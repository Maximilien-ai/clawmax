/**
 * Logs routes contract test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/logs-routes.test.ts
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

function getRouteHandler(method: 'get', routePath: string) {
  delete require.cache[require.resolve('./logs')]
  const router = require('./logs').default
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
    on() {},
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    headersSent: false,
    writableEnded: false,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      this.headersSent = true
      return this
    },
    writeHead(code: number) {
      this.statusCode = code
      return this
    },
    flushHeaders() {},
    write() {},
    end() {
      this.writableEnded = true
      this.headersSent = true
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Logs Routes Test Suite ===${RESET}\n`)

  await test('status route rejects invalid agent IDs', async () => {
    const handler = getRouteHandler('get', '/:id/status')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'BAD ID' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid status agent id to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'Invalid agent id', 'Expected invalid status id error')
  })

  await test('status route reports missing gateway config', async () => {
    const handler = getRouteHandler('get', '/:id/status')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'missing-agent' } }), res)
    assert([404, 503].includes(res.statusCode), `Expected missing/unavailable gateway to return HTTP 404 or 503, got ${res.statusCode}`)
    assert.strictEqual(res.jsonBody?.available, false, 'Expected unavailable gateway status')
  })

  await test('logs route rejects invalid agent IDs', async () => {
    const handler = getRouteHandler('get', '/:id/logs')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'BAD ID' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid logs agent id to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'Invalid agent id', 'Expected invalid logs id error')
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
