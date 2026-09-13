/**
 * Agents routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/agents.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import { EventEmitter } from 'events'
import { listActiveTurns, cancelTurn } from '../lib/agent-turns'
import { getAgentLifecycleGeneration } from '../lib/workspace'
import { hasNativeTranscript } from '../lib/openclaw-native-transcripts'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalOpenClawBin = process.env.OPENCLAW_BIN
const gatewayRpcModulePath = require.resolve('../lib/gateway-rpc')
const whatsappDependenciesModulePath = require.resolve('../lib/whatsapp-dependencies')
const openClawWorkspaceStateModulePath = require.resolve('../lib/openclaw-workspace-state')

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    })
    .catch((err: any) => {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    })
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'doctor-workspace',
    workspaces: [{
      id: 'doctor-workspace',
      name: 'Doctor Workspace',
      path: workspacePath,
      createdAt: '2026-05-26T00:00:00.000Z',
      lastAccessedAt: '2026-05-26T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

function ensureWorkspaceScaffold(workspacePath: string) {
  fs.mkdirSync(path.join(workspacePath, 'AGENTS'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n', 'utf-8')
}

function writeAgent(workspacePath: string, agentId: string, identityContent?: string) {
  const agentDir = path.join(workspacePath, 'AGENTS', agentId)
  fs.mkdirSync(agentDir, { recursive: true })
  if (typeof identityContent === 'string') {
    fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), identityContent, 'utf-8')
  }
}

// Fixture for OpenClaw 2's native session store (~/.openclaw/agents/<id>/agent/openclaw-agent.sqlite).
// Mirrors the real schema: session_nodes maps a session key to its current session id, and
// transcript_events holds one legacy-JSONL-format line per row, ordered by seq.
function writeNativeAgentStore(
  tmpHome: string,
  agentId: string,
  options: {
    sessions?: Array<{ sessionKey: string; sessionId: string; updatedAt?: number }>
    transcripts?: Record<string, string[]>
  } = {}
) {
  const { DatabaseSync } = require('node:sqlite')
  const agentDir = path.join(tmpHome, '.openclaw', 'agents', agentId, 'agent')
  fs.mkdirSync(agentDir, { recursive: true })
  const database = new DatabaseSync(path.join(agentDir, 'openclaw-agent.sqlite'))
  database.exec('CREATE TABLE session_key_contract (id INTEGER PRIMARY KEY)')
  database.exec('CREATE TABLE session_nodes (session_key TEXT, current_session_id TEXT, entry_json TEXT, updated_at INTEGER)')
  database.exec('CREATE TABLE transcript_events (session_id TEXT, seq INTEGER, event_json TEXT, created_at INTEGER)')

  const insertSession = database.prepare('INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at) VALUES (?, ?, ?, ?)')
  for (const session of options.sessions || []) {
    const updatedAt = session.updatedAt ?? Date.now()
    insertSession.run(
      session.sessionKey,
      session.sessionId,
      JSON.stringify({ sessionId: session.sessionId, updatedAt }),
      updatedAt
    )
  }

  const insertEvent = database.prepare('INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)')
  for (const [sessionId, lines] of Object.entries(options.transcripts || {})) {
    lines.forEach((line, index) => {
      insertEvent.run(sessionId, index, line, Date.now())
    })
  }

  database.close()
}

function getRouteHandler(method: 'get' | 'post' | 'put' | 'patch' | 'delete', routePath: string) {
  // Load after env is set so helper modules resolve the temp workspace/home.
  delete require.cache[require.resolve('./agents')]
  const router = require('./agents').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

async function withGatewayRpcStubs<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  delete require.cache[gatewayRpcModulePath]
  const gatewayRpc = require('../lib/gateway-rpc')
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, gatewayRpc[key]]))
  Object.assign(gatewayRpc, overrides)
  try {
    return await fn()
  } finally {
    Object.assign(gatewayRpc, originals)
    delete require.cache[require.resolve('./agents')]
  }
}

async function withOpenClawWorkspaceStateStubs<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  delete require.cache[openClawWorkspaceStateModulePath]
  const workspaceState = require('../lib/openclaw-workspace-state')
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, workspaceState[key]]))
  Object.assign(workspaceState, overrides)
  delete require.cache[require.resolve('./agents')]
  try {
    return await fn()
  } finally {
    Object.assign(workspaceState, originals)
    delete require.cache[require.resolve('./agents')]
  }
}

async function withChildProcessStubs<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  const childProcess = require('child_process')
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, childProcess[key]]))
  Object.assign(childProcess, overrides)
  delete require.cache[require.resolve('./agents')]
  try {
    return await fn()
  } finally {
    Object.assign(childProcess, originals)
    delete require.cache[require.resolve('./agents')]
  }
}

async function withDashboardEnvStubs<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  const dashboardEnv = require('../lib/dashboard-env')
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, dashboardEnv[key]]))
  Object.assign(dashboardEnv, overrides)
  delete require.cache[require.resolve('./agents')]
  try {
    return await fn()
  } finally {
    Object.assign(dashboardEnv, originals)
    delete require.cache[require.resolve('./agents')]
  }
}

async function withModelDiscoveryStubs<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  const modelDiscovery = require('../lib/model-discovery')
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, modelDiscovery[key]]))
  Object.assign(modelDiscovery, overrides)
  delete require.cache[require.resolve('./agents')]
  try {
    return await fn()
  } finally {
    Object.assign(modelDiscovery, originals)
    delete require.cache[require.resolve('./agents')]
  }
}

async function withWhatsAppDependencyStubs<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  delete require.cache[whatsappDependenciesModulePath]
  const whatsappDependencies = require('../lib/whatsapp-dependencies')
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, whatsappDependencies[key]]))
  Object.assign(whatsappDependencies, overrides)
  delete require.cache[require.resolve('./agents')]
  try {
    return await fn()
  } finally {
    Object.assign(whatsappDependencies, originals)
    delete require.cache[require.resolve('./agents')]
  }
}

function writeFakeOpenClawCli(tmpHome: string): string {
  const cliPath = path.join(tmpHome, 'openclaw')
  fs.writeFileSync(cliPath, '#!/bin/sh\necho "openclaw 2026.5.26"\n', 'utf-8')
  fs.chmodSync(cliPath, 0o755)
  return cliPath
}

function writeFakeDroidCli(filePath: string, resultText: string) {
  const payload = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1,
    num_turns: 1,
    result: resultText,
    session_id: 'fake-session',
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })
  fs.writeFileSync(filePath, `#!/bin/sh\necho '${payload}'\n`, 'utf-8')
  fs.chmodSync(filePath, 0o755)
}

// Fake `claude -p ... --output-format json` that dumps its own spawned ANTHROPIC_API_KEY env var
// into the JSON result envelope instead of echoing a fixed string, so the caller can assert on
// exactly what environment the route handed the child process (regression coverage for the P2
// finding: this route used to build the child env with safeEnv(), which never carries
// ANTHROPIC_API_KEY, so a claude-pinned agent silently authenticated with an empty key).
function writeFakeClaudeCliDumpingAnthropicKey(filePath: string) {
  const script = [
    '#!/bin/sh',
    'echo "{\\"type\\":\\"result\\",\\"subtype\\":\\"success\\",\\"is_error\\":false,\\"result\\":\\"ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY\\",\\"session_id\\":\\"fake-session\\"}"',
    '',
  ].join('\n')
  fs.writeFileSync(filePath, script, 'utf-8')
  fs.chmodSync(filePath, 0o755)
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Agents Routes Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agents-routes-test-'))
  const workspacePath = path.join(tmpHome, 'workspaces', 'doctor-workspace')
  ensureWorkspaceScaffold(workspacePath)
  writeWorkspaceRegistry(tmpHome, workspacePath)
  fs.mkdirSync(path.join(tmpHome, '.openclaw', 'agents'), { recursive: true })
  fs.writeFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), JSON.stringify({ agents: { list: [] } }, null, 2))

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath

  await test('doctor treats missing skills as neutral guidance instead of warning', async () => {
    writeAgent(workspacePath, 'plain-agent', [
      '# IDENTITY.md',
      'Name: plain-agent',
      'Role: General assistant',
    ].join('\n'))

    const handler = getRouteHandler('post', '/doctor')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected doctor route success')
    const agentResult = res.jsonBody?.results?.find((entry: any) => entry.id === 'plain-agent')
    assert(agentResult, 'Expected doctor results for plain-agent')
    const skillsCheck = agentResult.checks.find((check: any) => check.check === 'skills')
    assert(skillsCheck, 'Expected skills check for plain-agent')
    assert.strictEqual(skillsCheck.status, 'pass', 'Expected missing skills to be treated as pass')
    assert(/No extra skills configured/i.test(skillsCheck.message), 'Expected neutral missing-skills message')
  })

  await test('doctor avoids duplicate skills warning when IDENTITY.md is missing', async () => {
    writeAgent(workspacePath, 'broken-agent')

    const handler = getRouteHandler('post', '/doctor')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected doctor route success')
    const agentResult = res.jsonBody?.results?.find((entry: any) => entry.id === 'broken-agent')
    assert(agentResult, 'Expected doctor results for broken-agent')
    const identityCheck = agentResult.checks.find((check: any) => check.check === 'identity')
    assert(identityCheck && identityCheck.status === 'fail', 'Expected identity failure for broken-agent')
    const skillsCheck = agentResult.checks.find((check: any) => check.check === 'skills')
    assert.strictEqual(skillsCheck, undefined, 'Expected no separate skills warning when IDENTITY.md is missing')
  })

  await test('doctor reports missing shared provider execution path when no runtime path is configured', async () => {
    await withDashboardEnvStubs({
      getDashboardEnvRaw: () => ({ DASHBOARD_DEPLOYMENT_KIND: 'cloud', DASHBOARD_ENABLE_OLLAMA: 'false' }),
      resolveSystemExecutionProviderKeys: () => ({}),
      isOllamaUiEnabled: () => false,
      getDefaultOllamaBaseUrl: () => '',
    }, async () => {
      const handler = getRouteHandler('post', '/doctor')
      const res = makeRes()
      await handler(makeReq({ body: {} }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected doctor route success')
      assert.strictEqual(res.jsonBody?.platform?.providerExecution?.status, 'missing', 'Expected missing provider execution status')
      assert(/No shared model execution path is configured/i.test(res.jsonBody?.platform?.providerExecution?.message || ''), 'Expected missing execution-path guidance')
    })
  })

  await test('doctor reports configured shared hosted provider execution when system keys exist', async () => {
    await withDashboardEnvStubs({
      resolveSystemExecutionProviderKeys: () => ({ openai: 'sk-test-openai' }),
    }, async () => {
      const handler = getRouteHandler('post', '/doctor')
      const res = makeRes()
      await handler(makeReq({ body: {} }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected doctor route success')
      assert.strictEqual(res.jsonBody?.platform?.providerExecution?.status, 'configured', 'Expected configured provider execution status')
      assert(/Shared hosted provider execution is configured for OpenAI/i.test(res.jsonBody?.platform?.providerExecution?.message || ''), 'Expected configured hosted-provider guidance')
    })
  })

  await test('doctor reports gateway healthy when the runtime gateway is reachable but the admin probe token differs', async () => {
    await withGatewayRpcStubs({
      probeGatewayResponsive: async () => ({ running: false, port: 18789, error: 'token mismatch' }),
      isGatewayRunning: () => ({ running: true, port: 18789 }),
      getConfiguredGatewayPort: () => 18789,
    }, async () => {
      const handler = getRouteHandler('post', '/doctor')
      const res = makeRes()
      await handler(makeReq({ body: {} }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected doctor route success')
      assert.strictEqual(res.jsonBody?.platform?.gateway, true, 'Expected doctor platform gateway flag to stay healthy when the gateway process is reachable')
      const gatewayCheck = (res.jsonBody?.results || [])
        .flatMap((entry: any) => entry.checks || [])
        .find((check: any) => check.check === 'gateway')
      assert.strictEqual(gatewayCheck, undefined, 'Expected gateway health to be represented only in platform checks, not as an agent warning')
    })
  })

  await test('doctor auto-fix reports structured gateway restart success', async () => {
    const previousOpenClawBin = process.env.OPENCLAW_BIN
    process.env.OPENCLAW_BIN = writeFakeOpenClawCli(tmpHome)

    let probeCalls = 0
    let runningCalls = 0
    try {
      await withGatewayRpcStubs({
        probeGatewayResponsive: async () => {
          probeCalls += 1
          return probeCalls === 1
            ? { running: false, port: 18789, error: 'connection refused' }
            : { running: true, port: 18789 }
        },
        isGatewayRunning: () => {
          runningCalls += 1
          return { running: runningCalls > 1, port: 18789 }
        },
        getConfiguredGatewayPort: () => 18789,
      }, async () => {
        await withChildProcessStubs({
          execFileSync: () => 'Gateway restarted',
        }, async () => {
          const handler = getRouteHandler('post', '/doctor')
          const res = makeRes()
          await handler(makeReq({ body: { fix: true } }), res)

          assert.strictEqual(res.statusCode, 200, 'Expected doctor route success')
          assert.strictEqual(res.jsonBody?.platform?.gateway, true, 'Expected gateway to be healthy after restart')
          assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.attempted, true, 'Expected restart attempt to be recorded')
          assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.status, 'restarted', 'Expected structured restart success')
          assert((res.jsonBody?.summary?.fixed || 0) >= 1, 'Expected fixed count to include gateway restart')
        })
      })
    } finally {
      if (typeof previousOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
      else process.env.OPENCLAW_BIN = previousOpenClawBin
    }
  })

  await test('doctor reports structured gateway recovery when auto-fix is not requested', async () => {
    const previousOpenClawBin = process.env.OPENCLAW_BIN
    process.env.OPENCLAW_BIN = writeFakeOpenClawCli(tmpHome)

    try {
      await withGatewayRpcStubs({
        probeGatewayResponsive: async () => ({ running: false, port: 18789, error: 'connection refused' }),
        isGatewayRunning: () => ({ running: false, port: 18789 }),
        getConfiguredGatewayPort: () => 18789,
      }, async () => {
        const handler = getRouteHandler('post', '/doctor')
        const res = makeRes()
        await handler(makeReq({ body: { fix: false } }), res)

        assert.strictEqual(res.statusCode, 200, 'Expected doctor route success')
        assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.attempted, false, 'Expected no restart attempt without fix=true')
        assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.status, 'not-attempted', 'Expected structured no-fix state')
        assert(/not running/i.test(res.jsonBody?.platform?.gatewayRecovery?.message || ''), 'Expected actionable not-running message')
      })
    } finally {
      if (typeof previousOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
      else process.env.OPENCLAW_BIN = previousOpenClawBin
    }
  })

  await test('doctor auto-fix reports structured gateway restart failure', async () => {
    const previousOpenClawBin = process.env.OPENCLAW_BIN
    process.env.OPENCLAW_BIN = writeFakeOpenClawCli(tmpHome)

    try {
      await withGatewayRpcStubs({
        probeGatewayResponsive: async () => ({ running: false, port: 18789, error: 'connection refused' }),
        isGatewayRunning: () => ({ running: false, port: 18789 }),
        getConfiguredGatewayPort: () => 18789,
      }, async () => {
        await withChildProcessStubs({
          execFileSync: (_command: string, args: string[]) => {
            if (args.includes('--version')) return 'openclaw 2026.5.26'
            const err: any = new Error('restart exploded')
            err.stderr = 'gateway restart failed hard'
            throw err
          },
        }, async () => {
          const handler = getRouteHandler('post', '/doctor')
          const res = makeRes()
          await handler(makeReq({ body: { fix: true } }), res)

          assert.strictEqual(res.statusCode, 200, 'Expected doctor route success')
          assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.attempted, true, 'Expected restart attempt to be recorded')
          assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.status, 'failed', 'Expected structured restart failure')
          assert(/gateway restart failed/i.test(res.jsonBody?.platform?.gatewayRecovery?.message || ''), 'Expected restart failure message')
        })
      })
    } finally {
      if (typeof previousOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
      else process.env.OPENCLAW_BIN = previousOpenClawBin
    }
  })

  await test('doctor health probe passes agent ids as literal subprocess arguments', async () => {
    const previousOpenClawBin = process.env.OPENCLAW_BIN
    process.env.OPENCLAW_BIN = writeFakeOpenClawCli(tmpHome)
    const adversarialId = 'probe-agent;touch-pwned'
    const markerPath = path.join(tmpHome, 'pwned')
    writeAgent(workspacePath, adversarialId, '# IDENTITY.md\nName: Probe')
    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    const previousConfig = fs.readFileSync(configPath, 'utf-8')
    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [{ id: adversarialId }] } }))
    const calls: string[][] = []

    try {
      await withChildProcessStubs({
        execFileSync: (_command: string, args: string[]) => {
          calls.push([...args])
          if (args.includes('--version')) return 'openclaw 2026.5.26'
          return '{"payloads":[{"text":"OK"}]}'
        },
      }, async () => {
        const handler = getRouteHandler('post', '/doctor')
        const res = makeRes()
        await handler(makeReq({ body: { probe: true } }), res)
        assert.strictEqual(res.statusCode, 200)
      })

      const probeCall = calls.find((args) => args[0] === 'agent' && args.includes('--agent'))
      assert(probeCall, 'Expected doctor to invoke the agent health probe')
      assert(probeCall.includes(adversarialId), 'Expected the complete id to remain one argv entry')
      assert(!fs.existsSync(markerPath), 'Agent id must not be evaluated by a shell')
    } finally {
      fs.writeFileSync(configPath, previousConfig)
      fs.rmSync(path.join(workspacePath, 'AGENTS', adversarialId), { recursive: true, force: true })
      if (typeof previousOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
      else process.env.OPENCLAW_BIN = previousOpenClawBin
    }
  })

  await test('generate rejects missing descriptions before invoking AI generation', async () => {
    const handler = getRouteHandler('post', '/generate')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing description to return HTTP 400')
    assert(/description is required/i.test(res.jsonBody?.error || ''), 'Expected missing description guidance')
  })

  await test('model fit ranks only runtime-visible models and explains uncertainty', async () => {
    await withModelDiscoveryStubs({
      getAvailableModelsCached: () => ['openai/gpt-5.3-codex'],
    }, async () => {
      const handler = getRouteHandler('post', '/model-fit')
      const res = makeRes()
      await handler(makeReq({
        body: {
          description: 'Review a TypeScript repository and write code changes.',
          availableModels: ['openai/gpt-5.3-codex', 'not-configured/imaginary-model'],
          preference: 'balanced',
        },
      }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected model fit success')
      assert.strictEqual(res.jsonBody?.recommendedModel, 'openai/gpt-5.3-codex')
      assert.deepStrictEqual(
        res.jsonBody?.candidates.map((candidate: any) => candidate.model),
        ['openai/gpt-5.3-codex'],
        'Expected unavailable request models to be excluded',
      )
      assert(/not a quality or cost measurement/i.test(res.jsonBody?.disclaimer || ''), 'Expected advisory limitation')
    })
  })

  await test('generate returns AI-suggested names, tags, models, and skills for new agents', async () => {
    const aiGeneratorPath = require.resolve('../lib/ai-generator')
    delete require.cache[aiGeneratorPath]
    const aiGenerator = require('../lib/ai-generator')
    const originalGenerateAgentMeta = aiGenerator.generateAgentMeta
    const originalGenerateAgentFiles = aiGenerator.generateAgentFiles

    aiGenerator.generateAgentMeta = async () => ({
      name: 'resend-agent',
      tags: ['email', 'assistant'],
      model: 'openai/gpt-4o-mini',
      skills: ['resend', 'react-email'],
    })
    aiGenerator.generateAgentFiles = async () => ({
      identity: '# IDENTITY',
      soul: '# SOUL',
      tools: '# TOOLS',
    })
    try {
      await withModelDiscoveryStubs({
        getAvailableModelsCached: () => ['openai/gpt-5.4-pro', 'openai/gpt-5.4-mini'],
      }, async () => {
        const handler = getRouteHandler('post', '/generate')
        const res = makeRes()
        await handler(makeReq({
          body: {
            description: 'create a resend agent to test sending emails with resend skills',
            suggestMeta: true,
            availableModels: ['openai/gpt-5.4-pro', 'openai/gpt-5.4-mini'],
            modelPreference: 'cost',
          },
        }), res)

        assert.strictEqual(res.statusCode, 200, 'Expected generate route success')
        assert.strictEqual(res.jsonBody?.suggestedName, 'resend-agent')
        assert.deepStrictEqual(res.jsonBody?.suggestedTags, ['email', 'assistant'])
        assert.deepStrictEqual(res.jsonBody?.suggestedSkills, ['resend', 'react-email'])
        assert.strictEqual(res.jsonBody?.suggestedModel, 'openai/gpt-5.4-mini')
        assert.strictEqual(res.jsonBody?.modelRecommendation?.recommendedModel, 'openai/gpt-5.4-mini')
      })
    } finally {
      aiGenerator.generateAgentMeta = originalGenerateAgentMeta
      aiGenerator.generateAgentFiles = originalGenerateAgentFiles
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('generate pins the caller-selected runtime and model for every generation pass', async () => {
    const aiGeneratorPath = require.resolve('../lib/ai-generator')
    delete require.cache[aiGeneratorPath]
    const aiGenerator = require('../lib/ai-generator')
    const originalGenerateAgentMeta = aiGenerator.generateAgentMeta
    const originalGenerateAgentFiles = aiGenerator.generateAgentFiles
    const integrationPath = path.join(workspacePath, 'SYSTEM', 'integrations.json')
    const priorIntegrations = fs.existsSync(integrationPath) ? fs.readFileSync(integrationPath, 'utf-8') : undefined
    const priorClaudeBin = process.env.CLAUDE_BIN
    const priorDroidBin = process.env.DROID_BIN
    const calls: any[] = []

    fs.writeFileSync(integrationPath, JSON.stringify({ enabledRuntimes: ['claude', 'droid'] }), 'utf-8')
    process.env.CLAUDE_BIN = process.execPath
    process.env.DROID_BIN = process.execPath
    aiGenerator.generateAgentMeta = async () => {
      calls.push(aiGenerator.currentGenerationRuntimePin())
      return { name: 'runtime-pinned', tags: [], model: '', skills: [] }
    }
    aiGenerator.generateAgentFiles = async () => {
      calls.push(aiGenerator.currentGenerationRuntimePin())
      return { identity: '# IDENTITY', soul: '# SOUL', tools: '# TOOLS' }
    }

    try {
      const handler = getRouteHandler('post', '/generate')
      const res = makeRes()
      await handler(makeReq({
        body: {
          description: 'Research and compare local model options.',
          suggestMeta: true,
          runtime: 'droid',
          model: 'claude-opus-4-8',
        },
      }), res)

      assert.strictEqual(res.statusCode, 200, `Expected generation success, got ${res.jsonBody?.error || 'unknown error'}`)
      assert.deepStrictEqual(
        calls,
        [
          { runtime: 'droid', model: 'claude-opus-4-8' },
          { runtime: 'droid', model: 'claude-opus-4-8' },
        ],
        'Expected both metadata and files to use the caller-selected runtime and model',
      )
    } finally {
      aiGenerator.generateAgentMeta = originalGenerateAgentMeta
      aiGenerator.generateAgentFiles = originalGenerateAgentFiles
      if (priorClaudeBin === undefined) delete process.env.CLAUDE_BIN
      else process.env.CLAUDE_BIN = priorClaudeBin
      if (priorDroidBin === undefined) delete process.env.DROID_BIN
      else process.env.DROID_BIN = priorDroidBin
      if (priorIntegrations === undefined) fs.rmSync(integrationPath, { force: true })
      else fs.writeFileSync(integrationPath, priorIntegrations, 'utf-8')
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('generate surfaces a friendly network error when OpenAI DNS resolution fails', async () => {
    const aiGeneratorPath = require.resolve('../lib/ai-generator')
    delete require.cache[aiGeneratorPath]
    const aiGenerator = require('../lib/ai-generator')
    const originalGenerateAgentMeta = aiGenerator.generateAgentMeta

    aiGenerator.generateAgentMeta = async () => {
      const err: any = new Error('Connection error.')
      err.cause = new Error('fetch failed')
      err.cause.cause = Object.assign(new Error('getaddrinfo ENOTFOUND api.openai.com'), {
        code: 'ENOTFOUND',
        hostname: 'api.openai.com',
      })
      throw err
    }

    try {
      const handler = getRouteHandler('post', '/generate')
      const res = makeRes()
      await handler(makeReq({
        body: {
          description: 'create fake agent',
          suggestMeta: true,
        },
      }), res)

      assert.strictEqual(res.statusCode, 500, 'Expected DNS/network failure to return HTTP 500')
      assert(
        /Network error: the dashboard could not reach OpenAI/i.test(res.jsonBody?.error || ''),
        `Expected friendly OpenAI network error, got: ${res.jsonBody?.error || 'missing'}`
      )
    } finally {
      aiGenerator.generateAgentMeta = originalGenerateAgentMeta
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('generate reports provider-neutral timeout guidance', async () => {
    const aiGeneratorPath = require.resolve('../lib/ai-generator')
    delete require.cache[aiGeneratorPath]
    const aiGenerator = require('../lib/ai-generator')
    const originalGenerateAgentMeta = aiGenerator.generateAgentMeta

    aiGenerator.generateAgentMeta = async () => {
      throw new Error('AI request timed out after 45000ms')
    }

    try {
      const handler = getRouteHandler('post', '/generate')
      const res = makeRes()
      await handler(makeReq({
        body: {
          description: 'create a daily reasoning assistant',
          suggestMeta: true,
          byokKeys: { gemini: 'AIza123456789012345678901234567890' },
        },
      }), res)

      assert.strictEqual(res.statusCode, 500, 'Expected timeout to return HTTP 500')
      assert(/configured provider/i.test(res.jsonBody?.error || ''), `Expected provider-neutral timeout, got: ${res.jsonBody?.error || 'missing'}`)
      assert(!/GPT-5|gpt-4\.1/i.test(res.jsonBody?.error || ''), 'Timeout guidance must not blame an unrelated model provider')
    } finally {
      aiGenerator.generateAgentMeta = originalGenerateAgentMeta
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('provision returns a structured tenant agent limit conflict', async () => {
    const previous = process.env.CLAWMAX_MAX_AGENTS_PER_WORKSPACE
    process.env.CLAWMAX_MAX_AGENTS_PER_WORKSPACE = '0'
    try {
      const handler = getRouteHandler('post', '/provision')
      const res = makeRes()
      await handler(makeReq({ body: { name: 'blocked-agent', model: 'openai/gpt-4o-mini' } }), res)

      assert.strictEqual(res.statusCode, 409, 'Expected exhausted agent limit to return HTTP 409')
      assert.strictEqual(res.jsonBody?.code, 'TENANT_RESOURCE_LIMIT_REACHED')
      assert.strictEqual(res.jsonBody?.resource, 'agents')
    } finally {
      if (previous === undefined) delete process.env.CLAWMAX_MAX_AGENTS_PER_WORKSPACE
      else process.env.CLAWMAX_MAX_AGENTS_PER_WORKSPACE = previous
    }
  })

  await test('provision route honors OPENCLAW_BIN override when creating agents', async () => {
    const tmpCliDir = path.join(tmpHome, 'bin')
    const fakeCli = path.join(tmpCliDir, 'openclaw')
    fs.mkdirSync(tmpCliDir, { recursive: true })
    fs.writeFileSync(fakeCli, '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    fs.chmodSync(fakeCli, 0o755)
    process.env.OPENCLAW_BIN = fakeCli

    const childProcess = require('child_process')
    const originalSpawn = childProcess.spawn

    childProcess.spawn = (command: string, args: string[]) => {
      assert.strictEqual(command, fakeCli, 'Expected create route to spawn the resolved OPENCLAW_BIN override')
      assert.deepStrictEqual(args.slice(0, 3), ['agents', 'add', 'fresh-agent'], 'Expected create route to invoke openclaw agents add')
      const listeners: Record<string, Function> = {}
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(event: string, handler: Function) {
          listeners[event] = handler
          if (event === 'close') {
            setTimeout(() => handler(0, null), 0)
          }
        },
      }
    }

    try {
      const handler = getRouteHandler('post', '/provision')
      const writes: string[] = []
      const res: any = {
        writableEnded: false,
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) { this.headers[name] = value },
        writeHead() { return this },
        flushHeaders() {},
        write(chunk: string) { writes.push(String(chunk)) },
        end() { this.writableEnded = true },
      }
      const req: any = makeReq({
        body: {
          name: 'fresh-agent',
          model: 'openai/gpt-4o-mini',
          tags: [],
        },
        on() {},
      })
      await handler(req, res)
      await new Promise(resolve => setTimeout(resolve, 20))
      assert(writes.some(chunk => chunk.includes(fakeCli)), 'Expected streamed logs to include the resolved CLI path')
      assert(writes.some(chunk => chunk.includes('"type":"done"') && chunk.includes('"data":"ok"')), 'Expected successful create completion event')
      const config = JSON.parse(fs.readFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), 'utf-8'))
      const registered = Object.entries(config.agents?.entries || {})
        .find(([id, value]: [string, any]) => id === 'fresh-agent' && value.workspace === path.join(workspacePath, 'AGENTS', 'fresh-agent'))
      assert(registered, 'Expected done: ok only after the exact agent and workspace were durable in openclaw.json')
    } finally {
      childProcess.spawn = originalSpawn
    }
  })

  await test('provision emits an SSE error and never done when openclaw exits nonzero', async () => {
    const tmpCliDir = path.join(tmpHome, 'bin-failing-provision')
    const fakeCli = path.join(tmpCliDir, 'openclaw')
    fs.mkdirSync(tmpCliDir, { recursive: true })
    fs.writeFileSync(fakeCli, '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    fs.chmodSync(fakeCli, 0o755)
    process.env.OPENCLAW_BIN = fakeCli

    const childProcess = require('child_process')
    const originalSpawn = childProcess.spawn
    childProcess.spawn = () => {
      const listeners: Record<string, Function> = {}
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(event: string, handler: Function) {
          listeners[event] = handler
          if (event === 'close') setTimeout(() => handler(1, null), 0)
        },
      }
    }

    try {
      const handler = getRouteHandler('post', '/provision')
      const writes: string[] = []
      const res: any = {
        writableEnded: false,
        setHeader() {},
        flushHeaders() {},
        write(chunk: string) { writes.push(String(chunk)) },
        end() { this.writableEnded = true },
      }
      await handler(makeReq({
        body: { name: 'failed-provision', model: 'openai/gpt-4o-mini', tags: [] },
        on() {},
      }), res)
      await new Promise(resolve => setTimeout(resolve, 20))

      assert(writes.some(chunk => chunk.includes('"type":"error"') && chunk.includes('exit code 1')), 'Expected nonzero exit to emit an SSE error')
      assert(!writes.some(chunk => chunk.includes('"type":"done"')), 'Expected nonzero exit never to emit done')
      const config = JSON.parse(fs.readFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), 'utf-8'))
      assert(!Object.prototype.hasOwnProperty.call(config.agents?.entries || {}, 'failed-provision'), 'Expected failed agent not to be registered')
    } finally {
      childProcess.spawn = originalSpawn
    }
  })

  await test('remove-state clears attestation before registration-only OpenClaw deletion', async () => {
    const agentId = 'remove-state-agent'
    const agentWorkspace = path.join(workspacePath, 'AGENTS', agentId)
    writeAgent(workspacePath, agentId, '# IDENTITY.md\n\n- **Name:** Remove State Agent\n')
    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    const previousConfig = fs.readFileSync(configPath, 'utf-8')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: { entries: { [agentId]: { workspace: agentWorkspace } } },
    }, null, 2))
    const calls: Array<{ agentId: string; deleteFiles: boolean }> = []
    const clearedWorkspaces: string[] = []
    const lifecycleOrder: string[] = []
    const originalGeneration = getAgentLifecycleGeneration(agentWorkspace)
    const originalSessionsDir = path.join(tmpHome, '.openclaw', 'agents', agentId, 'sessions')
    fs.mkdirSync(originalSessionsDir, { recursive: true })
    fs.writeFileSync(path.join(originalSessionsDir, 'before-delete.jsonl'), '{"type":"message"}\n')

    try {
      await withOpenClawWorkspaceStateStubs({
        clearPinnedOpenClawWorkspaceState: async (workspaceDir: string) => {
          clearedWorkspaces.push(workspaceDir)
          lifecycleOrder.push('clear-attestation')
        },
      }, async () => {
        await withGatewayRpcStubs({
          isGatewayRunning: () => ({ running: true, port: 18789 }),
          getGatewayClient: () => ({
            deleteAgentNative: async (id: string, deleteFiles: boolean) => {
              calls.push({ agentId: id, deleteFiles })
              lifecycleOrder.push('delete-registration')
              return 'deleted'
            },
          }),
        }, async () => {
          const handler = getRouteHandler('delete', '/:id')
          const res = makeRes()
          await handler(makeReq({ params: { id: agentId }, body: { removeStateDir: true } }), res)

          assert.strictEqual(res.statusCode, 200)
          assert.strictEqual(res.jsonBody?.ok, true)
          assert.deepStrictEqual(calls, [{ agentId, deleteFiles: false }])
          assert.deepStrictEqual(clearedWorkspaces, [agentWorkspace])
          assert.deepStrictEqual(lifecycleOrder, ['clear-attestation', 'delete-registration'])
          assert(res.jsonBody.steps.includes(`Cleared OpenClaw workspace state for ${agentId}`))

          const historyHandler = getRouteHandler('get', '/:id/chat/messages')
          const deletedHistoryRes = makeRes()
          await historyHandler(makeReq({
            params: { id: agentId },
            headers: { 'x-clawmax-agent-generation': originalGeneration },
          }), deletedHistoryRes)
          assert.strictEqual(deletedHistoryRes.statusCode, 410, 'Expected stale chat route to be bounded after deletion')
          assert.strictEqual(deletedHistoryRes.jsonBody?.code, 'AGENT_GONE')
          assert(!fs.existsSync(path.join(tmpHome, '.openclaw', 'agents', agentId)), 'Expected cached session state to be removed')

          writeAgent(workspacePath, agentId, '# IDENTITY.md\n\n- **Name:** Recreated Agent\n')
          const recreatedGeneration = getAgentLifecycleGeneration(agentWorkspace)
          assert.notStrictEqual(recreatedGeneration, originalGeneration, 'Expected same-ID recreation to have a new generation')

          const staleGenerationRes = makeRes()
          await historyHandler(makeReq({
            params: { id: agentId },
            headers: { 'x-clawmax-agent-generation': originalGeneration },
          }), staleGenerationRes)
          assert.strictEqual(staleGenerationRes.statusCode, 410, 'Expected an old chat panel to reject the recreated generation')
          assert.strictEqual(staleGenerationRes.jsonBody?.code, 'STALE_AGENT_GENERATION')

          const recreatedHistoryRes = makeRes()
          await historyHandler(makeReq({
            params: { id: agentId },
            headers: { 'x-clawmax-agent-generation': recreatedGeneration },
          }), recreatedHistoryRes)
          assert.strictEqual(recreatedHistoryRes.statusCode, 200, 'Expected the recreated agent to start a fresh chat')
          assert.deepStrictEqual(recreatedHistoryRes.jsonBody?.messages, [])
        })
      })
    } finally {
      fs.writeFileSync(configPath, previousConfig)
      fs.rmSync(agentWorkspace, { recursive: true, force: true })
    }
  })

  await test('remove-state fails closed when OpenClaw attestation cleanup cannot be verified', async () => {
    const agentId = 'remove-state-failure'
    const agentWorkspace = path.join(workspacePath, 'AGENTS', agentId)
    writeAgent(workspacePath, agentId, '# IDENTITY.md\n\n- **Name:** Remove State Failure\n')
    const nativeDeleteCalls: string[] = []

    await withOpenClawWorkspaceStateStubs({
      clearPinnedOpenClawWorkspaceState: async () => { throw new Error('attestation still present') },
    }, async () => {
      await withGatewayRpcStubs({
        isGatewayRunning: () => ({ running: true, port: 18789 }),
        getGatewayClient: () => ({
          deleteAgentNative: async (id: string) => { nativeDeleteCalls.push(id) },
        }),
      }, async () => {
        const handler = getRouteHandler('delete', '/:id')
        const res = makeRes()
        await handler(makeReq({ params: { id: agentId }, body: { removeStateDir: true } }), res)

        assert.strictEqual(res.statusCode, 503)
        assert.strictEqual(res.jsonBody?.ok, false)
        assert(res.jsonBody.errors.some((error: string) => error.includes('attestation still present')))
        assert(fs.existsSync(agentWorkspace), 'Expected visible agent workspace to remain unchanged')
        assert.deepStrictEqual(nativeDeleteCalls, [], 'Expected native registration to remain unchanged')
      })
    })
  })

  await test('agent channels route returns non-secret binding state and current provider availability', async () => {
    writeAgent(workspacePath, 'channel-reader', '# IDENTITY.md\n\n- **Name:** Channel Reader\n')
    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      channels: {
        telegram: {
          enabled: true,
          accounts: {
            'channel-reader': {
              name: 'Reader Telegram',
              enabled: true,
              botToken: '123456789:SECRET_CHANNEL_TOKEN_VALUE',
              dmPolicy: 'pairing',
            },
          },
        },
      },
      bindings: [{
        type: 'route',
        agentId: 'channel-reader',
        match: { channel: 'telegram', accountId: 'channel-reader' },
      }],
    }, null, 2))

    const handler = getRouteHandler('get', '/:id/channels')
    const res = makeRes()
    handler(makeReq({ params: { id: 'channel-reader' } }), res)

    assert.strictEqual(res.statusCode, 200)
    const telegram = res.jsonBody.channels.find((entry: any) => entry.id === 'telegram')
    const discord = res.jsonBody.channels.find((entry: any) => entry.id === 'discord')
    assert.strictEqual(telegram.status, 'bound')
    assert.strictEqual(telegram.dmPolicy, 'pairing')
    const slack = res.jsonBody.channels.find((entry: any) => entry.id === 'slack')
    assert.strictEqual(discord.releaseState, 'available')
    assert.strictEqual(slack.releaseState, 'available')
    assert(!JSON.stringify(res.jsonBody).includes('SECRET_CHANNEL_TOKEN_VALUE'))
  })

  await test('Telegram connect uses a protected token file, persists policy, and binds the agent', async () => {
    writeAgent(workspacePath, 'telegram-agent', '# IDENTITY.md\n\n- **Name:** Telegram Agent\n')
    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [{ id: 'telegram-agent' }] }, unknown: { keep: true } }, null, 2))
    const fakeCli = writeFakeOpenClawCli(tmpHome)
    process.env.OPENCLAW_BIN = fakeCli
    const token = '123456789:abcdefghijklmnopqrstuvwxyz_123456'
    const calls: string[][] = []

    await withChildProcessStubs({
      execFileSync(command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) {
        assert.strictEqual(command, fakeCli)
        calls.push([...args])
        assert(!args.includes(token), 'Expected Telegram token not to appear in process arguments')
        assert(!options.env?.GITHUB_TOKEN && !options.env?.GH_TOKEN && !options.env?.RESEND_API_KEY, 'Expected channel CLI environment to exclude unrelated secrets')
        if (args[0] === 'channels' && args[1] === 'add') {
          const tokenPath = args[args.indexOf('--token-file') + 1]
          assert.strictEqual(fs.readFileSync(tokenPath, 'utf-8'), token)
          assert.strictEqual(fs.statSync(tokenPath).mode & 0o777, 0o600)
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          config.channels = { telegram: { enabled: true, accounts: {
            'telegram-agent': { name: 'Telegram Agent Telegram', enabled: true, botToken: token },
          } } }
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        } else if (args[0] === 'config' && args[1] === 'set') {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          const configKey = String(args[2])
          if (configKey === 'secrets.providers.clawmax-channels') {
            config.secrets = { providers: { 'clawmax-channels': {
              source: 'file',
              path: args[args.indexOf('--provider-path') + 1],
              mode: 'json',
            } } }
          } else if (configKey.endsWith('.botToken')) {
            config.channels.telegram.accounts['telegram-agent'].botToken = {
              source: 'file',
              provider: 'clawmax-channels',
              id: args[args.indexOf('--ref-id') + 1],
            }
          } else {
            const key = configKey.split('.').pop()!
            config.channels.telegram.accounts['telegram-agent'][key] = JSON.parse(String(args[3]))
          }
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        } else if (args[0] === 'agents' && args[1] === 'bind') {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          config.bindings = [{ type: 'route', agentId: 'telegram-agent', match: { channel: 'telegram', accountId: 'telegram-agent' } }]
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        }
        return ''
      },
    }, async () => {
      const handler = getRouteHandler('post', '/:id/channels/:provider')
      const res = makeRes()
      handler(makeReq({
        params: { id: 'telegram-agent', provider: 'telegram' },
        body: { token, allowFrom: ['123456', '123456'] },
      }), res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.channel.status, 'bound')
      assert.deepStrictEqual(res.jsonBody.channel.allowFrom, ['123456'])
      assert(!JSON.stringify(res.jsonBody).includes(token))
    })

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    assert.strictEqual(persisted.unknown.keep, true)
    assert(!JSON.stringify(persisted).includes(token), 'Expected OpenClaw config to contain a SecretRef instead of the token')
    assert.deepStrictEqual(persisted.channels.telegram.accounts['telegram-agent'].botToken, {
      source: 'file',
      provider: 'clawmax-channels',
      id: '/telegram-telegram-agent',
    })
    assert.strictEqual(persisted.channels.telegram.accounts['telegram-agent'].dmPolicy, 'allowlist')
    assert.deepStrictEqual(persisted.channels.telegram.accounts['telegram-agent'].allowFrom, ['123456'])
    assert(calls.some(args => args.includes('telegram:telegram-agent')))
    const secretPath = path.join(tmpHome, '.openclaw', 'credentials', 'clawmax-channel-secrets.json')
    assert.strictEqual(fs.statSync(secretPath).mode & 0o777, 0o600)
    assert.strictEqual(JSON.parse(fs.readFileSync(secretPath, 'utf-8'))['telegram-telegram-agent'], token)
    const auditPath = path.join(workspacePath, '.clawmax', 'lifecycle', 'agents', 'telegram-agent.jsonl')
    assert(!fs.readFileSync(auditPath, 'utf-8').includes(token))
  })

  await test('Telegram connect restores exact config and redacts the token when binding fails', async () => {
    writeAgent(workspacePath, 'telegram-rollback', '# IDENTITY.md\n\n- **Name:** Telegram Rollback\n')
    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    const original = JSON.stringify({ agents: { list: [{ id: 'telegram-rollback' }] }, unknown: { exact: 'value' } }, null, 2)
    fs.writeFileSync(configPath, original, { mode: 0o600 })
    fs.chmodSync(configPath, 0o600)
    const fakeCli = writeFakeOpenClawCli(tmpHome)
    process.env.OPENCLAW_BIN = fakeCli
    const token = '987654321:abcdefghijklmnopqrstuvwxyz_654321'

    await withChildProcessStubs({
      execFileSync(_command: string, args: string[]) {
        if (args[0] === 'channels' && args[1] === 'add') {
          fs.writeFileSync(configPath, JSON.stringify({ channels: { telegram: { accounts: {
            'telegram-rollback': { botToken: token },
          } } } }))
          return ''
        }
        if (args[0] === 'agents' && args[1] === 'bind') {
          throw new Error(`binding failed for ${token}`)
        }
        return ''
      },
    }, async () => {
      const handler = getRouteHandler('post', '/:id/channels/:provider')
      const res = makeRes()
      handler(makeReq({
        params: { id: 'telegram-rollback', provider: 'telegram' },
        body: { token },
      }), res)
      assert.strictEqual(res.statusCode, 502)
      assert.strictEqual(res.jsonBody.rolledBack, true)
      assert(!JSON.stringify(res.jsonBody).includes(token))
      assert(JSON.stringify(res.jsonBody).includes('[redacted]'))
    })

    assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), original)
    assert.strictEqual(fs.statSync(configPath).mode & 0o777, 0o600)
  })

  await test('Discord connect loads the pinned profile plugin, persists scoped policy, and binds without exposing the token', async () => {
    writeAgent(workspacePath, 'discord-agent', '# IDENTITY.md\n\n- **Name:** Discord Agent\n')
    const profileDir = path.join(tmpHome, '.openclaw-discord-agent')
    const configPath = path.join(profileDir, 'openclaw.json')
    fs.mkdirSync(profileDir, { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [{ id: 'discord-agent' }] }, unknown: { keep: true } }, null, 2))
    const pluginPath = path.join(tmpHome, '.openclaw', 'npm', 'node_modules', '@openclaw', 'discord')
    fs.mkdirSync(pluginPath, { recursive: true })
    fs.writeFileSync(path.join(pluginPath, 'openclaw.plugin.json'), JSON.stringify({ id: 'discord' }))
    const fakeCli = writeFakeOpenClawCli(tmpHome)
    process.env.OPENCLAW_BIN = fakeCli
    const token = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.signature_part_1234567890.tail_part_1234567890'
    const calls: string[][] = []

    const writePath = (config: Record<string, any>, dottedPath: string, value: unknown) => {
      const parts = dottedPath.split('.')
      let cursor = config
      for (const part of parts.slice(0, -1)) cursor = cursor[part] ||= {}
      cursor[parts[parts.length - 1]] = value
    }

    await withChildProcessStubs({
      execFileSync(command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) {
        assert.strictEqual(command, fakeCli)
        calls.push([...args])
        assert.deepStrictEqual(args.slice(0, 2), ['--profile', 'discord-agent'])
        assert(!args.includes(token), 'Expected Discord token not to appear in process arguments')
        assert(!options.env?.GITHUB_TOKEN && !options.env?.GH_TOKEN && !options.env?.RESEND_API_KEY)
        const commandArgs = args.slice(2)
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (commandArgs[0] === 'channels' && commandArgs[1] === 'add') {
          const tokenPath = commandArgs[commandArgs.indexOf('--token-file') + 1]
          assert.strictEqual(fs.readFileSync(tokenPath, 'utf-8'), token)
          assert.strictEqual(fs.statSync(tokenPath).mode & 0o777, 0o600)
          config.channels = { discord: { enabled: true, accounts: {
            'discord-agent': { name: 'Discord Agent Discord', enabled: true, token, groupPolicy: 'allowlist' },
          } } }
        } else if (commandArgs[0] === 'config' && commandArgs[1] === 'set') {
          const configKey = String(commandArgs[2])
          if (configKey === 'secrets.providers.clawmax-channels') {
            writePath(config, configKey, {
              source: 'file',
              path: commandArgs[commandArgs.indexOf('--provider-path') + 1],
              mode: 'json',
            })
          } else if (configKey.endsWith('.token')) {
            writePath(config, configKey, {
              source: 'file',
              provider: 'clawmax-channels',
              id: commandArgs[commandArgs.indexOf('--ref-id') + 1],
            })
          } else {
            writePath(config, configKey, JSON.parse(String(commandArgs[3])))
          }
        } else if (commandArgs[0] === 'agents' && commandArgs[1] === 'bind') {
          config.bindings = [{ type: 'route', agentId: 'discord-agent', match: { channel: 'discord', accountId: 'discord-agent' } }]
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        return ''
      },
    }, async () => {
      const handler = getRouteHandler('post', '/:id/channels/:provider')
      const res = makeRes()
      handler(makeReq({
        params: { id: 'discord-agent', provider: 'discord' },
        body: {
          token,
          applicationId: '123456789012345678',
          userIds: ['234567890123456789', '234567890123456789'],
          guildId: '345678901234567890',
          channelIds: ['456789012345678901'],
          requireMention: false,
        },
      }), res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.channel.status, 'bound')
      assert.strictEqual(res.jsonBody.channel.applicationId, '123456789012345678')
      assert.deepStrictEqual(res.jsonBody.channel.guilds[0].channels, ['456789012345678901'])
      assert(!JSON.stringify(res.jsonBody).includes(token))
    })

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    assert.strictEqual(persisted.unknown.keep, true)
    assert.deepStrictEqual(persisted.plugins.load.paths, [pluginPath])
    assert.strictEqual(persisted.plugins.entries.discord.enabled, true)
    assert.deepStrictEqual(persisted.channels.discord.accounts['discord-agent'].token, {
      source: 'file',
      provider: 'clawmax-channels',
      id: '/discord-discord-agent',
    })
    assert.strictEqual(persisted.channels.discord.accounts['discord-agent'].dmPolicy, 'allowlist')
    assert.strictEqual(persisted.channels.discord.accounts['discord-agent'].groupPolicy, 'allowlist')
    assert.strictEqual(persisted.channels.discord.accounts['discord-agent'].guilds['345678901234567890'].requireMention, false)
    assert(calls.some(args => args.includes('discord:discord-agent')))
    assert(!calls.some(args => args.includes('channels') && args.includes('add')), 'Discord must be created atomically from a SecretRef because its CLI rejects --token-file')
    const secretPath = path.join(profileDir, 'credentials', 'clawmax-channel-secrets.json')
    assert.strictEqual(JSON.parse(fs.readFileSync(secretPath, 'utf-8'))['discord-discord-agent'], token)
    assert(!fs.readFileSync(path.join(workspacePath, '.clawmax', 'lifecycle', 'agents', 'discord-agent.jsonl'), 'utf-8').includes(token))
  })

  await test('Slack connect persists separate SecretRefs, fail-closed scopes, and a Socket Mode binding', async () => {
    writeAgent(workspacePath, 'slack-agent', '# IDENTITY.md\n\n- **Name:** Slack Agent\n')
    const profileDir = path.join(tmpHome, '.openclaw-slack-agent')
    const configPath = path.join(profileDir, 'openclaw.json')
    fs.mkdirSync(profileDir, { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({ agents: { list: [{ id: 'slack-agent' }] }, unknown: { keep: true } }, null, 2))
    const pluginPath = path.join(tmpHome, '.openclaw', 'npm', 'node_modules', '@openclaw', 'slack')
    fs.mkdirSync(pluginPath, { recursive: true })
    fs.writeFileSync(path.join(pluginPath, 'openclaw.plugin.json'), JSON.stringify({ id: 'slack' }))
    const fakeCli = writeFakeOpenClawCli(tmpHome)
    process.env.OPENCLAW_BIN = fakeCli
    const botToken = 'xoxb-1234567890-abcdefghij'
    const appToken = 'xapp-1234567890-abcdefghij'
    const calls: string[][] = []
    const writePath = (config: Record<string, any>, dottedPath: string, value: unknown) => {
      const parts = dottedPath.split('.')
      let cursor = config
      for (const part of parts.slice(0, -1)) cursor = cursor[part] ||= {}
      cursor[parts[parts.length - 1]] = value
    }

    await withChildProcessStubs({
      execFileSync(command: string, args: string[], options: { env?: NodeJS.ProcessEnv }) {
        assert.strictEqual(command, fakeCli)
        calls.push([...args])
        assert.deepStrictEqual(args.slice(0, 2), ['--profile', 'slack-agent'])
        assert(!args.includes(botToken) && !args.includes(appToken), 'Slack tokens must not appear in process arguments')
        assert(!options.env?.GITHUB_TOKEN && !options.env?.GH_TOKEN)
        const commandArgs = args.slice(2)
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (commandArgs[0] === 'config' && commandArgs[1] === 'set') {
          const configKey = String(commandArgs[2])
          if (configKey === 'secrets.providers.clawmax-channels') {
            writePath(config, configKey, { source: 'file', path: commandArgs[commandArgs.indexOf('--provider-path') + 1], mode: 'json' })
          } else {
            writePath(config, configKey, JSON.parse(String(commandArgs[3])))
          }
        } else if (commandArgs[0] === 'agents' && commandArgs[1] === 'bind') {
          config.bindings = [{ agentId: 'slack-agent', match: { channel: 'slack', accountId: 'slack-agent' } }]
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        return ''
      },
    }, async () => {
      const handler = getRouteHandler('post', '/:id/channels/:provider')
      const res = makeRes()
      handler(makeReq({
        params: { id: 'slack-agent', provider: 'slack' },
        body: { botToken, appToken, userIds: ['U012ABCDEF'], channelIds: ['C012ABCDEF'], requireMention: false },
      }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.channel.status, 'bound')
      assert.strictEqual(res.jsonBody.channel.mode, 'socket')
      assert.deepStrictEqual(res.jsonBody.channel.channelIds, ['C012ABCDEF'])
      assert(!JSON.stringify(res.jsonBody).includes(botToken) && !JSON.stringify(res.jsonBody).includes(appToken))
    })

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const account = persisted.channels.slack.accounts['slack-agent']
    assert.deepStrictEqual(persisted.plugins.load.paths, [pluginPath])
    assert.strictEqual(persisted.plugins.entries.slack.enabled, true)
    assert.strictEqual(account.mode, 'socket')
    assert.deepStrictEqual(account.botToken, { source: 'file', provider: 'clawmax-channels', id: '/slack-bot-slack-agent' })
    assert.deepStrictEqual(account.appToken, { source: 'file', provider: 'clawmax-channels', id: '/slack-app-slack-agent' })
    assert.strictEqual(account.groupPolicy, 'allowlist')
    assert.strictEqual(account.channels.C012ABCDEF.requireMention, false)
    assert(calls.some(args => args.includes('slack:slack-agent')))
    assert(!calls.some(args => args.includes('channels') && args.includes('add')))
    const secrets = JSON.parse(fs.readFileSync(path.join(profileDir, 'credentials', 'clawmax-channel-secrets.json'), 'utf-8'))
    assert.deepStrictEqual(secrets, { 'slack-bot-slack-agent': botToken, 'slack-app-slack-agent': appToken })
    const audit = fs.readFileSync(path.join(workspacePath, '.clawmax', 'lifecycle', 'agents', 'slack-agent.jsonl'), 'utf-8')
    assert(!audit.includes(botToken) && !audit.includes(appToken))
  })

  await test('Slack capability probe returns actionable scope diagnostics without schema or secret leakage', async () => {
    const leakedToken = 'xoxb-1234567890-leakedvalue'
    await withChildProcessStubs({
      execFileSync(_command: string, args: string[], options: { timeout?: number }) {
        assert.deepStrictEqual(args.slice(0, 2), ['--profile', 'slack-agent'])
        assert(args.includes('--channel') && args.includes('slack') && args.includes('--account') && args.includes('slack-agent'))
        assert.strictEqual(options.timeout, 15000)
        return JSON.stringify({ channels: [{
          channel: 'slack', accountId: 'slack-agent',
          probe: { ok: false, status: 403, error: `missing_scope channels:history ${leakedToken}` },
          configSchema: { secret: 'must-not-return' },
        }] })
      },
    }, async () => {
      const handler = getRouteHandler('post', '/:id/channels/:provider/probe')
      const res = makeRes()
      handler(makeReq({ params: { id: 'slack-agent', provider: 'slack' } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.probe.category, 'scope')
      assert(!JSON.stringify(res.jsonBody).includes(leakedToken))
      assert(!JSON.stringify(res.jsonBody).includes('must-not-return'))
    })
  })

  await test('Discord capability probe returns bounded intent diagnostics and persists non-secret evidence', async () => {
    process.env.OPENCLAW_BIN = writeFakeOpenClawCli(tmpHome)
    const probeLeakedToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.probe_signature_1234567890.probe_tail_1234567890'
    await withChildProcessStubs({
      execFileSync(_command: string, args: string[], options: { timeout?: number; env?: NodeJS.ProcessEnv }) {
        assert.deepStrictEqual(args.slice(0, 2), ['--profile', 'discord-agent'])
        assert(args.includes('capabilities') && args.includes('--account') && args.includes('discord-agent'))
        assert.strictEqual(options.timeout, 15000)
        assert(!options.env?.GITHUB_TOKEN && !options.env?.GH_TOKEN)
        return JSON.stringify({
          channels: [{
            channel: 'discord',
            accountId: 'discord-agent',
            configured: true,
            probe: { ok: false, status: 403, error: `Missing Message Content intent for ${probeLeakedToken}` },
            configSchema: { secret: 'must-not-return' },
          }],
        })
      },
    }, async () => {
      const handler = getRouteHandler('post', '/:id/channels/:provider/probe')
      const res = makeRes()
      handler(makeReq({ params: { id: 'discord-agent', provider: 'discord' } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.probe.ok, false)
      assert.strictEqual(res.jsonBody.probe.category, 'intent')
      assert(!JSON.stringify(res.jsonBody).includes('must-not-return'))
      assert(!JSON.stringify(res.jsonBody).includes(probeLeakedToken))
    })
    const audit = fs.readFileSync(path.join(workspacePath, '.clawmax', 'lifecycle', 'agents', 'discord-agent.jsonl'), 'utf-8')
    assert(audit.includes('Discord channel probe failed'))
    assert(!audit.includes('must-not-return'))
    assert(!audit.includes(probeLeakedToken))
  })

  await test('Discord capability probe redacts token-shaped subprocess errors', async () => {
    const leakedToken = 'MTIzNDU2Nzg5MDEyMzQ1Njc4.signature_part_1234567890.tail_part_1234567890'
    await withChildProcessStubs({
      execFileSync() {
        throw new Error(`probe process failed for ${leakedToken}`)
      },
    }, async () => {
      const handler = getRouteHandler('post', '/:id/channels/:provider/probe')
      const res = makeRes()
      handler(makeReq({ params: { id: 'discord-agent', provider: 'discord' } }), res)
      assert.strictEqual(res.statusCode, 502)
      assert(!JSON.stringify(res.jsonBody).includes(leakedToken))
      assert(JSON.stringify(res.jsonBody).includes('[redacted]'))
    })
  })

  await test('channel connect validates provider input, installation, and release state', async () => {
    writeAgent(workspacePath, 'channel-validation', '# IDENTITY.md\n\n- **Name:** Channel Validation\n')
    fs.rmSync(path.join(tmpHome, '.openclaw', 'npm', 'node_modules', '@openclaw', 'discord'), { recursive: true, force: true })
    fs.rmSync(path.join(tmpHome, '.openclaw', 'npm', 'node_modules', '@openclaw', 'slack'), { recursive: true, force: true })
    const handler = getRouteHandler('post', '/:id/channels/:provider')
    const invalidRes = makeRes()
    handler(makeReq({
      params: { id: 'channel-validation', provider: 'telegram' },
      body: { token: 'invalid' },
    }), invalidRes)
    assert.strictEqual(invalidRes.statusCode, 400)

    const invalidDiscordRes = makeRes()
    handler(makeReq({
      params: { id: 'channel-validation', provider: 'discord' },
      body: { token: 'anything' },
    }), invalidDiscordRes)
    assert.strictEqual(invalidDiscordRes.statusCode, 400)

    const missingDiscordRes = makeRes()
    handler(makeReq({
      params: { id: 'channel-validation', provider: 'discord' },
      body: { token: 'abcdefghijklmnopqrstuvwxyz_1234567890' },
    }), missingDiscordRes)
    assert.strictEqual(missingDiscordRes.statusCode, 503)
    assert(String(missingDiscordRes.jsonBody.error).includes('not installed'))

    const invalidSlackRes = makeRes()
    handler(makeReq({
      params: { id: 'channel-validation', provider: 'slack' },
      body: { botToken: 'anything', appToken: 'anything' },
    }), invalidSlackRes)
    assert.strictEqual(invalidSlackRes.statusCode, 400)

    const missingSlackRes = makeRes()
    handler(makeReq({
      params: { id: 'channel-validation', provider: 'slack' },
      body: { botToken: 'xoxb-1234567890-abcdefghij', appToken: 'xapp-1234567890-abcdefghij' },
    }), missingSlackRes)
    assert.strictEqual(missingSlackRes.statusCode, 503)
    assert(String(missingSlackRes.jsonBody.error).includes('Slack channel runtime'))
  })

  await test('Telegram disconnect removes only the named binding and account', async () => {
    writeAgent(workspacePath, 'telegram-disconnect', '# IDENTITY.md\n\n- **Name:** Telegram Disconnect\n')
    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      channels: { telegram: { enabled: true, accounts: {
        'telegram-disconnect': { botToken: 'secret' },
        other: { botToken: 'preserve-me' },
      } } },
      bindings: [
        { type: 'route', agentId: 'telegram-disconnect', match: { channel: 'telegram', accountId: 'telegram-disconnect' } },
        { type: 'route', agentId: 'other', match: { channel: 'telegram', accountId: 'other' } },
      ],
    }, null, 2))
    const secretPath = path.join(tmpHome, '.openclaw', 'credentials', 'clawmax-channel-secrets.json')
    fs.mkdirSync(path.dirname(secretPath), { recursive: true })
    fs.writeFileSync(secretPath, JSON.stringify({
      'telegram-telegram-disconnect': 'remove-me',
      'telegram-other': 'preserve-me-too',
    }, null, 2), { mode: 0o600 })
    const fakeCli = writeFakeOpenClawCli(tmpHome)
    process.env.OPENCLAW_BIN = fakeCli

    await withChildProcessStubs({
      execFileSync(_command: string, args: string[]) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (args[0] === 'agents' && args[1] === 'unbind') {
          config.bindings = config.bindings.filter((binding: any) => binding.agentId !== 'telegram-disconnect')
        } else if (args[0] === 'channels' && args[1] === 'remove') {
          delete config.channels.telegram.accounts['telegram-disconnect']
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        return ''
      },
    }, async () => {
      const handler = getRouteHandler('delete', '/:id/channels/:provider')
      const res = makeRes()
      handler(makeReq({ params: { id: 'telegram-disconnect', provider: 'telegram' } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.channel.status, 'not-configured')
    })

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    assert.strictEqual(persisted.channels.telegram.accounts.other.botToken, 'preserve-me')
    assert(persisted.bindings.some((binding: any) => binding.agentId === 'other'))
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(secretPath, 'utf-8')), {
      'telegram-other': 'preserve-me-too',
    })
  })

  await test('Telegram disconnect restores the binding and account when account removal fails', async () => {
    writeAgent(workspacePath, 'telegram-disconnect-rollback', '# IDENTITY.md\n\n- **Name:** Telegram Disconnect Rollback\n')
    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    const original = JSON.stringify({
      channels: { telegram: { enabled: true, accounts: {
        'telegram-disconnect-rollback': { botToken: 'preserve-secret', dmPolicy: 'pairing' },
      } } },
      bindings: [{
        type: 'route',
        agentId: 'telegram-disconnect-rollback',
        match: { channel: 'telegram', accountId: 'telegram-disconnect-rollback' },
      }],
      unknown: { preserve: true },
    }, null, 2)
    fs.writeFileSync(configPath, original)
    const fakeCli = writeFakeOpenClawCli(tmpHome)
    process.env.OPENCLAW_BIN = fakeCli

    await withChildProcessStubs({
      execFileSync(_command: string, args: string[]) {
        if (args[0] === 'agents' && args[1] === 'unbind') {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
          config.bindings = []
          fs.writeFileSync(configPath, JSON.stringify(config))
          return ''
        }
        throw new Error('provider account removal failed')
      },
    }, async () => {
      const handler = getRouteHandler('delete', '/:id/channels/:provider')
      const res = makeRes()
      handler(makeReq({ params: { id: 'telegram-disconnect-rollback', provider: 'telegram' } }), res)
      assert.strictEqual(res.statusCode, 502)
      assert.strictEqual(res.jsonBody.rolledBack, true)
    })

    assert.strictEqual(fs.readFileSync(configPath, 'utf-8'), original)
  })

  await test('Discord disconnect removes only the named account, binding, and secret', async () => {
    writeAgent(workspacePath, 'discord-disconnect', '# IDENTITY.md\n\n- **Name:** Discord Disconnect\n')
    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      channels: { discord: { enabled: true, accounts: {
        'discord-disconnect': { token: { source: 'file', provider: 'clawmax-channels', id: '/discord-discord-disconnect' } },
        other: { token: 'preserve-me' },
      } } },
      bindings: [
        { agentId: 'discord-disconnect', match: { channel: 'discord', accountId: 'discord-disconnect' } },
        { agentId: 'other', match: { channel: 'discord', accountId: 'other' } },
      ],
    }, null, 2))
    const secretPath = path.join(tmpHome, '.openclaw', 'credentials', 'clawmax-channel-secrets.json')
    fs.mkdirSync(path.dirname(secretPath), { recursive: true })
    fs.writeFileSync(secretPath, JSON.stringify({
      'discord-discord-disconnect': 'remove-me',
      'discord-other': 'preserve-me-too',
    }, null, 2), { mode: 0o600 })
    process.env.OPENCLAW_BIN = writeFakeOpenClawCli(tmpHome)

    await withChildProcessStubs({
      execFileSync(_command: string, args: string[]) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (args[0] === 'agents' && args[1] === 'unbind') {
          config.bindings = config.bindings.filter((binding: any) => binding.agentId !== 'discord-disconnect')
        } else if (args[0] === 'channels' && args[1] === 'remove') {
          delete config.channels.discord.accounts['discord-disconnect']
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        return ''
      },
    }, async () => {
      const handler = getRouteHandler('delete', '/:id/channels/:provider')
      const res = makeRes()
      handler(makeReq({ params: { id: 'discord-disconnect', provider: 'discord' } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.channel.status, 'not-configured')
    })

    const persisted = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    assert.strictEqual(persisted.channels.discord.accounts.other.token, 'preserve-me')
    assert(persisted.bindings.some((binding: any) => binding.agentId === 'other'))
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(secretPath, 'utf-8')), { 'discord-other': 'preserve-me-too' })
  })

  await test('Slack disconnect removes both credentials while preserving sibling secrets', async () => {
    writeAgent(workspacePath, 'slack-disconnect', '# IDENTITY.md\n\n- **Name:** Slack Disconnect\n')
    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      channels: { slack: { enabled: true, accounts: {
        'slack-disconnect': { botToken: { id: '/slack-bot-slack-disconnect' }, appToken: { id: '/slack-app-slack-disconnect' } },
        other: { botToken: 'preserve', appToken: 'preserve' },
      } } },
      bindings: [
        { agentId: 'slack-disconnect', match: { channel: 'slack', accountId: 'slack-disconnect' } },
        { agentId: 'other', match: { channel: 'slack', accountId: 'other' } },
      ],
    }, null, 2))
    const secretPath = path.join(tmpHome, '.openclaw', 'credentials', 'clawmax-channel-secrets.json')
    fs.mkdirSync(path.dirname(secretPath), { recursive: true })
    fs.writeFileSync(secretPath, JSON.stringify({
      'slack-bot-slack-disconnect': 'remove-bot', 'slack-app-slack-disconnect': 'remove-app', 'discord-other': 'preserve',
    }, null, 2), { mode: 0o600 })
    process.env.OPENCLAW_BIN = writeFakeOpenClawCli(tmpHome)
    await withChildProcessStubs({
      execFileSync(_command: string, args: string[]) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (args[0] === 'agents' && args[1] === 'unbind') config.bindings = config.bindings.filter((binding: any) => binding.agentId !== 'slack-disconnect')
        if (args[0] === 'channels' && args[1] === 'remove') delete config.channels.slack.accounts['slack-disconnect']
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
        return ''
      },
    }, async () => {
      const handler = getRouteHandler('delete', '/:id/channels/:provider')
      const res = makeRes()
      handler(makeReq({ params: { id: 'slack-disconnect', provider: 'slack' } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody.channel.status, 'not-configured')
    })
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(secretPath, 'utf-8')), { 'discord-other': 'preserve' })
  })

  await test('provision route does not pass legacy --whatsapp to openclaw agents add', async () => {
    const tmpCliDir = path.join(tmpHome, 'bin-no-whatsapp')
    const fakeCli = path.join(tmpCliDir, 'openclaw')
    fs.mkdirSync(tmpCliDir, { recursive: true })
    fs.writeFileSync(fakeCli, '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    fs.chmodSync(fakeCli, 0o755)
    process.env.OPENCLAW_BIN = fakeCli

    const childProcess = require('child_process')
    const originalSpawn = childProcess.spawn
    const spawnCalls: Array<{ command: string; args: string[] }> = []

    childProcess.spawn = (command: string, args: string[]) => {
      spawnCalls.push({ command, args })
      const listeners: Record<string, Function> = {}
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(event: string, handler: Function) {
          listeners[event] = handler
          if (event === 'close') {
            setTimeout(() => handler(0, null), 0)
          }
        },
      }
    }

    try {
      const handler = getRouteHandler('post', '/provision')
      const res: any = {
        writableEnded: false,
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) { this.headers[name] = value },
        writeHead() { return this },
        flushHeaders() {},
        write() {},
        end() { this.writableEnded = true },
      }
      const req: any = makeReq({
        body: {
          name: 'whatsapp-agent',
          model: 'openai/gpt-5',
          whatsapp: '+15142427899',
          tags: [],
        },
        on() {},
      })
      await handler(req, res)
      await new Promise(resolve => setTimeout(resolve, 20))

      const addCall = spawnCalls.find((call) => call.args.slice(0, 3).join(' ') === 'agents add whatsapp-agent')
      assert(addCall, 'Expected openclaw agents add to be invoked')
      assert(!addCall!.args.includes('--whatsapp'), 'Expected provisioning to avoid legacy --whatsapp flag')
      assert(!addCall!.args.includes('+15142427899'), 'Expected WhatsApp number not to be passed to openclaw agents add')
    } finally {
      childProcess.spawn = originalSpawn
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('WhatsApp pairing uses resolved OpenClaw 2 dependencies and repository script', async () => {
    process.env.OPENCLAW_BIN = writeFakeOpenClawCli(tmpHome)
    const fakeBaileys = path.join(tmpHome, 'runtime', 'node_modules', 'baileys')
    const fakeBoom = path.join(tmpHome, 'runtime', 'node_modules', '@hapi', 'boom')
    const child = new EventEmitter() as any
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    let spawnCall: { command: string; args: string[]; options: Record<string, any> } | null = null

    await withWhatsAppDependencyStubs({
      resolveWhatsAppDependencyPaths() {
        return { baileys: fakeBaileys, boom: fakeBoom }
      },
    }, async () => {
      await withChildProcessStubs({
        spawn(command: string, args: string[], options: Record<string, any>) {
          spawnCall = { command, args, options }
          return child
        },
      }, async () => {
        const handler = getRouteHandler('post', '/:id/whatsapp/pair')
        const writes: string[] = []
        const res: any = {
          setHeader() {},
          flushHeaders() {},
          write(value: string) { writes.push(value) },
          end() {},
        }
        handler(makeReq({
          params: { id: 'whatsapp-agent' },
          body: { phone: '15142427899' },
          on() {},
        }), res)

        assert(spawnCall, 'Expected the pairing helper to be spawned')
        const { REPO_ROOT } = require('../lib/paths')
        const expectedScript = path.join(REPO_ROOT, 'SYSTEM', 'scripts', 'instances', 'lib', 'whatsapp-pair.mjs')
        assert.strictEqual(spawnCall!.command, 'node')
        assert.deepStrictEqual(spawnCall!.args, [expectedScript, '15142427899', path.join(tmpHome, '.openclaw', 'credentials', 'whatsapp', 'default'), fakeBaileys, fakeBoom])
        assert.strictEqual(spawnCall!.options.cwd, REPO_ROOT)
        assert(writes.some(value => value.includes('Pairing WhatsApp +15142427899')))
        child.emit('close', 0, null)
      })
    })
  })

  await test('provision assigns only installed selected skills after agent creation succeeds', async () => {
    const tmpCliDir = path.join(tmpHome, 'bin-skills')
    const fakeCli = path.join(tmpCliDir, 'openclaw')
    fs.mkdirSync(tmpCliDir, { recursive: true })
    fs.writeFileSync(fakeCli, '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    fs.chmodSync(fakeCli, 0o755)
    process.env.OPENCLAW_BIN = fakeCli

    const childProcess = require('child_process')
    const skillsModule = require('../lib/skills')
    const originalSpawn = childProcess.spawn
    const originalSetAgentSkills = skillsModule.setAgentSkills
    const assigned: Array<{ agentId: string; skills: string[] }> = []

    childProcess.spawn = () => {
      const listeners: Record<string, Function> = {}
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(event: string, handler: Function) {
          listeners[event] = handler
          if (event === 'close') {
            setTimeout(() => handler(0, null), 0)
          }
        },
      }
    }
    skillsModule.setAgentSkills = (agentId: string, skills: string[]) => {
      assigned.push({ agentId, skills })
    }

    try {
      const handler = getRouteHandler('post', '/provision')
      const writes: string[] = []
      const res: any = {
        writableEnded: false,
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) { this.headers[name] = value },
        writeHead() { return this },
        flushHeaders() {},
        write(chunk: string) { writes.push(String(chunk)) },
        end() { this.writableEnded = true },
      }
      const req: any = makeReq({
        body: {
          name: 'resend-agent',
          model: 'openai/gpt-4o-mini',
          tags: ['email'],
          skills: ['clawmax-resend', 'missing-skill', 'workspace-ls'],
        },
        on() {},
      })
      await handler(req, res)
      await new Promise(resolve => setTimeout(resolve, 20))

      assert.deepStrictEqual(assigned, [{ agentId: 'resend-agent', skills: ['clawmax-resend', 'workspace-ls'] }])
      assert(writes.some(chunk => chunk.includes('Assigned selected skills: clawmax-resend, workspace-ls')), 'Expected streamed logs to mention selected skill assignment')
      assert(writes.some(chunk => chunk.includes('"type":"done"') && chunk.includes('"data":"ok"')), 'Expected successful create completion event')
    } finally {
      childProcess.spawn = originalSpawn
      skillsModule.setAgentSkills = originalSetAgentSkills
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('provision keeps preferred hosted model when only local runtime models are cached', async () => {
    const tmpCliDir = path.join(tmpHome, 'bin-hosted')
    const fakeCli = path.join(tmpCliDir, 'openclaw')
    fs.mkdirSync(tmpCliDir, { recursive: true })
    fs.writeFileSync(fakeCli, '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    fs.chmodSync(fakeCli, 0o755)
    process.env.OPENCLAW_BIN = fakeCli

    const childProcess = require('child_process')
    const modelDiscovery = require('../lib/model-discovery')
    const originalSpawn = childProcess.spawn
    const originalGetAvailableModelsCached = modelDiscovery.getAvailableModelsCached
    const spawnCalls: Array<{ command: string; args: string[] }> = []

    modelDiscovery.getAvailableModelsCached = () => ['ollama/qwen2.5:latest']
    childProcess.spawn = (command: string, args: string[]) => {
      spawnCalls.push({ command, args })
      const listeners: Record<string, Function> = {}
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(event: string, handler: Function) {
          listeners[event] = handler
          if (event === 'close') {
            setTimeout(() => handler(0, null), 0)
          }
        },
      }
    }

    try {
      const handler = getRouteHandler('post', '/provision')
      const writes: string[] = []
      const res: any = {
        writableEnded: false,
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) { this.headers[name] = value },
        writeHead() { return this },
        flushHeaders() {},
        write(chunk: string) { writes.push(String(chunk)) },
        end() { this.writableEnded = true },
      }
      const req: any = makeReq({
        body: {
          name: 'hosted-preferred-agent',
          model: 'openai/gpt-5',
          tags: ['assistant'],
        },
        on() {},
      })
      await handler(req, res)
      await new Promise(resolve => setTimeout(resolve, 20))

      const addCall = spawnCalls.find((call) => call.args.slice(0, 3).join(' ') === 'agents add hosted-preferred-agent')
      assert(addCall, 'Expected openclaw agents add to be invoked')
      assert(addCall!.args.includes('openai/gpt-5'), 'Expected provisioning to keep the preferred hosted model')
      assert(!writes.some(chunk => chunk.includes('Using fallback model: "ollama/qwen2.5:latest"')), 'Expected provisioning to avoid falling back to the local Ollama model')
    } finally {
      childProcess.spawn = originalSpawn
      modelDiscovery.getAvailableModelsCached = originalGetAvailableModelsCached
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('provision writes AI-generated files after agent registration succeeds', async () => {
    const tmpCliDir = path.join(tmpHome, 'bin-generated')
    const fakeCli = path.join(tmpCliDir, 'openclaw')
    fs.mkdirSync(tmpCliDir, { recursive: true })
    fs.writeFileSync(fakeCli, '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    fs.chmodSync(fakeCli, 0o755)
    process.env.OPENCLAW_BIN = fakeCli

    const childProcess = require('child_process')
    const originalSpawn = childProcess.spawn

    childProcess.spawn = () => {
      const listeners: Record<string, Function> = {}
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(event: string, handler: Function) {
          listeners[event] = handler
          if (event === 'close') {
            setTimeout(() => handler(0, null), 0)
          }
        },
      }
    }

    try {
      const handler = getRouteHandler('post', '/provision')
      const writes: string[] = []
      const res: any = {
        writableEnded: false,
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) { this.headers[name] = value },
        writeHead() { return this },
        flushHeaders() {},
        write(chunk: string) { writes.push(String(chunk)) },
        end() { this.writableEnded = true },
      }
      const req: any = makeReq({
        body: {
          name: 'proto-bot',
          model: 'openai/gpt-4o-mini',
          tags: ['acceptance-probe', 'read-only'],
          generatedFiles: {
            identity: '# IDENTITY\n\n**Name:** proto-bot\n**Creature:** assistant\n**Vibe:** helpful\n**Emoji:** 🤖\n',
            soul: '# SOUL\n\nThis is a generated soul file with enough content to pass validation.\n',
            tools: '# TOOLS\n\nThis is a generated tools file with enough content to pass validation.\n',
          },
        },
        on() {},
      })
      await handler(req, res)
      await new Promise(resolve => setTimeout(resolve, 20))

      const generatedIdentityPath = path.join(workspacePath, 'AGENTS', 'proto-bot', 'IDENTITY.md')
      assert(fs.existsSync(generatedIdentityPath), 'Expected generated IDENTITY.md to be written after successful registration')
      const generatedIdentity = fs.readFileSync(generatedIdentityPath, 'utf-8')
      assert(generatedIdentity.includes('- **Tags:** acceptance-probe, read-only'), 'Expected ordered requested tags in generated identity')
      assert(writes.some(chunk => chunk.includes('Wrote AI-generated files')), 'Expected streamed logs to mention generated files')
      assert(writes.some(chunk => chunk.includes('"type":"done"') && chunk.includes('"data":"ok"')), 'Expected successful create completion event')

      const listHandler = getRouteHandler('get', '/')
      const listRes = makeRes()
      await listHandler(makeReq(), listRes)
      const listed = listRes.jsonBody?.agents?.find((agent: any) => agent.id === 'proto-bot')
      assert.deepStrictEqual(listed?.tags, ['acceptance-probe', 'read-only'], 'Expected GET /api/agents to preserve ordered tags')
    } finally {
      childProcess.spawn = originalSpawn
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('provision stores a synthesized AI Description instead of the raw builder conversation prompt', async () => {
    const tmpCliDir = path.join(tmpHome, 'bin-ai-description')
    const fakeCli = path.join(tmpCliDir, 'openclaw')
    fs.mkdirSync(tmpCliDir, { recursive: true })
    fs.writeFileSync(fakeCli, '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    fs.chmodSync(fakeCli, 0o755)
    process.env.OPENCLAW_BIN = fakeCli

    const childProcess = require('child_process')
    const originalSpawn = childProcess.spawn

    childProcess.spawn = () => {
      const listeners: Record<string, Function> = {}
      return {
        stdout: { on() {} },
        stderr: { on() {} },
        on(event: string, handler: Function) {
          listeners[event] = handler
          if (event === 'close') {
            setTimeout(() => handler(0, null), 0)
          }
        },
      }
    }

    try {
      const handler = getRouteHandler('post', '/provision')
      const res: any = {
        writableEnded: false,
        headers: {} as Record<string, string>,
        setHeader(name: string, value: string) { this.headers[name] = value },
        writeHead() { return this },
        flushHeaders() {},
        write() {},
        end() { this.writableEnded = true },
      }
      const req: any = makeReq({
        body: {
          name: 'summary-bot',
          model: 'openai/gpt-4o-mini',
          aiDescription: 'User: make me a Korean language study agent.\nAssistant: I can help.\nUser: focus on travel, pronunciation, and beginner drills.',
          generatedFiles: {
            identity: '# IDENTITY\n\n**Name:** summary-bot\n**Role:** Korean language tutor\n**Mission:** Help beginners practice travel conversations, pronunciation, and daily drills.\n',
            soul: '# SOUL\n\nPatient, encouraging, and concise.\n',
            tools: '# TOOLS\n\n- flashcards\n',
          },
        },
        on() {},
      })
      await handler(req, res)
      await new Promise(resolve => setTimeout(resolve, 20))

      const identityPath = path.join(workspacePath, 'AGENTS', 'summary-bot', 'IDENTITY.md')
      const identity = fs.readFileSync(identityPath, 'utf-8')
      assert(identity.includes('**AI Description:** summary-bot — Korean language tutor — Help beginners practice travel conversations, pronunciation, and daily drills.'), 'Expected synthesized AI Description from generated agent content')
      assert(!identity.includes('User: make me a Korean language study agent'), 'Expected raw builder conversation not to be persisted verbatim')
    } finally {
      childProcess.spawn = originalSpawn
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('synthesizeAgentAiDescription uses only user intent from builder transcripts', async () => {
    delete require.cache[require.resolve('./agents')]
    const { synthesizeAgentAiDescription } = require('./agents')
    const synthesized = synthesizeAgentAiDescription(
      'User: make me a Korean language study agent.\nAssistant: I can help.\nUser: focus on travel, pronunciation, and beginner drills.',
      undefined
    )

    assert(Boolean(synthesized), 'Expected synthesized description')
    assert(!String(synthesized).includes('Assistant: I can help'), 'Expected assistant transcript text to be excluded')
    assert(!String(synthesized).includes('User:'), 'Expected role prefixes to be removed')
    assert(/Korean language study agent/i.test(String(synthesized)), `Unexpected synthesized description: ${synthesized}`)
    assert(/travel, pronunciation, and beginner drills/i.test(String(synthesized)), `Unexpected synthesized description: ${synthesized}`)
  })

  await test('validate-provision surfaces duplicate agent IDs from the active workspace', async () => {
    writeAgent(workspacePath, 'plain-agent', [
      '# IDENTITY.md',
      '**Name:** plain-agent',
      '**Role:** General assistant',
    ].join('\n'))

    const handler = getRouteHandler('post', '/validate-provision')
    const res = makeRes()
    await handler(makeReq({
      body: {
        name: 'plain-agent',
        model: 'openai/gpt-4o',
        tags: ['support'],
      },
    }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected validate-provision route success')
    assert.strictEqual(res.jsonBody?.valid, false, 'Expected duplicate agent id to invalidate provisioning')
    assert((res.jsonBody?.errors || []).some((error: string) => /already exists/i.test(error)), 'Expected duplicate id error guidance')
  })

  await test('validate-provision honors BYOK model discovery context for local runtimes', async () => {
    const discoveryModule = require('../lib/model-discovery')
    const originalDiscoverModels = discoveryModule.discoverModels

    try {
      discoveryModule.discoverModels = async (byokKeys: any) => {
        assert.strictEqual(byokKeys?.openaiCompatibleBaseUrl, 'http://127.0.0.1:1234/v1', 'Expected BYOK-compatible base URL to be forwarded to validation')
        return {
          models: ['openai-compatible/meta-llama-3.1-8b-instruct'],
          modelsByProvider: {
            'openai-compatible': { name: 'OpenAI-Compatible', models: ['openai-compatible/meta-llama-3.1-8b-instruct'] },
          },
        }
      }

      const handler = getRouteHandler('post', '/validate-provision')
      const res = makeRes()
      await handler(makeReq({
        body: {
          name: 'korean-agent',
          model: 'openai-compatible/meta-llama-3.1-8b-instruct',
          openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
        },
      }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected validate-provision route success')
      assert.strictEqual(res.jsonBody?.valid, true, 'Expected BYOK-compatible validation to remain valid')
      assert(!(res.jsonBody?.warnings || []).some((warning: string) => /may fall back during provisioning/i.test(warning)), 'Expected no fallback warning when BYOK discovery advertises the model')
    } finally {
      discoveryModule.discoverModels = originalDiscoverModels
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('chat messages route falls back to the newest explicit session file when the legacy dashboard mapping is missing', async () => {
    writeAgent(workspacePath, 'history-agent', [
      '# IDENTITY.md',
      '**Name:** history-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'history-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'history-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const sessionsDir = path.join(tmpHome, '.openclaw', 'agents', 'history-agent', 'sessions')
    fs.mkdirSync(sessionsDir, { recursive: true })
    fs.writeFileSync(path.join(sessionsDir, 'agent-history-agent-explicit-gpt-4o-mini.jsonl'), [
      JSON.stringify({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello there' }],
          timestamp: 1,
        },
      }),
      JSON.stringify({
        type: 'message',
        timestamp: 2,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi from explicit session history' }],
          timestamp: 2,
        },
      }),
    ].join('\n'), 'utf-8')

    const handler = getRouteHandler('get', '/:id/chat/messages')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'history-agent' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected chat history route success')
    assert.deepStrictEqual(
      res.jsonBody?.messages?.map((message: any) => message.content),
      ['Hello there', 'Hi from explicit session history'],
      'Expected chat history to load from explicit session files even without a dashboard mapping'
    )
  })

  await test('chat history reopens a native SQLite conversation using the active transcript branch, without a legacy sessions directory', async () => {
    const id = 'native-active-branch-agent'
    writeAgent(workspacePath, id, '**Name:** Native history\n**Model:** openai/gpt-4o-mini\n')
    const nativeDir = path.join(tmpHome, '.openclaw', 'agents', id, 'agent')
    fs.mkdirSync(nativeDir, { recursive: true })
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(path.join(nativeDir, 'openclaw-agent.sqlite'))
    db.exec(`
      CREATE TABLE session_nodes (session_key TEXT, current_session_id TEXT, entry_json TEXT, updated_at INTEGER);
      CREATE TABLE transcript_events (session_id TEXT, seq INTEGER, event_json TEXT, created_at INTEGER);
      CREATE TABLE session_transcript_active_events (session_id TEXT, event_seq INTEGER, active_position INTEGER);
      INSERT INTO session_nodes VALUES ('agent:${id}:dashboard-chat', 'native-window', NULL, 1);
      INSERT INTO session_transcript_active_events VALUES ('native-window', 1, 0), ('native-window', 2, 1);
    `)
    const insert = db.prepare('INSERT INTO transcript_events VALUES (?, ?, ?, ?)')
    insert.run('native-window', 1, JSON.stringify({ type: 'message', message: { role: 'user', content: 'Synthetic question', timestamp: 1 } }), 1)
    insert.run('native-window', 2, JSON.stringify({ type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'Synthetic answer' }], timestamp: 2 } }), 2)
    // A rewound turn: present in transcript_events but not in the active branch, so it must never
    // surface in the merged view.
    insert.run('native-window', 5, JSON.stringify({ type: 'message', message: { role: 'assistant', content: 'Rewound turn that must not appear', timestamp: 5 } }), 5)
    db.close()
    const handler = getRouteHandler('get', '/:id/chat/messages')
    for (let reopen = 0; reopen < 2; reopen++) {
      const res = makeRes()
      await handler(makeReq({ params: { id } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.jsonBody.messages.map((message: any) => message.content), ['Synthetic question', 'Synthetic answer'])
    }
    assert(!fs.existsSync(path.join(nativeDir, '..', 'sessions')), 'History read must not create legacy state')
  })


  await test('chat messages route reads from the OpenClaw 2 native session store when no legacy jsonl exists', async () => {
    writeAgent(workspacePath, 'native-agent', [
      '# IDENTITY.md',
      '**Name:** native-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'native-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'native-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    // Use the real seed the live chat route (routes/chat.ts POST /:id/chat) actually passes
    // OpenClaw as --session-id — a live install recorded this exact shape (session_key
    // "agent:<id>:dashboard-chat" mapped to a "dashboard-<id>-<mtime36>-chat"-derived id, NOT the
    // "agent:<id>:dashboard-chat" string scoped directly) — not the idealized semantic key alone.
    const { buildDashboardChatSeed, scopeSessionIdToModel } = require('../lib/agent-execution')
    const agentWorkspaceDir = path.join(workspacePath, 'AGENTS', 'native-agent')
    const sessionId = scopeSessionIdToModel(buildDashboardChatSeed('native-agent', agentWorkspaceDir), 'openai/gpt-4o-mini')
    // A second, unrelated native session recorded more recently (e.g. a scheduled workflow ping
    // to the same agent) proves resolution picks the session matching the real seed, not merely
    // "whichever native session is newest" — a naive newest-only reader would return this instead.
    writeNativeAgentStore(tmpHome, 'native-agent', {
      sessions: [
        { sessionKey: 'agent:native-agent:dashboard-chat', sessionId, updatedAt: 1000 },
        { sessionKey: 'agent:native-agent:workflow-run', sessionId: 'unrelated-newer-session', updatedAt: 9000 },
      ],
      transcripts: {
        [sessionId]: [
          JSON.stringify({ type: 'message', timestamp: 1, message: { role: 'user', content: [{ type: 'text', text: 'Hello from native store' }], timestamp: 1 } }),
          JSON.stringify({ type: 'message', timestamp: 2, message: { role: 'assistant', content: [{ type: 'text', text: 'Hi, native reply' }], timestamp: 2 } }),
        ],
        'unrelated-newer-session': [
          JSON.stringify({ type: 'message', timestamp: 3, message: { role: 'user', content: [{ type: 'text', text: 'Unrelated workflow content that must not win' }], timestamp: 3 } }),
        ],
      },
    })

    // No sessions.json and no sessions dir at all for this agent — matches a freshly created
    // OpenClaw 2 agent, which never writes either.
    assert.strictEqual(fs.existsSync(path.join(tmpHome, '.openclaw', 'agents', 'native-agent', 'sessions')), false, 'Expected no legacy sessions dir to exist yet')

    const handler = getRouteHandler('get', '/:id/chat/messages')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'native-agent' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected chat history route success')
    assert.deepStrictEqual(
      res.jsonBody?.messages?.map((message: any) => message.content),
      ['Hello from native store', 'Hi, native reply'],
      'Expected chat history to load from the dashboard-chat native session, not the more recently updated unrelated one'
    )
  })

  await test('chat messages route prefers the legacy jsonl transcript over the native store, then falls back to it once the jsonl is gone', async () => {
    writeAgent(workspacePath, 'legacy-wins-agent', [
      '# IDENTITY.md',
      '**Name:** legacy-wins-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'legacy-wins-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'legacy-wins-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    // Use the real seed the live chat route (routes/chat.ts) actually passes OpenClaw as
    // --session-id — not the semantic key alone (see buildDashboardChatSeed) — so this fixture
    // exercises the same session-id resolution production traffic does.
    const { buildDashboardChatSeed, scopeSessionIdToModel } = require('../lib/agent-execution')
    const agentWorkspaceDir = path.join(workspacePath, 'AGENTS', 'legacy-wins-agent')
    const sessionId = scopeSessionIdToModel(buildDashboardChatSeed('legacy-wins-agent', agentWorkspaceDir), 'openai/gpt-4o-mini')

    const sessionsDir = path.join(tmpHome, '.openclaw', 'agents', 'legacy-wins-agent', 'sessions')
    fs.mkdirSync(sessionsDir, { recursive: true })
    const jsonlPath = path.join(sessionsDir, `${sessionId}.jsonl`)
    fs.writeFileSync(jsonlPath, [
      JSON.stringify({ type: 'message', timestamp: 1, message: { role: 'user', content: [{ type: 'text', text: 'Legacy jsonl content' }], timestamp: 1 } }),
    ].join('\n'), 'utf-8')

    writeNativeAgentStore(tmpHome, 'legacy-wins-agent', {
      sessions: [{ sessionKey: 'agent:legacy-wins-agent:dashboard-chat', sessionId }],
      transcripts: {
        [sessionId]: [
          JSON.stringify({ type: 'message', timestamp: 1, message: { role: 'user', content: [{ type: 'text', text: 'Native store content that must not win' }], timestamp: 1 } }),
        ],
      },
    })

    const handler = getRouteHandler('get', '/:id/chat/messages')
    const withBothRes = makeRes()
    await handler(makeReq({ params: { id: 'legacy-wins-agent' } }), withBothRes)

    assert.strictEqual(withBothRes.statusCode, 200, 'Expected chat history route success')
    assert.deepStrictEqual(
      withBothRes.jsonBody?.messages?.map((message: any) => message.content),
      ['Legacy jsonl content'],
      'Expected the legacy jsonl transcript to win over the native store when both exist'
    )

    // Prove this isn't passing merely because the native store is never consulted (which the
    // pre-fix route would also do, vacuously "preferring" jsonl): with the jsonl gone, the SAME
    // route must now surface the native content instead of going empty.
    fs.unlinkSync(jsonlPath)
    const nativeOnlyRes = makeRes()
    await handler(makeReq({ params: { id: 'legacy-wins-agent' } }), nativeOnlyRes)
    assert.strictEqual(nativeOnlyRes.statusCode, 200, 'Expected chat history route success once the jsonl is removed')
    assert.deepStrictEqual(
      nativeOnlyRes.jsonBody?.messages?.map((message: any) => message.content),
      ['Native store content that must not win'],
      'Expected the native store to be read once the legacy jsonl no longer exists'
    )
  })

  await test('clearing a native-only chat archives the transcript, empties the current view via a watermark, leaves SQLite untouched, and a later turn reappears', async () => {
    writeAgent(workspacePath, 'native-clear-agent', [
      '# IDENTITY.md',
      '**Name:** native-clear-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'native-clear-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'native-clear-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const { buildDashboardChatSeed, scopeSessionIdToModel } = require('../lib/agent-execution')
    const agentWorkspaceDir = path.join(workspacePath, 'AGENTS', 'native-clear-agent')
    const sessionId = scopeSessionIdToModel(buildDashboardChatSeed('native-clear-agent', agentWorkspaceDir), 'openai/gpt-4o-mini')
    writeNativeAgentStore(tmpHome, 'native-clear-agent', {
      sessions: [{ sessionKey: 'agent:native-clear-agent:dashboard-chat', sessionId }],
      transcripts: {
        [sessionId]: [
          JSON.stringify({ type: 'message', timestamp: 1, message: { role: 'user', content: [{ type: 'text', text: 'Native clear test' }], timestamp: 1 } }),
          JSON.stringify({ type: 'message', timestamp: 2, message: { role: 'assistant', content: [{ type: 'text', text: 'Native clear reply' }], timestamp: 2 } }),
        ],
      },
    })

    const dbPath = path.join(tmpHome, '.openclaw', 'agents', 'native-clear-agent', 'agent', 'openclaw-agent.sqlite')
    const dbContentBeforeClear = fs.readFileSync(dbPath)

    const clearHandler = getRouteHandler('delete', '/:id/chat/messages')
    const clearRes = makeRes()
    await clearHandler(makeReq({ params: { id: 'native-clear-agent' } }), clearRes)
    assert.strictEqual(clearRes.jsonBody?.archived, true, 'Expected the native-only chat to be archived')

    const archiveDir = path.join(tmpHome, '.openclaw', 'agents', 'native-clear-agent', 'sessions', 'archive')
    assert(fs.existsSync(archiveDir), 'Expected archive dir to be created')
    const archiveFiles = fs.readdirSync(archiveDir).filter((name) => name.endsWith('.jsonl'))
    assert.strictEqual(archiveFiles.length, 1, 'Expected exactly one archived file')
    const archivedLines = fs.readFileSync(path.join(archiveDir, archiveFiles[0]), 'utf-8').trim().split('\n').map((line) => JSON.parse(line))
    assert.strictEqual(archivedLines.length, 2, 'Expected both native turns to be archived')

    assert(
      !fs.existsSync(path.join(tmpHome, '.openclaw', 'agents', 'native-clear-agent', 'sessions', 'sessions.json')),
      'Expected Clear never to create a legacy sessions.json for a native-store agent: OpenClaw 2 refuses to start its gateway when it finds one'
    )
    assert(fs.existsSync(dbPath), 'Expected native SQLite store to remain on disk after Clear')
    assert(Buffer.compare(fs.readFileSync(dbPath), dbContentBeforeClear) === 0, 'Expected Clear never to modify the native SQLite store — the runtime owns it')

    // Clear owns a dashboard-side watermark (server/lib/openclaw-native-transcripts.ts) instead —
    // it can't delete the runtime's rows, but it can make the dashboard stop showing them. The
    // current conversation must now read as empty, and the history list must show no active entry.
    const messagesHandler = getRouteHandler('get', '/:id/chat/messages')
    const clearedMessagesRes = makeRes()
    await messagesHandler(makeReq({ params: { id: 'native-clear-agent' } }), clearedMessagesRes)
    assert.deepStrictEqual(clearedMessagesRes.jsonBody?.messages, [], 'Expected the current conversation to read as empty right after Clear')

    const listHandler = getRouteHandler('get', '/:id/chat/archives')
    const listRes = makeRes()
    await listHandler(makeReq({ params: { id: 'native-clear-agent' } }), listRes)
    assert.strictEqual(listRes.statusCode, 200, 'Expected archive list route success')
    assert.strictEqual(listRes.jsonBody?.archives?.some((entry: any) => entry.active), false, 'Expected no active/current entry right after Clear')
    const archivedEntry = listRes.jsonBody?.archives?.find((entry: any) => !entry.active)
    assert(archivedEntry, 'Expected the archived native chat to appear in the history list')
    assert.strictEqual(archivedEntry.messageCount, 2, 'Expected the archived native chat message count to include both turns')

    // A later turn on the same session (the runtime appending a higher-seq row, exactly as it
    // would on the next real chat message) must reappear as the current conversation — proving
    // the watermark filters by position, not by hiding the session outright.
    const { DatabaseSync } = require('node:sqlite')
    const liveDb = new DatabaseSync(dbPath)
    liveDb.prepare('INSERT INTO transcript_events (session_id, seq, event_json, created_at) VALUES (?, ?, ?, ?)').run(
      sessionId,
      2,
      JSON.stringify({ type: 'message', timestamp: 3, message: { role: 'user', content: [{ type: 'text', text: 'Turn after Clear' }], timestamp: 3 } }),
      Date.now()
    )
    liveDb.close()

    const afterNewTurnRes = makeRes()
    await messagesHandler(makeReq({ params: { id: 'native-clear-agent' } }), afterNewTurnRes)
    assert.deepStrictEqual(
      afterNewTurnRes.jsonBody?.messages?.map((message: any) => message.content),
      ['Turn after Clear'],
      'Expected a turn added after Clear to reappear as the current conversation, without the archived turns'
    )
  })

  await test('clearing a native-only chat is safe to retry after a crash between archiving and marking the watermark', async () => {
    writeAgent(workspacePath, 'native-clear-retry-agent', [
      '# IDENTITY.md',
      '**Name:** native-clear-retry-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'native-clear-retry-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'native-clear-retry-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const { buildDashboardChatSeed, scopeSessionIdToModel } = require('../lib/agent-execution')
    const agentWorkspaceDir = path.join(workspacePath, 'AGENTS', 'native-clear-retry-agent')
    const sessionId = scopeSessionIdToModel(buildDashboardChatSeed('native-clear-retry-agent', agentWorkspaceDir), 'openai/gpt-4o-mini')
    const turnOne = JSON.stringify({ type: 'message', timestamp: 1, message: { role: 'user', content: [{ type: 'text', text: 'Retry test turn' }], timestamp: 1 } })
    const turnTwo = JSON.stringify({ type: 'message', timestamp: 2, message: { role: 'assistant', content: [{ type: 'text', text: 'Retry test reply' }], timestamp: 2 } })
    writeNativeAgentStore(tmpHome, 'native-clear-retry-agent', {
      sessions: [{ sessionKey: 'agent:native-clear-retry-agent:dashboard-chat', sessionId }],
      transcripts: { [sessionId]: [turnOne, turnTwo] },
    })

    // Simulate a process crash that completed the archive write but never reached
    // markNativeTranscriptCleared: pre-create the exact archive file a first Clear attempt would
    // have produced, while the native store is still unwatermarked (still reads as live).
    const archiveDir = path.join(tmpHome, '.openclaw', 'agents', 'native-clear-retry-agent', 'sessions', 'archive')
    fs.mkdirSync(archiveDir, { recursive: true })
    fs.writeFileSync(path.join(archiveDir, `${sessionId}_2026-01-01_1735689600000.jsonl`), `${turnOne}\n${turnTwo}\n`)
    assert(hasNativeTranscript('native-clear-retry-agent', sessionId, tmpHome), 'Expected the transcript to still read as live before the retried Clear — the crash never reached the watermark')

    const clearHandler = getRouteHandler('delete', '/:id/chat/messages')
    const clearRes = makeRes()
    await clearHandler(makeReq({ params: { id: 'native-clear-retry-agent' } }), clearRes)
    assert.strictEqual(clearRes.jsonBody?.archived, true, 'Expected the retried Clear to report the chat as archived')

    const archiveFilesAfterRetry = fs.readdirSync(archiveDir).filter((name) => name.endsWith('.jsonl'))
    assert.strictEqual(archiveFilesAfterRetry.length, 1, `Expected the pre-existing archive not to be duplicated, got ${archiveFilesAfterRetry.length} files`)

    assert(!hasNativeTranscript('native-clear-retry-agent', sessionId, tmpHome), 'Expected the retried Clear to finish the interrupted step and finally mark the transcript cleared')

    const messagesHandler = getRouteHandler('get', '/:id/chat/messages')
    const messagesRes = makeRes()
    await messagesHandler(makeReq({ params: { id: 'native-clear-retry-agent' } }), messagesRes)
    assert.deepStrictEqual(messagesRes.jsonBody?.messages, [], 'Expected the current conversation to read as empty after the retry completes')
  })

  await test('after Clear, the newest-native-session fallback does not present an unrelated, more recently touched native session as the current conversation', async () => {
    writeAgent(workspacePath, 'native-clear-fallback-agent', [
      '# IDENTITY.md',
      '**Name:** native-clear-fallback-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'native-clear-fallback-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'native-clear-fallback-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const { buildDashboardChatSeed, scopeSessionIdToModel } = require('../lib/agent-execution')
    const agentWorkspaceDir = path.join(workspacePath, 'AGENTS', 'native-clear-fallback-agent')
    const seedSessionId = scopeSessionIdToModel(buildDashboardChatSeed('native-clear-fallback-agent', agentWorkspaceDir), 'openai/gpt-4o-mini')
    // A second native session recorded under a completely different key (e.g. a scheduled
    // workflow ping, or a session left behind by an earlier model switch) that happens to be
    // touched more recently than this agent's own dashboard-chat session.
    const unrelatedSessionId = 'unrelated-post-clear-session'

    writeNativeAgentStore(tmpHome, 'native-clear-fallback-agent', {
      sessions: [
        { sessionKey: 'agent:native-clear-fallback-agent:dashboard-chat', sessionId: seedSessionId, updatedAt: 1000 },
        { sessionKey: 'agent:native-clear-fallback-agent:workflow-run', sessionId: unrelatedSessionId, updatedAt: 9000 },
      ],
      transcripts: {
        [seedSessionId]: [
          JSON.stringify({ type: 'message', timestamp: 1, message: { role: 'user', content: [{ type: 'text', text: 'My own conversation' }], timestamp: 1 } }),
          JSON.stringify({ type: 'message', timestamp: 2, message: { role: 'assistant', content: [{ type: 'text', text: 'My own conversation reply' }], timestamp: 2 } }),
        ],
        [unrelatedSessionId]: [
          JSON.stringify({ type: 'message', timestamp: 3, message: { role: 'user', content: [{ type: 'text', text: 'Unrelated session content' }], timestamp: 3 } }),
          JSON.stringify({ type: 'message', timestamp: 4, message: { role: 'assistant', content: [{ type: 'text', text: 'Unrelated session reply' }], timestamp: 4 } }),
        ],
      },
    })

    const messagesHandler = getRouteHandler('get', '/:id/chat/messages')
    const beforeClearRes = makeRes()
    await messagesHandler(makeReq({ params: { id: 'native-clear-fallback-agent' } }), beforeClearRes)
    assert.deepStrictEqual(
      beforeClearRes.jsonBody?.messages?.map((message: any) => message.content),
      ['My own conversation', 'My own conversation reply'],
      'Expected the seeded dashboard-chat session to be current before Clear, not the more recently touched unrelated one'
    )

    const clearHandler = getRouteHandler('delete', '/:id/chat/messages')
    const clearRes = makeRes()
    await clearHandler(makeReq({ params: { id: 'native-clear-fallback-agent' } }), clearRes)
    assert.strictEqual(clearRes.jsonBody?.archived, true, 'Expected the seeded session to be archived by Clear')

    // The bug: resolvePersistedAgentSessionId's newest-native-session fallback isn't
    // watermark-aware, so once the seed session reads as empty it would fall through to "the
    // newest native session for this agent, whatever its key" and hand back the unrelated
    // session's own messages here instead of an empty conversation.
    const afterClearRes = makeRes()
    await messagesHandler(makeReq({ params: { id: 'native-clear-fallback-agent' } }), afterClearRes)
    assert.deepStrictEqual(afterClearRes.jsonBody?.messages, [], 'Expected the current conversation to read as empty right after Clear, not the unrelated session\'s messages')

    const listHandler = getRouteHandler('get', '/:id/chat/archives')
    const listRes = makeRes()
    await listHandler(makeReq({ params: { id: 'native-clear-fallback-agent' } }), listRes)
    const archives = listRes.jsonBody?.archives || []
    assert.strictEqual(archives.some((entry: any) => entry.active), false, 'Expected no active/current entry right after Clear — the unrelated session must not be named as current')

    const unrelatedEntry = archives.find((entry: any) => entry.filename === `native:${unrelatedSessionId}`)
    assert(unrelatedEntry, 'Expected the unrelated native session to still be visible as ordinary history, just not as the current conversation')
    assert.strictEqual(unrelatedEntry.messageCount, 2, 'Expected the unrelated session\'s own messages to be intact')
  })

  await test('an agent re-pinned to a non-openclaw runtime with no runtime transcript yet never resolves to a session left behind in the old openclaw store', async () => {
    writeAgent(workspacePath, 're-pinned-agent', [
      '# IDENTITY.md',
      '**Name:** re-pinned-agent',
      '**Runtime:** droid',
    ].join('\n'))
    fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(workspacePath, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: ['droid'] }), 'utf-8')

    // The agent used to run on openclaw; its native store still holds a session recorded under an
    // unrelated key (e.g. a scheduled workflow run) that the re-pin to droid never touched or
    // cleared. With no droid transcript yet (a fresh re-pin, nothing sent under the new runtime),
    // resolveAgentChatSessionId falls back to the openclaw-side resolver — which must not offer up
    // that leftover session just because it is the only (or newest) thing in the store.
    writeNativeAgentStore(tmpHome, 're-pinned-agent', {
      sessions: [{ sessionKey: 'agent:re-pinned-agent:workflow-run', sessionId: 'leftover-workflow-session', updatedAt: 9000 }],
      transcripts: {
        'leftover-workflow-session': [
          JSON.stringify({ type: 'message', timestamp: 1, message: { role: 'user', content: [{ type: 'text', text: 'Unrelated workflow content' }], timestamp: 1 } }),
        ],
      },
    })

    const messagesHandler = getRouteHandler('get', '/:id/chat/messages')
    const res = makeRes()
    await messagesHandler(makeReq({ params: { id: 're-pinned-agent' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected the chat messages route to succeed for a re-pinned agent with no runtime transcript yet')
    assert.deepStrictEqual(res.jsonBody?.messages, [], 'Expected an empty conversation, not the leftover workflow session from before the re-pin')
  })

  await test('chat archives route lists older native sessions from session_nodes as read-only history entries', async () => {
    writeAgent(workspacePath, 'native-history-agent', [
      '# IDENTITY.md',
      '**Name:** native-history-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'native-history-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'native-history-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const { scopeSessionIdToModel } = require('../lib/agent-execution')
    const activeSessionId = scopeSessionIdToModel('agent:native-history-agent:dashboard-chat', 'openai/gpt-4o-mini')
    // A session recorded under a completely different key — e.g. a session started before a model
    // switch re-scoped the dashboard-chat key, or a CLI run — with no file-based archive covering
    // it at all, since Clear can never delete rows from this database (see readChatSessionMessages).
    const oldSessionId = 'old-native-session-1'

    writeNativeAgentStore(tmpHome, 'native-history-agent', {
      sessions: [
        { sessionKey: 'agent:native-history-agent:dashboard-chat', sessionId: activeSessionId, updatedAt: 2000 },
        { sessionKey: 'agent:native-history-agent:dashboard-chat:explicit:old', sessionId: oldSessionId, updatedAt: 1000 },
      ],
      transcripts: {
        [activeSessionId]: [
          JSON.stringify({ type: 'message', timestamp: 3, message: { role: 'user', content: [{ type: 'text', text: 'Current native turn' }], timestamp: 3 } }),
        ],
        [oldSessionId]: [
          JSON.stringify({ type: 'message', timestamp: 1, message: { role: 'user', content: [{ type: 'text', text: 'Old native turn one' }], timestamp: 1 } }),
          JSON.stringify({ type: 'message', timestamp: 2, message: { role: 'assistant', content: [{ type: 'text', text: 'Old native turn two' }], timestamp: 2 } }),
        ],
      },
    })

    const listHandler = getRouteHandler('get', '/:id/chat/archives')
    const listRes = makeRes()
    await listHandler(makeReq({ params: { id: 'native-history-agent' } }), listRes)

    assert.strictEqual(listRes.statusCode, 200, 'Expected chat archives route success')
    const archives = listRes.jsonBody?.archives || []
    const activeEntry = archives.find((entry: any) => entry.active)
    assert(activeEntry, 'Expected the active native session to appear as the current entry')
    assert.strictEqual(activeEntry.filename, `current:${activeSessionId}`)

    const nativeHistoryEntry = archives.find((entry: any) => entry.filename === `native:${oldSessionId}`)
    assert(nativeHistoryEntry, 'Expected the older native session to appear as a history entry')
    assert.strictEqual(nativeHistoryEntry.active, false, 'Expected the older native session not to be marked active')
    assert.strictEqual(nativeHistoryEntry.removable, false, 'Expected a native session entry to be marked non-removable — the dashboard never writes to that SQLite store')
    assert.strictEqual(nativeHistoryEntry.messageCount, 2, 'Expected both turns of the older native session to be counted')

    const detailHandler = getRouteHandler('get', '/:id/chat/archives/:filename')
    const detailRes = makeRes()
    await detailHandler(makeReq({ params: { id: 'native-history-agent', filename: `native:${oldSessionId}` } }), detailRes)
    assert.strictEqual(detailRes.statusCode, 200, 'Expected native history detail route success')
    assert.deepStrictEqual(
      detailRes.jsonBody?.messages?.map((message: any) => message.content),
      ['Old native turn one', 'Old native turn two'],
      'Expected the native history detail route to return that session\'s own transcript'
    )
  })

  await test('chat archive restore and delete routes reject native-session filenames — the dashboard never writes to that store', async () => {
    const restoreHandler = getRouteHandler('post', '/:id/chat/archives/:filename/restore')
    let res = makeRes()
    await restoreHandler(makeReq({
      params: { id: 'native-history-agent', filename: 'native:old-native-session-1' },
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected native session restore to return HTTP 400')

    const deleteHandler = getRouteHandler('delete', '/:id/chat/archives/:filename')
    res = makeRes()
    await deleteHandler(makeReq({
      params: { id: 'native-history-agent', filename: 'native:old-native-session-1' },
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected native session delete to return HTTP 400')
  })

  await test('chat archives route includes the current explicit conversation when no archived sessions exist yet', async () => {
    writeAgent(workspacePath, 'current-history-agent', [
      '# IDENTITY.md',
      '**Name:** current-history-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'current-history-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'current-history-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const sessionsDir = path.join(tmpHome, '.openclaw', 'agents', 'current-history-agent', 'sessions')
    fs.mkdirSync(sessionsDir, { recursive: true })
    fs.writeFileSync(path.join(sessionsDir, 'agent-current-history-explicit-gpt-4o-mini.jsonl'), [
      JSON.stringify({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Need help with the current thread' }],
          timestamp: 1,
        },
      }),
    ].join('\n'), 'utf-8')

    const listHandler = getRouteHandler('get', '/:id/chat/archives')
    const listRes = makeRes()
    await listHandler(makeReq({ params: { id: 'current-history-agent' } }), listRes)

    assert.strictEqual(listRes.statusCode, 200, 'Expected chat archives route success')
    assert.strictEqual(listRes.jsonBody?.archives?.[0]?.active, true, 'Expected current conversation to appear as a history entry')
    assert.strictEqual(listRes.jsonBody?.archives?.[0]?.title, 'Current conversation', 'Expected current conversation title')

    const detailHandler = getRouteHandler('get', '/:id/chat/archives/:filename')
    const detailRes = makeRes()
    await detailHandler(makeReq({
      params: {
        id: 'current-history-agent',
        filename: listRes.jsonBody.archives[0].filename,
      },
    }), detailRes)

    assert.strictEqual(detailRes.statusCode, 200, 'Expected current conversation history detail route success')
    assert.strictEqual(detailRes.jsonBody?.messages?.[0]?.content, 'Need help with the current thread')
  })

  await test('clearing a mixed openclaw+runtime chat archives both stores in timestamp order (droid P1 regression)', async () => {
    const { scopeSessionIdToModel } = require('../lib/agent-execution')
    writeAgent(workspacePath, 'mixed-agent', [
      '# IDENTITY.md',
      '- **Name:** Mixed Agent',
      '- **Model:** anthropic/claude-sonnet-4-20250514',
    ].join('\n'))

    // Same scoped session id the route resolves for the dashboard chat key.
    const sid = scopeSessionIdToModel('agent:mixed-agent:dashboard-chat', 'anthropic/claude-sonnet-4-20250514')

    // OpenClaw session file: an early turn (ts=1), an EMPTY-content turn (must survive archiving),
    // and a late turn. The empty row carries a top-level timestamp (100) that DISAGREES with its
    // message.timestamp (2.5): the archive must order by message.timestamp — matching the read
    // path's `msg.timestamp || entry.timestamp` — so it lands at 2.5 (between the runtime turn and
    // the late turn), not at 100 (last).
    const sessionsDir = path.join(tmpHome, '.openclaw', 'agents', 'mixed-agent', 'sessions')
    fs.mkdirSync(sessionsDir, { recursive: true })
    fs.writeFileSync(path.join(sessionsDir, `${sid}.jsonl`), [
      JSON.stringify({ type: 'message', timestamp: 1, message: { role: 'user', content: [{ type: 'text', text: 'openclaw-early' }], timestamp: 1 } }),
      JSON.stringify({ type: 'message', timestamp: 100, message: { role: 'assistant', content: [], timestamp: 2.5 } }),
      JSON.stringify({ type: 'message', timestamp: 4, message: { role: 'assistant', content: [{ type: 'text', text: 'openclaw-late' }], timestamp: 4 } }),
    ].join('\n'), 'utf-8')

    // Runtime transcript for the SAME session: a turn that happened between them (ts=2).
    const transcriptDir = path.join(workspacePath, 'SYSTEM', 'runtime-transcripts', 'mixed-agent')
    fs.mkdirSync(transcriptDir, { recursive: true })
    fs.writeFileSync(path.join(transcriptDir, `${sid}.jsonl`),
      JSON.stringify({ role: 'user', content: 'runtime-middle', ts: 2 }) + '\n', 'utf-8')

    const clearHandler = getRouteHandler('delete', '/:id/chat/messages')
    const clearRes = makeRes()
    await clearHandler(makeReq({ params: { id: 'mixed-agent' } }), clearRes)
    assert.strictEqual(clearRes.jsonBody?.archived, true, 'Expected the mixed chat to be archived, not deleted')

    const archiveDir = path.join(sessionsDir, 'archive')
    const archiveFile = fs.readdirSync(archiveDir).find((name) => name.startsWith(sid))
    assert.ok(archiveFile, 'Expected an archive file to be written')
    const archivedLines = fs.readFileSync(path.join(archiveDir, archiveFile!), 'utf-8').trim().split('\n').map((line) => JSON.parse(line))
    // The empty OpenClaw row must be preserved verbatim (droid P1: parsing openclaw through the
    // visible-message filter would have dropped it), so all 4 rows survive in timestamp order.
    assert.strictEqual(archivedLines.length, 4, 'Expected all 4 rows (incl. the empty openclaw turn) to be archived')
    const textOf = (msg: any) => Array.isArray(msg.content)
      ? msg.content.map((c: any) => c?.text || '').join('')
      : String(msg.content ?? '')
    assert.deepStrictEqual(archivedLines.map((l) => textOf(l.message)), ['openclaw-early', 'runtime-middle', '', 'openclaw-late'],
      'Expected interleaved chronological order across both stores with the empty openclaw turn intact')
  })

  await test('chat archives route ignores trajectory rows, parses prefixed timestamps, and avoids noisy titles', async () => {
    writeAgent(workspacePath, 'archive-agent', [
      '# IDENTITY.md',
      '**Name:** archive-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'archive-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'archive-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const archiveDir = path.join(tmpHome, '.openclaw', 'agents', 'archive-agent', 'sessions', 'archive')
    fs.mkdirSync(archiveDir, { recursive: true })

    fs.writeFileSync(path.join(archiveDir, '1781888896343-agent-archive-agent-dashboard-chat--abcd1234.jsonl'), [
      JSON.stringify({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Conversation context for this single-turn execution:' }],
          timestamp: 1,
        },
      }),
      JSON.stringify({
        type: 'message',
        timestamp: 2,
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Please summarize the repo history' }],
          timestamp: 2,
        },
      }),
    ].join('\n'), 'utf-8')

    fs.writeFileSync(path.join(archiveDir, '1781888896343-agent-archive-agent-dashboard-chat--abcd1234.trajectory.jsonl'), [
      JSON.stringify({ type: 'step', value: 'ignored' }),
    ].join('\n'), 'utf-8')

    const listHandler = getRouteHandler('get', '/:id/chat/archives')
    const listRes = makeRes()
    await listHandler(makeReq({ params: { id: 'archive-agent' } }), listRes)

    assert.strictEqual(listRes.statusCode, 200, 'Expected archive list success')
    assert.strictEqual(listRes.jsonBody?.archives?.length, 1, 'Expected trajectory artifacts to be excluded from archive list')
    assert.strictEqual(listRes.jsonBody?.archives?.[0]?.timestamp, 1781888896343, 'Expected prefixed archive timestamps to be parsed correctly')
    assert(!String(listRes.jsonBody?.archives?.[0]?.title || '').includes('Conversation context for this single-turn execution'), 'Expected noisy injected context not to become the archive title')
  })

  await test('chat archives route ignores runtime-only archive files with no visible chat messages', async () => {
    writeAgent(workspacePath, 'runtime-only-archive-agent', [
      '# IDENTITY.md',
      '**Name:** runtime-only-archive-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'runtime-only-archive-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'runtime-only-archive-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const archiveDir = path.join(tmpHome, '.openclaw', 'agents', 'runtime-only-archive-agent', 'sessions', 'archive')
    fs.mkdirSync(archiveDir, { recursive: true })

    fs.writeFileSync(path.join(archiveDir, '1781888896343-agent-runtime-only-archive-agent-dashboard-chat--runtime.jsonl'), [
      JSON.stringify({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'system',
          content: [{ type: 'text', text: 'Conversation context for this single-turn execution:' }],
          timestamp: 1,
        },
      }),
    ].join('\n'), 'utf-8')

    const listHandler = getRouteHandler('get', '/:id/chat/archives')
    const listRes = makeRes()
    await listHandler(makeReq({ params: { id: 'runtime-only-archive-agent' } }), listRes)

    assert.strictEqual(listRes.statusCode, 200, 'Expected archive list success')
    assert.strictEqual(listRes.jsonBody?.archives?.length, 0, 'Expected runtime-only archive files to be excluded from the list')
  })

  await test('chat archives route regenerates stale noisy cached titles instead of reusing them', async () => {
    writeAgent(workspacePath, 'cached-title-archive-agent', [
      '# IDENTITY.md',
      '**Name:** cached-title-archive-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'cached-title-archive-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'cached-title-archive-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const archiveDir = path.join(tmpHome, '.openclaw', 'agents', 'cached-title-archive-agent', 'sessions', 'archive')
    fs.mkdirSync(archiveDir, { recursive: true })

    const archiveFilename = '1781888896343-agent-cached-title-archive-agent-dashboard-chat--cached.jsonl'
    fs.writeFileSync(path.join(archiveDir, archiveFilename), [
      JSON.stringify({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Conversation context for this single-turn execution:' }],
          timestamp: 1,
        },
      }),
      JSON.stringify({
        type: 'message',
        timestamp: 2,
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Please continue the deployment checklist' }],
          timestamp: 2,
        },
      }),
    ].join('\n'), 'utf-8')

    fs.writeFileSync(path.join(archiveDir, '.titles.json'), JSON.stringify({
      [archiveFilename]: 'Conversation context for this single-turn execution:',
    }, null, 2))

    const listHandler = getRouteHandler('get', '/:id/chat/archives')
    const listRes = makeRes()
    await listHandler(makeReq({ params: { id: 'cached-title-archive-agent' } }), listRes)

    assert.strictEqual(listRes.statusCode, 200, 'Expected archive list success')
    assert.strictEqual(listRes.jsonBody?.archives?.length, 1, 'Expected archive entry to remain visible')
    assert.equal(String(listRes.jsonBody?.archives?.[0]?.title || '').includes('Conversation context for this single-turn execution'), false, 'Expected stale cached runtime title to be replaced')
  })

  await test('chat archives route falls back to file metadata when legacy archive filenames contain invalid timestamps', async () => {
    writeAgent(workspacePath, 'bad-timestamp-archive-agent', [
      '# IDENTITY.md',
      '**Name:** bad-timestamp-archive-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'bad-timestamp-archive-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'bad-timestamp-archive-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const archiveDir = path.join(tmpHome, '.openclaw', 'agents', 'bad-timestamp-archive-agent', 'sessions', 'archive')
    fs.mkdirSync(archiveDir, { recursive: true })

    const archivePath = path.join(archiveDir, '0-agent-bad-timestamp-archive-agent-dashboard-chat--legacy.jsonl')
    fs.writeFileSync(archivePath, [
      JSON.stringify({
        type: 'message',
        timestamp: 2,
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Reopen the deployment conversation' }],
          timestamp: 2,
        },
      }),
    ].join('\n'), 'utf-8')

    const expectedTimestamp = fs.statSync(archivePath).mtimeMs

    const listHandler = getRouteHandler('get', '/:id/chat/archives')
    const listRes = makeRes()
    await listHandler(makeReq({ params: { id: 'bad-timestamp-archive-agent' } }), listRes)

    assert.strictEqual(listRes.statusCode, 200, 'Expected archive list success')
    assert.strictEqual(listRes.jsonBody?.archives?.length, 1, 'Expected archive entry to remain visible')
    assert(listRes.jsonBody?.archives?.[0]?.timestamp >= expectedTimestamp, 'Expected invalid legacy timestamp to fall back to file metadata')
    assert.notStrictEqual(listRes.jsonBody?.archives?.[0]?.timestamp, 0, 'Expected invalid legacy timestamp not to surface as zero')
  })

  await test('chat archive restore route reactivates an archived conversation as the current chat', async () => {
    writeAgent(workspacePath, 'restore-agent', [
      '# IDENTITY.md',
      '**Name:** restore-agent',
      '**Model:** openai/gpt-4o-mini',
      '**Role:** Test assistant',
    ].join('\n'))

    const configPath = path.join(tmpHome, '.openclaw', 'openclaw.json')
    fs.writeFileSync(configPath, JSON.stringify({
      agents: {
        list: [{
          id: 'restore-agent',
          workspace: path.join(workspacePath, 'AGENTS', 'restore-agent'),
          model: 'openai/gpt-4o-mini',
        }],
      },
    }, null, 2))

    const sessionsDir = path.join(tmpHome, '.openclaw', 'agents', 'restore-agent', 'sessions')
    const archiveDir = path.join(sessionsDir, 'archive')
    fs.mkdirSync(archiveDir, { recursive: true })

    const archiveFilename = '1781888896343-agent-restore-agent-dashboard-chat--abcd1234.jsonl'
    fs.writeFileSync(path.join(archiveDir, archiveFilename), [
      JSON.stringify({
        type: 'message',
        timestamp: 1,
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Continue my previous work' }],
          timestamp: 1,
        },
      }),
      JSON.stringify({
        type: 'message',
        timestamp: 2,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Restored conversation reply' }],
          timestamp: 2,
        },
      }),
    ].join('\n'), 'utf-8')

    const restoreHandler = getRouteHandler('post', '/:id/chat/archives/:filename/restore')
    const restoreRes = makeRes()
    await restoreHandler(makeReq({
      params: {
        id: 'restore-agent',
        filename: archiveFilename,
      },
    }), restoreRes)

    assert.strictEqual(restoreRes.statusCode, 200, 'Expected archive restore success')
    assert.strictEqual(restoreRes.jsonBody?.messages?.[0]?.content, 'Continue my previous work', 'Expected restored messages to be returned')

    const historyHandler = getRouteHandler('get', '/:id/chat/messages')
    const historyRes = makeRes()
    await historyHandler(makeReq({ params: { id: 'restore-agent' } }), historyRes)

    assert.strictEqual(historyRes.statusCode, 200, 'Expected chat history route success after restore')
    assert.deepStrictEqual(
      historyRes.jsonBody?.messages?.map((message: any) => message.content),
      ['Continue my previous work', 'Restored conversation reply'],
      'Expected restored archive to become the current active conversation'
    )

    const listHandler = getRouteHandler('get', '/:id/chat/archives')
    const listRes = makeRes()
    await listHandler(makeReq({ params: { id: 'restore-agent' } }), listRes)

    assert.strictEqual(listRes.statusCode, 200, 'Expected archive list success after restore')
    assert.strictEqual(listRes.jsonBody?.archives?.length, 1, 'Expected restored chat to replace its archived copy in the history list')
    assert.strictEqual(listRes.jsonBody?.archives?.[0]?.active, true, 'Expected restored conversation to become the current active history entry')
    assert.strictEqual(String(listRes.jsonBody?.archives?.[0]?.title || ''), 'Current conversation', 'Expected restored current history entry title')
    assert.strictEqual(fs.existsSync(path.join(archiveDir, archiveFilename)), false, 'Expected restored archive file to be consumed from the archive directory')
  })

  await test('chat archive restore and delete routes reject current-session and path-traversal filenames', async () => {
    const restoreHandler = getRouteHandler('post', '/:id/chat/archives/:filename/restore')
    let res = makeRes()
    await restoreHandler(makeReq({
      params: {
        id: 'restore-agent',
        filename: 'current:session-1',
      },
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected current conversation restore to return HTTP 400')

    res = makeRes()
    await restoreHandler(makeReq({
      params: {
        id: 'restore-agent',
        filename: '../escape.jsonl',
      },
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected archive path traversal restore to return HTTP 400')

    const deleteHandler = getRouteHandler('delete', '/:id/chat/archives/:filename')
    res = makeRes()
    await deleteHandler(makeReq({
      params: {
        id: 'restore-agent',
        filename: 'current:session-1',
      },
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected current conversation delete to return HTTP 400')

    res = makeRes()
    await deleteHandler(makeReq({
      params: {
        id: 'restore-agent',
        filename: '../escape.jsonl',
      },
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected archive path traversal delete to return HTTP 400')
  })

  await test('models route forwards LM Studio and Ollama local model settings into discovery', async () => {
    const discoveryModule = require('../lib/model-discovery')
    const originalDiscoverModels = discoveryModule.discoverModels

    try {
      discoveryModule.discoverModels = async (byokKeys: any, options: any) => {
        assert.strictEqual(byokKeys?.openaiCompatibleBaseUrl, 'http://127.0.0.1:1234/v1', 'Expected LM Studio base URL to be forwarded')
        assert.strictEqual(byokKeys?.ollamaBaseUrl, 'http://127.0.0.1:11434', 'Expected Ollama base URL to be forwarded')
        assert.strictEqual(options?.showAll, true, 'Expected showAll query to be forwarded')
        return {
          models: ['openai-compatible/granite-3.3-8b-instruct', 'ollama/qwen2.5:latest'],
          modelsByProvider: {
            'openai-compatible': { name: 'OpenAI-Compatible', models: ['openai-compatible/granite-3.3-8b-instruct'] },
            ollama: { name: 'Ollama', models: ['ollama/qwen2.5:latest'] },
          },
        }
      }

      const handler = getRouteHandler('get', '/models')
      const res = makeRes()
      await handler(makeReq({
        query: {
          openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
          ollamaBaseUrl: 'http://127.0.0.1:11434',
          showAll: 'true',
        },
      }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected models route success')
      assert(res.jsonBody?.modelsByProvider?.['openai-compatible'], 'Expected LM Studio provider in response')
      assert(res.jsonBody?.modelsByProvider?.ollama, 'Expected Ollama provider in response')
    } finally {
      discoveryModule.discoverModels = originalDiscoverModels
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('models refresh clears cache and forwards local model endpoints', async () => {
    const discoveryModule = require('../lib/model-discovery')
    const originalDiscoverModels = discoveryModule.discoverModels
    const originalClearModelCache = discoveryModule.clearModelCache
    let cacheCleared = false

    try {
      discoveryModule.clearModelCache = () => { cacheCleared = true }
      discoveryModule.discoverModels = async (byokKeys: any, options: any) => {
        assert.strictEqual(byokKeys?.openaiCompatibleBaseUrl, 'http://127.0.0.1:1234/v1', 'Expected LM Studio base URL in refresh body')
        assert.strictEqual(byokKeys?.ollamaBaseUrl, 'http://127.0.0.1:11434', 'Expected Ollama base URL in refresh body')
        assert.strictEqual(options?.showAll, true, 'Expected refresh showAll body to be forwarded')
        return {
          models: ['openai-compatible/granite-3.3-8b-instruct', 'ollama/granite3.3:8b'],
          modelsByProvider: {
            'openai-compatible': { name: 'OpenAI-Compatible', models: ['openai-compatible/granite-3.3-8b-instruct'] },
            ollama: { name: 'Ollama', models: ['ollama/granite3.3:8b'] },
          },
        }
      }

      const handler = getRouteHandler('post', '/models/refresh')
      const res = makeRes()
      await handler(makeReq({
        body: {
          openaiCompatibleBaseUrl: 'http://127.0.0.1:1234/v1',
          ollamaBaseUrl: 'http://127.0.0.1:11434',
          showAll: true,
        },
      }), res)

      assert.strictEqual(cacheCleared, true, 'Expected refresh route to clear model cache')
      assert.strictEqual(res.statusCode, 200, 'Expected refresh route success')
      assert(res.jsonBody?.modelsByProvider?.['openai-compatible'], 'Expected LM Studio provider in refresh response')
      assert(res.jsonBody?.modelsByProvider?.ollama, 'Expected Ollama provider in refresh response')
    } finally {
      discoveryModule.discoverModels = originalDiscoverModels
      discoveryModule.clearModelCache = originalClearModelCache
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('gateway-status rejects invalid ids and missing agents cleanly', async () => {
    const handler = getRouteHandler('get', '/:id/gateway-status')

    let res = makeRes()
    await handler(makeReq({ params: { id: 'BAD ID' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid gateway-status id to return HTTP 400')

    res = makeRes()
    await handler(makeReq({ params: { id: 'missing-agent' } }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing agent gateway-status to return HTTP 404')
    assert(/Agent not found/i.test(res.jsonBody?.error || ''), 'Expected missing agent guidance')
  })

  await test('health returns 404 for missing agents before invoking openclaw', async () => {
    const handler = getRouteHandler('get', '/:id/health')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'missing-agent' } }), res)

    assert.strictEqual(res.statusCode, 404, 'Expected missing agent health to return HTTP 404')
    assert(/Agent not found/i.test(res.jsonBody?.error || ''), 'Expected missing agent health guidance')
  })

  await test('status and usage routes return structured fallback data when gateway is unavailable', async () => {
    const statusHandler = getRouteHandler('get', '/status')
    let res = makeRes()
    await statusHandler(makeReq(), res)
    assert.strictEqual(res.statusCode, 200, 'Expected status route success')
    assert(typeof res.jsonBody?.total === 'number', 'Expected total agent count in status response')
    assert(typeof res.jsonBody?.gatewayAvailable === 'boolean', 'Expected gateway availability flag')
    assert(typeof res.jsonBody?.timestamp === 'string', 'Expected status timestamp')

    const usageHandler = getRouteHandler('get', '/usage')
    res = makeRes()
    await usageHandler(makeReq({ query: { days: '7' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected usage route success')
    assert.deepStrictEqual(res.jsonBody?.agentUsage, {}, 'Expected empty usage payload when gateway is unavailable')
    assert.strictEqual(res.jsonBody?.days, 7, 'Expected requested days to be preserved')
    assert(/Gateway unavailable|no usage data/i.test(res.jsonBody?.error || ''), 'Expected gateway-unavailable usage guidance')
  })

  await test('cost limit route validates invalid values and returns stored values', async () => {
    const getHandler = getRouteHandler('get', '/:id/cost-limit')
    let res = makeRes()
    await getHandler(makeReq({ params: { id: 'plain-agent' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected cost limit read success')
    assert.strictEqual(res.jsonBody?.agentId, 'plain-agent', 'Expected cost limit payload agent id')

    const putHandler = getRouteHandler('put', '/:id/cost-limit')
    res = makeRes()
    await putHandler(makeReq({ params: { id: 'plain-agent' }, body: { limitUsd: -1 } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected negative cost limit to return HTTP 400')
    assert(/limitUsd/i.test(res.jsonBody?.error || ''), 'Expected invalid limit guidance')
  })

  await test('agent config routes reject invalid ids, missing agents, and invalid expected ids', async () => {
    const getConfigHandler = getRouteHandler('get', '/:id/config')
    let res = makeRes()
    await getConfigHandler(makeReq({ params: { id: 'BAD ID' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid config id to return HTTP 400')

    res = makeRes()
    await getConfigHandler(makeReq({ params: { id: 'missing-agent' } }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing config agent to return HTTP 404')

    const validateConfigHandler = getRouteHandler('post', '/validate-config')
    res = makeRes()
    await validateConfigHandler(makeReq({ body: { expectedId: 'BAD ID' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid expected agent id to return HTTP 400')

    const putConfigHandler = getRouteHandler('put', '/:id/config')
    res = makeRes()
    await putConfigHandler(makeReq({ params: { id: 'BAD ID' }, body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid config update id to return HTTP 400')
  })

  await test('identity route surfaces the runtime pin for the agent edit form, omitting it when unset', async () => {
    writeAgent(workspacePath, 'runtime-pinned-agent', [
      '# IDENTITY.md',
      '- **Name:** Pinned',
      '- **Model:** anthropic/claude-sonnet-4-20250514',
      '- **Runtime:** claude',
    ].join('\n'))
    writeAgent(workspacePath, 'runtime-default-agent', [
      '# IDENTITY.md',
      '- **Name:** Unpinned',
      '- **Model:** anthropic/claude-sonnet-4-20250514',
    ].join('\n'))

    const identityHandler = getRouteHandler('get', '/:id/identity')

    let res = makeRes()
    await identityHandler(makeReq({ params: { id: 'runtime-pinned-agent' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected identity route success for pinned agent')
    assert.strictEqual(res.jsonBody?.metadata?.runtime, 'claude', 'Expected pinned runtime to surface in identity metadata')

    res = makeRes()
    await identityHandler(makeReq({ params: { id: 'runtime-default-agent' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected identity route success for unpinned agent')
    assert.strictEqual(res.jsonBody?.metadata?.runtime, undefined, 'Expected no runtime field when the agent has no pin')
  })

  await test('agent model and tags routes reject invalid requests', async () => {
    const patchTagsHandler = getRouteHandler('patch', '/:id/tags')
    let res = makeRes()
    await patchTagsHandler(makeReq({ params: { id: 'BAD ID' }, body: { tags: [] } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid tags agent id to return HTTP 400')

    res = makeRes()
    await patchTagsHandler(makeReq({ params: { id: 'plain-agent' }, body: { tags: 'bad' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected non-array tags to return HTTP 400')

    const patchModelHandler = getRouteHandler('patch', '/:id/model')
    res = makeRes()
    await patchModelHandler(makeReq({ params: { id: 'BAD ID' }, body: { model: 'openai/gpt-4o-mini' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid model agent id to return HTTP 400')

    res = makeRes()
    await patchModelHandler(makeReq({ params: { id: 'plain-agent' }, body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing model to return HTTP 400')
  })

  await test('agent model route persists automatic selection mode and priority per agent', async () => {
    writeAgent(workspacePath, 'model-fit-agent', [
      '# IDENTITY.md',
      '',
      '- **Name:** Model Fit Agent',
      '- **Model:** openai/gpt-5.5',
      '',
      '## Creation Metadata',
      '',
      '- **Model:** original/model',
    ].join('\n'))

    const patchModelHandler = getRouteHandler('patch', '/:id/model')
    let res = makeRes()
    await patchModelHandler(makeReq({
      params: { id: 'model-fit-agent' },
      body: {
        model: 'openai/gpt-5.5',
        modelSelection: 'auto',
        modelPreference: 'cost',
      },
    }), res)
    assert.strictEqual(res.statusCode, 200, `Expected model settings update success: ${res.jsonBody?.error || ''}`)

    const identityPath = path.join(workspacePath, 'AGENTS', 'model-fit-agent', 'IDENTITY.md')
    const persisted = fs.readFileSync(identityPath, 'utf-8')
    assert(persisted.includes('- **Model Selection:** auto'), 'Expected automatic selection mode in agent identity')
    assert(persisted.includes('- **Model Priority:** cost'), 'Expected cost priority in agent identity')
    assert(persisted.indexOf('**Model Selection:**') < persisted.indexOf('## Creation Metadata'), 'Expected settings in runtime section')

    const getIdentityHandler = getRouteHandler('get', '/:id/identity')
    res = makeRes()
    await getIdentityHandler(makeReq({ params: { id: 'model-fit-agent' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected identity metadata success')
    assert.deepStrictEqual(
      res.jsonBody?.modelFit,
      { selectionMode: 'auto', preference: 'cost' },
      'Expected saved agent-specific settings from identity route',
    )
  })

  await test('runtime pin route validates input, persists to IDENTITY.md, and clears back to default', async () => {
    writeAgent(workspacePath, 'runtime-route-agent', [
      '# IDENTITY.md',
      '- **Name:** Runtime Route Agent',
      '- **Model:** anthropic/claude-sonnet-4-20250514',
    ].join('\n'))
    const identityPath = path.join(workspacePath, 'AGENTS', 'runtime-route-agent', 'IDENTITY.md')

    const patchRuntimeHandler = getRouteHandler('patch', '/:id/runtime')

    let res = makeRes()
    await patchRuntimeHandler(makeReq({ params: { id: 'BAD ID' }, body: { runtime: 'claude' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid runtime agent id to return HTTP 400')

    res = makeRes()
    await patchRuntimeHandler(makeReq({ params: { id: 'runtime-route-agent' }, body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing runtime to return HTTP 400')

    res = makeRes()
    await patchRuntimeHandler(makeReq({ params: { id: 'runtime-route-agent' }, body: { runtime: 'not-a-runtime' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid runtime value to return HTTP 400')
    assert(/default, openclaw, claude, droid/.test(res.jsonBody?.error || ''), 'Expected allowed runtime values listed in the error')

    res = makeRes()
    await patchRuntimeHandler(makeReq({ params: { id: 'missing-agent' }, body: { runtime: 'claude' } }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing agent runtime update to return HTTP 404')

    res = makeRes()
    await patchRuntimeHandler(makeReq({ params: { id: 'runtime-route-agent' }, body: { runtime: 'claude' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected valid runtime pin to succeed')
    assert.strictEqual(res.jsonBody?.runtime, 'claude', 'Expected response to echo the normalized runtime')
    assert(/\*\*Runtime:\*\* claude/.test(fs.readFileSync(identityPath, 'utf-8')), 'Expected runtime pin persisted to IDENTITY.md')

    res = makeRes()
    await patchRuntimeHandler(makeReq({ params: { id: 'runtime-route-agent' }, body: { runtime: 'default' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected clearing the runtime pin to succeed')
    assert.strictEqual(res.jsonBody?.runtime, 'default', 'Expected response to echo default')
    assert(!/\*\*Runtime:\*\*/.test(fs.readFileSync(identityPath, 'utf-8')), 'Expected runtime pin removed from IDENTITY.md')
  })

  await test('dashboard chat/messages route runs a droid-pinned agent through the runtime adapter instead of spawning openclaw', async () => {
    writeAgent(workspacePath, 'droid-dashboard-chat', [
      '# IDENTITY.md',
      '- **Name:** Droid Dashboard Chat',
      '- **Runtime:** droid',
    ].join('\n'))
    fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(workspacePath, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: ['droid'] }), 'utf-8')

    const droidCli = path.join(tmpHome, 'fake-droid-dashboard-chat')
    writeFakeDroidCli(droidCli, 'hello from droid dashboard chat')
    const originalDroidBin = process.env.DROID_BIN
    process.env.DROID_BIN = droidCli

    try {
      const handler = getRouteHandler('post', '/:id/chat/messages')
      const res = makeRes()
      await handler(makeReq({ params: { id: 'droid-dashboard-chat' }, body: { message: 'hi' } }), res)
      // The route resolves the droid CLI child process asynchronously (fire-and-forget past the
      // await'd handler call, same as the existing openclaw branch below it); poll briefly for
      // the real spawned fake-droid process to exit and call res.json().
      for (let waited = 0; waited < 2000 && typeof res.jsonBody === 'undefined'; waited += 20) {
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      assert.strictEqual(res.statusCode, 200, 'Expected the droid-pinned dashboard chat call to succeed')
      assert.strictEqual(
        res.jsonBody?.result?.response,
        'hello from droid dashboard chat',
        'Expected the response text to come from the droid runtime adapter, not an openclaw JSON envelope'
      )
    } finally {
      if (typeof originalDroidBin === 'undefined') delete process.env.DROID_BIN
      else process.env.DROID_BIN = originalDroidBin
    }
  })

  await test('dashboard chat/messages route hands a claude-pinned agent user-execution ANTHROPIC_API_KEY per the Separated Key Policy', async () => {
    writeAgent(workspacePath, 'claude-dashboard-chat', [
      '# IDENTITY.md',
      '- **Name:** Claude Dashboard Chat',
      '- **Model:** anthropic/claude-sonnet-4-20250514',
      '- **Runtime:** claude',
    ].join('\n'))
    fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(workspacePath, 'SYSTEM', 'integrations.json'), JSON.stringify({ enabledRuntimes: ['claude'] }), 'utf-8')

    const claudeCli = path.join(tmpHome, 'fake-claude-dashboard-chat')
    writeFakeClaudeCliDumpingAnthropicKey(claudeCli)
    const originalClaudeBin = process.env.CLAUDE_BIN
    process.env.CLAUDE_BIN = claudeCli

    try {
      // This route is user-initiated agent execution, so it must resolve keys through the USER
      // execution path (userExecutionEnv → resolveUserExecutionProviderKeys), NOT the system path.
      // Stub the user resolver with a key and a system resolver with a DIFFERENT key: the CLI must
      // receive the user key, proving the route honors the Separated Key Policy rather than leaking
      // SYSTEM_* keys into user chats.
      await withDashboardEnvStubs({
        resolveUserExecutionProviderKeys: () => ({ anthropic: 'sk-ant-user-key' }),
        resolveSystemExecutionProviderKeys: () => ({ anthropic: 'sk-ant-system-key-must-not-leak' }),
      }, async () => {
        const handler = getRouteHandler('post', '/:id/chat/messages')
        const res = makeRes()
        await handler(makeReq({ params: { id: 'claude-dashboard-chat' }, body: { message: 'hi' } }), res)
        // Same fire-and-forget shape as the droid case above; poll briefly for the real spawned
        // fake-claude process to exit and call res.json().
        for (let waited = 0; waited < 2000 && typeof res.jsonBody === 'undefined'; waited += 20) {
          await new Promise(resolve => setTimeout(resolve, 20))
        }
        assert.strictEqual(res.statusCode, 200, 'Expected the claude-pinned dashboard chat call to succeed')
        assert.strictEqual(
          res.jsonBody?.result?.response,
          'ANTHROPIC_API_KEY=sk-ant-user-key',
          'Expected the spawned claude CLI to see the user-execution ANTHROPIC_API_KEY, not the system key'
        )
      })
    } finally {
      if (typeof originalClaudeBin === 'undefined') delete process.env.CLAUDE_BIN
      else process.env.CLAUDE_BIN = originalClaudeBin
    }
  })

  await test('dashboard chat/messages route for a default (openclaw) agent has no fixed deadline and is only stoppable via the turn registry', async () => {
    // Regression coverage for the P1 finding: this branch used to unconditionally
    // `setTimeout(() => proc.kill(), 600000)`, killing a still-working turn 10 minutes in
    // regardless of whether it was making progress -- exactly the bug the rest of this change
    // deletes everywhere else. Nothing in this suite exercised the branch before, which is how
    // that survived. A fake child process here stands in for the real `openclaw` CLI.
    writeAgent(workspacePath, 'openclaw-dashboard-chat', [
      '# IDENTITY.md',
      '- **Name:** OpenClaw Dashboard Chat',
    ].join('\n'))

    const fakeProc: any = new EventEmitter()
    fakeProc.stdout = new EventEmitter()
    fakeProc.stderr = new EventEmitter()
    fakeProc.killed = false
    fakeProc.kill = () => { fakeProc.killed = true }

    await withChildProcessStubs({
      spawn: () => fakeProc,
    }, async () => {
      const handler = getRouteHandler('post', '/:id/chat/messages')
      const res = makeRes()
      await handler(makeReq({ params: { id: 'openclaw-dashboard-chat' }, body: { message: 'hi' } }), res)

      // registerTurn happens inside runExclusiveAgentExecution's callback, past an await the
      // handler itself doesn't wait on (same fire-and-forget shape as the droid/claude cases
      // above) -- poll briefly for it to show up rather than assuming it's there synchronously.
      let turn: ReturnType<typeof listActiveTurns>[number] | undefined
      for (let waited = 0; waited < 2000 && !turn; waited += 10) {
        turn = listActiveTurns().find((t) => t.agentId === 'openclaw-dashboard-chat')
        if (!turn) await new Promise((resolve) => setTimeout(resolve, 10))
      }
      assert(turn, 'Expected the openclaw chat turn to be visible in the active-turn registry')

      // Prove there is no timer standing between "still working" and "killed": letting the fake
      // CLI sit idle proves nothing fires on its own -- the only thing that can kill it now is an
      // explicit cancel.
      await new Promise((resolve) => setTimeout(resolve, 50))
      assert.strictEqual(fakeProc.killed, false, 'Expected no automatic timer to have touched the process')

      // Simulate a user pressing Stop.
      const wasCancelled = cancelTurn(turn.turnId)
      assert.strictEqual(wasCancelled, true, 'Expected cancelTurn(turnId) to find and abort the registered turn')
      assert.strictEqual(fakeProc.killed, true, 'Expected the abort to reach proc.kill(), the route\'s only kill switch now')

      // Let the killed process actually exit so the route's promise settles and releases the turn.
      // Same fire-and-forget shape as the droid/claude cases above: poll for res.json() rather
      // than a promise the handler itself never awaits.
      fakeProc.emit('close', 143)
      for (let waited = 0; waited < 2000 && typeof res.jsonBody === 'undefined'; waited += 10) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }

      assert.strictEqual(res.statusCode, 500, 'Expected a killed-mid-flight turn to surface as a failed request')
      assert(
        listActiveTurns().every((t) => t.turnId !== turn!.turnId),
        'Expected the turn to be released from the registry once the handler settled'
      )
    })
  })

  await test('agent archive and unarchive routes reject invalid ids and missing agents', async () => {
    const archiveHandler = getRouteHandler('post', '/:id/archive')
    let res = makeRes()
    await archiveHandler(makeReq({ params: { id: 'BAD ID' }, body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid archive agent id to return HTTP 400')

    res = makeRes()
    await archiveHandler(makeReq({ params: { id: 'missing-agent' }, body: {} }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing agent archive to return HTTP 404')

    const unarchiveHandler = getRouteHandler('post', '/:id/unarchive')
    res = makeRes()
    await unarchiveHandler(makeReq({ params: { id: 'BAD ID' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid unarchive agent id to return HTTP 400')

    res = makeRes()
    await unarchiveHandler(makeReq({ params: { id: 'missing-agent' } }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing agent unarchive to return HTTP 404')
  })

  await test('agent import routes reject missing source paths, empty zip bodies, and invalid ids', async () => {
    const importDirectoryHandler = getRouteHandler('post', '/import-directory')
    let res = makeRes()
    await importDirectoryHandler(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing import directory sourcePath to return HTTP 400')

    res = makeRes()
    await importDirectoryHandler(makeReq({ body: { sourcePath: '/tmp/agent', targetId: 'bad id' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid import directory targetId to return HTTP 400')

    const importZipHandler = getRouteHandler('post', '/import-zip')
    res = makeRes()
    await importZipHandler(makeReq({ query: { targetId: 'bad id' }, body: Buffer.from('zip') }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid import-zip targetId to return HTTP 400')

    res = makeRes()
    await importZipHandler(makeReq({ body: Buffer.alloc(0) }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected empty import-zip body to return HTTP 400')

    const openClawImportHandler = getRouteHandler('post', '/openclaw/import')
    res = makeRes()
    await openClawImportHandler(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing OpenClaw sourceId to return HTTP 400')

    res = makeRes()
    await openClawImportHandler(makeReq({ body: { sourceId: 'valid-source', targetId: 'bad id' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid OpenClaw targetId to return HTTP 400')
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  if (typeof originalOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
  else process.env.OPENCLAW_BIN = originalOpenClawBin

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
}

run().catch((err) => {
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
  else process.env.OPENCLAW_BIN = originalOpenClawBin
  console.error(err)
  process.exit(1)
})
