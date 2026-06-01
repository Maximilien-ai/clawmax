/**
 * Workflow routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/workflows.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import router from './workflows'
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

function getRouteHandler(method: 'get' | 'post' | 'delete' | 'put', routePath: string) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
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
