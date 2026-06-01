/**
 * Teams routes contract test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/teams-routes.test.ts
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
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n', 'utf-8')
}

function getRouteHandler(method: 'get' | 'post' | 'patch' | 'delete', routePath: string) {
  delete require.cache[require.resolve('./teams')]
  const router = require('./teams').default
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
    ended: false,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
    end() {
      this.ended = true
      return this
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Teams Routes Test Suite ===${RESET}\n`)

  const tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-teams-routes-'))
  const tmpHome = path.join(tmpWorkspace, 'home')
  ensureWorkspaceScaffold(tmpWorkspace)
  fs.mkdirSync(path.join(tmpHome, '.openclaw'), { recursive: true })
  process.env.OPENCLAW_WORKSPACE = tmpWorkspace
  process.env.HOME = tmpHome

  await test('teams list returns an empty array for a fresh workspace', async () => {
    const handler = getRouteHandler('get', '/')
    const res = makeRes()
    await handler(makeReq(), res)
    assert.strictEqual(res.statusCode, 200, 'Expected teams list success')
    assert.deepStrictEqual(res.jsonBody?.teams || [], [], 'Expected no teams in a fresh workspace')
  })

  await test('team create, get, update, and delete routes work end-to-end', async () => {
    const createHandler = getRouteHandler('post', '/')
    const getHandler = getRouteHandler('get', '/:id')
    const patchHandler = getRouteHandler('patch', '/:id')
    const deleteHandler = getRouteHandler('delete', '/:id')

    let res = makeRes()
    await createHandler(makeReq({
      body: {
        name: 'Research Team',
        purpose: 'Research new markets',
        tags: ['research'],
      },
    }), res)
    assert.strictEqual(res.statusCode, 201, 'Expected team create success')
    const createdId = res.jsonBody?.id
    assert(createdId, 'Expected created team id')

    res = makeRes()
    await getHandler(makeReq({ params: { id: createdId } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected get team success')
    assert.strictEqual(res.jsonBody?.name, 'Research Team', 'Expected created team name')

    res = makeRes()
    await patchHandler(makeReq({
      params: { id: createdId },
      body: {
        name: 'Research Squad',
        tags: ['research', 'strategy'],
      },
    }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected patch team success')
    assert.strictEqual(res.jsonBody?.name, 'Research Squad', 'Expected updated team name')

    res = makeRes()
    await deleteHandler(makeReq({ params: { id: createdId } }), res)
    assert.strictEqual(res.statusCode, 204, 'Expected delete team success')
    assert.strictEqual(res.ended, true, 'Expected delete route to end the response')
  })

  await test('teams routes return 404 for missing team ids', async () => {
    const getHandler = getRouteHandler('get', '/:id')
    const patchHandler = getRouteHandler('patch', '/:id')
    const deleteHandler = getRouteHandler('delete', '/:id')

    let res = makeRes()
    await getHandler(makeReq({ params: { id: 'missing-team' } }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing team get to return HTTP 404')

    res = makeRes()
    await patchHandler(makeReq({ params: { id: 'missing-team' }, body: { name: 'Nope' } }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing team patch to return HTTP 404')

    res = makeRes()
    await deleteHandler(makeReq({ params: { id: 'missing-team' } }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing team delete to return HTTP 404')
  })

  await test('team create rejects invalid payloads and unknown references', async () => {
    const createHandler = getRouteHandler('post', '/')

    let res = makeRes()
    await createHandler(makeReq({ body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing team name to return HTTP 400')

    res = makeRes()
    await createHandler(makeReq({
      body: {
        name: 'Broken Team',
        leaderAgentId: 'missing-agent',
      },
    }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected unknown leader to return HTTP 400')
    assert(/Unknown leader agent/i.test(res.jsonBody?.error || ''), 'Expected unknown leader guidance')
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
