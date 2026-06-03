/**
 * Agents routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/agents.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'

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

function getRouteHandler(method: 'get' | 'post', routePath: string) {
  // Load after env is set so helper modules resolve the temp workspace/home.
  delete require.cache[require.resolve('./agents')]
  const router = require('./agents').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
}

function withGatewayRpcStubs<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> | T {
  delete require.cache[gatewayRpcModulePath]
  const gatewayRpc = require('../lib/gateway-rpc')
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, gatewayRpc[key]]))
  Object.assign(gatewayRpc, overrides)
  try {
    return fn()
  } finally {
    Object.assign(gatewayRpc, originals)
    delete require.cache[require.resolve('./agents')]
  }
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

  await test('generate rejects missing descriptions before invoking AI generation', async () => {
    const handler = getRouteHandler('post', '/generate')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing description to return HTTP 400')
    assert(/description is required/i.test(res.jsonBody?.error || ''), 'Expected missing description guidance')
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
      const handler = getRouteHandler('post', '/generate')
      const res = makeRes()
      await handler(makeReq({
        body: {
          description: 'create a resend agent to test sending emails with resend skills',
          suggestMeta: true,
        },
      }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected generate route success')
      assert.strictEqual(res.jsonBody?.suggestedName, 'resend-agent')
      assert.deepStrictEqual(res.jsonBody?.suggestedTags, ['email', 'assistant'])
      assert.deepStrictEqual(res.jsonBody?.suggestedSkills, ['resend', 'react-email'])
    } finally {
      aiGenerator.generateAgentMeta = originalGenerateAgentMeta
      aiGenerator.generateAgentFiles = originalGenerateAgentFiles
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

  await test('provision assigns inferred skills after agent creation succeeds', async () => {
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
          skills: ['github', 'workspace-ls'],
        },
        on() {},
      })
      await handler(req, res)
      await new Promise(resolve => setTimeout(resolve, 20))

      assert.deepStrictEqual(assigned, [{ agentId: 'resend-agent', skills: ['github', 'workspace-ls'] }])
      assert(writes.some(chunk => chunk.includes('Assigned inferred skills: github, workspace-ls')), 'Expected streamed logs to mention inferred skill assignment')
      assert(writes.some(chunk => chunk.includes('"type":"done"') && chunk.includes('"data":"ok"')), 'Expected successful create completion event')
    } finally {
      childProcess.spawn = originalSpawn
      skillsModule.setAgentSkills = originalSetAgentSkills
      delete require.cache[require.resolve('./agents')]
    }
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
