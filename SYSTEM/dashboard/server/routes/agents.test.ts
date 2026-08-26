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
    } finally {
      childProcess.spawn = originalSpawn
    }
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
          tags: [],
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
      assert(writes.some(chunk => chunk.includes('Wrote AI-generated files')), 'Expected streamed logs to mention generated files')
      assert(writes.some(chunk => chunk.includes('"type":"done"') && chunk.includes('"data":"ok"')), 'Expected successful create completion event')
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
