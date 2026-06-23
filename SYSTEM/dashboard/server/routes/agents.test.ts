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

function writeFakeOpenClawCli(tmpHome: string): string {
  const cliPath = path.join(tmpHome, 'openclaw')
  fs.writeFileSync(cliPath, '#!/bin/sh\necho "openclaw 2026.5.26"\n', 'utf-8')
  fs.chmodSync(cliPath, 0o755)
  return cliPath
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
          execSync: () => 'Gateway restarted',
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
          execSync: () => {
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
