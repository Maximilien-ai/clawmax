import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { TemplateRecoveryWorker, RecoveryClock } from './template-recovery-worker'
import { TemplateGatewayTransaction, TemplateGatewayTransport } from './template-gateway-transaction'
import { recoverTemplatesBeforeStartup } from './template-startup-recovery'
import { assertWorkspaceRecovered } from './workspace-recovery-admission'

function fakeClock() {
  let time = 0
  const tasks: Array<{ task: () => Promise<void>; delay: number }> = []
  const clock: RecoveryClock = {
    now: () => time,
    schedule(task, delay) {
      const entry = { task, delay }
      tasks.push(entry)
      return () => { const index = tasks.indexOf(entry); if (index >= 0) tasks.splice(index, 1) }
    },
  }
  return { clock, tasks, fire() {
    const entry = tasks.shift()!
    assert(entry, 'Expected a scheduled retry')
    time += entry.delay
    return entry.task()
  } }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-recovery-worker-'))
  try {
    // Production omits the injected clock, including when startup has no quarantine.
    const defaultEmpty = new TemplateRecoveryWorker([], async () => { throw new Error('Unexpected recovery') })
    defaultEmpty.start()
    assert.equal(defaultEmpty.diagnostics().status, 'complete')
    defaultEmpty.stop()
    let defaultCalls = 0
    const defaultPending = new TemplateRecoveryWorker([{ id: 'default', path: root }], async () => { defaultCalls++ })
    const beforeStart = Date.now()
    try {
      defaultPending.start()
      const diagnostics = defaultPending.diagnostics()
      assert.equal(diagnostics.status, 'waiting')
      const nextRetry = Date.parse(diagnostics.nextRetryAt!)
      assert(nextRetry >= beforeStart + 30_000 && nextRetry <= Date.now() + 30_000)
    } finally { defaultPending.stop() }
    assert.equal(defaultPending.diagnostics().status, 'stopped')
    assert.equal(defaultPending.diagnostics().nextRetryAt, null)
    assert.equal(defaultCalls, 0, 'Default timer must not run recovery immediately')

    const workspace = { id: 'recover', path: path.join(root, 'recover') }
    const id = 'tr-0123456789abcdef-agent-0123456789ab'
    let available = true
    let patches = 0
    const entries: Record<string, unknown> = { unrelated: { name: 'Keep' } }
    const transport: TemplateGatewayTransport = {
      async snapshot() { if (!available) throw new Error('Private transport error'); return { hash: String(patches), entries: structuredClone(entries) } },
      async patch(changes, hash) {
        assert.equal(hash, String(patches))
        patches++
        for (const [key, value] of Object.entries(changes)) { if (value === null) delete entries[key]; else entries[key] = value }
      },
    }
    await new TemplateGatewayTransaction(workspace.path, transport).register('a'.repeat(64), { [id]: {
      name: 'Staged', workspace: path.join(workspace.path, 'AGENTS', id), agentDir: path.join(root, 'runtime', id),
      model: 'test/model', skills: [], tools: { deny: ['*'] }, heartbeat: { every: '0m' },
    } })
    available = false
    const clock = fakeClock()
    const worker = new TemplateRecoveryWorker([workspace, { ...workspace }], async item => {
      await recoverTemplatesBeforeStartup([item], transport, path.join(root, 'runtime'))
    }, clock.clock)
    worker.start(); worker.start()
    assert.equal(clock.tasks.length, 1)
    assert.equal(clock.tasks[0].delay, 30_000)
    await clock.fire()
    assert.equal(worker.diagnostics().pendingWorkspaces, 1)
    assert.throws(() => assertWorkspaceRecovered(workspace.path), /recovery/)
    assert.equal(clock.tasks[0].delay, 60_000)
    assert.equal(patches, 1, 'Failed snapshot cannot remove entries')
    assert(!JSON.stringify(worker.diagnostics()).includes('Private'))
    assert(!JSON.stringify(worker.diagnostics()).includes(root))
    available = true
    await clock.fire()
    assertWorkspaceRecovered(workspace.path)
    assert.deepEqual(entries, { unrelated: { name: 'Keep' } })
    assert.equal(patches, 2)
    assert.equal(worker.diagnostics().status, 'complete')
    assert.equal(worker.diagnostics().attempts, 2)
    assert.equal(clock.tasks.length, 0)

    const corrupt = { id: 'corrupt', path: path.join(root, 'corrupt') }
    fs.mkdirSync(path.join(corrupt.path, '.clawmax'), { recursive: true })
    const journal = path.join(corrupt.path, '.clawmax/template-gateway-transaction.json')
    fs.writeFileSync(journal, '{invalid')
    const backoff = fakeClock()
    // A returning callback alone is not proof of recovery: admission must pass.
    const blocked = new TemplateRecoveryWorker([corrupt], async () => {}, backoff.clock)
    blocked.start()
    for (const delay of [30_000, 60_000, 120_000, 240_000, 300_000, 300_000]) {
      assert.equal(backoff.tasks[0].delay, delay)
      await backoff.fire()
      assert.equal(blocked.diagnostics().pendingWorkspaces, 1)
    }
    assert.equal(fs.readFileSync(journal, 'utf8'), '{invalid')
    blocked.stop(); blocked.start()
    assert.equal(backoff.tasks.length, 0)
    assert.equal(blocked.diagnostics().status, 'stopped')

    const deferred = fakeClock()
    let release!: () => void
    let calls = 0
    const serial = new TemplateRecoveryWorker([
      { id: 'first', path: path.join(root, 'first') }, { id: 'second', path: path.join(root, 'second') },
    ], async () => { calls++; await new Promise<void>(resolve => { release = resolve }) }, deferred.clock)
    serial.start()
    const callback = deferred.tasks[0].task
    const running = deferred.fire()
    await callback()
    assert.equal(calls, 1, 'An in-flight mutation cannot overlap another attempt')
    assert.equal(serial.diagnostics().status, 'retrying')
    assert.equal(deferred.tasks.length, 0)
    serial.stop()
    release()
    await running
    assert.equal(calls, 1, 'Shutdown cannot start another workspace recovery')
    assert.equal(deferred.tasks.length, 0)
    const empty = new TemplateRecoveryWorker([], async () => { throw new Error('Unexpected recovery') }, deferred.clock)
    empty.start()
    assert.equal(empty.diagnostics().status, 'complete')
    assert.equal(deferred.tasks.length, 0)
    console.log('template-recovery-worker.test.ts: passed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
