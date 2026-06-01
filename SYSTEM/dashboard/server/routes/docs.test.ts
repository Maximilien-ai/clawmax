/**
 * Docs routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/docs.test.ts
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
const originalTestWorkspace = process.env.CLAWMAX_TEST_WORKSPACE

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

function getRouteHandler(method: 'get' | 'post', routePath: string) {
  resetWorkspaceManagerForTests()
  delete require.cache[require.resolve('../lib/workspace')]
  delete require.cache[require.resolve('./docs')]
  const router = require('./docs').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    header(name: string) {
      return (this.headers || {})[name.toLowerCase()]
    },
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
  console.log(`\n${YELLOW}=== Docs Routes Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-docs-routes-home-'))
  const workspacePath = path.join(tmpHome, 'workspace')
  ensureWorkspaceScaffold(workspacePath)
  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath
  process.env.CLAWMAX_TEST_WORKSPACE = workspacePath
  resetWorkspaceManagerForTests()

  fs.writeFileSync(path.join(workspacePath, 'SYSTEM', 'notes.md'), '# Notes\n\nAlpha project status\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'SYSTEM', 'runtime.log'), 'gateway ready\nline two\n', 'utf-8')

  await test('content route rejects missing path', async () => {
    const handler = getRouteHandler('get', '/content')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing path to return HTTP 400')
    assert(/path query param required/i.test(res.jsonBody?.error || ''), 'Expected missing path guidance')
  })

  await test('content route returns markdown and text previews by file type', async () => {
    const handler = getRouteHandler('get', '/content')

    const mdRes = makeRes()
    await handler(makeReq({ query: { path: 'SYSTEM/notes.md' } }), mdRes)
    assert.strictEqual(mdRes.statusCode, 200, 'Expected markdown fetch success')
    assert.strictEqual(mdRes.jsonBody?.kind, 'markdown', 'Expected markdown kind')
    assert(/Alpha project status/.test(mdRes.jsonBody?.content || ''), 'Expected markdown content')

    const textRes = makeRes()
    await handler(makeReq({ query: { path: 'SYSTEM/runtime.log' } }), textRes)
    assert.strictEqual(textRes.statusCode, 200, 'Expected text fetch success')
    assert.strictEqual(textRes.jsonBody?.kind, 'text', 'Expected text kind')
    assert(/gateway ready/.test(textRes.jsonBody?.content || ''), 'Expected text file content')
  })

  await test('post content writes files inside the workspace and search finds them', async () => {
    const postHandler = getRouteHandler('post', '/content')
    const postRes = makeRes()
    await postHandler(makeReq({
      body: {
        path: 'SYSTEM/brief.md',
        content: '# Brief\n\nCustomer launch checklist\n',
      },
    }), postRes)

    assert.strictEqual(postRes.statusCode, 200, 'Expected write success')
    assert.strictEqual(postRes.jsonBody?.ok, true, 'Expected ok response')
    assert(fs.existsSync(path.join(workspacePath, 'SYSTEM', 'brief.md')), 'Expected file to be written')

    const searchHandler = getRouteHandler('get', '/search')
    const searchRes = makeRes()
    await searchHandler(makeReq({ query: { q: 'launch' } }), searchRes)

    assert.strictEqual(searchRes.statusCode, 200, 'Expected search success')
    assert((searchRes.jsonBody?.results || []).some((entry: any) => entry.path === 'SYSTEM/brief.md'), 'Expected search results to include written brief')
  })

  await test('upload route rejects missing target or file header', async () => {
    const handler = getRouteHandler('post', '/upload')

    const missingTargetRes = makeRes()
    await handler(makeReq({
      body: Buffer.from('hello'),
      headers: { 'x-file-name': 'note.txt' },
    }), missingTargetRes)
    assert.strictEqual(missingTargetRes.statusCode, 400, 'Expected missing target to return HTTP 400')

    const missingHeaderRes = makeRes()
    await handler(makeReq({
      query: { target: 'SYSTEM' },
      body: Buffer.from('hello'),
      headers: {},
    }), missingHeaderRes)
    assert.strictEqual(missingHeaderRes.statusCode, 400, 'Expected missing file name header to return HTTP 400')
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalTestWorkspace === 'undefined') delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
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
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalTestWorkspace === 'undefined') delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = originalTestWorkspace
  resetWorkspaceManagerForTests()
  console.error(err)
  process.exit(1)
})
