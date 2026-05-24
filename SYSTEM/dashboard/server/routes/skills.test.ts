/**
 * Skills routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/skills.test.ts
 */

import assert from 'assert'
import childProcess from 'child_process'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

type ExecFileCallback = (error: NodeJS.ErrnoException | null, stdout?: string, stderr?: string) => void
type ExecFileMock = (file: string, args: string[], options: any, callback: ExecFileCallback) => void

const originalExecFile = childProcess.execFile
let execFileMock: ExecFileMock = (_file, _args, _options, callback) => callback(null, '', '')

;(childProcess as any).execFile = ((file: string, args: string[], options: any, callback?: ExecFileCallback) => {
  const cb = typeof options === 'function' ? options : callback
  const opts = typeof options === 'function' ? {} : options
  if (!cb) throw new Error('Missing execFile callback')
  return execFileMock(file, args, opts, cb)
}) as typeof childProcess.execFile

const router = require('./skills').default

function restoreExecFile() {
  ;(childProcess as any).execFile = originalExecFile
}

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

function getRouteHandler(method: 'get' | 'post', routePath: string) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
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
  console.log(`\n${YELLOW}=== Skills Routes Test Suite ===${RESET}\n`)

  await test('registry search returns actionable warning when Tessl CLI is unavailable', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      const err = new Error('tessl not found') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      callback(err, '', '')
    }

    const handler = getRouteHandler('get', '/registry/search')
    const res = makeRes()
    await handler(makeReq({ query: { provider: 'tessl', q: 'review', limit: '6' } }), res)

    assert.strictEqual(res.statusCode, 200, 'Expected search route to stay HTTP 200')
    assert.strictEqual(res.jsonBody?.provider, 'tessl', 'Expected tessl provider')
    assert(Array.isArray(res.jsonBody?.results) && res.jsonBody.results.length === 0, 'Expected no results')
    assert(/Tessl CLI not available/i.test(res.jsonBody?.warning || ''), 'Expected Tessl CLI warning')
  })

  await test('registry install surfaces Tessl security-review blocker guidance', async () => {
    execFileMock = (_file, _args, _options, callback) => {
      const err = new Error('install blocked') as NodeJS.ErrnoException
      ;(err as any).stdout = 'Skipped odyssey4me/gmail due to security review.\n⚠ Use --dangerously-ignore-security to bypass.\n'
      ;(err as any).stderr = ''
      callback(err, (err as any).stdout, '')
    }

    const handler = getRouteHandler('post', '/registry/install')
    const res = makeRes()
    await handler(makeReq({ body: { provider: 'tessl', name: 'odyssey4me/gmail' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected blocker to return HTTP 400')
    assert(/security review/i.test(res.jsonBody?.error || ''), 'Expected security review guidance')
  })

  restoreExecFile()

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
  restoreExecFile()
  console.error(err)
  process.exit(1)
})
