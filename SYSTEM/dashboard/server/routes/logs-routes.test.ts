/**
 * Logs routes contract test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/logs-routes.test.ts
 */

import assert from 'assert'
import { EventEmitter } from 'events'

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

class FakeWebSocket extends EventEmitter {
  static OPEN = 1
  static CONNECTING = 0

  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  closed = false
  terminated = false
  options: any
  url: string

  constructor(url: string, options: any) {
    super()
    this.url = url
    this.options = options
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    this.closed = true
  }

  terminate() {
    this.terminated = true
  }
}

function loadRouterWithOverrides(overrides: {
  workspace?: Record<string, any>
  WebSocket?: any
} = {}) {
  const workspacePath = require.resolve('../lib/workspace')
  delete require.cache[workspacePath]
  Object.assign(require(workspacePath), overrides.workspace || {})

  const wsPath = require.resolve('ws')
  delete require.cache[wsPath]
  const wsModule = require(wsPath)
  const fake = overrides.WebSocket
  if (fake) {
    require.cache[wsPath]!.exports = { __esModule: true, default: fake }
  } else {
    require.cache[wsPath]!.exports = wsModule
  }

  const routePath = require.resolve('./logs')
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
    writes: [] as string[],
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
      this.headersSent = true
      return this
    },
    flushHeaders() {},
    write(chunk?: string) {
      if (typeof chunk === 'string') {
        this.writes.push(chunk)
      }
    },
    end() {
      this.writableEnded = true
      this.headersSent = true
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Logs Routes Test Suite ===${RESET}\n`)

  await test('status route rejects invalid agent IDs', async () => {
    const router = loadRouterWithOverrides()
    const handler = getRouteHandler(router, 'get', '/:id/status')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'BAD ID' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid status agent id to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'Invalid agent id', 'Expected invalid status id error')
  })

  await test('status route reports missing gateway config', async () => {
    const router = loadRouterWithOverrides({
      workspace: {
        getAgentGatewayConfig: () => null,
      },
    })
    const handler = getRouteHandler(router, 'get', '/:id/status')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'missing-agent' } }), res)
    assert.strictEqual(res.statusCode, 404, 'Expected missing gateway config to return HTTP 404')
    assert.strictEqual(res.jsonBody?.available, false, 'Expected unavailable gateway status')
  })

  await test('logs route rejects invalid agent IDs', async () => {
    const router = loadRouterWithOverrides()
    const handler = getRouteHandler(router, 'get', '/:id/logs')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'BAD ID' } }), res)
    assert.strictEqual(res.statusCode, 400, 'Expected invalid logs agent id to return HTTP 400')
    assert.strictEqual(res.jsonBody?.error, 'Invalid agent id', 'Expected invalid logs id error')
  })

  await test('logs route reports missing gateway config', async () => {
    const router = loadRouterWithOverrides({
      workspace: {
        getAgentGatewayConfig: () => null,
      },
    })
    const handler = getRouteHandler(router, 'get', '/:id/logs')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'briefing-writer' } }), res)

    assert.strictEqual(res.statusCode, 503, 'Expected missing logs gateway config to return HTTP 503')
    assert.strictEqual(res.jsonBody?.error, 'Gateway not configured for this agent', 'Expected missing gateway guidance')
  })

  await test('status route maps gateway authentication failures', async () => {
    const sockets: FakeWebSocket[] = []
    const WebSocketMock = class extends FakeWebSocket {
      constructor(url: string, options: any) {
        super(url, options)
        sockets.push(this)
      }
    }
    const router = loadRouterWithOverrides({
      workspace: {
        getAgentGatewayConfig: () => ({ port: 18789, token: 'secret', httpUrl: 'http://localhost:18789', wsUrl: 'ws://127.0.0.1:18789' }),
      },
      WebSocket: WebSocketMock,
    })
    const handler = getRouteHandler(router, 'get', '/:id/status')
    const res = makeRes()
    const promise = handler(makeReq({ params: { id: 'briefing-writer' } }), res)
    assert.strictEqual(sockets.length, 1, 'Expected one websocket connection')

    sockets[0].emit('message', Buffer.from(JSON.stringify({
      event: 'connect.challenge',
      payload: { nonce: 'abc' },
    })))
    sockets[0].emit('message', Buffer.from(JSON.stringify({
      type: 'res',
      ok: false,
      error: { message: 'denied' },
    })))

    await promise
    assert.strictEqual(res.statusCode, 401, 'Expected failed gateway auth to return HTTP 401')
    assert.strictEqual(res.jsonBody?.code, 'gateway_auth_failed', 'Expected auth failure code')
    assert.strictEqual(sockets[0].sent.length, 1, 'Expected only connect request to be sent')
  })

  await test('status route returns gateway status payload after successful handshake', async () => {
    const sockets: FakeWebSocket[] = []
    const WebSocketMock = class extends FakeWebSocket {
      constructor(url: string, options: any) {
        super(url, options)
        sockets.push(this)
      }
    }
    const router = loadRouterWithOverrides({
      workspace: {
        getAgentGatewayConfig: () => ({ port: 18789, token: 'secret', httpUrl: 'http://localhost:18789', wsUrl: 'ws://127.0.0.1:18789' }),
      },
      WebSocket: WebSocketMock,
    })
    const handler = getRouteHandler(router, 'get', '/:id/status')
    const res = makeRes()
    const promise = handler(makeReq({ params: { id: 'briefing-writer' } }), res)
    assert.strictEqual(sockets.length, 1, 'Expected one websocket connection')

    sockets[0].emit('message', Buffer.from(JSON.stringify({
      event: 'connect.challenge',
      payload: { nonce: 'abc' },
    })))
    sockets[0].emit('message', Buffer.from(JSON.stringify({
      type: 'res',
      ok: true,
    })))
    const secondMessage = JSON.parse(sockets[0].sent[1] || '{}')
    sockets[0].emit('message', Buffer.from(JSON.stringify({
      type: 'res',
      id: secondMessage.id,
      payload: { uptimeSec: 12, health: 'ok' },
    })))

    await promise
    assert.strictEqual(res.statusCode, 200, 'Expected successful gateway status to return HTTP 200')
    assert.strictEqual(res.jsonBody?.available, true, 'Expected available gateway status')
    assert.strictEqual(res.jsonBody?.status?.health, 'ok', 'Expected returned health payload')
    assert.strictEqual(sockets[0].sent.length, 2, 'Expected connect and status requests')
  })

  await test('logs route streams payloads and ends on websocket close after auth failure', async () => {
    const sockets: FakeWebSocket[] = []
    const WebSocketMock = class extends FakeWebSocket {
      constructor(url: string, options: any) {
        super(url, options)
        sockets.push(this)
      }
    }
    const router = loadRouterWithOverrides({
      workspace: {
        getAgentGatewayConfig: () => ({ port: 18789, token: 'secret', httpUrl: 'http://localhost:18789', wsUrl: 'ws://127.0.0.1:18789' }),
      },
      WebSocket: WebSocketMock,
    })
    const handler = getRouteHandler(router, 'get', '/:id/logs')
    const req = makeReq({ params: { id: 'briefing-writer' }, query: { lines: '25' } })
    const res = makeRes()
    handler(req, res)
    assert.strictEqual(sockets.length, 1, 'Expected one websocket connection')

    sockets[0].emit('message', Buffer.from(JSON.stringify({
      event: 'connect.challenge',
      payload: { nonce: 'abc' },
    })))
    sockets[0].emit('message', Buffer.from(JSON.stringify({
      type: 'res',
      ok: false,
      error: { message: 'denied' },
    })))
    sockets[0].emit('close')

    assert.strictEqual(res.statusCode, 200, 'Expected SSE route to keep HTTP 200 status')
    assert(res.writes.some((entry) => entry.includes('"type":"error"') && entry.includes('denied')), 'Expected auth failure event in SSE stream')
    assert.strictEqual(res.writableEnded, true, 'Expected SSE stream to end after auth failure')
  })

  await test('logs route sends log payloads after successful handshake', async () => {
    const sockets: FakeWebSocket[] = []
    const WebSocketMock = class extends FakeWebSocket {
      constructor(url: string, options: any) {
        super(url, options)
        sockets.push(this)
      }
    }
    const router = loadRouterWithOverrides({
      workspace: {
        getAgentGatewayConfig: () => ({ port: 18789, token: 'secret', httpUrl: 'http://localhost:18789', wsUrl: 'ws://127.0.0.1:18789' }),
      },
      WebSocket: WebSocketMock,
    })
    const handler = getRouteHandler(router, 'get', '/:id/logs')
    const req = makeReq({ params: { id: 'briefing-writer' }, query: { lines: '25' } })
    const res = makeRes()
    handler(req, res)
    assert.strictEqual(sockets.length, 1, 'Expected one websocket connection')

    sockets[0].emit('message', Buffer.from(JSON.stringify({
      event: 'connect.challenge',
      payload: { nonce: 'abc' },
    })))
    sockets[0].emit('message', Buffer.from(JSON.stringify({
      type: 'res',
      ok: true,
    })))
    const tailRequest = JSON.parse(sockets[0].sent[1] || '{}')
    assert.strictEqual(tailRequest.method, 'logs.tail', 'Expected logs tail request after auth')
    assert.strictEqual(tailRequest.params.lines, 25, 'Expected requested line count')

    sockets[0].emit('message', Buffer.from(JSON.stringify({
      type: 'res',
      id: tailRequest.id,
      payload: { lines: ['a', 'b'] },
    })))
    sockets[0].emit('message', Buffer.from(JSON.stringify({
      event: 'log',
      payload: { line: 'streamed' },
    })))
    sockets[0].emit('close')

    assert(res.writes.some((entry) => entry.includes('"type":"logs"') && entry.includes('"a"')), 'Expected initial logs payload in SSE stream')
    assert(res.writes.some((entry) => entry.includes('"type":"log"') && entry.includes('streamed')), 'Expected streamed log event in SSE stream')
    assert.strictEqual(res.writableEnded, true, 'Expected SSE stream to end on websocket close')
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
