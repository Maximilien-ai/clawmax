/**
 * Workflow routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/workflows.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { createWorkflow } from '../lib/workflows'
import { resetWorkspaceManagerForTests } from '../lib/workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'workspace-under-test',
    workspaces: [{
      id: 'workspace-under-test',
      name: 'Workspace Under Test',
      path: workspacePath,
      createdAt: '2026-04-18T00:00:00.000Z',
      lastAccessedAt: '2026-04-18T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

function ensureWorkspaceScaffold(workspacePath: string) {
  fs.mkdirSync(path.join(workspacePath, 'AGENTS', 'archive'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'WORKFLOWS', 'executions'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n', 'utf-8')
}

function getRouter(overrides: {
  aiGenerator?: Partial<typeof import('../lib/ai-generator')>
  workflows?: Partial<typeof import('../lib/workflows')>
  notifications?: Partial<typeof import('../lib/notifications')>
} = {}) {
  const moduleOverrides: Array<[string, Record<string, any> | undefined]> = [
    ['../lib/ai-generator', overrides.aiGenerator as any],
    ['../lib/workflows', overrides.workflows as any],
    ['../lib/notifications', overrides.notifications as any],
  ]
  for (const [modulePath, patch] of moduleOverrides) {
    const resolved = require.resolve(modulePath)
    delete require.cache[resolved]
    if (patch) Object.assign(require(resolved), patch)
  }

  const routerPath = require.resolve('./workflows')
  delete require.cache[routerPath]
  return require('./workflows').default
}

function getRouteHandler(
  method: 'get' | 'post' | 'delete' | 'put',
  routePath: string,
  overrides: {
    aiGenerator?: Partial<typeof import('../lib/ai-generator')>
    workflows?: Partial<typeof import('../lib/workflows')>
    notifications?: Partial<typeof import('../lib/notifications')>
  } = {},
) {
  const router = getRouter(overrides)
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

function makeReq(params: Record<string, string>, overrides: Record<string, any> = {}) {
  return { params, query: {}, body: {}, headers: {}, ...overrides } as any
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

console.log(`\n${YELLOW}=== Workflow Routes Test Suite ===${RESET}\n`)

async function run() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-routes-test-'))
  const workspacePath = path.join(tmpHome, 'workspaces', 'workspace-under-test')
  ensureWorkspaceScaffold(workspacePath)
  writeWorkspaceRegistry(tmpHome, workspacePath)
  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath
  resetWorkspaceManagerForTests()

  await test('workflow execution archive routes use active workspace instead of default home workspace', async () => {
    const created = createWorkflow({
      name: 'Archive Route Test',
      description: 'Validate execution archive routes',
      schedule: 'manual',
      content: '# Test\nArchive me.',
      executionMode: 'managed',
      owner: 'test-owner',
      targeting: { agents: [], groups: [], tags: [], communities: [] },
    } as any)
    assert(!!(created.success && created.id), `Workflow should be created: ${created.error}`)

    const workflowId = created.id!
    const executionDir = path.join(workspacePath, 'WORKFLOWS', 'executions', workflowId)
    fs.mkdirSync(executionDir, { recursive: true })

    const execution = {
      id: 'exec-001',
      workflowId,
      startedAt: '2026-04-18T00:00:00.000Z',
      completedAt: '2026-04-18T00:01:00.000Z',
      status: 'completed',
      triggerType: 'manual',
      participants: [],
      logs: [],
    }
    fs.writeFileSync(path.join(executionDir, 'exec-001.json'), JSON.stringify(execution, null, 2), 'utf-8')

    const archiveHandler = getRouteHandler('post', '/:id/executions/:executionId/archive')
    const archivedListHandler = getRouteHandler('get', '/:id/executions/archived')
    const unarchiveHandler = getRouteHandler('post', '/:id/executions/:executionId/unarchive')
    const deleteHandler = getRouteHandler('delete', '/:id/executions/:executionId')

    let res = makeRes()
    await archiveHandler(makeReq({ id: workflowId, executionId: 'exec-001' }), res)
    assert(res.statusCode === 200, `Expected archive success, got ${res.statusCode}`)
    assert(!fs.existsSync(path.join(executionDir, 'exec-001.json')), 'Expected execution file moved out of main directory')
    assert(fs.existsSync(path.join(executionDir, 'archived', 'exec-001.json')), 'Expected archived execution in active workspace')

    res = makeRes()
    await archivedListHandler(makeReq({ id: workflowId }), res)
    assert(res.statusCode === 200, `Expected archived list success, got ${res.statusCode}`)
    assert(Array.isArray(res.jsonBody?.executions) && res.jsonBody.executions.length === 1, 'Expected one archived execution from active workspace')

    res = makeRes()
    await unarchiveHandler(makeReq({ id: workflowId, executionId: 'exec-001' }), res)
    assert(res.statusCode === 200, `Expected unarchive success, got ${res.statusCode}`)
    assert(fs.existsSync(path.join(executionDir, 'exec-001.json')), 'Expected execution restored to active workspace main directory')

    res = makeRes()
    await deleteHandler(makeReq({ id: workflowId, executionId: 'exec-001' }), res)
    assert(res.statusCode === 200, `Expected delete success, got ${res.statusCode}`)
    assert(!fs.existsSync(path.join(executionDir, 'exec-001.json')), 'Expected execution deleted from active workspace')
  })

  await test('workflow mutation routes reject invalid and missing workflow ids', async () => {
    const triggerHandler = getRouteHandler('post', '/:id/trigger')
    const updateHandler = getRouteHandler('put', '/:id')
    const participantsHandler = getRouteHandler('get', '/:id/participants')
    const progressHandler = getRouteHandler('post', '/:id/progress')
    const completeHandler = getRouteHandler('post', '/:id/complete')

    let res = makeRes()
    await triggerHandler(makeReq({ id: 'BAD ID' }), res)
    assert(res.statusCode === 400, `Expected invalid workflow id for trigger, got ${res.statusCode}`)

    res = makeRes()
    await updateHandler(makeReq({ id: 'BAD ID' }, { body: {} }), res)
    assert(res.statusCode === 400, `Expected invalid workflow id for update, got ${res.statusCode}`)

    res = makeRes()
    await participantsHandler(makeReq({ id: 'BAD ID' }), res)
    assert(res.statusCode === 400, `Expected invalid workflow id for participants, got ${res.statusCode}`)

    res = makeRes()
    await progressHandler(makeReq({ id: 'missing-workflow' }, { body: { progress: 25 } }), res)
    assert(res.statusCode === 404, `Expected missing workflow for progress, got ${res.statusCode}`)

    res = makeRes()
    await completeHandler(makeReq({ id: 'missing-workflow' }), res)
    assert(res.statusCode === 404, `Expected missing workflow for complete, got ${res.statusCode}`)
  })

  await test('workflow progress route validates progress bounds', async () => {
    const created = createWorkflow({
      name: 'Progress Route Test',
      description: 'Validate progress route guards',
      schedule: 'manual',
      content: '# Test\nProgress me.',
      executionMode: 'managed',
      owner: 'test-owner',
      targeting: { agents: [], groups: [], tags: [], communities: [] },
    } as any)
    assert(!!(created.success && created.id), `Workflow should be created: ${created.error}`)

    const workflowId = created.id!
    const progressHandler = getRouteHandler('post', '/:id/progress')

    let res = makeRes()
    await progressHandler(makeReq({ id: workflowId }, { body: { progress: 150 } }), res)
    assert(res.statusCode === 400, `Expected invalid progress >100 to return 400, got ${res.statusCode}`)

    res = makeRes()
    await progressHandler(makeReq({ id: workflowId }, { body: { progress: -1 } }), res)
    assert(res.statusCode === 400, `Expected invalid progress <0 to return 400, got ${res.statusCode}`)
  })

  await test('workflow creation route rejects invalid payloads', async () => {
    const createHandler = getRouteHandler('post', '/')
    const res = makeRes()
    await createHandler(makeReq({}, {
      body: {
        name: 'Broken Workflow',
      },
    }), res)
    assert(res.statusCode === 400, `Expected invalid workflow payload to return 400, got ${res.statusCode}`)
    assert(res.jsonBody?.error === 'Invalid workflow data', 'Expected invalid workflow data response')
  })

  await test('workflow import and generation routes validate required input', async () => {
    let res = makeRes()
    const importHandler = getRouteHandler('post', '/import-md')
    await importHandler(makeReq({}, { body: {} }), res)
    assert(res.statusCode === 400, `Expected missing markdown content to return 400, got ${res.statusCode}`)

    res = makeRes()
    await importHandler(makeReq({}, { body: { content: '# No frontmatter' } }), res)
    assert(res.statusCode === 400, `Expected invalid markdown import to return 400, got ${res.statusCode}`)

    const generateCronHandler = getRouteHandler('post', '/generate-cron')
    res = makeRes()
    await generateCronHandler(makeReq({}, { body: {} }), res)
    assert(res.statusCode === 400, `Expected missing cron text to return 400, got ${res.statusCode}`)

    const generateHandler = getRouteHandler('post', '/generate')
    res = makeRes()
    await generateHandler(makeReq({}, { body: {} }), res)
    assert(res.statusCode === 400, `Expected missing workflow description to return 400, got ${res.statusCode}`)
  })

  await test('generate-cron handles one-time schedule requests without returning a cron', async () => {
    const handler = getRouteHandler('post', '/generate-cron', {
      aiGenerator: {
        generateCronFromText: async () => ({ cron: '0 9 * * *', explanation: 'One-time event' }),
        isOneTimeScheduleRequest: () => true,
        explainOneTimeCronLimitation: () => 'One-time schedules are not supported by cron',
      } as any,
    })
    const res = makeRes()
    await handler(makeReq({}, { body: { text: 'Run this once tomorrow at 9am' } }), res)

    assert(res.statusCode === 200, `Expected one-time schedule request success response, got ${res.statusCode}`)
    assert(res.jsonBody?.valid === false, 'Expected one-time schedule response to be invalid for cron')
    assert(res.jsonBody?.cron === '', 'Expected one-time schedule response to omit cron')
  })

  await test('workflow list and detail routes expose generated metadata for valid workflows', async () => {
    const created = createWorkflow({
      name: 'Detail Route Test',
      description: 'Validate list and detail metadata',
      schedule: '0 9 * * *',
      content: '# Test\nDetails.',
      executionMode: 'managed',
      owner: 'test-owner',
      targeting: { agents: [], groups: [], tags: [], communities: [] },
      enabled: true,
      status: 'running',
      progress: 42,
      inputRefs: [{ workflowId: 'upstream', outputKey: 'brief' }],
    } as any)
    assert(!!(created.success && created.id), `Workflow should be created: ${created.error}`)

    const listHandler = getRouteHandler('get', '/')
    let res = makeRes()
    await listHandler(makeReq({}), res)
    assert(res.statusCode === 200, `Expected workflow list success, got ${res.statusCode}`)
    const listed = (res.jsonBody?.workflows || []).find((workflow: any) => workflow.id === created.id)
    assert(!!listed, 'Expected created workflow in list response')
    assert(typeof listed.scheduleHuman === 'string', 'Expected scheduleHuman in list response')
    assert('nextRunAt' in listed, 'Expected nextRunAt in list response')

    const detailHandler = getRouteHandler('get', '/:id')
    res = makeRes()
    await detailHandler(makeReq({ id: created.id! }), res)
    assert(res.statusCode === 200, `Expected workflow detail success, got ${res.statusCode}`)
    assert(res.jsonBody?.participantCount >= 0, 'Expected participant count in detail response')
    assert(Array.isArray(res.jsonBody?.resolvedParticipants), 'Expected resolved participants array')
  })

  await test('workflow detail and execution routes reject invalid or missing resources', async () => {
    const detailHandler = getRouteHandler('get', '/:id')
    let res = makeRes()
    await detailHandler(makeReq({ id: 'BAD ID' }), res)
    assert(res.statusCode === 400, `Expected invalid workflow id for detail, got ${res.statusCode}`)

    res = makeRes()
    await detailHandler(makeReq({ id: 'missing-workflow' }), res)
    assert(res.statusCode === 404, `Expected missing workflow detail to return 404, got ${res.statusCode}`)

    const executionsHandler = getRouteHandler('get', '/:id/executions')
    res = makeRes()
    await executionsHandler(makeReq({ id: 'missing-workflow' }), res)
    assert(res.statusCode === 404, `Expected missing workflow executions to return 404, got ${res.statusCode}`)

    const executionDetailHandler = getRouteHandler('get', '/:id/executions/:executionId')
    res = makeRes()
    await executionDetailHandler(makeReq({ id: 'missing-workflow', executionId: 'exec-1' }), res)
    assert(res.statusCode === 404, `Expected missing workflow execution detail to return 404, got ${res.statusCode}`)
  })

  await test('workflow archived executions route returns an empty list when nothing has been archived', async () => {
    const created = createWorkflow({
      name: 'Archived List Empty Test',
      description: 'Validate archived list empty state',
      schedule: 'manual',
      content: '# Test\nArchive list.',
      executionMode: 'managed',
      owner: 'test-owner',
      targeting: { agents: [], groups: [], tags: [], communities: [] },
    } as any)
    assert(!!(created.success && created.id), `Workflow should be created: ${created.error}`)

    const handler = getRouteHandler('get', '/:id/executions/archived')
    const res = makeRes()
    await handler(makeReq({ id: created.id! }), res)
    assert(res.statusCode === 200, `Expected archived executions list success, got ${res.statusCode}`)
    assert(Array.isArray(res.jsonBody?.executions) && res.jsonBody.executions.length === 0, 'Expected empty archived execution list')
  })

  await test('workflow dependencies route reports unmet and met dependencies', async () => {
    const workflowOverrides = {
      getWorkflow: (id: string) => {
        if (id === 'child') return { id: 'child', dependsOn: ['dep-done', 'dep-pending'] }
        if (id === 'dep-done') return { id: 'dep-done', name: 'Done Dependency', status: 'completed', progress: 100 }
        if (id === 'dep-pending') return { id: 'dep-pending', name: 'Pending Dependency', status: 'running', progress: 40 }
        return null
      },
    }
    const handler = getRouteHandler('get', '/:id/dependencies', { workflows: workflowOverrides as any })
    const res = makeRes()
    await handler(makeReq({ id: 'child' }), res)

    assert(res.statusCode === 200, `Expected dependencies route success, got ${res.statusCode}`)
    assert(res.jsonBody?.met === false, 'Expected dependencies to be unmet when one dependency is incomplete')
    assert(Array.isArray(res.jsonBody?.dependencies) && res.jsonBody.dependencies.length === 2, 'Expected dependency details for each dependency')
    assert(res.jsonBody.dependencies.some((entry: any) => entry.id === 'dep-done' && entry.met === true), 'Expected completed dependency to be marked met')
    assert(res.jsonBody.dependencies.some((entry: any) => entry.id === 'dep-pending' && entry.met === false), 'Expected incomplete dependency to be marked unmet')
  })

  await test('workflow blocker route validates required fields and emits structured choice actions', async () => {
    let createdNotification: any = null
    const handler = getRouteHandler('post', '/:id/blocker', {
      workflows: {
        getWorkflow: (id: string) => id === 'wf-blocked' ? { id, name: 'Blocked Workflow' } : null,
        updateWorkflow: () => ({ success: true }),
      } as any,
      notifications: {
        createNotification: (payload: any) => { createdNotification = payload },
      } as any,
    })

    let res = makeRes()
    await handler(makeReq({ id: 'wf-blocked' }, { body: { agentId: '', blockerType: '', title: '' } }), res)
    assert(res.statusCode === 400, `Expected missing blocker fields to return 400, got ${res.statusCode}`)

    res = makeRes()
    await handler(makeReq({ id: 'wf-blocked' }, {
      body: {
        agentId: 'agent-1',
        blockerType: 'choice',
        title: 'Pick a rollout plan',
        message: 'Choose one',
        options: ['Option A', 'Option B'],
      },
    }), res)
    assert(res.statusCode === 200, `Expected blocker route success, got ${res.statusCode}`)
    assert(res.jsonBody?.ok === true, 'Expected blocker response ok')
    assert(createdNotification, 'Expected blocker notification to be created')
    assert(createdNotification.type === 'workflow-blocked', 'Expected workflow-blocked notification type')
    assert(
      JSON.stringify(createdNotification.actions) === JSON.stringify([
        { type: 'choose', label: 'Option A', value: 'Option A' },
        { type: 'choose', label: 'Option B', value: 'Option B' },
      ]),
      'Expected choice blocker actions to be created'
    )
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  resetWorkspaceManagerForTests()

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
