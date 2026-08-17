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

function getRouter(
  reset = true,
  overrides: {
    workspaceDashboards?: Partial<typeof import('../lib/workspace-dashboards')>
    workspaceImport?: Partial<typeof import('../lib/workspace-import')>
  } = {},
) {
  if (reset) {
    const moduleOverrides: Array<[string, Record<string, any> | undefined]> = [
      ['../lib/workspace-dashboards', overrides.workspaceDashboards as any],
      ['../lib/workspace-import', overrides.workspaceImport as any],
    ]
    for (const [modulePath, patch] of moduleOverrides) {
      const resolved = require.resolve(modulePath)
      delete require.cache[resolved]
      if (patch) Object.assign(require(resolved), patch)
    }
    resetWorkspaceManagerForTests()
    delete require.cache[require.resolve('./workspaces')]
  }
  return require('./workspaces').default
}

function getRouteHandler(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  routePath: string,
  reset = true,
  overrides: {
    workspaceDashboards?: Partial<typeof import('../lib/workspace-dashboards')>
    workspaceImport?: Partial<typeof import('../lib/workspace-import')>
  } = {},
) {
  const router = getRouter(reset, overrides)
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
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

  await test('create workspace returns a structured tenant limit conflict', async () => {
    const previous = process.env.CLAWMAX_MAX_WORKSPACES
    process.env.CLAWMAX_MAX_WORKSPACES = '0'
    try {
      const handler = getRouteHandler('post', '/')
      const res = makeRes()
      await handler(makeReq({ body: { name: 'Blocked', path: path.join(tmpHome, 'blocked-workspace') } }), res)

      assert.strictEqual(res.statusCode, 409, 'Expected exhausted workspace limit to return HTTP 409')
      assert.strictEqual(res.jsonBody?.code, 'TENANT_RESOURCE_LIMIT_REACHED')
      assert.strictEqual(res.jsonBody?.resource, 'workspaces')
    } finally {
      if (previous === undefined) delete process.env.CLAWMAX_MAX_WORKSPACES
      else process.env.CLAWMAX_MAX_WORKSPACES = previous
    }
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

  await test('workspace detail and export routes return 404 for unknown workspace ids', async () => {
    const detailHandler = getRouteHandler('get', '/:id')
    const detailRes = makeRes()
    await detailHandler(makeReq({ params: { id: 'missing-workspace' } }), detailRes)
    assert.strictEqual(detailRes.statusCode, 404, 'Expected missing workspace detail to return HTTP 404')
    assert(/not found/i.test(detailRes.jsonBody?.error || ''), 'Expected missing workspace detail guidance')

    const exportHandler = getRouteHandler('get', '/:id/export')
    const exportRes = makeRes()
    await exportHandler(makeReq({ params: { id: 'missing-workspace' } }), exportRes)
    assert.strictEqual(exportRes.statusCode, 404, 'Expected missing workspace export to return HTTP 404')
    assert(/not found/i.test(exportRes.jsonBody?.error || ''), 'Expected missing workspace export guidance')
  })

  await test('workspace patch route updates persisted metadata', async () => {
    const createHandler = getRouteHandler('post', '/')
    const createRes = makeRes()
    await createHandler(makeReq({
      body: {
        name: 'Gamma Workspace',
        path: path.join(tmpHome, 'gamma-workspace'),
        color: '#111111',
        tags: ['old'],
      },
    }), createRes)
    const workspaceId = createRes.jsonBody?.workspace?.id
    assert(workspaceId, 'Expected workspace id from create response')

    const patchHandler = getRouteHandler('patch', '/:id', false)
    const patchRes = makeRes()
    await patchHandler(makeReq({
      params: { id: workspaceId },
      body: {
        name: 'Gamma Workspace Updated',
        color: '#123456',
        tags: ['customer', 'priority'],
      },
    }), patchRes)
    assert.strictEqual(patchRes.statusCode, 200, 'Expected workspace patch success')
    assert.strictEqual(patchRes.jsonBody?.ok, true, 'Expected ok patch response')

    const detailHandler = getRouteHandler('get', '/:id', false)
    const detailRes = makeRes()
    await detailHandler(makeReq({ params: { id: workspaceId } }), detailRes)
    assert.strictEqual(detailRes.jsonBody?.workspace?.name, 'Gamma Workspace Updated', 'Expected updated name to persist')
    assert.strictEqual(detailRes.jsonBody?.workspace?.color, '#123456', 'Expected updated color to persist')
    assert.deepStrictEqual(detailRes.jsonBody?.workspace?.tags, ['customer', 'priority'], 'Expected updated tags to persist')
  })

  await test('workspace import route rejects empty ZIP payloads', async () => {
    const handler = getRouteHandler('post', '/import-zip')
    const res = makeRes()
    await handler(makeReq({ body: Buffer.alloc(0) }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected empty ZIP payload to return HTTP 400')
    assert(/ZIP body is required/i.test(res.jsonBody?.error || ''), 'Expected empty ZIP guidance')
  })

  await test('workspace dashboard create route validates title and normalizes defaults', async () => {
    const createWorkspaceHandler = getRouteHandler('post', '/')
    const createWorkspaceRes = makeRes()
    await createWorkspaceHandler(makeReq({
      body: {
        name: 'Dash Workspace',
        path: path.join(tmpHome, 'dash-workspace'),
      },
    }), createWorkspaceRes)
    const workspaceId = createWorkspaceRes.jsonBody?.workspace?.id
    assert(workspaceId, 'Expected dashboard workspace id')

    const missingTitleHandler = getRouteHandler('post', '/:id/dashboards', false)
    const missingTitleRes = makeRes()
    await missingTitleHandler(makeReq({ params: { id: workspaceId }, body: {} }), missingTitleRes)
    assert.strictEqual(missingTitleRes.statusCode, 400, 'Expected missing dashboard title to return HTTP 400')

    let capturedInput: any = null
    const handler = getRouteHandler('post', '/:id/dashboards', true, {
      workspaceDashboards: {
        createWorkspaceDashboard: (_workspaceId: string, input: any) => {
          capturedInput = input
          return { id: 'dash-1', ...input }
        },
      } as any,
    })
    const res = makeRes()
    await handler(makeReq({
      params: { id: workspaceId },
      body: {
        title: 'Ops Board',
        displayMode: 'unsupported-mode',
        companyFocusKind: 'bad-kind',
        companyFocusValue: 123,
        sections: 'invalid-sections',
        sectionOrder: 'invalid-order',
        compactColumns: 'invalid-columns',
      },
    }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected dashboard create success')
    assert.strictEqual(res.jsonBody?.dashboard?.id, 'dash-1', 'Expected dashboard payload')
    assert.strictEqual(capturedInput?.displayMode, 'standard', 'Expected display mode normalization')
    assert.strictEqual(capturedInput?.companyFocusKind, 'workspace', 'Expected focus kind normalization')
    assert.strictEqual(capturedInput?.companyFocusValue, null, 'Expected invalid focus value to normalize to null')
    assert.strictEqual(capturedInput?.sections, undefined, 'Expected invalid sections to be omitted')
    assert.strictEqual(capturedInput?.sectionOrder, undefined, 'Expected invalid section order to be omitted')
    assert.strictEqual(capturedInput?.compactColumns, undefined, 'Expected invalid compact columns to be omitted')
  })

  await test('workspace dashboard update, token regeneration, and delete return 404 when dashboard is missing', async () => {
    const createWorkspaceHandler = getRouteHandler('post', '/')
    const createWorkspaceRes = makeRes()
    await createWorkspaceHandler(makeReq({
      body: {
        name: 'Dash Missing Workspace',
        path: path.join(tmpHome, 'dash-missing-workspace'),
      },
    }), createWorkspaceRes)
    const workspaceId = createWorkspaceRes.jsonBody?.workspace?.id
    assert(workspaceId, 'Expected workspace id for dashboard 404 routes')

    const updateHandler = getRouteHandler('patch', '/:id/dashboards/:dashboardId', true, {
      workspaceDashboards: {
        updateWorkspaceDashboard: () => null,
      } as any,
    })
    const updateRes = makeRes()
    await updateHandler(makeReq({ params: { id: workspaceId, dashboardId: 'missing-dashboard' }, body: {} }), updateRes)
    assert.strictEqual(updateRes.statusCode, 404, 'Expected missing dashboard update to return HTTP 404')

    const tokenHandler = getRouteHandler('post', '/:id/dashboards/:dashboardId/regenerate-token', true, {
      workspaceDashboards: {
        regenerateWorkspaceDashboardToken: () => null,
      } as any,
    })
    const tokenRes = makeRes()
    await tokenHandler(makeReq({ params: { id: workspaceId, dashboardId: 'missing-dashboard' } }), tokenRes)
    assert.strictEqual(tokenRes.statusCode, 404, 'Expected missing dashboard token regeneration to return HTTP 404')

    const deleteHandler = getRouteHandler('delete', '/:id/dashboards/:dashboardId', true, {
      workspaceDashboards: {
        deleteWorkspaceDashboard: () => false,
      } as any,
    })
    const deleteRes = makeRes()
    await deleteHandler(makeReq({ params: { id: workspaceId, dashboardId: 'missing-dashboard' } }), deleteRes)
    assert.strictEqual(deleteRes.statusCode, 404, 'Expected missing dashboard delete to return HTTP 404')
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
