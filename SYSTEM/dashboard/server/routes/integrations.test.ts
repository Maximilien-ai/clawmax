/**
 * Integrations routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/integrations.test.ts
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
const originalDeploymentKind = process.env.DASHBOARD_DEPLOYMENT_KIND
const originalEnableOllama = process.env.DASHBOARD_ENABLE_OLLAMA

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

function ensureWorkspaceScaffold(workspacePath: string) {
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'AGENTS'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'integrations-workspace',
    workspaces: [{
      id: 'integrations-workspace',
      name: 'Integrations Workspace',
      path: workspacePath,
      createdAt: '2026-06-01T00:00:00.000Z',
      lastAccessedAt: '2026-06-01T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

function getRouteHandler(method: 'get' | 'put', routePath: string) {
  delete require.cache[require.resolve('./integrations')]
  const router = require('./integrations').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    on() {},
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Integrations Routes Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-integrations-routes-home-'))
  const workspacePath = path.join(tmpHome, 'workspaces', 'integrations-workspace')
  ensureWorkspaceScaffold(workspacePath)
  writeWorkspaceRegistry(tmpHome, workspacePath)
  fs.mkdirSync(path.join(tmpHome, '.openclaw'), { recursive: true })

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath

  await test('status omits ollama provider on cloud runtimes', async () => {
    process.env.DASHBOARD_DEPLOYMENT_KIND = 'cloud'
    delete process.env.DASHBOARD_ENABLE_OLLAMA

    const handler = getRouteHandler('get', '/status')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected status route success')
    assert(Array.isArray(res.jsonBody?.providers), 'Expected providers array')
    assert(!res.jsonBody.providers.includes('ollama'), 'Expected ollama to be hidden for cloud runtimes')
  })

  await test('config round-trip persists workspace defaults and secret presence', async () => {
    process.env.DASHBOARD_DEPLOYMENT_KIND = 'local'
    process.env.DASHBOARD_ENABLE_OLLAMA = 'true'

    const putHandler = getRouteHandler('put', '/config')
    const putRes = makeRes()
    await putHandler(makeReq({
      body: {
        preferredModel: 'openai/gpt-5',
        systemPreferredModel: 'openai/gpt-5',
        githubDefaultRepo: 'owner/repo',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaDefaultModel: 'llama3.2',
        enabledPartners: ['github', 'github'],
        partners: {
          github: {
            repoLabelsEnabled: true,
          },
        },
        partnerSecrets: {
          github: {
            token: 'ghp_test_123',
          },
        },
      },
    }), putRes)

    assert.strictEqual(putRes.statusCode, 200, 'Expected config update success')
    assert.strictEqual(putRes.jsonBody?.config?.preferredModel, 'openai/gpt-5', 'Expected preferred model persistence')
    assert.deepStrictEqual(putRes.jsonBody?.config?.enabledPartners, ['github'], 'Expected enabled partners deduped')
    assert.strictEqual(putRes.jsonBody?.secretPresence?.github?.token, true, 'Expected GitHub token presence to be reported')

    const getHandler = getRouteHandler('get', '/config')
    const getRes = makeRes()
    await getHandler(makeReq(), getRes)

    assert.strictEqual(getRes.statusCode, 200, 'Expected config fetch success')
    assert.strictEqual(getRes.jsonBody?.config?.githubDefaultRepo, 'owner/repo', 'Expected github repo persistence')
    assert.strictEqual(getRes.jsonBody?.config?.ollamaDefaultModel, 'llama3.2', 'Expected ollama defaults persistence')
    assert.strictEqual(getRes.jsonBody?.secretPresence?.github?.token, true, 'Expected GitHub token secret presence after reload')
  })

  await test('config update preserves existing github token when a later save sends a blank token', async () => {
    const putHandler = getRouteHandler('put', '/config')
    const putRes = makeRes()
    await putHandler(makeReq({
      body: {
        partnerSecrets: {
          github: {
            token: '   ',
          },
        },
      },
    }), putRes)

    assert.strictEqual(putRes.statusCode, 200, 'Expected config update success')
    assert.strictEqual(putRes.jsonBody?.secretPresence?.github?.token, true, 'Expected existing token presence to be preserved')

    const secretsPath = path.join(workspacePath, 'SYSTEM', 'integrations.secrets.json')
    const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'))
    assert.strictEqual(secrets?.partners?.github?.token, 'ghp_test_123', 'Expected blank token update not to erase existing token')
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalDeploymentKind === 'undefined') delete process.env.DASHBOARD_DEPLOYMENT_KIND
  else process.env.DASHBOARD_DEPLOYMENT_KIND = originalDeploymentKind
  if (typeof originalEnableOllama === 'undefined') delete process.env.DASHBOARD_ENABLE_OLLAMA
  else process.env.DASHBOARD_ENABLE_OLLAMA = originalEnableOllama

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
  if (typeof originalDeploymentKind === 'undefined') delete process.env.DASHBOARD_DEPLOYMENT_KIND
  else process.env.DASHBOARD_DEPLOYMENT_KIND = originalDeploymentKind
  if (typeof originalEnableOllama === 'undefined') delete process.env.DASHBOARD_ENABLE_OLLAMA
  else process.env.DASHBOARD_ENABLE_OLLAMA = originalEnableOllama
  console.error(err)
  process.exit(1)
})
