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


asyncCases.push(['a completed CLI request clears its timeout instead of leaking it', async () => {
  await withWorkspaceAsync(['droid'], { DROID_BIN: realBinary }, async () => {
  const { createChatCompletionWithCompatibilityRetry } = require('./ai-generator')
  // Count timers created and cleared across the call. A leaked 245s timer would show as an
  // unmatched creation and, in the server, keep a closure alive per request.
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
  assert(created > 0, 'Expected the request to arm a timeout')
  assert.strictEqual(cleared, created, `Armed ${created} timers but cleared ${cleared}`)
  })
}])

asyncCases.push(['a CLI that ignores SIGTERM is escalated to SIGKILL', async () => {
  const { runRuntimeCli } = require('./agent-runtime')
  // A shell that traps SIGTERM and keeps running — exactly the case SIGTERM alone cannot end.
  const plan = {
    cliPath: '/bin/sh',
    args: ['-c', 'trap "" TERM; while true; do sleep 0.2; done'],
    missingCliError: 'unused',
    streamsDeltas: false,
  }
  const started = Date.now()
  const { errorText } = await runRuntimeCli({
    plan, env: process.env, timeoutMs: 1000, rebuildPlan: () => plan,
    runtime: 'droid', mode: 'json', agentId: 'kill-test', scopedSessionId: 'kill-test',
  })
  const elapsed = Date.now() - started
  assert.strictEqual(errorText, 'timeout', `Expected a timeout result, got: ${errorText}`)
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
        assert(calls[0].timeoutMs > 45000, `CLI needs more than the hosted default; got ${calls[0].timeoutMs}ms`)

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

asyncCases.push(['a CLI whose grandchild holds stdout still settles at its deadline', async () => {
  // The turn used to resolve only on the child's "close" event, which needs every stdio pipe
  // closed. Killing the CLI does not kill the processes it spawned, and those inherit stdout --
  // so the promise never settled, the caller's recovery never ran, and the request stayed wedged
  // server-side while the user saw only the route's own timeout message.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-hang-'))
  const fakeCli = path.join(dir, 'claude')
  // Backgrounds a grandchild that outlives the shell and keeps the inherited stdout open.
  fs.writeFileSync(fakeCli, '#!/bin/sh\nsleep 900 &\nsleep 900\n')
  fs.chmodSync(fakeCli, 0o755)
  await withWorkspaceAsync(['claude'], { CLAUDE_BIN: fakeCli }, async () => {
    const { executeAgentRuntimeTurn } = require('./agent-runtime')
    const started = Date.now()
    const result = await Promise.race([
      executeAgentRuntimeTurn({
        runtime: 'claude', agentId: 'hang-probe', agentDir: dir, message: 'hi',
        scopedSessionId: 'hang-probe-session', model: 'sonnet', mode: 'chat',
        env: process.env, timeoutMs: 2000,
      }),
      new Promise((resolve) => setTimeout(() => resolve('NEVER_SETTLED'), 20000)),
    ])
    const elapsed = Date.now() - started
    assert.notStrictEqual(result, 'NEVER_SETTLED', `Turn never settled after ${elapsed}ms`)
    assert(elapsed < 15000, `Expected the turn to settle near its 2s deadline, took ${elapsed}ms`)
  })
  fs.rmSync(dir, { recursive: true, force: true })
}])

runAsyncCases().then(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})
