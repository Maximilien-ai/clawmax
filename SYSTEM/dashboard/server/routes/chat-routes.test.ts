/**
 * Chat routes contract test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/chat-routes.test.ts
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

function getRouteHandler(method: 'get' | 'post', routePath: string) {
  delete require.cache[require.resolve('./chat')]
  const router = require('./chat').default
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
    socket: { remoteAddress: '127.0.0.1' },
    get(name: string) { return (this.headers as Record<string, string>)[name.toLowerCase()] },
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    headersSent: false,
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
      this.headersSent = true
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Chat Routes Test Suite ===${RESET}\n`)

  await test('gateway route rejects invalid agent IDs', async () => {
    const handler = getRouteHandler('get', '/:id/gateway')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'BAD ID' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid agent id to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'Invalid agent id', 'Expected invalid id error')
  })

  await test('chat readiness rejects invalid agent IDs', async () => {
    const handler = getRouteHandler('post', '/:id/chat/readiness')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'Invalid Agent' }, body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid readiness request to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'Invalid agent id', 'Expected readiness invalid id error')
  })

  await test('chat route rejects invalid agent IDs before runtime work', async () => {
    const handler = getRouteHandler('post', '/:id/chat')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'Invalid Agent' }, body: { message: 'hello' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid chat agent id to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'Invalid agent id', 'Expected invalid chat id error')
  })

  await test('chat route rejects missing messages before runtime work', async () => {
    const handler = getRouteHandler('post', '/:id/chat')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'valid-agent' }, body: {} }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected missing chat message to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'message is required', 'Expected missing message error')
  })

  await test('reserved Template chat cannot reach readiness, broker credentials, or managed actions', async () => {
    const modules = [
      [require('../lib/agent-execution'), 'resolveAgentExecutionConfig'],
      [require('../lib/skill-secret-broker'), 'createBrokerCapabilityToken'],
      [require('../lib/clawmax-resend-command'), 'executeClawmaxResendSend'],
    ] as const
    const originals = modules.map(([mod, key]) => mod[key])
    let calls = 0
    modules.forEach(([mod, key]) => { mod[key] = () => { calls++; throw new Error('Must not reach runtime preparation') } })
    try {
      const id = 'tr-0123456789abcdef-agent-0123456789ab'
      const res = makeRes()
      await getRouteHandler('post', '/:id/chat')(makeReq({ params: { id }, body: { message: 'Send an email' } }), res)
      assert.equal(res.statusCode, 409)
      assert.match(res.jsonBody.error, /Template execution is unavailable/)
      const readiness = makeRes()
      await getRouteHandler('post', '/:id/chat/readiness')(makeReq({ params: { id } }), readiness)
      assert.equal(readiness.jsonBody.available, false)
      assert.equal(readiness.jsonBody.code, 'template_runtime_unavailable')
      assert.equal(calls, 0)
    } finally { modules.forEach(([mod, key], index) => { mod[key] = originals[index] }) }
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
