/**
 * Workspace dashboard routes contract test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/workspace-dashboards-routes.test.ts
 */

import assert from 'assert'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

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
  workspaceManager?: Partial<typeof import('../lib/workspace-manager')>
  workspace?: Partial<typeof import('../lib/workspace')>
  budget?: Partial<typeof import('../lib/budget')>
  metering?: Partial<typeof import('../lib/metering')>
  notifications?: Partial<typeof import('../lib/notifications')>
  workflows?: Partial<typeof import('../lib/workflows')>
  cron?: Partial<typeof import('../lib/cron-next-run')>
  messages?: Partial<typeof import('../lib/messages')>
  teams?: Partial<typeof import('../lib/teams')>
} = {}) {
  const moduleOverrides: Array<[string, Record<string, any> | undefined]> = [
    ['../lib/workspace-dashboards', overrides.workspaceDashboards],
    ['../lib/workspace-manager', overrides.workspaceManager],
    ['../lib/workspace', overrides.workspace],
    ['../lib/budget', overrides.budget],
    ['../lib/metering', overrides.metering],
    ['../lib/notifications', overrides.notifications],
    ['../lib/workflows', overrides.workflows],
    ['../lib/cron-next-run', overrides.cron],
    ['../lib/messages', overrides.messages],
    ['../lib/teams', overrides.teams],
  ]

  for (const [modulePath, patch] of moduleOverrides) {
    const resolved = require.resolve(modulePath)
    delete require.cache[resolved]
    if (patch) Object.assign(require(resolved), patch)
  }

  const routePath = require.resolve('./workspace-dashboards')
  delete require.cache[routePath]
  return require(routePath).default
}

function getRouteHandler(router: any, method: 'get', routePath: string) {
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
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
  console.log(`\n${YELLOW}=== Workspace Dashboard Routes Test Suite ===${RESET}\n`)

  await test('workspace dashboard token route returns 404 for unknown dashboard token', async () => {
    const router = loadRouter({
      workspaceDashboards: {
        getWorkspaceDashboardByToken: () => null,
      } as any,
    })
    const handler = getRouteHandler(router, 'get', '/:token')
    const res = makeRes()
    await handler(makeReq({ params: { token: 'missing-token' } }), res)

    assert.strictEqual(res.statusCode, 404, 'Expected missing token to return HTTP 404')
    assert.strictEqual(res.jsonBody?.error, 'Workspace dashboard not found', 'Expected missing dashboard guidance')
  })

  await test('workspace dashboard token route returns 404 when workspace no longer exists', async () => {
    const router = loadRouter({
      workspaceDashboards: {
        getWorkspaceDashboardByToken: () => ({
          id: 'dash-1',
          workspaceId: 'missing-workspace',
          title: 'Ops Board',
          token: 'token-1',
          companyFocusKind: 'workspace',
          companyFocusValue: null,
          companyFocusLabel: null,
        }),
      } as any,
      workspaceManager: {
        getWorkspaceManager: () => ({
          getWorkspace: () => null,
        }),
      } as any,
    })
    const handler = getRouteHandler(router, 'get', '/:token')
    const res = makeRes()
    await handler(makeReq({ params: { token: 'token-1' } }), res)

    assert.strictEqual(res.statusCode, 404, 'Expected missing workspace to return HTTP 404')
    assert.strictEqual(res.jsonBody?.error, 'Workspace not found', 'Expected missing workspace guidance')
  })

  await test('workspace dashboard token route returns a workspace payload snapshot', async () => {
    const router = loadRouter({
      workspaceDashboards: {
        getWorkspaceDashboardByToken: () => ({
          id: 'dash-1',
          workspaceId: 'workspace-1',
          title: 'Ops Board',
          token: 'token-1',
          companyFocusKind: 'workspace',
          companyFocusValue: null,
          companyFocusLabel: null,
        }),
      } as any,
      workspaceManager: {
        getWorkspaceManager: () => ({
          getWorkspace: () => ({
            id: 'workspace-1',
            name: 'Demo Workspace',
            color: '#2563EB',
            path: '/tmp/demo-workspace',
          }),
          withWorkspace: async (_workspaceId: string, fn: Function) => fn(),
        }),
      } as any,
      workspace: {
        listAgents: () => [{
          id: 'agent-1',
          name: 'Agent One',
          status: 'online',
          paused: false,
          archived: false,
          lastHeartbeat: '2026-06-01T00:00:00.000Z',
        }],
        parseGroups: () => ({ groups: [], communities: [] }),
        parseGroupsWithMembers: () => ({ groups: [], communities: [] }),
      } as any,
      budget: {
        getBudgetStatus: async () => ({ totalBudgetUsd: 100, remainingBudgetUsd: 80 }),
      } as any,
      metering: {
        getWorkspaceMetering: async () => ({
          estimatedCostUsd: 12.5,
          totalTraces: 3,
          dailyCost: [],
          costSummary: [],
          byAgent: [{ agentId: 'agent-1', estimatedCostUsd: 12.5 }],
          byWorkflow: [],
        }),
      } as any,
      notifications: {
        getActiveNotifications: () => [{ id: 'note-1', entityType: 'agent', entityId: 'agent-1', severity: 'info' }],
      } as any,
      workflows: {
        listWorkflows: () => [],
        listExecutions: () => [],
        resolveWorkflowInputRefs: () => [],
      } as any,
      cron: {
        getNextCronRun: () => null,
      } as any,
      messages: {
        getMessages: () => [],
      } as any,
      teams: {
        listTeams: () => [],
      } as any,
    })
    const handler = getRouteHandler(router, 'get', '/:token')
    const res = makeRes()
    await handler(makeReq({ params: { token: 'token-1' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected workspace dashboard payload success')
    assert.strictEqual(res.jsonBody?.dashboard?.id, 'dash-1', 'Expected dashboard metadata in payload')
    assert.strictEqual(res.jsonBody?.workspace?.id, 'workspace-1', 'Expected workspace metadata in payload')
    assert.strictEqual(res.jsonBody?.overview?.totalAgents, 1, 'Expected scoped agent count in overview')
    assert.strictEqual(res.jsonBody?.costs?.metering?.totalCostUsd, 12.5, 'Expected metering total in payload')
    assert.strictEqual(res.jsonBody?.agents?.[0]?.id, 'agent-1', 'Expected agent snapshot in payload')
  })

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
  console.error(err)
  process.exit(1)
})
