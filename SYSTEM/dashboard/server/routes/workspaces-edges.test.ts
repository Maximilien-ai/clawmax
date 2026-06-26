import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
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

function loadRouter(overrides: {
  workspaceDashboards?: Partial<typeof import('../lib/workspace-dashboards')>
  workspaceImport?: Partial<typeof import('../lib/workspace-import')>
  teams?: Partial<typeof import('../lib/teams')>
  workflows?: Partial<typeof import('../lib/workflows')>
  scheduler?: Partial<typeof import('../lib/scheduler')>
  workspaceDashboardsRoute?: Partial<typeof import('./workspace-dashboards')>
} = {}) {
  const moduleOverrides: Array<[string, Record<string, any> | undefined]> = [
    ['../lib/workspace-dashboards', overrides.workspaceDashboards],
    ['../lib/workspace-import', overrides.workspaceImport],
    ['../lib/teams', overrides.teams],
    ['../lib/workflows', overrides.workflows],
    ['../lib/scheduler', overrides.scheduler],
    ['./workspace-dashboards', overrides.workspaceDashboardsRoute],
  ]

  for (const [modulePath, patch] of moduleOverrides) {
    const resolved = require.resolve(modulePath)
    delete require.cache[resolved]
    if (patch) Object.assign(require(resolved), patch)
  }

  resetWorkspaceManagerForTests()
  const routePath = require.resolve('./workspaces')
  delete require.cache[routePath]
  return require(routePath).default
}

function getRouteHandler(
  method: 'get' | 'post',
  routePath: string,
  overrides: Parameters<typeof loadRouter>[0] = {},
) {
  const router = loadRouter(overrides)
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

async function createWorkspace(tmpHome: string, name: string, dirName: string) {
  const handler = getRouteHandler('post', '/')
  const res = makeRes()
  await handler(makeReq({
    body: {
      name,
      path: path.join(tmpHome, dirName),
    },
  }), res)
  assert.strictEqual(res.statusCode, 200, 'Expected workspace create success')
  return res.jsonBody.workspace
}

async function run() {
  console.log(`\n${YELLOW}=== Workspaces Route Edge Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspaces-edges-home-'))
  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = path.join(tmpHome, 'workspace-default')

  await test('workspace dashboard context route returns 404 for missing workspace ids', async () => {
    const handler = getRouteHandler('get', '/:id/dashboards/context')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'missing-workspace' } }), res)
    assert.strictEqual(res.statusCode, 404)
    assert(/not found/i.test(res.jsonBody?.error || ''))
  })

  await test('workspace dashboard context route builds companies inside the requested workspace', async () => {
    const workspace = await createWorkspace(tmpHome, 'Research Workspace', 'research-workspace')
    let seenTeams = 0
    let seenWorkflows = 0
    let withWorkspaceId = ''
    const handler = getRouteHandler('get', '/:id/dashboards/context', {
      teams: {
        listTeams: () => [{ id: 'research-team', name: 'Research Team' }],
      } as any,
      workflows: {
        listWorkflows: () => [{ id: 'daily-brief', name: 'Daily Brief' }],
      } as any,
      workspaceDashboardsRoute: {
        inferWorkspaceDashboardCompanies: ({ teams, workflows }: any) => {
          seenTeams = teams.length
          seenWorkflows = workflows.length
          return [{ kind: 'team', value: 'research-team', label: 'Research Team' }]
        },
      } as any,
    })
    const res = makeRes()
    const workspaceManager = require('../lib/workspace-manager').getWorkspaceManager()
    const originalWithWorkspace = workspaceManager.withWorkspace.bind(workspaceManager)
    workspaceManager.withWorkspace = async (workspaceId: string, fn: Function) => {
      withWorkspaceId = workspaceId
      return originalWithWorkspace(workspaceId, fn)
    }
    try {
      await handler(makeReq({ params: { id: workspace.id } }), res)
    } finally {
      workspaceManager.withWorkspace = originalWithWorkspace
    }
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(withWorkspaceId, workspace.id)
    assert.strictEqual(seenTeams, 1)
    assert.strictEqual(seenWorkflows, 1)
    assert.deepStrictEqual(res.jsonBody?.companies, [
      { kind: 'team', value: 'research-team', label: 'Research Team' },
    ])
  })

  await test('workspace import route persists ZIP uploads and forwards override options', async () => {
    let capturedZipPath = ''
    let capturedOptions: any = null
    const handler = getRouteHandler('post', '/import-zip', {
      workspaceImport: {
        importWorkspaceFromZipArchive: (zipPath: string, options: any) => {
          capturedZipPath = zipPath
          capturedOptions = options
          return {
            workspace: { id: 'imported-workspace', name: 'Imported Workspace' },
          }
        },
      } as any,
    })
    const res = makeRes()
    const zipBody = Buffer.from('PK\x03\x04demo-zip')
    await handler(makeReq({
      query: {
        targetName: 'Imported Workspace',
        targetPath: '/tmp/import-target',
        activate: 'false',
      },
      body: zipBody,
    }), res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.jsonBody?.ok, true)
    assert.strictEqual(res.jsonBody?.workspace?.id, 'imported-workspace')
    assert(capturedZipPath.endsWith('/workspace.zip'))
    assert(fs.existsSync(capturedZipPath), 'Expected uploaded zip to be written to disk')
    assert.deepStrictEqual(capturedOptions, {
      targetName: 'Imported Workspace',
      targetPath: '/tmp/import-target',
      activate: false,
    })
  })

  await test('workspace import route returns importer failures as HTTP 500', async () => {
    const handler = getRouteHandler('post', '/import-zip', {
      workspaceImport: {
        importWorkspaceFromZipArchive: () => {
          throw new Error('Archive contents are invalid')
        },
      } as any,
    })
    const res = makeRes()
    await handler(makeReq({
      body: Buffer.from('PK\x03\x04demo-zip'),
    }), res)
    assert.strictEqual(res.statusCode, 500)
    assert.strictEqual(res.jsonBody?.error, 'Archive contents are invalid')
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
