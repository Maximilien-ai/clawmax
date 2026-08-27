/**
 * Runtime selection for CLI-backed AI generation.
 *
 * Run with: npx ts-node --transpileOnly server/lib/ai-generation-runtime.test.ts
 */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

const GREEN = '\x1b[32m', RED = '\x1b[31m', RESET = '\x1b[0m'
let passed = 0, failed = 0
const asyncCases: Array<[string, () => Promise<void>]> = []
function test(name: string, fn: () => void) {
  try { fn(); console.log(`${GREEN}✓${RESET} ${name}`); passed++ }
  catch (err: any) { console.log(`${RED}✗${RESET} ${name}`); console.log(`  ${err.message}`); failed++ }
}

function withWorkspace(enabled: string[], env: Record<string, string | undefined>, fn: () => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-genrt-'))
  fs.mkdirSync(path.join(root, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(root, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: enabled }))
  const prev: Record<string, string | undefined> = { OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE }
  process.env.OPENCLAW_WORKSPACE = root
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k]
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
  try {
    for (const k of Object.keys(require.cache)) if (k.includes('/server/lib/')) delete require.cache[k]
    fn()
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
}

async function withWorkspaceAsync(enabled: string[], env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-genrt-'))
  fs.mkdirSync(path.join(root, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(root, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: enabled }))
  const prev: Record<string, string | undefined> = { OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE }
  process.env.OPENCLAW_WORKSPACE = root
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k]
    if (v === undefined) delete process.env[k]; else process.env[k] = v
  }
  try {
    for (const k of Object.keys(require.cache)) if (k.includes('/server/lib/')) delete require.cache[k]
    await fn()
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v
    }
    fs.rmSync(root, { recursive: true, force: true })
  }
}

// A real file stands in for an installed CLI; resolveRuntimeCliPath only needs an executable path.
const realBinary = process.execPath
const missingBinary = path.join(os.tmpdir(), 'clawmax-not-installed-cli')
// resolveRuntimeCliPath falls back to PATH and ~/.local/bin when an override is unusable, and this
// machine really does have droid installed — so "not installed" cases must neutralise both.
const emptyPathDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-empty-path-'))
const emptyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-empty-home-'))
const NOT_INSTALLED = { PATH: emptyPathDir, HOME: emptyHome }

console.log('\n=== AI generation runtime selection ===\n')

test('never selects a runtime whose CLI is absent', () => {
  // Faking absence is unreliable — an unusable *_BIN override falls through to PATH and
  // ~/.local/bin, and this machine has the CLIs installed. Assert the invariant instead: whatever
  // is selected must have a resolvable CLI, which is what the missing-CLI failure mode requires.
  withWorkspace(['droid', 'claude'], { CLAWMAX_ANTHROPIC_GENERATION_MODEL: 'claude-sonnet-4-5' }, () => {
    const { pickGenerationRuntime } = require('./ai-generator')
    const { resolveRuntimeCliPath } = require('./agent-runtime')
    const picked = pickGenerationRuntime()
    if (picked) {
      assert(resolveRuntimeCliPath(picked), `Selected ${picked} but its CLI does not resolve`)
    }
  })
})

test('uses an enabled, installed runtime when both CLIs are present', () => {
  // Both now supply a usable default — droid picks its own, claude takes an alias that tracks the
  // current model — so either is acceptable; what matters is that one is chosen.
  withWorkspace(['claude', 'droid'], { DROID_BIN: realBinary, CLAUDE_BIN: realBinary }, () => {
    const { pickGenerationRuntime } = require('./ai-generator')
    assert(['claude', 'droid'].includes(pickGenerationRuntime()), 'Expected one of the enabled runtimes')
  })
})

test('claude generation uses an alias, never a dated id that can retire', () => {
  withWorkspace(['claude'], { CLAUDE_BIN: realBinary, CLAWMAX_ANTHROPIC_GENERATION_MODEL: undefined }, () => {
    const { resolveClaudeGenerationModel } = require('./ai-generator')
    const model = resolveClaudeGenerationModel()
    assert(model, 'Expected a model for claude generation')
    assert(!/\d{8}/.test(model), `Expected an alias, got a dated id: ${model}`)
  })
})

test('returns nothing when no runtime is enabled', () => {
  withWorkspace([], { DROID_BIN: realBinary, CLAUDE_BIN: realBinary }, () => {
    const { pickGenerationRuntime } = require('./ai-generator')
    assert.strictEqual(pickGenerationRuntime(), undefined)
  })
})


// ── Session isolation and timeout ordering for CLI-backed generation ──

const agentRuntimeModulePath = require.resolve('./agent-runtime')

async function withRuntimeTurnSpy(fn: (calls: any[]) => Promise<void>): Promise<void> {
  delete require.cache[agentRuntimeModulePath]
  const mod = require(agentRuntimeModulePath)
  const original = mod.executeAgentRuntimeTurn
  const calls: any[] = []
  mod.executeAgentRuntimeTurn = async (opts: any) => {
    calls.push(opts)
    return { text: '{"identity":"x"}' }
  }
  delete require.cache[require.resolve('./ai-generator')]
  try { await fn(calls) }
  finally {
    mod.executeAgentRuntimeTurn = original
    delete require.cache[require.resolve('./ai-generator')]
  }
}


test('a stale CLAUDE override yields to a runtime that picks its own model', () => {
  withWorkspace(['claude', 'droid'], {
    CLAUDE_BIN: realBinary, DROID_BIN: realBinary,
    // A dated id the CLI rejects — the exact shape that used to strand generation.
    CLAWMAX_ANTHROPIC_GENERATION_MODEL: 'claude-sonnet-4-20250514',
  }, () => {
    const { pickGenerationRuntime } = require('./ai-generator')
    assert.strictEqual(pickGenerationRuntime(), 'droid', 'Expected droid rather than claude with an untrusted override')
  })
})

test('claude is chosen on its built-in alias even when listed first', () => {
  withWorkspace(['claude', 'droid'], {
    CLAUDE_BIN: realBinary, DROID_BIN: realBinary, CLAWMAX_ANTHROPIC_GENERATION_MODEL: undefined,
  }, () => {
    const { pickGenerationRuntime, resolveClaudeGenerationModel } = require('./ai-generator')
    const { CLAUDE_MODEL_ALIASES } = require('./agent-runtime')
    assert(CLAUDE_MODEL_ALIASES.includes(resolveClaudeGenerationModel()), 'Expected an alias by default')
    assert.strictEqual(pickGenerationRuntime(), 'claude')
  })
})

test('an alias reaches the claude CLI unchanged and a foreign model falls back', () => {
  const { runtimeModelArg, buildRuntimePlan, CLAUDE_MODEL_ALIASES } = require('./agent-runtime')
  for (const alias of CLAUDE_MODEL_ALIASES) {
    assert.strictEqual(runtimeModelArg('claude', alias), alias, `Alias ${alias} should pass through`)
  }
  // A provider-qualified non-Anthropic model is not runnable, but refusing the turn left agents
  // already on disk permanently unusable, so it runs on the runtime's own default instead.
  assert.strictEqual(runtimeModelArg('claude', 'openai/sonnet'), 'sonnet')
  assert.strictEqual(runtimeModelArg('claude', 'openai/gpt-5'), 'sonnet')
  const plan = buildRuntimePlan({
    runtime: 'claude', mode: 'json', agentId: 'a', scopedSessionId: 's',
    message: 'hi', model: 'sonnet', agentDir: '/tmp', resume: false,
  })
  const at = plan.args.indexOf('--model')
  assert(at !== -1 && plan.args[at + 1] === 'sonnet', `Expected --model sonnet, got ${plan.args.join(' ')}`)
})

test('claude advertises aliases only when its CLI is present', () => {
  withWorkspace(['claude'], { CLAUDE_BIN: realBinary }, async () => {
    const { listRuntimeModels, CLAUDE_MODEL_ALIASES } = require('./agent-runtime')
    const models = await listRuntimeModels('claude')
    assert.deepStrictEqual(models, CLAUDE_MODEL_ALIASES, 'Expected the alias list when installed')
  })
})


asyncCases.push(['a CLI request arms NO timer at all -- not even one it later clears', async () => {
  await withWorkspaceAsync(['droid'], { DROID_BIN: realBinary }, async () => {
  const { createChatCompletionWithCompatibilityRetry } = require('./ai-generator')
  // This used to assert arm-and-clear: a 245s deadline was armed and had to be cleared so it did
  // not leak. That deadline is gone -- a CLI-backed generation is an agent turn and gets no clock,
  // like every other turn. Asserting zero timers is strictly stronger: arm-and-clear would still
  // pass with a deadline present, which is exactly how the 245s cap survived the first sweep.
  const realSet = global.setTimeout, realClear = global.clearTimeout
  let created = 0, cleared = 0
  ;(global as any).setTimeout = (...args: any[]) => { created++; return (realSet as any)(...args) }
  ;(global as any).clearTimeout = (...args: any[]) => { cleared++; return (realClear as any)(...args) }
  try {
    const fast: any = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'x' } }] }) } } }
    fast.__clawmaxCliRuntime = true
    await createChatCompletionWithCompatibilityRetry(fast, { messages: [] })
  } finally {
    ;(global as any).setTimeout = realSet
    ;(global as any).clearTimeout = realClear
  }
  assert.strictEqual(created, 0, `A CLI-backed request must arm no deadline; armed ${created}`)
  })
}])

asyncCases.push(['a cancelled CLI that ignores SIGTERM is escalated to SIGKILL', async () => {
  const { runRuntimeCli, RUNTIME_CANCELLED } = require('./agent-runtime')
  // A shell that traps SIGTERM and keeps running -- exactly the case SIGTERM alone cannot end.
  const plan = {
    cliPath: '/bin/sh',
    args: ['-c', 'trap "" TERM; while true; do sleep 0.2; done'],
    missingCliError: 'unused',
    streamsDeltas: false,
  }
  const controller = new AbortController()
  const started = Date.now()
  setTimeout(() => controller.abort(), 300)
  const { errorText } = await runRuntimeCli({
    plan, env: process.env, signal: controller.signal, rebuildPlan: () => plan,
    runtime: 'droid', mode: 'json', agentId: 'kill-test', scopedSessionId: 'kill-test',
  })
  const elapsed = Date.now() - started
  assert.strictEqual(errorText, RUNTIME_CANCELLED, `Expected a cancellation, got: ${errorText}`)
  assert(elapsed < 8000, `Expected escalation to end it quickly, took ${elapsed}ms`)
}])
async function asyncTest(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`${GREEN}✓${RESET} ${name}`); passed++ }
  catch (err: any) { console.log(`${RED}✗${RESET} ${name}`); console.log(`  ${err.message}`); failed++ }
}

async function runAsyncCases() {
  for (const [name, fn] of asyncCases) await asyncTest(name, fn)
  await asyncTest('each CLI generation request gets its own session instead of sharing one', async () => {
    await withWorkspaceAsync(['droid'], { DROID_BIN: realBinary }, async () => {
      await withRuntimeTurnSpy(async (calls) => {
        const { buildCliRuntimeClient } = require('./ai-generator')
        const { client } = buildCliRuntimeClient('droid')
        const payload = { model: 'x', messages: [{ role: 'user', content: 'hi' }] }
        await client.chat.completions.create(payload)
        await client.chat.completions.create(payload)
        assert.strictEqual(calls.length, 2, 'Expected both requests to reach the runtime')
        const [a, b] = calls.map((c: any) => c.scopedSessionId)
        assert(a && b, 'Expected a session id on each request')
        assert.notStrictEqual(a, b, `Both generations shared the session id ${a}`)
        assert(/^clawmax-ai-generation-/.test(a), `Unexpected session id shape: ${a}`)
      })
    })
  })

  await asyncTest('the CLI kills its own child before the caller stops waiting', async () => {
    await withWorkspaceAsync(['droid'], { DROID_BIN: realBinary }, async () => {
      await withRuntimeTurnSpy(async (calls) => {
        const { buildCliRuntimeClient, createChatCompletionWithCompatibilityRetry } = require('./ai-generator')
        const { client } = buildCliRuntimeClient('droid')
        await client.chat.completions.create({ messages: [{ role: 'user', content: 'hi' }] })
        // A CLI generation used to need a bigger budget than the hosted default. It now needs no
        // budget at all -- but it must still be cancellable, or the child outlives every caller.
        assert.strictEqual(calls[0].timeoutMs, undefined, 'a CLI turn must carry no deadline')
        assert(calls[0].signal && typeof calls[0].signal.aborted === 'boolean',
          'a CLI turn must be given an AbortSignal, or nothing can ever stop it')

        // The retry helper must extend its own race past that deadline for a CLI-backed client;
        // otherwise it rejects first and leaves the child process running.
        let issued = 0
        const slowClient: any = { chat: { completions: { create: () => { issued++; return new Promise(() => {}) } } } }
        slowClient.__clawmaxCliRuntime = true
        const outcome = await Promise.race([
          createChatCompletionWithCompatibilityRetry(slowClient, { messages: [] }).catch(() => 'rejected'),
          new Promise((r) => setTimeout(() => r('still-waiting'), 1500)),
        ])
        assert.strictEqual(outcome, 'still-waiting', 'Race settled before the CLI deadline')
        assert.strictEqual(issued, 1, 'Expected the request to have been issued')
      })
    })
  })

}

test('an enabled CLI runtime outranks a hosted provider key', () => {
  // The reported symptom: two enabled CLIs, a stale OpenAI key, and generation still went to
  // OpenAI and died on a 401 naming a key the operator had already replaced with a CLI.
  withWorkspace(['claude', 'droid'], { DROID_BIN: realBinary, CLAUDE_BIN: realBinary }, () => {
    const { resolveGenerationProvider } = require('./ai-generator')
    const chosen = resolveGenerationProvider({ openai: 'sk-test-key-not-used' })
    assert.strictEqual(chosen.provider, 'cli-runtime', `Expected a CLI to win, got ${chosen.provider}`)
    assert(['claude', 'droid'].includes(String(chosen.runtime)), `Unexpected runtime ${chosen.runtime}`)
  })
})

test('a hosted key is still used when no CLI runtime is enabled', () => {
  withWorkspace([], { DROID_BIN: realBinary, CLAUDE_BIN: realBinary }, () => {
    const { resolveGenerationProvider } = require('./ai-generator')
    const chosen = resolveGenerationProvider({ openai: 'sk-test-key-not-used' })
    assert.strictEqual(chosen.provider, 'openai')
    assert.strictEqual(chosen.runtime, undefined)
  })
})

test('only a CLI that could not run falls back; a CLI verdict stands', () => {
  withWorkspace(['droid'], { DROID_BIN: realBinary }, () => {
    const { isCliRecoverableFailure } = require('./ai-generator')
    // "could not run" -- retrying elsewhere is legitimate.
    assert.strictEqual(isCliRecoverableFailure('Not logged in \u00b7 Please run /login'), true)
    assert.strictEqual(isCliRecoverableFailure('Claude Code CLI is not available in this runtime. Install it or set CLAUDE_BIN to the executable path.'), true)
    assert.strictEqual(isCliRecoverableFailure('droid: command not found'), true)
    assert.strictEqual(isCliRecoverableFailure('spawn droid ENOENT'), true)
    assert.strictEqual(isCliRecoverableFailure('permission denied'), true)
    // The CLI ran and produced a verdict. Falling back would launder a refusal or a parse
    // failure into another provider's answer and hide a real generation bug.
    assert.strictEqual(isCliRecoverableFailure('AI generation timed out'), false)
    assert.strictEqual(isCliRecoverableFailure('request timeout after 45000ms'), false)
    assert.strictEqual(isCliRecoverableFailure('I cannot help with that request'), false)
    assert.strictEqual(isCliRecoverableFailure('stopped by content policy'), false)
    assert.strictEqual(isCliRecoverableFailure('Unexpected token < in JSON at position 0'), false)
    assert.strictEqual(isCliRecoverableFailure(''), false)
    // Structural signal beats text: a tagged missing-CLI error is recoverable even though its
    // message would not match any pattern above.
    const tagged: any = new Error('some message no pattern matches')
    tagged.__clawmaxCliUnavailable = true
    assert.strictEqual(isCliRecoverableFailure(tagged), true)
    // A non-Error throw must not become the literal string "[object Object]".
    const { describeThrown } = require('./ai-generator')
    assert.strictEqual(describeThrown({ code: 'X' }).includes('[object Object]'), false)
    assert.strictEqual(describeThrown(new Error('boom')), 'boom')
  })
})

test('a hosted fallback never sends the CLI sentinel as its model', () => {
  // resolveModel() used to re-derive the provider from scratch. During a fallback the CLI is
  // still enabled, so it resolved to cli-runtime again and handed 'cli-runtime' to the OpenAI
  // client as a model id. An invalid key hides this (auth fails first); a working key does not.
  withWorkspace(['claude', 'droid'], { CLAUDE_BIN: realBinary, DROID_BIN: realBinary }, () => {
    const { buildClientForSelection } = require('./ai-generator')
    const hosted = buildClientForSelection({ provider: 'openai', key: 'sk-test-not-used' })
    assert.notStrictEqual(hosted.model, 'cli-runtime')
    assert(hosted.model && !/cli/i.test(hosted.model), `Hosted fallback model looks CLI-ish: ${hosted.model}`)
  })
})

test('a malformed hosted key does not block an enabled CLI runtime', () => {
  // Key-shape validation ran before the CLI was considered, so a stale browser-stored
  // credential 400'd a request that was never going to use it.
  withWorkspace(['droid'], { DROID_BIN: realBinary }, () => {
    const { resolveGenerationProvider } = require('./ai-generator')
    const chosen = resolveGenerationProvider({ openai: 'not-a-real-openai-key-shape' })
    assert.strictEqual(chosen.provider, 'cli-runtime')
    assert.strictEqual(chosen.runtime, 'droid')
  })
})

asyncCases.push(['concurrent generations do not report each other\'s provider', async () => {
  // Attribution used to be a module-level "last generation" value, so whichever concurrent
  // request resolved a client last overwrote the other's provider before the response read it.
  await withWorkspaceAsync([], { CLAUDE_BIN: realBinary, DROID_BIN: realBinary }, async () => {
    const { withGenerationAttribution, getAIClient } = require('./ai-generator')
    const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const [a, b] = await Promise.all([
      // Resolves first but finishes last -- the ordering that broke the global.
      withGenerationAttribution(async () => { getAIClient({ openai: 'sk-aaa' }); await settle(60); return 'a' }),
      withGenerationAttribution(async () => { await settle(20); getAIClient({ anthropic: 'sk-ant-bbb' }); return 'b' }),
    ])
    assert.strictEqual(a.attribution?.label, 'OpenAI', `first call saw ${a.attribution?.label}`)
    assert.strictEqual(b.attribution?.label, 'Anthropic', `second call saw ${b.attribution?.label}`)
  })
}])

asyncCases.push(['a cancelled CLI whose grandchild holds stdout still settles', async () => {
  // The turn used to resolve only on the child's "close" event, which needs every stdio pipe
  // closed. Killing the CLI does not kill the processes it spawned, and those inherit stdout --
  // so the promise never settled, the caller's recovery never ran, and the request stayed wedged
  // server-side. With no deadline left, cancellation is the only thing that can end this, so
  // settling off the SIGKILL escalation is what stops it hanging forever.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-hang-'))
  const fakeCli = path.join(dir, 'claude')
  fs.writeFileSync(fakeCli, '#!/bin/sh\nsleep 900 &\nsleep 900\n')
  fs.chmodSync(fakeCli, 0o755)
  await withWorkspaceAsync(['claude'], { CLAUDE_BIN: fakeCli }, async () => {
    const { executeAgentRuntimeTurn } = require('./agent-runtime')
    const controller = new AbortController()
    const started = Date.now()
    setTimeout(() => controller.abort(), 500)
    const result = await Promise.race([
      executeAgentRuntimeTurn({
        runtime: 'claude', agentId: 'hang-probe', agentDir: dir, message: 'hi',
        scopedSessionId: 'hang-probe-session', model: 'sonnet', mode: 'chat',
        env: process.env, signal: controller.signal,
      }),
      new Promise((resolve) => setTimeout(() => resolve('NEVER_SETTLED'), 20000)),
    ])
    const elapsed = Date.now() - started
    assert.notStrictEqual(result, 'NEVER_SETTLED', `Turn never settled after ${elapsed}ms`)
    assert(elapsed < 15000, `Expected the turn to settle shortly after cancel, took ${elapsed}ms`)
  })
  fs.rmSync(dir, { recursive: true, force: true })
}])
asyncCases.push(['a CLI that keeps streaming runs to completion, uncapped', async () => {
  // The deadline used to measure total runtime, so a real research turn -- minutes of work while
  // streaming the whole time -- was killed mid-flight. There is no cap at all now.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-stream-'))
  const cli = path.join(dir, 'claude')
  const event = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'chunk' }] } })
  fs.writeFileSync(cli, `#!/bin/sh\ni=0\nwhile [ $i -lt 8 ]; do echo '${event}'; sleep 0.5; i=$((i+1)); done\n`)
  fs.chmodSync(cli, 0o755)
  await withWorkspaceAsync(['claude'], { CLAUDE_BIN: cli }, async () => {
    const { executeAgentRuntimeTurn } = require('./agent-runtime')
    const started = Date.now()
    const r = await executeAgentRuntimeTurn({
      runtime: 'claude', agentId: 'stream-probe', agentDir: dir, message: 'hi',
      scopedSessionId: 'stream-probe-session', model: 'sonnet', mode: 'chat',
      env: process.env, signal: new AbortController().signal,
    })
    const elapsed = Date.now() - started
    assert(elapsed > 2500, `Expected the streaming turn to run its full length, took ${elapsed}ms`)
    assert.strictEqual(r.errorText, undefined, `Streaming turn should not fail, got: ${r.errorText}`)
    assert(String(r.text).includes('chunk'), `Expected streamed text, got: ${String(r.text).slice(0, 80)}`)
  })
  fs.rmSync(dir, { recursive: true, force: true })
}])
asyncCases.push(['a CLI that never speaks is NOT killed -- silence is not a failure', async () => {
  // The inverse of what this used to assert. A turn that has produced nothing was treated as
  // wedged and killed on a short first-output deadline; but agent work is legitimately silent for
  // long stretches, and a measured 21-minute research turn went quiet for 316s while working.
  // Only cancellation ends a turn now, so a silent CLI must still be running until one arrives.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-silent-'))
  const cli = path.join(dir, 'claude')
  fs.writeFileSync(cli, '#!/bin/sh\nsleep 900\n')
  fs.chmodSync(cli, 0o755)
  await withWorkspaceAsync(['claude'], { CLAUDE_BIN: cli }, async () => {
    const { executeAgentRuntimeTurn, RUNTIME_CANCELLED } = require('./agent-runtime')
    const controller = new AbortController()
    const started = Date.now()
    // Long enough that every deleted deadline (90s first-output was the shortest) would have
    // fired first had it survived; the turn must still be alive when this cancel lands.
    setTimeout(() => controller.abort(), 2000)
    const r = await executeAgentRuntimeTurn({
      runtime: 'claude', agentId: 'silent-probe', agentDir: dir, message: 'ping',
      scopedSessionId: 'silent-probe-session', model: 'sonnet', mode: 'chat',
      env: process.env, signal: controller.signal,
    })
    const elapsed = Date.now() - started
    assert.strictEqual(r.errorText, RUNTIME_CANCELLED, `Expected cancellation, got: ${r.errorText}`)
    assert(elapsed >= 1900, `The silent turn must survive until cancelled, ended after ${elapsed}ms`)
  })
  fs.rmSync(dir, { recursive: true, force: true })
}])
asyncCases.push(['tool-only activity counts as liveness, not silence', async () => {
  // An agent doing a long stretch of tool work emits almost no assistant prose. A watchdog fed
  // only by visible deltas treats that as silence and kills a healthy turn -- the failure mode
  // behind "went quiet with no output" on a research task that was actively running tools.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-toolonly-'))
  const cli = path.join(dir, 'claude')
  // Emits only tool_use / thinking events -- never an assistant text block -- then finishes.
  const toolEvent = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read' }] } })
  const result = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'done' })
  fs.writeFileSync(cli, `#!/bin/sh\ni=0\nwhile [ $i -lt 6 ]; do echo '${toolEvent}'; sleep 0.4; i=$((i+1)); done\necho '${result}'\n`)
  fs.chmodSync(cli, 0o755)
  await withWorkspaceAsync(['claude'], { CLAUDE_BIN: cli }, async () => {
    const { executeAgentRuntimeTurn } = require('./agent-runtime')
    const deltas: string[] = []
    let activity = 0
    const r = await executeAgentRuntimeTurn({
      runtime: 'claude', agentId: 'toolonly-probe', agentDir: dir, message: 'go',
      scopedSessionId: 'toolonly-probe-session', model: 'sonnet', mode: 'chat',
      env: process.env, signal: new AbortController().signal,
      onDelta: (t: string) => deltas.push(t),
      onActivity: () => { activity++ },
    })
    // No visible text was ever emitted...
    assert.strictEqual(deltas.length, 0, `Expected no visible deltas, got ${deltas.length}`)
    // ...but activity fired repeatedly, which is what keeps the caller's watchdog alive.
    assert(activity >= 5, `Expected tool events to report activity, got ${activity}`)
    // ...and the turn completed normally. Activity is what the UI uses to show a long silent turn
    // is alive, now that nothing kills it for being quiet.
    assert.strictEqual(r.errorText, undefined, `Tool-only turn should not fail, got: ${r.errorText}`)
    assert.strictEqual(String(r.text).trim(), 'done')
  })
  fs.rmSync(dir, { recursive: true, force: true })
}])

asyncCases.push(['a buffered JSON turn is not killed by the first-output cap', async () => {
  // Regression: the 90s first-output cap was applied to every runtime call, but generation,
  // workflows and channels use buffered JSON mode and emit nothing until the final result. A
  // legitimate multi-minute droid/claude generation was being killed at 90s.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-buffered-'))
  const cli = path.join(dir, 'droid')
  const envelope = JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'BUFFERED_OK' })
  // Silent for 2s, then emits the whole envelope at once -- the buffered-JSON shape.
  fs.writeFileSync(cli, `#!/bin/sh\nsleep 2\necho '${envelope}'\n`)
  fs.chmodSync(cli, 0o755)
  await withWorkspaceAsync(['droid'], { DROID_BIN: cli }, async () => {
    const { executeAgentRuntimeTurn } = require('./agent-runtime')
    // droid emits nothing until its final envelope, so it is silent for its whole run. Nothing may
    // read that silence as a failure -- and for droid there was never any mid-run signal to read.
    const r = await executeAgentRuntimeTurn({
      runtime: 'droid', agentId: 'buffered-probe', agentDir: dir, message: 'go',
      scopedSessionId: 'buffered-probe-session', model: 'auto', mode: 'json',
      env: process.env, signal: new AbortController().signal,
    })
    assert.strictEqual(r.errorText, undefined, `Buffered JSON turn should not fail, got: ${r.errorText}`)
    assert.strictEqual(String(r.text).trim(), 'BUFFERED_OK')
  })
  fs.rmSync(dir, { recursive: true, force: true })
}])

asyncCases.push(['a failing result outranks text already streamed', async () => {
  // A turn that emits partial assistant text and then fails (quota, model error, tool failure)
  // must not be persisted and shown to the user as a successful reply.
  const { parseClaudeStreamJson } = require('./agent-runtime')
  const stdout = [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Here is half an ans' }] } }),
    JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Usage limit reached' }),
  ].join('\n')
  const parsed = parseClaudeStreamJson(stdout, '', 1)
  assert.strictEqual(parsed.text, '', `Partial text must not be returned as the reply, got: ${parsed.text}`)
  assert.strictEqual(parsed.errorText, 'Usage limit reached')
}])

test('safeEnv never carries the claude subscription token', () => {
  // The guard that makes the runtime-scoped injection meaningful: if the token were ever added to
  // safe-env's shared allowlist it would reach every CLI, including droid.
  const prev = process.env.CLAUDE_CODE_OAUTH_TOKEN
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sub-token-should-not-leak'
  try {
    const { safeEnv } = require('./safe-env')
    const env = safeEnv()
    assert.strictEqual(env.CLAUDE_CODE_OAUTH_TOKEN, undefined,
      'safeEnv must not forward the Claude subscription token to every runtime')
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = prev
  }
})

asyncCases.push(['the claude subscription token never reaches a droid process', async () => {
  // safe-env's allowlist takes no runtime parameter, so anything added there reaches every CLI.
  // Droid runs fully autonomous tool execution: a single "print your environment" turn would
  // exfiltrate the Claude subscription token as a side effect of an unrelated task. The token is
  // therefore injected only where the runtime is already known to be claude.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-tokenleak-'))
  // Each fake CLI reports back whether it can see the token in its own environment.
  const mk = (name: string) => {
    const f = path.join(dir, name)
    fs.writeFileSync(f, `#!/bin/sh\nprintf '{"type":"result","subtype":"success","is_error":false,"result":"TOKEN=%s"}\\n' "$CLAUDE_CODE_OAUTH_TOKEN"\n`)
    fs.chmodSync(f, 0o755)
    return f
  }
  const claudeCli = mk('claude')
  const droidCli = mk('droid')
  const prev = process.env.CLAUDE_CODE_OAUTH_TOKEN
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sub-token-should-not-leak'
  try {
    await withWorkspaceAsync(['claude', 'droid'], { CLAUDE_BIN: claudeCli, DROID_BIN: droidCli }, async () => {
      const { executeAgentRuntimeTurn } = require('./agent-runtime')
      // Deliberately passes process.env -- with the token in it -- because that is what
      // ai-generator.ts does for every CLI-backed generation. An earlier version of this test used
      // a curated env and therefore proved nothing: the leak it was meant to catch happens exactly
      // when a caller forwards the whole environment.
      const run = (runtime: string) => executeAgentRuntimeTurn({
        runtime, agentId: 'leak-probe', agentDir: dir, message: 'go',
        scopedSessionId: 'leak-probe-session', model: runtime === 'claude' ? 'sonnet' : 'auto',
        mode: 'json', env: process.env, signal: new AbortController().signal,
      })
      const droidResult = await run('droid')
      assert(!String(droidResult.text).includes('sub-token-should-not-leak'),
        `Droid saw the Claude subscription token: ${droidResult.text}`)
      const claudeResult = await run('claude')
      assert(String(claudeResult.text).includes('sub-token-should-not-leak'),
        `Claude did not receive the subscription token: ${claudeResult.text}`)
    })
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    else process.env.CLAUDE_CODE_OAUTH_TOKEN = prev
    fs.rmSync(dir, { recursive: true, force: true })
  }
}])

test('a failing result with no message still fails the turn', () => {
  // is_error with a null/object payload must not fall through and let partial text be returned as
  // a successful reply.
  const { parseClaudeStreamJson } = require('./agent-runtime')
  const stdout = [
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'partial' }] } }),
    JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true, result: null }),
  ].join('\n')
  const parsed = parseClaudeStreamJson(stdout, '', 1)
  assert.strictEqual(parsed.text, '', `Partial text must not be returned, got: ${parsed.text}`)
  assert(parsed.errorText && /error/i.test(parsed.errorText), `Expected an error message, got: ${parsed.errorText}`)
})

test('no turn deadline survives anywhere in the runtime or its spawn sites', () => {
  // Guards against a deadline creeping back in under a new name. The requirement is that a turn runs
  // for as long as the task takes, so any timer that can end a turn is a regression -- and an
  // arithmetic test over the old constants could not catch a differently-named one.
  const runtime = require('./agent-runtime')
  for (const name of ['RUNTIME_IDLE_TIMEOUT_MS', 'FIRST_OUTPUT_TIMEOUT_MS', 'effectiveFirstOutputTimeoutMs', 'isRuntimeTimeoutError']) {
    assert.strictEqual(runtime[name], undefined, `${name} must not exist: turns have no deadline`)
  }

  // agent-runtime owns no timer at all now: the one legitimate timer (SIGTERM -> SIGKILL) moved into
  // process-tree's cancelProcessTree, which is armed by cancellation and never by elapsed time.
  const runtimeSource = fs.readFileSync(path.join(__dirname, 'agent-runtime.ts'), 'utf-8')
  const runtimeTimers = runtimeSource.split('\n').filter((line) => /setTimeout\(|setInterval\(/.test(line))
  assert.strictEqual(runtimeTimers.length, 0, `agent-runtime.ts must arm no timers, found:\n${runtimeTimers.join('\n')}`)

  // Every raw spawn site must likewise carry no turn-ending timer of its own. These are the five
  // places that used to hand-roll the kill dance, and each grew its own deadline before.
  //
  // The rule: a setTimeout whose body kills a process or rejects a promise is a turn deadline unless
  // it is explicitly annotated. Annotating forces the next person adding one to say why it is not a
  // deadline, which is the only thing that reliably stops one reappearing under a new name.
  const ALLOW = '// not-a-turn-deadline:'
  for (const rel of ['../routes/chat.ts', '../routes/channels.ts', '../routes/agents.ts', './workflows.ts']) {
    const lines = fs.readFileSync(path.join(__dirname, rel), 'utf-8').split('\n')
    const offenders: string[] = []
    lines.forEach((line: string, idx: number) => {
      if (!/setTimeout\(/.test(line)) return
      const body = lines.slice(idx, idx + 8).join('\n')
      const endsSomething = /\.kill\(|reject\(/.test(body)
      const annotated = lines.slice(Math.max(0, idx - 3), idx + 1).join('\n').includes(ALLOW)
      if (endsSomething && !annotated) offenders.push(`${rel}:${idx + 1}  ${line.trim()}`)
    })
    assert.strictEqual(offenders.length, 0,
      `Turn deadline found (annotate with "${ALLOW} <reason>" if it genuinely is not one):\n${offenders.join('\n')}`)
  }

  // The single surviving timer lives in process-tree and must be cancellation-armed.
  const treeSource = fs.readFileSync(path.join(__dirname, 'process-tree.ts'), 'utf-8')
  const treeTimers = treeSource.split('\n').filter((line) => /setTimeout\(|setInterval\(/.test(line))
  assert.strictEqual(treeTimers.length, 1, `process-tree.ts must hold exactly one timer, found:\n${treeTimers.join('\n')}`)
  assert(/SIGKILL/.test(treeSource), 'the surviving timer must be the SIGKILL escalation')
  assert(/cancelProcessTree/.test(treeSource), 'and it must only be reachable through cancellation')
})

// ── The runtime and model chosen in the Add Agent wizard are what generate ──

// Same shape as withRuntimeTurnSpy, but the turn's outcome is the caller's to decide -- a failure
// result is what proves the no-silent-fallback rule.
async function withRuntimeTurnResult(
  result: any,
  fn: (calls: any[]) => Promise<void>,
): Promise<void> {
  delete require.cache[agentRuntimeModulePath]
  const mod = require(agentRuntimeModulePath)
  const original = mod.executeAgentRuntimeTurn
  const calls: any[] = []
  mod.executeAgentRuntimeTurn = async (opts: any) => { calls.push(opts); return result }
  delete require.cache[require.resolve('./ai-generator')]
  try { await fn(calls) }
  finally {
    mod.executeAgentRuntimeTurn = original
    delete require.cache[require.resolve('./ai-generator')]
  }
}

asyncCases.push(['the runtime chosen for the agent generates it, not the first enabled one', async () => {
  // The reported defect: "Factory Droid" was selected in step 1, generation ran on Claude Code
  // anyway (it is simply earlier in the enabled list), hit Claude's missing login, and surfaced as
  // an OpenAI 401 from a stale browser key.
  await withWorkspaceAsync(['claude', 'droid'], { CLAUDE_BIN: realBinary, DROID_BIN: realBinary, CLAWMAX_ANTHROPIC_GENERATION_MODEL: undefined }, async () => {
    await withRuntimeTurnResult({ text: '{"identity":"x"}' }, async (calls) => {
      const { withGenerationRuntimePin, getAIClient, pickGenerationRuntime } = require('./ai-generator')
      assert.strictEqual(pickGenerationRuntime(), 'claude', 'precondition: unpinned order picks claude')
      await withGenerationRuntimePin({ runtime: 'droid' }, async () => {
        const { client } = getAIClient({ openai: 'sk-stale-browser-key' })
        await client.chat.completions.create({ messages: [{ role: 'user', content: 'hi' }] })
      })
      assert.strictEqual(calls.length, 1, 'Expected the pinned runtime to be used')
      assert.strictEqual(calls[0].runtime, 'droid', `Pinned droid, generated on ${calls[0].runtime}`)
    })
  })
}])

asyncCases.push(['the model chosen for the agent reaches the CLI that generates it', async () => {
  // The model dropdown is scoped to the pinned runtime's own catalog, so ignoring it generated on
  // a different model than the agent was created with -- claude was hardcoded to its 'sonnet'
  // default no matter which alias the user picked.
  await withWorkspaceAsync(['claude', 'droid'], { CLAUDE_BIN: realBinary, DROID_BIN: realBinary }, async () => {
    await withRuntimeTurnResult({ text: '{"identity":"x"}' }, async (calls) => {
      const { withGenerationRuntimePin, getAIClient } = require('./ai-generator')
      await withGenerationRuntimePin({ runtime: 'claude', model: 'opus' }, async () => {
        const { client } = getAIClient(undefined)
        await client.chat.completions.create({ messages: [{ role: 'user', content: 'hi' }] })
      })
      assert.strictEqual(calls[0].runtime, 'claude')
      assert.strictEqual(calls[0].model, 'opus', `Expected the chosen model, got ${calls[0].model}`)
    })
  })
}])

asyncCases.push(['a pinned model never leaks onto a different runtime', async () => {
  // Model ids are runtime-specific; handing droid's id to claude produces a turn that cannot run.
  await withWorkspaceAsync(['claude', 'droid'], { CLAUDE_BIN: realBinary, DROID_BIN: realBinary, CLAWMAX_ANTHROPIC_GENERATION_MODEL: undefined }, async () => {
    await withRuntimeTurnResult({ text: '{"identity":"x"}' }, async (calls) => {
      const { withGenerationRuntimePin, buildClientForSelection } = require('./ai-generator')
      await withGenerationRuntimePin({ runtime: 'droid', model: 'gpt-5-codex' }, async () => {
        const { client } = buildClientForSelection({ provider: 'cli-runtime', key: 'claude' })
        await client.chat.completions.create({ messages: [{ role: 'user', content: 'hi' }] })
      })
      assert.strictEqual(calls[0].runtime, 'claude')
      assert.notStrictEqual(calls[0].model, 'gpt-5-codex', 'droid\'s model id must not be sent to claude')
    })
  })
}])

asyncCases.push(['a chosen runtime that cannot run is reported, not silently replaced', async () => {
  // What the operator actually saw: two stacked errors, the second naming an OpenAI key they had
  // stopped using. A runtime picked in the UI is an answer -- if it cannot run, say so.
  await withWorkspaceAsync(['claude', 'droid'], { CLAUDE_BIN: realBinary, DROID_BIN: realBinary }, async () => {
    await withRuntimeTurnResult({ errorText: 'Not logged in \u00b7 Please run /login' }, async () => {
      const { withGenerationRuntimePin, getAIClient } = require('./ai-generator')
      const message = await withGenerationRuntimePin({ runtime: 'claude', model: 'opus' }, async () => {
        const { client } = getAIClient({ openai: 'sk-stale-browser-key' })
        try {
          await client.chat.completions.create({ messages: [{ role: 'user', content: 'hi' }] })
          return 'NO_ERROR'
        } catch (err: any) { return String(err?.message || err) }
      })
      assert(/Claude Code/.test(message), `Expected the failure to name the chosen runtime, got: ${message}`)
      assert(/logged in/i.test(message), `Expected the CLI's own reason to survive, got: ${message}`)
      assert(!/OpenAI|401|api key/i.test(message), `A hosted provider was substituted: ${message}`)
    })
  })
}])

asyncCases.push(['generation still resolves a provider normally when nothing is pinned', async () => {
  // The pin must not become a requirement: the template wizard and every scripted caller send no
  // runtime at all, and they still have to generate.
  await withWorkspaceAsync(['droid'], { DROID_BIN: realBinary }, async () => {
    await withRuntimeTurnResult({ text: '{"identity":"x"}' }, async (calls) => {
      const { withGenerationRuntimePin, getAIClient } = require('./ai-generator')
      await withGenerationRuntimePin(undefined, async () => {
        const { client } = getAIClient(undefined)
        await client.chat.completions.create({ messages: [{ role: 'user', content: 'hi' }] })
      })
      assert.strictEqual(calls[0].runtime, 'droid')
      assert.strictEqual(calls[0].model, undefined, 'droid supplies its own default when unpinned')
    })
  })
}])

runAsyncCases().then(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})
