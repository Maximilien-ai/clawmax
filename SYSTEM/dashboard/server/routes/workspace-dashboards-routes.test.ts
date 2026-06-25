/**
 * Workspace dashboard routes contract test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/workspace-dashboards-routes.test.ts
 */

import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

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

  await test('workspace dashboard token route applies team company focus to agents workflows chats and notifications', async () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-dashboard-scope-'))
    fs.mkdirSync(path.join(workspaceRoot, 'ORG'), { recursive: true })
    fs.writeFileSync(path.join(workspaceRoot, 'ORG', 'GROUPS.md'), '# Groups\n', 'utf-8')
    fs.writeFileSync(path.join(workspaceRoot, 'ORG', 'COMMUNITIES.md'), '# Communities\n', 'utf-8')
    const artifactPath = path.join(workspaceRoot, 'SYSTEM', 'docs', 'TEAM_REPORT.md')
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
    fs.writeFileSync(artifactPath, '# Team report\n', 'utf-8')

    const router = loadRouter({
      workspaceDashboards: {
        getWorkspaceDashboardByToken: () => ({
          id: 'dash-team',
          workspaceId: 'workspace-1',
          title: 'Research Board',
          token: 'token-team',
          companyFocusKind: 'team',
          companyFocusValue: 'research-team',
          companyFocusLabel: 'Research Team',
        }),
      } as any,
      workspaceManager: {
        getWorkspaceManager: () => ({
          getWorkspace: () => ({
            id: 'workspace-1',
            name: 'Demo Workspace',
            color: '#2563EB',
            path: workspaceRoot,
          }),
          withWorkspace: async (_workspaceId: string, fn: Function) => fn(),
        }),
      } as any,
      workspace: {
        listAgents: () => [
          { id: 'agent-1', name: 'Lead', status: 'online', paused: false, archived: false, lastHeartbeat: '2026-06-01T00:00:00.000Z' },
          { id: 'agent-2', name: 'Analyst', status: 'online', paused: true, archived: false, lastHeartbeat: '2026-06-01T00:00:00.000Z' },
          { id: 'agent-3', name: 'Outside', status: 'online', paused: false, archived: false, lastHeartbeat: '2026-06-01T00:00:00.000Z' },
        ],
        parseGroups: () => ({
          groups: [{ name: 'Research Team', description: 'Scoped group', community: null, channels: ['slack'] }],
          communities: [{ name: 'Research Hub', description: 'Scoped community', channels: ['discord'] }],
        }),
        parseGroupsWithMembers: () => ({
          groups: [{
            name: 'Research Team',
            description: 'Scoped group',
            community: null,
            channels: ['slack'],
            members: [{ id: 'agent-1' }, { id: 'agent-2' }],
          }],
          communities: [{
            name: 'Research Hub',
            description: 'Scoped community',
            channels: ['discord'],
            members: [{ id: 'agent-1' }, { id: 'agent-2' }],
          }],
        }),
      } as any,
      budget: {
        getBudgetStatus: async () => ({ totalBudgetUsd: 100, remainingBudgetUsd: 60 }),
      } as any,
      metering: {
        getWorkspaceMetering: async () => ({
          estimatedCostUsd: 30,
          totalTraces: 7,
          dailyCost: [],
          costSummary: [],
          byAgent: [
            { agentId: 'agent-1', estimatedCostUsd: 10 },
            { agentId: 'agent-2', estimatedCostUsd: 5 },
            { agentId: 'agent-3', estimatedCostUsd: 15 },
          ],
          byWorkflow: [
            { workflowId: 'workflow-1', estimatedCostUsd: 9 },
            { workflowId: 'workflow-2', estimatedCostUsd: 12 },
          ],
        }),
      } as any,
      notifications: {
        getActiveNotifications: () => [
          { id: 'note-agent', entityType: 'agent', entityId: 'agent-1', severity: 'critical' },
          { id: 'note-workflow', entityType: 'workflow', entityId: 'workflow-1', workflowId: 'workflow-1', severity: 'warning' },
          { id: 'note-external', entityType: 'agent', entityId: 'agent-3', severity: 'critical' },
        ],
      } as any,
      workflows: {
        listWorkflows: () => [
          {
            id: 'workflow-1',
            name: 'Research Team · Daily Sync / Brief',
            description: `Review ${artifactPath} and https://example.com/report`,
            content: '## Project Configuration\n- Goal: Review blockers',
            enabled: true,
            schedule: '0 9 * * *',
            status: 'running',
            owner: 'agent-1',
            targeting: { teamIds: ['research-team'], groups: ['Research Team'] },
            inputRefs: [{ workflowId: 'upstream-1', outputKey: 'brief', label: 'Brief' }],
          },
          {
            id: 'workflow-2',
            name: 'Other Team · Daily Sync / Brief',
            description: 'Unrelated workflow',
            content: '',
            enabled: true,
            schedule: '0 10 * * *',
            status: 'idle',
            owner: 'agent-3',
            targeting: { teamIds: ['other-team'] },
            inputRefs: [],
          },
        ],
        listExecutions: (workflowId: string) => workflowId === 'workflow-1'
          ? [{
              id: 'exec-1',
              startedAt: '2026-06-01T10:00:00.000Z',
              completedAt: '2026-06-01T10:05:00.000Z',
              status: 'completed',
              triggerType: 'schedule',
              logs: ['Execution log line', `Artifact written to ${artifactPath}`],
              participants: [{ response: 'Shared results in https://example.com/report' }],
            }]
          : [],
        resolveWorkflowInputRefs: () => [{
          workflowId: 'upstream-1',
          label: 'Brief',
          outputKey: 'brief',
          summary: 'Upstream brief',
          artifactPath,
          missing: false,
        }],
      } as any,
      cron: {
        getNextCronRun: () => new Date('2026-06-02T09:00:00.000Z'),
      } as any,
      messages: {
        getMessages: (kind: string, name: string) => {
          if (kind === 'group' && name === 'Research Team') {
            return [{ from: 'agent-1', content: 'Team update', timestamp: 5 }]
          }
          if (kind === 'community' && name === 'Research Hub') {
            return [{ from: 'agent-2', content: 'Community update', timestamp: 4 }]
          }
          return []
        },
      } as any,
      teams: {
        listTeams: () => [{
          id: 'research-team',
          name: 'Research Team',
          leaderAgentId: 'agent-1',
          memberAgentIds: ['agent-2'],
          parentTeamId: null,
          purpose: 'Research focus',
          tags: [],
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }],
      } as any,
    })
    const handler = getRouteHandler(router, 'get', '/:token')
    const res = makeRes()
    await handler(makeReq({ params: { token: 'token-team' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected team-scoped workspace dashboard payload success')
    assert.strictEqual(res.jsonBody?.overview?.totalAgents, 2, 'Expected only team agents in overview')
    assert.strictEqual(res.jsonBody?.overview?.failingAgents, 1, 'Expected only scoped critical agent notifications')
    assert.strictEqual(res.jsonBody?.company?.kind, 'team', 'Expected team company scope')
    assert.strictEqual(res.jsonBody?.company?.label, 'Research Team', 'Expected company label to persist')
    assert.strictEqual(res.jsonBody?.company?.workflowCount, 1, 'Expected only scoped workflow count')
    assert.strictEqual(res.jsonBody?.company?.handoffs?.[0]?.workflowId, 'workflow-1', 'Expected scoped workflow handoff')
    assert.deepStrictEqual(res.jsonBody?.agents?.map((agent: any) => agent.id), ['agent-1', 'agent-2'], 'Expected only scoped agents')
    assert.strictEqual(res.jsonBody?.notifications?.length, 2, 'Expected only scoped notifications')
    assert.strictEqual(res.jsonBody?.workflows?.length, 1, 'Expected only scoped workflows')
    assert.strictEqual(res.jsonBody?.workflows?.[0]?.resultArtifacts?.length, 2, 'Expected normalized artifacts for scoped workflow')
    assert.strictEqual(res.jsonBody?.groupChats?.length, 2, 'Expected scoped chats to include group and community')
    assert.strictEqual(res.jsonBody?.costs?.metering?.totalCostUsd, 15, 'Expected scoped metering total to sum scoped agents')
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
