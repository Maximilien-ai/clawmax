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

test('an alias reaches the claude CLI unchanged and a foreign model still throws', () => {
  const { runtimeModelArg, buildRuntimePlan, CLAUDE_MODEL_ALIASES } = require('./agent-runtime')
  for (const alias of CLAUDE_MODEL_ALIASES) {
    assert.strictEqual(runtimeModelArg('claude', alias), alias, `Alias ${alias} should pass through`)
  }
  assert.throws(() => runtimeModelArg('claude', 'openai/sonnet'), /Anthropic models only/,
    'A provider-qualified non-Anthropic model must still be rejected')
  assert.throws(() => runtimeModelArg('claude', 'openai/gpt-5'), /Anthropic models only/)
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

async function asyncTest(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log(`${GREEN}✓${RESET} ${name}`); passed++ }
  catch (err: any) { console.log(`${RED}✗${RESET} ${name}`); console.log(`  ${err.message}`); failed++ }
}

async function runAsyncCases() {
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

runAsyncCases().then(() => {
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})
