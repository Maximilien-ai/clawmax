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

  await test('generate rejects missing descriptions before invoking AI generation', async () => {
    const handler = getRouteHandler('post', '/generate')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing description to return HTTP 400')
    assert(/description is required/i.test(res.jsonBody?.error || ''), 'Expected missing description guidance')
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
  console.error(err)
  process.exit(1)
})
