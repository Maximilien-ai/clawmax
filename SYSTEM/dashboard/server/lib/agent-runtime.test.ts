/**
 * Agent runtime adapter test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-runtime.test.ts
 */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  AGENT_RUNTIME_IDS,
  buildRuntimePlan,
  claudeSessionUuid,
  classifyClaudeSessionError,
  detectRuntimeStatuses,
  droidSessionId,
  normalizeAgentRuntime,
  parseRuntimeResult,
  readAgentIdentitySystemPrompt,
  resolveAgentRuntime,
  resolveEnabledRuntimes,
  resolveRuntimeCliPath,
  resolveWorkspaceRuntime,
  runRuntimeCli,
  runtimeModelArg,
  RuntimeModelError,
} from './agent-runtime'
import { hasRuntimeSession } from './runtime-sessions'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const originals = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    originals.set(key, process.env[key])
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of originals.entries()) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
  }
}

// Async-safe variants: the sync helpers above tear down (rm/restore-env) as soon as `fn`
// returns, which for an async `fn` is before its body actually runs. These `await fn()` first.
async function withTempDirAsync<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    return await fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function withEnvAsync<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const originals = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    originals.set(key, process.env[key])
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of originals.entries()) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
  }
}

function writeFakeCli(filePath: string, versionOutput: string) {
  fs.writeFileSync(filePath, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "${versionOutput}"; else echo ok; fi\n`, 'utf-8')
  fs.chmodSync(filePath, 0o755)
}

function writeFakeNodeCli(filePath: string, body: string) {
  fs.writeFileSync(filePath, `#!/usr/bin/env node\n${body}\n`, 'utf-8')
  fs.chmodSync(filePath, 0o755)
}

console.log(`\n${YELLOW}=== Agent Runtime Adapter Test Suite ===${RESET}\n`)

// ── normalizeAgentRuntime ──

test('normalizeAgentRuntime accepts known ids case-insensitively and trims whitespace', () => {
  assert.strictEqual(normalizeAgentRuntime(' Claude '), 'claude')
  assert.strictEqual(normalizeAgentRuntime('DROID'), 'droid')
  assert.strictEqual(normalizeAgentRuntime('openclaw'), 'openclaw')
})

test('normalizeAgentRuntime rejects unknown or non-string values', () => {
  assert.strictEqual(normalizeAgentRuntime('bogus'), undefined)
  assert.strictEqual(normalizeAgentRuntime(''), undefined)
  assert.strictEqual(normalizeAgentRuntime(undefined), undefined)
  assert.strictEqual(normalizeAgentRuntime(null), undefined)
  assert.strictEqual(normalizeAgentRuntime(42), undefined)
  assert.strictEqual(normalizeAgentRuntime({ id: 'claude' }), undefined)
})

test('AGENT_RUNTIME_IDS exposes exactly the three supported runtimes', () => {
  assert.deepStrictEqual(AGENT_RUNTIME_IDS, ['openclaw', 'claude', 'droid'])
})

// ── resolveRuntimeCliPath precedence (claude + droid) ──

for (const rt of ['claude', 'droid'] as const) {
  const envVar = rt === 'claude' ? 'CLAUDE_BIN' : 'DROID_BIN'

  test(`resolveRuntimeCliPath(${rt}) prefers ${envVar} override when executable`, () => {
    withTempDir(`clawmax-agent-runtime-${rt}-override-`, (dir) => {
      const fakeCli = path.join(dir, rt)
      writeFakeCli(fakeCli, `${rt} 1.0.0`)
      withEnv({ [envVar]: fakeCli }, () => {
        assert.strictEqual(resolveRuntimeCliPath(rt), fakeCli)
      })
    })
  })

  test(`resolveRuntimeCliPath(${rt}) returns PATH entry when override is absent`, () => {
    withTempDir(`clawmax-agent-runtime-${rt}-path-`, (dir) => {
      const binDir = path.join(dir, 'bin')
      fs.mkdirSync(binDir, { recursive: true })
      const fakeCli = path.join(binDir, rt)
      writeFakeCli(fakeCli, `${rt} 1.0.0`)
      // Prepend binDir onto the real PATH (rather than replacing it) so `which` itself stays
      // resolvable — our fixture still wins because it comes first.
      withEnv({ [envVar]: undefined, PATH: `${binDir}:${process.env.PATH || ''}`, HOME: dir }, () => {
        assert.strictEqual(resolveRuntimeCliPath(rt), fakeCli)
      })
    })
  })

  test(`resolveRuntimeCliPath(${rt}) falls back to PATH when override is not executable`, () => {
    withTempDir(`clawmax-agent-runtime-${rt}-fallback-`, (dir) => {
      const badOverride = path.join(dir, `not-executable-${rt}`)
      const binDir = path.join(dir, 'bin')
      fs.mkdirSync(binDir, { recursive: true })
      const pathCli = path.join(binDir, rt)
      fs.writeFileSync(badOverride, 'echo broken\n', 'utf-8')
      writeFakeCli(pathCli, `${rt} 1.0.0`)
      withEnv({ [envVar]: badOverride, PATH: `${binDir}:${process.env.PATH || ''}`, HOME: dir }, () => {
        assert.strictEqual(resolveRuntimeCliPath(rt), pathCli)
      })
    })
  })

  test(`resolveRuntimeCliPath(${rt}) falls back to ~/.local/bin/${rt} when PATH has no match`, () => {
    withTempDir(`clawmax-agent-runtime-${rt}-home-`, (dir) => {
      const localBin = path.join(dir, '.local', 'bin')
      fs.mkdirSync(localBin, { recursive: true })
      const homeCli = path.join(localBin, rt)
      writeFakeCli(homeCli, `${rt} 1.0.0`)
      withEnv({ [envVar]: undefined, PATH: path.join(dir, 'empty-bin'), HOME: dir }, () => {
        assert.strictEqual(resolveRuntimeCliPath(rt), homeCli)
      })
    })
  })

  test(`resolveRuntimeCliPath(${rt}) returns null when nothing resolves`, () => {
    withTempDir(`clawmax-agent-runtime-${rt}-none-`, (dir) => {
      withEnv({ [envVar]: undefined, PATH: path.join(dir, 'empty-bin'), HOME: dir }, () => {
        assert.strictEqual(resolveRuntimeCliPath(rt), null)
      })
    })
  })
}

// ── resolveWorkspaceRuntime / resolveAgentRuntime precedence ──

function withWorkspace<T>(config: Record<string, unknown> | null, fn: () => T): T {
  return withTempDir('clawmax-agent-runtime-workspace-', (dir) => {
    if (config) {
      fs.mkdirSync(path.join(dir, 'SYSTEM'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'SYSTEM', 'integrations.json'), JSON.stringify(config), 'utf-8')
    }
    return withEnv({ CLAWMAX_TEST_WORKSPACE: dir, OPENCLAW_WORKSPACE: dir, HOME: dir }, fn)
  })
}

async function withWorkspaceAsync<T>(config: Record<string, unknown> | null, fn: () => Promise<T>): Promise<T> {
  return withTempDirAsync('clawmax-agent-runtime-workspace-async-', async (dir) => {
    if (config) {
      fs.mkdirSync(path.join(dir, 'SYSTEM'), { recursive: true })
      fs.writeFileSync(path.join(dir, 'SYSTEM', 'integrations.json'), JSON.stringify(config), 'utf-8')
    }
    return withEnvAsync({ CLAWMAX_TEST_WORKSPACE: dir, OPENCLAW_WORKSPACE: dir, HOME: dir }, fn)
  })
}

test('resolveWorkspaceRuntime defaults to openclaw when no config exists', () => {
  withWorkspace(null, () => {
    assert.strictEqual(resolveWorkspaceRuntime(), 'openclaw')
  })
})

test('resolveWorkspaceRuntime honors a valid agentRuntime field', () => {
  withWorkspace({ agentRuntime: 'claude' }, () => {
    assert.strictEqual(resolveWorkspaceRuntime(), 'claude')
  })
})

test('resolveWorkspaceRuntime falls back to openclaw for an invalid agentRuntime value', () => {
  withWorkspace({ agentRuntime: 'not-a-runtime' }, () => {
    assert.strictEqual(resolveWorkspaceRuntime(), 'openclaw')
  })
})

test('resolveEnabledRuntimes returns the enabled CLI set, filtering junk and openclaw', () => {
  withWorkspace({ enabledRuntimes: ['claude', 'droid', 'openclaw', 'not-a-runtime'] }, () => {
    assert.deepStrictEqual(resolveEnabledRuntimes(), ['claude', 'droid'])
  })
})

test('resolveEnabledRuntimes returns [] when nothing is enabled', () => {
  withWorkspace(null, () => {
    assert.deepStrictEqual(resolveEnabledRuntimes(), [])
  })
})

test('resolveAgentRuntime: honors a per-agent pin when that CLI is enabled', () => {
  withWorkspace({ enabledRuntimes: ['droid'] }, () => {
    assert.strictEqual(resolveAgentRuntime('agent1', 'droid'), 'droid')
  })
})

test('resolveAgentRuntime: unpinned agents run on openclaw even when CLIs are enabled', () => {
  withWorkspace({ enabledRuntimes: ['claude', 'droid'] }, () => {
    assert.strictEqual(resolveAgentRuntime('agent1', undefined), 'openclaw')
  })
})

test('resolveAgentRuntime: a pin to a disabled CLI falls back to openclaw', () => {
  withWorkspace({ enabledRuntimes: ['claude'] }, () => {
    assert.strictEqual(resolveAgentRuntime('agent1', 'droid'), 'openclaw')
  })
})

test('resolveAgentRuntime: an invalid pin falls back to openclaw', () => {
  withWorkspace({ enabledRuntimes: ['claude', 'droid'] }, () => {
    assert.strictEqual(resolveAgentRuntime('agent1', 'not-a-runtime'), 'openclaw')
  })
})

test('resolveAgentRuntime: falls back to openclaw when neither pin nor workspace default is set', () => {
  withWorkspace(null, () => {
    assert.strictEqual(resolveAgentRuntime('agent1', undefined), 'openclaw')
  })
})

// ── claudeSessionUuid ──

test('claudeSessionUuid is deterministic for identical inputs', () => {
  const a = claudeSessionUuid('session-1', 'agent-1')
  const b = claudeSessionUuid('session-1', 'agent-1')
  assert.strictEqual(a, b)
})

test('claudeSessionUuid differs when scopedSessionId or agentId changes', () => {
  const base = claudeSessionUuid('session-1', 'agent-1')
  assert.notStrictEqual(claudeSessionUuid('session-2', 'agent-1'), base)
  assert.notStrictEqual(claudeSessionUuid('session-1', 'agent-2'), base)
})

test('claudeSessionUuid produces a valid RFC 4122 v4-shaped UUID', () => {
  const uuid = claudeSessionUuid('session-1', 'agent-1')
  assert.ok(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid),
    `Expected UUID v4 shape, got ${uuid}`
  )
})

// ── droidSessionId ──

test('droidSessionId is deterministic for identical inputs', () => {
  const a = droidSessionId('session-1', 'agent-1')
  const b = droidSessionId('session-1', 'agent-1')
  assert.strictEqual(a, b)
})

test('droidSessionId differs when scopedSessionId changes (agentId held fixed)', () => {
  const base = droidSessionId('session-1', 'agent-1')
  assert.notStrictEqual(droidSessionId('session-2', 'agent-1'), base)
})

test('droidSessionId binds to agentId: identical scopedSessionId never collides across two different agents', () => {
  // This is the exact cross-agent-hijack shape from the finding: two agents sharing the same
  // (client-derived or attacker-supplied) raw scopedSessionId must never resolve to the same
  // underlying droid `-s` value.
  const sharedScopedSessionId = 'agent:agent-a:dashboard-chat'
  const forAgentA = droidSessionId(sharedScopedSessionId, 'agent-a')
  const forAgentB = droidSessionId(sharedScopedSessionId, 'agent-b')
  assert.notStrictEqual(forAgentA, forAgentB)
})

test('droidSessionId only ever produces droid-safe characters within the documented length bound', () => {
  const id = droidSessionId('session-1', 'agent-1')
  assert.ok(id.length > 0 && id.length <= 48, `Expected length in (0, 48], got ${id.length}`)
  assert.ok(/^[0-9a-f]+$/.test(id), `Expected only [0-9a-f] characters, got ${id}`)
})

// ── runtimeModelArg / RuntimeModelError ──

test('runtimeModelArg(claude) strips the anthropic/ prefix', () => {
  assert.strictEqual(runtimeModelArg('claude', 'anthropic/claude-sonnet-4-20250514'), 'claude-sonnet-4-20250514')
})

test('runtimeModelArg(claude) throws RuntimeModelError for a non-anthropic model', () => {
  assert.throws(() => runtimeModelArg('claude', 'openai/gpt-5.5'), RuntimeModelError)
})

test('runtimeModelArg(claude) throws RuntimeModelError for an undefined model', () => {
  assert.throws(() => runtimeModelArg('claude', undefined), RuntimeModelError)
})

test('runtimeModelArg(claude) throws RuntimeModelError for a bare model with no provider prefix', () => {
  assert.throws(() => runtimeModelArg('claude', 'claude-sonnet-4-20250514'), RuntimeModelError)
})

test('runtimeModelArg(claude) error message names the offending model and points at a fix', () => {
  try {
    runtimeModelArg('claude', 'openai/gpt-5.5')
    assert.fail('expected RuntimeModelError to be thrown')
  } catch (err: any) {
    assert.ok(err instanceof RuntimeModelError)
    assert.strictEqual(
      err.message,
      "Claude Code runtime supports Anthropic models only. Agent model is 'openai/gpt-5.5'. Pick an Anthropic model or switch the agent's runtime."
    )
  }
})

test('runtimeModelArg(droid) strips the leading provider/ segment', () => {
  assert.strictEqual(runtimeModelArg('droid', 'openai/gpt-5.5'), 'gpt-5.5')
  assert.strictEqual(runtimeModelArg('droid', 'anthropic/claude-opus-4-8'), 'claude-opus-4-8')
})

test('runtimeModelArg(droid) passes bare models through unchanged', () => {
  assert.strictEqual(runtimeModelArg('droid', 'claude-opus-4-8'), 'claude-opus-4-8')
})

test('runtimeModelArg(droid) returns undefined for an undefined model', () => {
  assert.strictEqual(runtimeModelArg('droid', undefined), undefined)
})

test('runtimeModelArg(openclaw) passes the model through unchanged (ClawMax notation stays)', () => {
  assert.strictEqual(runtimeModelArg('openclaw', 'anthropic/claude-sonnet-4-20250514'), 'anthropic/claude-sonnet-4-20250514')
  assert.strictEqual(runtimeModelArg('openclaw', undefined), undefined)
})

// ── buildRuntimePlan: args for all runtime x mode x resume combos ──

function withStubbedClis<T>(fn: (dir: string) => T): T {
  return withTempDir('clawmax-agent-runtime-plan-', (dir) => {
    const openclawCli = path.join(dir, 'openclaw')
    const claudeCli = path.join(dir, 'claude')
    const droidCli = path.join(dir, 'droid')
    writeFakeCli(openclawCli, 'openclaw 1.0.0')
    writeFakeCli(claudeCli, 'claude 1.0.0')
    writeFakeCli(droidCli, 'droid 1.0.0')
    return withEnv({ OPENCLAW_BIN: openclawCli, CLAUDE_BIN: claudeCli, DROID_BIN: droidCli }, () => fn(dir))
  })
}

test('buildRuntimePlan(openclaw, chat) matches today\'s args exactly, no cwd, streams deltas', () => {
  withStubbedClis(() => {
    const plan = buildRuntimePlan({
      runtime: 'openclaw', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    assert.deepStrictEqual(plan.args, ['agent', '--agent', 'agent1', '--session-id', 'sess1', '--message', 'hello'])
    assert.strictEqual(plan.cwd, undefined)
    assert.strictEqual(plan.streamsDeltas, true)
  })
})

test('buildRuntimePlan(openclaw, json) appends --json and does not stream deltas', () => {
  withStubbedClis(() => {
    const plan = buildRuntimePlan({
      runtime: 'openclaw', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    assert.deepStrictEqual(plan.args, ['agent', '--agent', 'agent1', '--session-id', 'sess1', '--message', 'hello', '--json'])
    assert.strictEqual(plan.streamsDeltas, false)
  })
})

test('buildRuntimePlan(claude, chat, create) uses --session-id with the deterministic UUID and full-autonomy flag', () => {
  withStubbedClis(() => {
    const plan = buildRuntimePlan({
      runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', model: 'anthropic/claude-sonnet-4-20250514', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    const uuid = claudeSessionUuid('sess1', 'agent1')
    assert.deepStrictEqual(plan.args, [
      '-p', 'hello',
      '--model', 'claude-sonnet-4-20250514',
      '--session-id', uuid,
      '--dangerously-skip-permissions',
    ])
    assert.strictEqual(plan.cwd, '/workspace/AGENTS/agent1')
    assert.strictEqual(plan.streamsDeltas, true)
  })
})

test('buildRuntimePlan(claude, json, resume) uses --resume and --output-format json', () => {
  withStubbedClis(() => {
    const plan = buildRuntimePlan({
      runtime: 'claude', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', model: 'anthropic/claude-sonnet-4-20250514', agentDir: '/workspace/AGENTS/agent1', resume: true,
    })
    const uuid = claudeSessionUuid('sess1', 'agent1')
    assert.deepStrictEqual(plan.args, [
      '-p', 'hello',
      '--model', 'claude-sonnet-4-20250514',
      '--resume', uuid,
      '--dangerously-skip-permissions',
      '--output-format', 'json',
    ])
    assert.strictEqual(plan.streamsDeltas, false)
  })
})

test('buildRuntimePlan(claude) appends --append-system-prompt only when a system prompt is given', () => {
  withStubbedClis(() => {
    const plan = buildRuntimePlan({
      runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', model: 'anthropic/claude-sonnet-4-20250514', agentDir: '/workspace/AGENTS/agent1',
      systemPrompt: 'You are TestBot.', resume: false,
    })
    assert.ok(plan.args.includes('--append-system-prompt'))
    assert.strictEqual(plan.args[plan.args.indexOf('--append-system-prompt') + 1], 'You are TestBot.')
  })
})

test('buildRuntimePlan(claude) throws RuntimeModelError for a non-anthropic model before spawning anything', () => {
  withStubbedClis(() => {
    assert.throws(() => buildRuntimePlan({
      runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', model: 'openai/gpt-5.5', agentDir: '/workspace/AGENTS/agent1', resume: false,
    }), RuntimeModelError)
  })
})

test('buildRuntimePlan(droid) includes -m only when a model is given, always -o json, no cwd field', () => {
  withStubbedClis(() => {
    const boundSessionId = droidSessionId('sess1', 'agent1')

    const withModel = buildRuntimePlan({
      runtime: 'droid', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', model: 'openai/gpt-5.5', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    assert.deepStrictEqual(withModel.args, [
      'exec', 'hello', '-m', 'gpt-5.5', '-s', boundSessionId, '--auto', 'high', '-o', 'json', '--cwd', '/workspace/AGENTS/agent1',
    ])
    assert.strictEqual(withModel.cwd, undefined)
    assert.strictEqual(withModel.streamsDeltas, false)

    const withoutModel = buildRuntimePlan({
      runtime: 'droid', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    assert.deepStrictEqual(withoutModel.args, [
      'exec', 'hello', '-s', boundSessionId, '--auto', 'high', '-o', 'json', '--cwd', '/workspace/AGENTS/agent1',
    ])
    assert.strictEqual(withoutModel.streamsDeltas, false)
  })
})

test('buildRuntimePlan(droid) never passes the raw scopedSessionId as -s (must be agent-bound)', () => {
  withStubbedClis(() => {
    const plan = buildRuntimePlan({
      runtime: 'droid', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    const sIndex = plan.args.indexOf('-s')
    assert.ok(sIndex !== -1, 'expected -s flag in droid args')
    assert.notStrictEqual(plan.args[sIndex + 1], 'sess1')
  })
})

test('buildRuntimePlan(droid) binds -s to the agent: identical scopedSessionId yields different session ids for two agents', () => {
  withStubbedClis(() => {
    const planA = buildRuntimePlan({
      runtime: 'droid', mode: 'json', agentId: 'agent-a', scopedSessionId: 'shared-session',
      message: 'hello', agentDir: '/workspace/AGENTS/agent-a', resume: false,
    })
    const planB = buildRuntimePlan({
      runtime: 'droid', mode: 'json', agentId: 'agent-b', scopedSessionId: 'shared-session',
      message: 'hello', agentDir: '/workspace/AGENTS/agent-b', resume: false,
    })
    const sessionIdOf = (plan: { args: string[] }) => plan.args[plan.args.indexOf('-s') + 1]
    assert.notStrictEqual(sessionIdOf(planA), sessionIdOf(planB))
  })
})

test('buildRuntimePlan(droid) -s is deterministic across repeated calls for the same agent + scopedSessionId', () => {
  withStubbedClis(() => {
    const build = () => buildRuntimePlan({
      runtime: 'droid', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    const first = build()
    const second = build()
    const sessionIdOf = (plan: { args: string[] }) => plan.args[plan.args.indexOf('-s') + 1]
    assert.strictEqual(sessionIdOf(first), sessionIdOf(second))
  })
})

test('buildRuntimePlan(droid) mode has no effect on streamsDeltas (always false)', () => {
  withStubbedClis(() => {
    const chat = buildRuntimePlan({
      runtime: 'droid', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hi', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    const json = buildRuntimePlan({
      runtime: 'droid', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hi', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    assert.strictEqual(chat.streamsDeltas, false)
    assert.strictEqual(json.streamsDeltas, false)
  })
})

test('buildRuntimePlan returns the runtime-specific missingCliError and a null cliPath when the CLI is absent', () => {
  withTempDir('clawmax-agent-runtime-missing-', (dir) => {
    withEnv({ CLAUDE_BIN: undefined, PATH: path.join(dir, 'empty'), HOME: dir }, () => {
      const plan = buildRuntimePlan({
        runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
        message: 'hi', model: 'anthropic/claude-sonnet-4-20250514', agentDir: dir, resume: false,
      })
      assert.strictEqual(plan.cliPath, null)
      assert.match(plan.missingCliError, /Claude Code CLI is not available.*CLAUDE_BIN/)
    })
  })
})

// ── parseRuntimeResult against verbatim probe outputs ──

test('parseRuntimeResult: claude json success (claude-probe.md TEST 1)', () => {
  const stdout = '{"type":"result","subtype":"success","is_error":false,"api_error_status":null,"duration_ms":2957,"duration_api_ms":2822,"ttft_ms":2898,"ttft_stream_ms":1102,"time_to_request_ms":97,"num_turns":1,"result":"PROBE_OK","stop_reason":"end_turn","session_id":"7177673e-06dd-4564-bae4-73bc39bccd55","total_cost_usd":0.0035399999999999997}'
  const parsed = parseRuntimeResult('claude', 'json', stdout, '', 0)
  assert.strictEqual(parsed.text, 'PROBE_OK')
  assert.strictEqual(parsed.errorText, undefined)
})

test('parseRuntimeResult: claude session-id-already-in-use (claude-probe.md TEST 2c)', () => {
  const stderr = 'Error: Session ID 8DB2CBB6-235B-4BDF-89E5-80C37CC0181A is already in use.'
  const parsed = parseRuntimeResult('claude', 'json', '', stderr, 1)
  assert.strictEqual(parsed.text, '')
  assert.strictEqual(parsed.errorText, stderr)
})

test('parseRuntimeResult: claude resume-wrong-cwd not-found (claude-probe.md TEST 6)', () => {
  const stderr = 'No conversation found with session ID: 8DB2CBB6-235B-4BDF-89E5-80C37CC0181A'
  const parsed = parseRuntimeResult('claude', 'json', '', stderr, 1)
  assert.strictEqual(parsed.errorText, stderr)
})

test('parseRuntimeResult: claude bad-model error lands on stdout in plain-text/chat mode (claude-probe.md TEST 5)', () => {
  const stdout = "There's an issue with the selected model (not-a-real-model). It may not exist or you may not have access to it. Run --model to pick a different model."
  const parsed = parseRuntimeResult('claude', 'chat', stdout, '', 1)
  assert.strictEqual(parsed.errorText, stdout)
})

test('parseRuntimeResult: claude plain-text success is stdout trimmed (claude-probe.md TEST 3)', () => {
  const parsed = parseRuntimeResult('claude', 'chat', 'PROBE_OK\n', '', 0)
  assert.strictEqual(parsed.text, 'PROBE_OK')
})

test('parseRuntimeResult: droid json success (droid-probe.md Probe 1)', () => {
  const stdout = '{"type":"result","subtype":"success","is_error":false,"duration_ms":23593,"num_turns":1,"result":"PROBE_OK","session_id":"f448f2c0-107b-494a-8609-c2bddea7b2dd","usage":{"input_tokens":2,"output_tokens":9,"cache_read_input_tokens":16928,"cache_creation_input_tokens":3556}}'
  const parsed = parseRuntimeResult('droid', 'json', stdout, '', 0)
  assert.strictEqual(parsed.text, 'PROBE_OK')
})

test('parseRuntimeResult: droid always parses as JSON even when mode is chat (droid always runs -o json)', () => {
  const stdout = '{"type":"result","subtype":"success","is_error":false,"duration_ms":100,"num_turns":1,"result":"CHAT_MODE_OK","session_id":"abc"}'
  const parsed = parseRuntimeResult('droid', 'chat', stdout, '', 0)
  assert.strictEqual(parsed.text, 'CHAT_MODE_OK')
})

test('parseRuntimeResult: droid bad-model failure has empty stdout, error on stderr, no JSON envelope (droid-probe.md Probe 6)', () => {
  const stderr = 'Invalid model: not-a-real-model\n\nAvailable built-in models:\n  auto, claude-opus-4-8, ...\n'
  const parsed = parseRuntimeResult('droid', 'json', '', stderr, 1)
  assert.strictEqual(parsed.text, '')
  assert.strictEqual(parsed.errorText, stderr.trim())
})

// ── classifyClaudeSessionError ──

test('classifyClaudeSessionError recognizes "already in use"', () => {
  assert.strictEqual(
    classifyClaudeSessionError('Error: Session ID 8DB2CBB6-235B-4BDF-89E5-80C37CC0181A is already in use.', ''),
    'already-in-use'
  )
})

test('classifyClaudeSessionError recognizes "No conversation found"', () => {
  assert.strictEqual(
    classifyClaudeSessionError('No conversation found with session ID: 8DB2CBB6-235B-4BDF-89E5-80C37CC0181A', ''),
    'not-found'
  )
})

test('classifyClaudeSessionError returns null for unrelated errors', () => {
  assert.strictEqual(classifyClaudeSessionError('some other CLI failure', ''), null)
  assert.strictEqual(classifyClaudeSessionError('', ''), null)
})

// ── readAgentIdentitySystemPrompt ──

test('readAgentIdentitySystemPrompt returns undefined when IDENTITY.md is absent', () => {
  withTempDir('clawmax-agent-runtime-identity-missing-', (dir) => {
    assert.strictEqual(readAgentIdentitySystemPrompt(dir), undefined)
  })
})

test('readAgentIdentitySystemPrompt strips content from "## Creation Metadata" onward', () => {
  withTempDir('clawmax-agent-runtime-identity-strip-', (dir) => {
    fs.writeFileSync(path.join(dir, 'IDENTITY.md'), '**Name:** TestBot\n**Model:** anthropic/claude-sonnet-4-20250514\n\n## Creation Metadata\nsecret internal notes\n', 'utf-8')
    const prompt = readAgentIdentitySystemPrompt(dir)
    assert.ok(prompt?.includes('TestBot'))
    assert.ok(!prompt?.includes('secret internal notes'))
  })
})

test('readAgentIdentitySystemPrompt caps output at 16000 characters', () => {
  withTempDir('clawmax-agent-runtime-identity-cap-', (dir) => {
    fs.writeFileSync(path.join(dir, 'IDENTITY.md'), 'x'.repeat(20000), 'utf-8')
    const prompt = readAgentIdentitySystemPrompt(dir)
    assert.strictEqual(prompt?.length, 16000)
  })
})

// ── detectRuntimeStatuses ──

test('detectRuntimeStatuses reports installed status, version, and active flag without throwing', () => {
  withStubbedClis(() => {
    const statuses = detectRuntimeStatuses('claude')
    assert.strictEqual(statuses.length, 3)
    const claude = statuses.find((s) => s.id === 'claude')
    assert.ok(claude?.installed)
    assert.strictEqual(claude?.active, true)
    assert.ok(claude?.version?.includes('claude'))
    const droid = statuses.find((s) => s.id === 'droid')
    assert.strictEqual(droid?.active, false)
  })
})

test('detectRuntimeStatuses never throws when no CLIs are present', () => {
  withTempDir('clawmax-agent-runtime-detect-none-', (dir) => {
    withEnv({ CLAUDE_BIN: undefined, DROID_BIN: undefined, OPENCLAW_BIN: undefined, PATH: path.join(dir, 'empty'), HOME: dir }, () => {
      const statuses = detectRuntimeStatuses('openclaw')
      assert.strictEqual(statuses.length, 3)
      assert.ok(statuses.every((s) => s.installed === false))
    })
  })
})

// ── runRuntimeCli: spawn + self-heal behavior ──

async function run(): Promise<void> {
  await testAsync('runRuntimeCli returns parsed text on a clean success and delivers one final onDelta for non-streaming plans', async () => {
    await withTempDirAsync('clawmax-agent-runtime-exec-success-', async (dir) => {
      const cli = path.join(dir, 'fake-droid.js')
      writeFakeNodeCli(cli, `
        process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'DROID_OK', session_id: 'sess1' }))
      `)
      fs.chmodSync(cli, 0o755)
      const plan = { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: false }
      const deltas: string[] = []
      const result = await runRuntimeCli({
        plan, env: process.env as NodeJS.ProcessEnv, timeoutMs: 5000,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called for droid') },
        runtime: 'droid', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
        onDelta: (text) => deltas.push(text),
      })
      assert.strictEqual(result.text, 'DROID_OK')
      assert.strictEqual(result.errorText, undefined)
      assert.deepStrictEqual(deltas, ['DROID_OK'])
    })
  })

  await testAsync('runRuntimeCli injects IS_SANDBOX=1 for claude when running as root, but not for droid', async () => {
    await withTempDirAsync('clawmax-agent-runtime-sandbox-', async (dir) => {
      const cli = path.join(dir, 'fake-cli.js')
      // Echo the spawned IS_SANDBOX env value back through the result envelope.
      writeFakeNodeCli(cli, `
        process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'IS_SANDBOX=' + (process.env.IS_SANDBOX || ''), session_id: 's' }))
      `)
      fs.chmodSync(cli, 0o755)
      const plan = { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: false }
      const baseEnv = { ...process.env, IS_SANDBOX: undefined } as NodeJS.ProcessEnv
      const originalGetuid = process.getuid
      ;(process as any).getuid = () => 0 // simulate running as root (the container case)
      try {
        const claudeRes = await runRuntimeCli({
          plan, env: baseEnv, timeoutMs: 5000, rebuildPlan: () => plan,
          runtime: 'claude', mode: 'json', agentId: 'a', scopedSessionId: 's',
        })
        assert.strictEqual(claudeRes.text, 'IS_SANDBOX=1', 'claude as root must receive IS_SANDBOX=1')
        const droidRes = await runRuntimeCli({
          plan, env: baseEnv, timeoutMs: 5000, rebuildPlan: () => plan,
          runtime: 'droid', mode: 'json', agentId: 'a', scopedSessionId: 's',
        })
        assert.strictEqual(droidRes.text, 'IS_SANDBOX=', 'droid must not get IS_SANDBOX injected')
      } finally {
        ;(process as any).getuid = originalGetuid
      }
    })
  })

  await testAsync('runRuntimeCli streams multiple chunks for streamsDeltas plans instead of one final delta', async () => {
    await withTempDirAsync('clawmax-agent-runtime-exec-stream-', async (dir) => {
      const cli = path.join(dir, 'fake-claude.js')
      writeFakeNodeCli(cli, `
        process.stdout.write('Hello ')
        setTimeout(() => { process.stdout.write('World'); }, 30)
      `)
      fs.chmodSync(cli, 0o755)
      const plan = { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: true }
      const deltas: string[] = []
      const result = await runRuntimeCli({
        plan, env: process.env as NodeJS.ProcessEnv, timeoutMs: 5000,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called on a clean success') },
        runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
        onDelta: (text) => deltas.push(text),
      })
      assert.strictEqual(result.text, 'Hello World')
      assert.ok(deltas.length >= 2, `Expected multiple streamed chunks, got ${deltas.length}`)
    })
  })

  await testAsync('runRuntimeCli kills the process and reports errorText "timeout" when it runs too long', async () => {
    await withTempDirAsync('clawmax-agent-runtime-exec-timeout-', async (dir) => {
      const cli = path.join(dir, 'fake-slow.js')
      writeFakeNodeCli(cli, `setTimeout(() => {}, 60000)`)
      fs.chmodSync(cli, 0o755)
      const plan = { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: false }
      const result = await runRuntimeCli({
        plan, env: process.env as NodeJS.ProcessEnv, timeoutMs: 200,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called on timeout') },
        runtime: 'droid', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      })
      assert.strictEqual(result.errorText, 'timeout')
    })
  })

  await testAsync('runRuntimeCli self-heals claude "already in use" by retrying with --resume and marks the session', async () => {
    await withTempDirAsync('clawmax-agent-runtime-exec-heal-inuse-', async (dir) => {
      const cli = path.join(dir, 'fake-claude-inuse.js')
      writeFakeNodeCli(cli, `
        const args = process.argv.slice(2)
        if (args.includes('--session-id')) {
          process.stderr.write('Error: Session ID FAKE-UUID is already in use.')
          process.exit(1)
        } else if (args.includes('--resume')) {
          process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'RESUMED_OK', session_id: 'FAKE-UUID' }))
          process.exit(0)
        } else {
          process.exit(1)
        }
      `)
      fs.chmodSync(cli, 0o755)

      const createPlan = { cliPath: cli, args: ['--session-id', 'FAKE-UUID'], missingCliError: 'missing', streamsDeltas: false }
      const resumePlan = { cliPath: cli, args: ['--resume', 'FAKE-UUID'], missingCliError: 'missing', streamsDeltas: false }

      await withWorkspaceAsync(null, async () => {
        let rebuildCalls = 0
        const result = await runRuntimeCli({
          plan: createPlan, env: process.env as NodeJS.ProcessEnv, timeoutMs: 5000,
          rebuildPlan: (resume) => { rebuildCalls++; return resume ? resumePlan : createPlan },
          runtime: 'claude', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
        })
        assert.strictEqual(result.text, 'RESUMED_OK')
        assert.strictEqual(rebuildCalls, 1)
        assert.strictEqual(hasRuntimeSession('claude', 'agent1', 'sess1'), true)
      })
    })
  })

  await testAsync('runRuntimeCli self-heals claude "not found" by retrying with --session-id', async () => {
    await withTempDirAsync('clawmax-agent-runtime-exec-heal-notfound-', async (dir) => {
      const cli = path.join(dir, 'fake-claude-notfound.js')
      writeFakeNodeCli(cli, `
        const args = process.argv.slice(2)
        if (args.includes('--resume')) {
          process.stderr.write('No conversation found with session ID: FAKE-UUID')
          process.exit(1)
        } else if (args.includes('--session-id')) {
          process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'CREATED_OK', session_id: 'FAKE-UUID' }))
          process.exit(0)
        } else {
          process.exit(1)
        }
      `)
      fs.chmodSync(cli, 0o755)

      const resumePlan = { cliPath: cli, args: ['--resume', 'FAKE-UUID'], missingCliError: 'missing', streamsDeltas: false }
      const createPlan = { cliPath: cli, args: ['--session-id', 'FAKE-UUID'], missingCliError: 'missing', streamsDeltas: false }

      const result = await runRuntimeCli({
        plan: resumePlan, env: process.env as NodeJS.ProcessEnv, timeoutMs: 5000,
        rebuildPlan: (resume) => (resume ? resumePlan : createPlan),
        runtime: 'claude', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      })
      assert.strictEqual(result.text, 'CREATED_OK')
    })
  })

  await testAsync('runRuntimeCli does not retry droid errors (self-heal is claude-only)', async () => {
    await withTempDirAsync('clawmax-agent-runtime-exec-no-heal-droid-', async (dir) => {
      const cli = path.join(dir, 'fake-droid-error.js')
      writeFakeNodeCli(cli, `
        process.stderr.write('some droid failure')
        process.exit(1)
      `)
      fs.chmodSync(cli, 0o755)
      const plan = { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: false }
      const result = await runRuntimeCli({
        plan, env: process.env as NodeJS.ProcessEnv, timeoutMs: 5000,
        rebuildPlan: () => { throw new Error('rebuildPlan should never be called for droid') },
        runtime: 'droid', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      })
      assert.strictEqual(result.errorText, 'some droid failure')
    })
  })

  await testAsync('runRuntimeCli does not retry unclassified claude errors', async () => {
    await withTempDirAsync('clawmax-agent-runtime-exec-no-heal-unclassified-', async (dir) => {
      const cli = path.join(dir, 'fake-claude-other.js')
      writeFakeNodeCli(cli, `
        process.stderr.write('some unrelated claude failure')
        process.exit(1)
      `)
      fs.chmodSync(cli, 0o755)
      const plan = { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: false }
      const result = await runRuntimeCli({
        plan, env: process.env as NodeJS.ProcessEnv, timeoutMs: 5000,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called for an unclassified error') },
        runtime: 'claude', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      })
      assert.strictEqual(result.errorText, 'some unrelated claude failure')
    })
  })
}

run().then(() => {
  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
})
