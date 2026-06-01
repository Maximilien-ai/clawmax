/**
 * Notifications routes contract test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/notifications-routes.test.ts
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

const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalHome = process.env.HOME

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

function getRouteHandler(method: 'get' | 'post', routePath: string) {
  delete require.cache[require.resolve('./notifications')]
  const router = require('./notifications').default
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
  console.log(`\n${YELLOW}=== Notifications Routes Test Suite ===${RESET}\n`)

  const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-notifications-routes-'))
  const tmpHome = path.join(tmpWorkspace, 'home')
  ensureWorkspaceScaffold(tmpWorkspace)
  fs.mkdirSync(path.join(tmpHome, '.openclaw'), { recursive: true })
  process.env.OPENCLAW_WORKSPACE = tmpWorkspace
  process.env.HOME = tmpHome

  const { createNotification } = require('../lib/notifications')

  await test('notifications list returns grouped counts for active notifications', async () => {
    createNotification({
      type: 'workflow-failed',
      title: 'Workflow failed',
      message: 'Latest execution failed.',
      entityId: 'wf-1',
      entityType: 'workflow',
      fingerprint: 'workflow-failed:wf-1',
    })
    createNotification({
      type: 'cost-warning',
      title: 'Budget warning',
      message: 'Workspace is approaching budget.',
      entityId: 'budget',
      entityType: 'budget',
      fingerprint: 'cost-warning:budget',
    })

    const handler = getRouteHandler('get', '/')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected notifications list success')
    assert.strictEqual(res.jsonBody?.activeCount, 2, 'Expected two active notifications')
    assert.strictEqual(res.jsonBody?.criticalCount, 1, 'Expected one critical notification')
    assert.strictEqual(res.jsonBody?.warningCount, 1, 'Expected one warning notification')
  })

  await test('dismiss route validates required id and can dismiss grouped notifications', async () => {
    const listHandler = getRouteHandler('get', '/')
    const dismissHandler = getRouteHandler('post', '/dismiss')

    const invalidRes = makeRes()
    await dismissHandler(makeReq({ body: {} }), invalidRes)
    assert.strictEqual(invalidRes.statusCode, 400, 'Expected missing dismiss id to return HTTP 400')

    const n1 = createNotification({
      type: 'artifact-update',
      title: 'agent-a updated brief.md',
      message: 'Updated workspace artifact from agent-a: AGENTS/agent-a/brief.md',
      entityId: 'agent-a',
      entityType: 'agent',
      fingerprint: 'artifact-group:a',
    })
    const n2 = createNotification({
      type: 'artifact-update',
      title: 'agent-b updated brief.md',
      message: 'Updated workspace artifact from agent-b: AGENTS/agent-b/brief.md',
      entityId: 'agent-b',
      entityType: 'agent',
      fingerprint: 'artifact-group:b',
    })
    assert(n1 && n2, 'Expected grouped notifications to be created')

    const groupedRes = makeRes()
    await listHandler(makeReq(), groupedRes)
    const grouped = (groupedRes.jsonBody?.notifications || []).find((notification: any) => notification.grouped)
    assert(grouped, 'Expected grouped notification in list')

    const dismissRes = makeRes()
    await dismissHandler(makeReq({
      body: { id: grouped.id, groupedIds: grouped.groupedIds },
    }), dismissRes)
    assert.strictEqual(dismissRes.statusCode, 200, 'Expected grouped dismiss success')
    assert.strictEqual(dismissRes.jsonBody?.ok, true, 'Expected grouped dismiss ok response')
  })

  await test('dismiss-all clears all active notifications', async () => {
    createNotification({
      type: 'agent-offline',
      title: 'Agent offline',
      message: 'Agent stopped responding.',
      entityId: 'agent-c',
      entityType: 'agent',
      fingerprint: 'agent-offline:agent-c',
    })

    const dismissAllHandler = getRouteHandler('post', '/dismiss-all')
    const res = makeRes()
    await dismissAllHandler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected dismiss-all success')
    assert.strictEqual(res.jsonBody?.ok, true, 'Expected dismiss-all ok response')
    assert((res.jsonBody?.dismissed || 0) >= 1, 'Expected at least one notification to be dismissed')
  })

  await test('action route validates action and resolves actionable notifications', async () => {
    const actionHandler = getRouteHandler('post', '/:id/action')

    const missingActionRes = makeRes()
    await actionHandler(makeReq({
      params: { id: 'anything' },
      body: {},
    }), missingActionRes)
    assert.strictEqual(missingActionRes.statusCode, 400, 'Expected missing action to return HTTP 400')

    const actionable = createNotification({
      type: 'agent-needs-decision',
      title: 'Decision needed',
      message: 'Choose the next path.',
      entityId: 'agent-z',
      entityType: 'agent',
      fingerprint: 'decision:agent-z',
      workflowId: 'wf-decision',
      actions: [{ type: 'choose', label: 'Choose', value: 'ship-it' }],
      blockerType: 'choice',
      blockerOptions: ['ship-it', 'hold'],
    })
    assert(actionable, 'Expected actionable notification to be created')

    const actionRes = makeRes()
    await actionHandler(makeReq({
      params: { id: actionable.id },
      body: { action: 'choose', value: 'ship-it' },
    }), actionRes)
    assert.strictEqual(actionRes.statusCode, 200, 'Expected notification action success')
    assert.strictEqual(actionRes.jsonBody?.ok, true, 'Expected action resolution ok response')
  })

  await test('workflow blockers route returns unresolved workflow blockers', async () => {
    createNotification({
      type: 'workflow-blocked',
      title: 'Blocked waiting for approval',
      message: 'Workflow cannot proceed.',
      entityId: 'wf-blocked',
      entityType: 'workflow',
      fingerprint: 'blocker:wf-blocked',
      workflowId: 'wf-blocked',
      blockerType: 'approval',
    })

    const handler = getRouteHandler('get', '/blockers/:workflowId')
    const res = makeRes()
    await handler(makeReq({ params: { workflowId: 'wf-blocked' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected blockers route success')
    assert.strictEqual(res.jsonBody?.count, 1, 'Expected one unresolved blocker')
    assert.strictEqual((res.jsonBody?.blockers || [])[0]?.workflowId, 'wf-blocked', 'Expected blocker to match workflow')
  })

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome

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
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  console.error(err)
  process.exit(1)
})
