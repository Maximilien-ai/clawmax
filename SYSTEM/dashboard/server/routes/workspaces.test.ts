/**
 * Workspaces routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/workspaces.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import { resetWorkspaceManagerForTests } from '../lib/workspace-manager'

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

function getRouter(reset = true) {
  if (reset) {
    resetWorkspaceManagerForTests()
    delete require.cache[require.resolve('./workspaces')]
  }
  return require('./workspaces').default
}

function getRouteHandler(method: 'get' | 'post' | 'put', routePath: string, reset = true) {
  const router = getRouter(reset)
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
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
  console.log(`\n${YELLOW}=== Workspaces Routes Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspaces-routes-home-'))
  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = path.join(tmpHome, 'workspace-default')

  await test('create workspace rejects missing required fields', async () => {
    const handler = getRouteHandler('post', '/')
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing workspace fields to return HTTP 400')
    assert(/workspace name is required/i.test(res.jsonBody?.error || ''), 'Expected missing name guidance')
  })

  await test('create workspace resolves relative paths and persists workspace metadata', async () => {
    const handler = getRouteHandler('post', '/')
    const res = makeRes()
    const absoluteCustomerPath = path.join(tmpHome, 'customer-workspace')
    const relativePath = path.relative(process.cwd(), absoluteCustomerPath)
    await handler(makeReq({
      body: {
        name: 'Customer Workspace',
        path: relativePath,
        color: '#10B981',
        tags: ['customer'],
      },
    }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected workspace create success')
    assert.strictEqual(res.jsonBody?.workspace?.name, 'Customer Workspace', 'Expected workspace name to persist')
    assert(path.isAbsolute(res.jsonBody?.workspace?.path || ''), 'Expected route to resolve relative paths')
    assert.strictEqual(res.jsonBody?.workspace?.path, absoluteCustomerPath, 'Expected relative path to resolve into the temp test workspace path')
    assert(fs.existsSync(path.join(res.jsonBody.workspace.path, 'AGENTS')), 'Expected workspace scaffold to be created')
  })

  await test('list and active routes reflect created workspaces and active workspace changes', async () => {
    const router = getRouter(true)
    const getHandler = (method: 'get' | 'post' | 'put', routePath: string) => {
      const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
      if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
      return layer.route.stack[0].handle as Function
    }

    const createHandler = getHandler('post', '/')
    const alphaRes = makeRes()
    await createHandler(makeReq({
      body: {
        name: 'Alpha Workspace',
        path: path.join(tmpHome, 'alpha-workspace'),
      },
    }), alphaRes)
    const betaRes = makeRes()
    await createHandler(makeReq({
      body: {
        name: 'Beta Workspace',
        path: path.join(tmpHome, 'beta-workspace'),
      },
    }), betaRes)

    const listHandler = getHandler('get', '/')
    const listRes = makeRes()
    await listHandler(makeReq(), listRes)

    assert.strictEqual(listRes.statusCode, 200, 'Expected list route success')
    assert((listRes.jsonBody?.workspaces || []).length >= 2, 'Expected multiple workspaces to be listed')

    const activeHandler = getHandler('get', '/active')
    const beforeRes = makeRes()
    await activeHandler(makeReq(), beforeRes)
    assert.strictEqual(beforeRes.statusCode, 200, 'Expected active workspace route success')
    assert.strictEqual(beforeRes.jsonBody?.workspace?.id, 'default', 'Expected default workspace to remain active until explicit activation')

    const activateHandler = getHandler('put', '/:id/activate')
    const activateRes = makeRes()
    await activateHandler(makeReq({ params: { id: betaRes.jsonBody?.workspace?.id } }), activateRes)
    assert.strictEqual(activateRes.statusCode, 200, 'Expected activate route success')
    assert.strictEqual(activateRes.jsonBody?.ok, true, 'Expected ok response from activate route')

    const afterRes = makeRes()
    await activeHandler(makeReq(), afterRes)
    assert.strictEqual(afterRes.jsonBody?.workspace?.id, betaRes.jsonBody?.workspace?.id, 'Expected active workspace to switch to beta')
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
