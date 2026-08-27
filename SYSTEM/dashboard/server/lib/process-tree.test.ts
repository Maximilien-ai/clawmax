/**
 * process-tree: the shared cancellation primitives.
 *
 * These exist because five spawn sites hand-rolled the same kill dance and every copy shared the
 * same two bugs. The tests below assert the rules those bugs violated, not the shape of the code.
 */
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { spawn } from 'child_process'
import { cancelProcessTree, detachProcessStreams, signalProcessTree } from './process-tree'

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m'
let passed = 0, failed = 0

async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`${GREEN}✓${RESET} ${name}`); passed++ }
  catch (err: any) { console.log(`${RED}✗${RESET} ${name}`); console.log(`  ${err.message}`); failed++ }
}

async function run() {
  await test('the SIGKILL escalation still reaches a surviving group member after the parent exits', async () => {
    // The bug this replaces: the escalation was guarded by "is the direct child still alive?".
    // A CLI that exits cleanly on SIGTERM while leaving a group member that ignores it would skip
    // the group SIGKILL entirely, leaking a live process at exactly the boundary meant to stop it.
    //
    // Shell below: traps SIGTERM, starts a child that ignores it, and exits itself on the trap --
    // so the parent is dead while the group is not. Both stay in the same process group.
    const parent = spawn('/bin/sh', ['-c',
      'trap "exit 0" TERM; /bin/sh -c \'trap "" TERM; while true; do sleep 0.2; done\' & wait'
    ], { detached: true })
    await new Promise((r) => setTimeout(r, 300))
    const groupPid = parent.pid!

    let escalated = false
    cancelProcessTree(parent, () => { escalated = true }, 400)

    await new Promise((r) => setTimeout(r, 1200))
    assert.strictEqual(escalated, true, 'the escalation callback must fire even though the parent exited on SIGTERM')

    // signal 0 probes existence without sending anything. ESRCH means the group is gone, which is
    // what an unconditional SIGKILL guarantees and the old guarded version did not.
    let groupAlive = true
    try { process.kill(-groupPid, 0) } catch { groupAlive = false }
    assert.strictEqual(groupAlive, false, 'the whole process group must be dead after the escalation')
  })

  await test('cancelProcessTree fires its callback even when the process is already gone', async () => {
    const child = spawn('/bin/sh', ['-c', 'exit 0'], { detached: true })
    await new Promise((r) => setTimeout(r, 200))
    let called = false
    cancelProcessTree(child, () => { called = true }, 100)
    await new Promise((r) => setTimeout(r, 400))
    // Settling is the caller's only exit path; skipping it on an already-reaped process would hang
    // the promise and, with it, the per-agent execution lock.
    assert.strictEqual(called, true, 'the callback must fire so the caller can settle')
  })

  await test('signalProcessTree falls back to the direct child when there is no pid', () => {
    // An earlier copy read `if (pid) process.kill(-pid, sig)` inside a try, so a process with no
    // pid took NEITHER branch: nothing was signalled and the caller believed it had killed something.
    let directKill: string | undefined
    const fake: any = { pid: undefined, kill: (sig: string) => { directKill = sig; return true } }
    assert.strictEqual(signalProcessTree(fake, 'SIGTERM'), 'child')
    assert.strictEqual(directKill, 'SIGTERM', 'must fall back to child.kill() when no pid is available')
  })

  await test('terminateProcessTree escalates unconditionally, like cancelProcessTree', () => {
    // main added terminateProcessTree with the same guarded escalation this module exists to fix.
    // Both entry points must behave identically or the bug simply moves to whichever one is used.
    const source = fs.readFileSync(path.join(__dirname, 'process-tree.ts'), 'utf-8')
    const guarded = source.split('\n').filter((l) => /exitCode === null && .*signalCode === null/.test(l))
    assert.strictEqual(guarded.length, 0,
      `No escalation may be guarded on the direct child being alive; found:\n${guarded.join('\n')}`)
  })

  await test('detachProcessStreams never throws, whatever shape the streams are', () => {
    // settle() is the one path that must not throw: it releases the turn registry entry and the
    // per-agent lock, and a throw here would strand both with no deadline left to clear them.
    assert.doesNotThrow(() => detachProcessStreams({ stdout: undefined, stderr: undefined }))
    assert.doesNotThrow(() => detachProcessStreams({ stdout: {} as any, stderr: {} as any }))
    assert.doesNotThrow(() => detachProcessStreams({
      stdout: { removeAllListeners() { throw new Error('boom') } } as any,
      stderr: undefined,
    }))
    let removed = false, destroyed = false
    detachProcessStreams({
      stdout: { removeAllListeners() { removed = true }, destroy() { destroyed = true } } as any,
      stderr: undefined,
    })
    assert.ok(removed && destroyed, 'a real stream must be both detached and destroyed')
  })

  await test('a bounded runtime turn stops a runaway producer and still settles', async () => {
    // clawmax-cli#50 was only closed for the OpenClaw path. runOnce accumulated stdout unbounded,
    // so a claude/droid turn emitting garbage grew this process's memory until it died -- taking
    // every other in-flight turn with it, since they all live here.
    const { runRuntimeCli, isRuntimeRunawayOutputError } = require('./agent-runtime')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-runaway-'))
    const cli = path.join(dir, 'flood')
    // Emits ~1MB per tick and ignores SIGTERM, so only the group SIGKILL plus a forced settle ends
    // it -- the exact shape that hangs if the caller waits on 'close'.
    fs.writeFileSync(cli, `#!/usr/bin/env node
process.on('SIGTERM', () => {})
const blob = 'x'.repeat(1024 * 1024)
setInterval(() => process.stdout.write(blob), 5)
`, 'utf-8')
    fs.chmodSync(cli, 0o755)
    const started = Date.now()
    const outcome = await Promise.race([
      runRuntimeCli({
        plan: { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: false },
        env: process.env as NodeJS.ProcessEnv, signal: new AbortController().signal,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called') },
        runtime: 'droid', mode: 'json', agentId: 'a1', scopedSessionId: 's1',
      }),
      new Promise((r) => setTimeout(() => r('HUNG'), 60000)),
    ]) as any
    assert.notStrictEqual(outcome, 'HUNG', 'a runaway turn must settle, not wedge the caller')
    assert.ok(isRuntimeRunawayOutputError(outcome.errorText),
      `expected a runaway-output verdict, got: ${outcome.errorText}`)
    // Bounded retention: the process emitted far more than this before being stopped.
    assert.ok(outcome.text.length < 8 * 1024 * 1024,
      `retained output must be bounded, held ${outcome.text.length} bytes`)
    console.log(`      (settled in ${Date.now() - started}ms, retained ${outcome.text.length} bytes)`)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run()
