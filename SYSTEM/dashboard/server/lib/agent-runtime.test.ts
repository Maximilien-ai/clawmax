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
  runtimeModelArg, shouldClearSessionOnZeroOutputCancel, CLAUDE_POST_TURN_TOOLS,
  DROID_POST_TURN_TOOLS,
  RUNTIME_CANCELLED, isRuntimeCancelledError,
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
    withEnv({ WORKSPACES_INTEGRATIONS_RUNTIMES: undefined }, () => {
      assert.deepStrictEqual(resolveEnabledRuntimes(), [])
    })
  })
})

test('resolveEnabledRuntimes falls back to WORKSPACES_INTEGRATIONS_RUNTIMES when the workspace has no config', () => {
  withWorkspace(null, () => {
    withEnv({ WORKSPACES_INTEGRATIONS_RUNTIMES: 'claude, droid, bogus' }, () => {
      assert.deepStrictEqual(resolveEnabledRuntimes(), ['claude', 'droid'])
    })
  })
})

test('resolveEnabledRuntimes: workspace config overrides the env default (incl. explicit empty = all off)', () => {
  withEnv({ WORKSPACES_INTEGRATIONS_RUNTIMES: 'claude,droid' }, () => {
    withWorkspace({ enabledRuntimes: ['claude'] }, () => {
      assert.deepStrictEqual(resolveEnabledRuntimes(), ['claude'])
    })
    withWorkspace({ enabledRuntimes: [] }, () => {
      assert.deepStrictEqual(resolveEnabledRuntimes(), [])
    })
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

// Agents exist on disk pinned to claude with a provider model, because the suggestion panel
// used to rank the provider catalog for a pinned runtime. Refusing the turn left them
// permanently unusable, so an unrunnable model now falls back to the runtime's own default.
test('runtimeModelArg(claude) falls back to the runtime default for a non-anthropic model', () => {
  assert.strictEqual(runtimeModelArg('claude', 'openai/gpt-5.5'), 'sonnet')
})

test('runtimeModelArg(claude) falls back to the runtime default for an undefined model', () => {
  assert.strictEqual(runtimeModelArg('claude', undefined), 'sonnet')
})

test('runtimeModelArg(claude) falls back to the runtime default for a bare unaliased model', () => {
  assert.strictEqual(runtimeModelArg('claude', 'claude-sonnet-4-20250514'), 'sonnet')
})

test('runtimeModelArg(claude) still passes through a valid anthropic model and alias', () => {
  assert.strictEqual(runtimeModelArg('claude', 'anthropic/claude-sonnet-4-5-20250929'), 'claude-sonnet-4-5-20250929')
  assert.strictEqual(runtimeModelArg('claude', 'sonnet'), 'sonnet')
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

test('a resumed claude session that produced nothing before cancel is cleared, not reused', () => {
  // Resuming one long-lived transcript can produce no output at all, and because the session id is
  // deterministic every later turn resumes the same wedged transcript. Clearing it means the next
  // message starts fresh instead of re-entering the same hole.
  assert.strictEqual(shouldClearSessionOnZeroOutputCancel({
    runtime: 'claude', cancelled: true, text: '', resumed: true,
  }), true)
  // A fresh session has no stale transcript to blame.
  assert.strictEqual(shouldClearSessionOnZeroOutputCancel({
    runtime: 'claude', cancelled: true, text: '', resumed: false,
  }), false)
  // Partial output means the session was alive; the user just stopped it.
  assert.strictEqual(shouldClearSessionOnZeroOutputCancel({
    runtime: 'claude', cancelled: true, text: 'partial', resumed: true,
  }), false)
  // A turn that ended on its own is not evidence of a wedged session.
  assert.strictEqual(shouldClearSessionOnZeroOutputCancel({
    runtime: 'claude', cancelled: false, text: '', resumed: true,
  }), false)
  assert.strictEqual(shouldClearSessionOnZeroOutputCancel({
    runtime: 'droid', cancelled: true, text: '', resumed: true,
  }), false)
})


test('claude is denied every tool whose payoff outlives the turn, but keeps Task', () => {
  // The root cause, asserted at the rule. Measured: the agent armed a Monitor, said it would relay
  // results, ended its turn, and the process died 15s later -- reported as a success.
  //
  // The expected set is spelled out literally rather than spread from CLAUDE_POST_TURN_TOOLS. The
  // golden-argv tests below DO spread it, so they would keep passing if a tool were quietly deleted
  // from the constant -- the change would regress straight back to the original bug with a green
  // suite. This list is the one place that has to be edited deliberately.
  const EXPECTED_DENIED = [
    'Monitor', 'ScheduleWakeup', 'CronCreate', 'CronDelete', 'CronList',
    'RemoteTrigger', 'SendMessage', 'PushNotification', 'DesignSync',
  ]
  assert.deepStrictEqual([...CLAUDE_POST_TURN_TOOLS], EXPECTED_DENIED,
    'CLAUDE_POST_TURN_TOOLS changed. Every tool here defers work past the end of the turn, and the '
    + 'turn is one process -- so anything removed silently reopens the original bug. If Claude Code '
    + 'added or renamed a post-turn tool, add it here deliberately.')

  const plan = buildRuntimePlan({
    runtime: 'claude', mode: 'chat', agentId: 'a1', scopedSessionId: 's1',
    message: 'hi', agentDir: '/tmp/a1', resume: false,
  })
  const flagIndex = plan.args.indexOf('--disallowed-tools')
  assert.ok(flagIndex >= 0, 'claude must be spawned with --disallowed-tools')
  for (const tool of EXPECTED_DENIED) {
    assert.ok(plan.args.includes(tool), `${tool} must be denied: it cannot outlive the turn`)
  }
  // Subagents resolve inside the turn -- the process waits for them -- so Task must stay granted.
  // A measured 21-minute, 8-subagent research turn depends on this.
  assert.ok(!plan.args.includes('Task'), 'Task must NOT be denied')
})

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
      '--disallowed-tools', ...CLAUDE_POST_TURN_TOOLS,
    '--output-format', 'stream-json', '--verbose',
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
      '--disallowed-tools', ...CLAUDE_POST_TURN_TOOLS,
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

test('buildRuntimePlan(claude) runs a non-anthropic model on the runtime default instead of refusing', () => {
  withStubbedClis(() => {
    const plan = buildRuntimePlan({
      runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', model: 'openai/gpt-5.5', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    assert(plan.args.includes('sonnet'), `Expected the runtime default in args, got: ${plan.args.join(' ')}`)
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
      '--disabled-tools', DROID_POST_TURN_TOOLS.join(','),
    ])
    assert.strictEqual(withModel.cwd, undefined)
    assert.strictEqual(withModel.streamsDeltas, false)

    const withoutModel = buildRuntimePlan({
      runtime: 'droid', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
      message: 'hello', agentDir: '/workspace/AGENTS/agent1', resume: false,
    })
    assert.deepStrictEqual(withoutModel.args, [
      'exec', 'hello', '-s', boundSessionId, '--auto', 'high', '-o', 'json', '--cwd', '/workspace/AGENTS/agent1',
      '--disabled-tools', DROID_POST_TURN_TOOLS.join(','),
    ])
    assert.strictEqual(withoutModel.streamsDeltas, false)
  })
})

test('droid is denied every tool whose payoff outlives the turn, but keeps Task -- passed as one comma-joined value', () => {
  // Mirrors the claude test above. Reproduced directly against droid 0.158.0: a CronCreate call in
  // one process was visible to a CronList call in a second, unrelated process sharing the session.
  const plan = buildRuntimePlan({
    runtime: 'droid', mode: 'json', agentId: 'a1', scopedSessionId: 's1',
    message: 'hi', agentDir: '/tmp/a1', resume: false,
  })
  const flagIndex = plan.args.indexOf('--disabled-tools')
  assert.ok(flagIndex >= 0, 'droid must be spawned with --disabled-tools')
  // Verified against the real CLI: droid takes one comma-joined value here, not repeated/
  // space-separated args -- passing separate argv entries silently dropped everything but the
  // first, so this shape is load-bearing, not stylistic.
  assert.strictEqual(plan.args[flagIndex + 1], DROID_POST_TURN_TOOLS.join(','))
  for (const tool of ['CronCreate', 'CronDelete', 'CronList', 'CreateAutomation', 'EditAutomation', 'DeleteAutomation']) {
    assert.ok(plan.args[flagIndex + 1].split(',').includes(tool), `${tool} must be denied: it cannot outlive the turn`)
  }
  // Task/TaskOutput/TaskStop are droid's own subagent tool -- the process waits for them -- so,
  // mirroring CLAUDE_POST_TURN_TOOLS' Task exemption, they must stay granted.
  for (const tool of ['Task', 'TaskOutput', 'TaskStop']) {
    assert.ok(!(DROID_POST_TURN_TOOLS as readonly string[]).includes(tool), `${tool} must NOT be denied`)
  }
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

test('parseRuntimeResult: claude chat surfaces an error result event', () => {
  const message = "There's an issue with the selected model (not-a-real-model). It may not exist or you may not have access to it."
  const stdout = '{"type":"result","subtype":"error","is_error":true,"result":' + JSON.stringify(message) + '}'
  const parsed = parseRuntimeResult('claude', 'chat', stdout, '', 1)
  assert.strictEqual(parsed.errorText, message)
})

test('parseRuntimeResult: claude chat surfaces stderr when the stream produced nothing', () => {
  const parsed = parseRuntimeResult('claude', 'chat', '', 'boom from the CLI', 1)
  assert.strictEqual(parsed.errorText, 'boom from the CLI')
})

test('parseRuntimeResult: claude chat reads assistant text out of the stream-json log', () => {
  // Chat runs with --output-format stream-json so the turn produces output while it works;
  // plain -p printed nothing until the whole task finished, which was indistinguishable from a
  // hung process and got long turns killed at the deadline.
  const stdout = [
    '{"type":"system","subtype":"init"}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":"PROBE_OK"}]}}',
    '{"type":"result","subtype":"success","is_error":false,"result":"PROBE_OK"}',
  ].join('\n')
  const parsed = parseRuntimeResult('claude', 'chat', stdout, '', 0)
  assert.strictEqual(parsed.text, 'PROBE_OK')
})

test('parseRuntimeResult: claude chat falls back to streamed assistant text with no result event', () => {
  // A turn cut short by the deadline has no result event; whatever it already said still counts.
  const stdout = ['{"type":"assistant","message":{"content":[{"type":"text","text":"Partial "}]}}', '{"type":"assistant","message":{"content":[{"type":"text","text":"answer"}]}}'].join('\n')
  const parsed = parseRuntimeResult('claude', 'chat', stdout, '', null)
  assert.strictEqual(parsed.text, 'Partial answer')
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
        plan, env: process.env as NodeJS.ProcessEnv, signal: new AbortController().signal,
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
          plan, env: baseEnv, signal: new AbortController().signal, rebuildPlan: () => plan,
          runtime: 'claude', mode: 'json', agentId: 'a', scopedSessionId: 's',
        })
        assert.strictEqual(claudeRes.text, 'IS_SANDBOX=1', 'claude as root must receive IS_SANDBOX=1')
        const droidRes = await runRuntimeCli({
          plan, env: baseEnv, signal: new AbortController().signal, rebuildPlan: () => plan,
          runtime: 'droid', mode: 'json', agentId: 'a', scopedSessionId: 's',
        })
        assert.strictEqual(droidRes.text, 'IS_SANDBOX=', 'droid must not get IS_SANDBOX injected')
      } finally {
        ;(process as any).getuid = originalGetuid
      }
    })
  })

  await testAsync('runRuntimeCli exposes each CLI credential only to its owning runtime', async () => {
    await withTempDirAsync('clawmax-agent-runtime-credentials-', async (dir) => {
      const cli = path.join(dir, 'fake-cli.js')
      writeFakeNodeCli(cli, `
        process.stdout.write(JSON.stringify({
          type: 'result', subtype: 'success', is_error: false,
          result: 'CLAUDE=' + (process.env.CLAUDE_CODE_OAUTH_TOKEN || '') + ';FACTORY=' + (process.env.FACTORY_API_KEY || ''),
          session_id: 's'
        }))
      `)
      fs.chmodSync(cli, 0o755)
      const plan = { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: false }
      const originalClaudeToken = process.env.CLAUDE_CODE_OAUTH_TOKEN
      const originalFactoryKey = process.env.FACTORY_API_KEY
      process.env.CLAUDE_CODE_OAUTH_TOKEN = 'claude-secret'
      process.env.FACTORY_API_KEY = 'factory-secret'
      const intentionallyDirtyEnv = { ...process.env } as NodeJS.ProcessEnv
      try {
        const claudeRes = await runRuntimeCli({
          plan, env: intentionallyDirtyEnv, signal: new AbortController().signal, rebuildPlan: () => plan,
          runtime: 'claude', mode: 'json', agentId: 'a', scopedSessionId: 's',
        })
        assert.strictEqual(claudeRes.text, 'CLAUDE=claude-secret;FACTORY=', 'Claude must not inherit the Factory key')

        const droidRes = await runRuntimeCli({
          plan, env: intentionallyDirtyEnv, signal: new AbortController().signal, rebuildPlan: () => plan,
          runtime: 'droid', mode: 'json', agentId: 'a', scopedSessionId: 's',
        })
        assert.strictEqual(droidRes.text, 'CLAUDE=;FACTORY=factory-secret', 'Droid must not inherit the Claude token')
      } finally {
        if (typeof originalClaudeToken === 'undefined') delete process.env.CLAUDE_CODE_OAUTH_TOKEN
        else process.env.CLAUDE_CODE_OAUTH_TOKEN = originalClaudeToken
        if (typeof originalFactoryKey === 'undefined') delete process.env.FACTORY_API_KEY
        else process.env.FACTORY_API_KEY = originalFactoryKey
      }
    })
  })

  await testAsync('runRuntimeCli streams multiple chunks for streamsDeltas plans instead of one final delta', async () => {
    await withTempDirAsync('clawmax-agent-runtime-exec-stream-', async (dir) => {
      const cli = path.join(dir, 'fake-claude.js')
      const evt = (t: string) => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } })
      writeFakeNodeCli(cli, `
        const evt = ${evt.toString()}
        process.stdout.write(evt('Hello ') + '\\n')
        setTimeout(() => { process.stdout.write(evt('World') + '\\n'); }, 30)
      `)
      fs.chmodSync(cli, 0o755)
      const plan = { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: true }
      const deltas: string[] = []
      const result = await runRuntimeCli({
        plan, env: process.env as NodeJS.ProcessEnv, signal: new AbortController().signal,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called on a clean success') },
        runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
        onDelta: (text) => deltas.push(text),
      })
      assert.strictEqual(result.text, 'Hello World')
      assert.ok(deltas.length >= 2, `Expected multiple streamed chunks, got ${deltas.length}`)
    })
  })

  await testAsync('a silent turn is NEVER killed, however long it stays quiet', async () => {
    // The rule, asserted directly rather than through a fixture that would pass either way: a turn
    // that produces nothing for longer than every deadline this code used to carry (90s
    // first-output, 600s idle, 750s route backstop) must still be running and must finish normally.
    await withTempDirAsync('clawmax-agent-runtime-no-deadline-', async (dir) => {
      const cli = path.join(dir, 'fake-silent.js')
      writeFakeNodeCli(cli, `
        process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\\n')
        setTimeout(() => {
          process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'SURVIVED' }) + '\\n')
          process.exit(0)
        }, 1200)
      `)
      fs.chmodSync(cli, 0o755)
      const started = Date.now()
      const result = await runRuntimeCli({
        plan: { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: true },
        env: process.env as NodeJS.ProcessEnv, signal: new AbortController().signal,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called') },
        runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
      })
      // If any deadline survived the refactor this comes back cancelled or empty instead.
      assert.strictEqual(result.text, 'SURVIVED')
      assert.strictEqual(result.errorText, undefined)
      assert.ok(Date.now() - started >= 1100, 'the turn must run to completion, not be cut short')
    })
  })

  await testAsync('cancel settles even when a grandchild holds stdout open and close never fires', async () => {
    // 'close' needs every stdio pipe closed, and a grandchild in its own session keeps stdout open
    // after the child dies -- so waiting for 'close' would hang this promise forever, wedge the
    // request, and leave the turn in the registry with nothing able to clear it. runOnce must
    // settle off the SIGKILL escalation instead of trusting 'close'.
    await withTempDirAsync('clawmax-agent-runtime-orphan-', async (dir) => {
      const cli = path.join(dir, 'fake-leaky.js')
      writeFakeNodeCli(cli, `
        const { spawn } = require('child_process')
        // detached => its own process group, so the parent's group kill cannot reach it; it
        // inherits stdout, so the pipe stays open after this process is gone.
        const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
          detached: true, stdio: ['ignore', 'inherit', 'ignore'],
        })
        grandchild.unref()
        process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\\n')
        setInterval(() => {}, 1000)
      `)
      fs.chmodSync(cli, 0o755)
      const controller = new AbortController()
      const run = runRuntimeCli({
        plan: { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: true },
        env: process.env as NodeJS.ProcessEnv, signal: controller.signal,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called') },
        runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
      })
      await new Promise((r) => setTimeout(r, 400))
      controller.abort()
      const outcome = await Promise.race([
        run.then(() => 'settled'),
        new Promise((r) => setTimeout(() => r('HUNG'), 8000)),
      ])
      assert.strictEqual(outcome, 'settled', 'must settle after SIGKILL even if close never fires')
    })
  })

  await testAsync('a grandchild that keeps writing after cancel no longer reaches onActivity once the turn has settled', async () => {
    // Distinct from the test above: that one only proves the promise settles despite the leaked
    // pipe. This proves the *listener* is actually detached at settle -- without removeAllListeners
    // in settle(), the escaped grandchild's writes keep re-entering this closure forever, growing
    // `stdout` unboundedly and firing onActivity/onDelta long after the caller has moved on.
    await withTempDirAsync('clawmax-agent-runtime-orphan-listener-', async (dir) => {
      const cli = path.join(dir, 'fake-leaky-writer.js')
      writeFakeNodeCli(cli, `
        const { spawn } = require('child_process')
        const grandchild = spawn(process.execPath, [
          '-e', 'setInterval(() => process.stdout.write("grandchild-alive\\\\n"), 50)',
        ], { detached: true, stdio: ['ignore', 'inherit', 'ignore'] })
        grandchild.unref()
        process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\\n')
        setInterval(() => {}, 1000)
      `)
      fs.chmodSync(cli, 0o755)
      const controller = new AbortController()
      let activityCount = 0
      const run = runRuntimeCli({
        plan: { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: true },
        env: process.env as NodeJS.ProcessEnv, signal: controller.signal,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called') },
        runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
        onActivity: () => { activityCount++ },
      })
      await new Promise((r) => setTimeout(r, 300))
      controller.abort()
      await Promise.race([run, new Promise((r) => setTimeout(r, 8000))])
      const countAtSettle = activityCount
      // The grandchild writes every 50ms; give it ten more rounds to prove silence, not luck.
      await new Promise((r) => setTimeout(r, 600))
      assert.strictEqual(activityCount, countAtSettle, 'onActivity fired after settle -- the stream listener leaked past the promise resolving')
    })
  })

  await testAsync('a stdout stream error settles the turn instead of crashing the process', async () => {
    // child.stdout/stderr had no 'error' listener, so a stream fault (EPIPE/EBADF) surfaced as an
    // uncaughtException -- which the dashboard's own global handler turns into process.exit(1),
    // killing every other turn in flight, not just this one's. Reproduced here by reaching into the
    // real ChildProcess the same way the finding did: capture it via a spy on child_process.spawn,
    // then destroy its stdout with an error, and prove runRuntimeCli still settles cleanly.
    await withTempDirAsync('clawmax-agent-runtime-stream-error-', async (dir) => {
      const cli = path.join(dir, 'fake-idle.js')
      writeFakeNodeCli(cli, `setInterval(() => {}, 1000)`)
      fs.chmodSync(cli, 0o755)

      const cp = require('child_process')
      const originalSpawn = cp.spawn
      let captured: any
      cp.spawn = (...args: any[]) => {
        captured = originalSpawn(...args)
        return captured
      }
      // A safety net, not the assertion: if this regresses, the exception should still be caught
      // here and turned into a normal test failure rather than crashing the whole suite process.
      let uncaught: Error | undefined
      const onUncaught = (err: Error) => { uncaught = err }
      process.once('uncaughtException', onUncaught)
      try {
        const run = runRuntimeCli({
          plan: { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: false },
          env: process.env as NodeJS.ProcessEnv, signal: new AbortController().signal,
          rebuildPlan: () => { throw new Error('rebuildPlan should not be called') },
          runtime: 'droid', mode: 'json', agentId: 'agent1', scopedSessionId: 'sess1',
        })
        await new Promise((r) => setTimeout(r, 200))
        captured.stdout.destroy(new Error('synthetic EPIPE-style stream error'))
        const outcome = await Promise.race([
          run.then(() => 'settled'),
          new Promise((r) => setTimeout(() => r('HUNG'), 5000)),
        ])
        assert.strictEqual(outcome, 'settled', 'a stream error must settle the turn, not hang it')
        assert.strictEqual(uncaught, undefined, `stream error escaped as an uncaughtException: ${uncaught}`)
      } finally {
        cp.spawn = originalSpawn
        process.removeListener('uncaughtException', onUncaught)
      }
    })
  })

  await testAsync('a turn cancelled after streaming keeps its partial text and reports cancellation', async () => {
    await withTempDirAsync('clawmax-agent-runtime-cancel-', async (dir) => {
      const cli = path.join(dir, 'fake-chatty.js')
      writeFakeNodeCli(cli, `
        process.stdout.write(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'PARTIAL' }] } }) + '\\n')
        setInterval(() => {}, 1000)
      `)
      fs.chmodSync(cli, 0o755)
      const controller = new AbortController()
      const deltas: string[] = []
      const run = runRuntimeCli({
        plan: { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: true },
        env: process.env as NodeJS.ProcessEnv, signal: controller.signal,
        rebuildPlan: () => { throw new Error('rebuildPlan should not be called') },
        runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
        onDelta: (t) => deltas.push(t),
      })
      await new Promise((r) => setTimeout(r, 400))
      controller.abort()
      const result = await run
      assert.strictEqual(result.errorText, RUNTIME_CANCELLED)
      assert.ok(isRuntimeCancelledError(result.errorText), 'predicate must recognise the sentinel')
      // Discarding streamed text made a cancelled turn indistinguishable from a wedged one.
      assert.strictEqual(result.text, 'PARTIAL')
      assert.deepStrictEqual(deltas, ['PARTIAL'])
    })
  })

  await testAsync('a signal already aborted before spawn settles instead of hanging', async () => {
    // The abort fires before the listener is attached, so addEventListener alone would never run.
    await withTempDirAsync('clawmax-agent-runtime-preabort-', async (dir) => {
      const cli = path.join(dir, 'fake-slow.js')
      writeFakeNodeCli(cli, `setInterval(() => {}, 1000)`)
      fs.chmodSync(cli, 0o755)
      const controller = new AbortController()
      controller.abort()
      const outcome = await Promise.race([
        runRuntimeCli({
          plan: { cliPath: cli, args: [], missingCliError: 'missing', streamsDeltas: true },
          env: process.env as NodeJS.ProcessEnv, signal: controller.signal,
          rebuildPlan: () => { throw new Error('rebuildPlan should not be called') },
          runtime: 'claude', mode: 'chat', agentId: 'agent1', scopedSessionId: 'sess1',
        }).then(() => 'settled'),
        new Promise((r) => setTimeout(() => r('HUNG'), 8000)),
      ])
      assert.strictEqual(outcome, 'settled')
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
          plan: createPlan, env: process.env as NodeJS.ProcessEnv, signal: new AbortController().signal,
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
        plan: resumePlan, env: process.env as NodeJS.ProcessEnv, signal: new AbortController().signal,
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
        plan, env: process.env as NodeJS.ProcessEnv, signal: new AbortController().signal,
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
        plan, env: process.env as NodeJS.ProcessEnv, signal: new AbortController().signal,
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

// ── Regression cover for droid-review findings on CLI-backed AI generation ──

test('parseRuntimeResult surfaces the CLI envelope message instead of a raw blob', () => {
  const envelope = JSON.stringify({
    type: 'result', is_error: true, subtype: 'failure',
    result: 'Authentication failed. Please log in using /login or set a valid FACTORY_API_KEY environment variable.',
  })
  const { text, errorText } = parseRuntimeResult('droid', 'json', envelope, '', 1)
  assert.strictEqual(text, '')
  assert(
    errorText === 'Authentication failed. Please log in using /login or set a valid FACTORY_API_KEY environment variable.',
    `Expected the CLI's own message, got: ${errorText}`,
  )
  assert(!String(errorText).includes('is_error'), 'Expected the raw JSON envelope not to leak into the error')
})

test('parseRuntimeResult explains a silent non-zero exit rather than repeating the code', () => {
  const { errorText } = parseRuntimeResult('droid', 'json', '', '', 1)
  assert(/not authenticated/i.test(String(errorText)), `Expected an actionable cause, got: ${errorText}`)
  assert(/FACTORY_API_KEY/.test(String(errorText)), `Expected the remediation env var, got: ${errorText}`)
  assert(String(errorText) !== 'droid exited with code 1', 'Expected more than a bare exit code')
})

test('parseRuntimeResult still returns a successful envelope payload', () => {
  const ok = JSON.stringify({ type: 'result', is_error: false, result: 'generated text' })
  const { text, errorText } = parseRuntimeResult('droid', 'json', ok, '', 0)
  assert.strictEqual(text, 'generated text')
  assert.strictEqual(errorText, undefined)
})
