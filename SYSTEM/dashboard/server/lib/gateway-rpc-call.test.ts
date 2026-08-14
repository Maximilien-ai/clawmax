import assert from 'assert'
import { EventEmitter } from 'events'
import fs from 'fs'
import os from 'os'
import path from 'path'

type SentMessage = Record<string, any>

class FakeWebSocket extends EventEmitter {
  static instances: FakeWebSocket[] = []

  sent: SentMessage[] = []
  closed = false
  url: string
  options: any

  constructor(url: string, options: any) {
    super()
    this.url = url
    this.options = options
    FakeWebSocket.instances.push(this)
  }

  send(raw: string) {
    this.sent.push(JSON.parse(raw))
  }

  close() {
    this.closed = true
  }
}

const wsModulePath = require.resolve('ws')
const originalWsExports = require(wsModulePath)
require.cache[wsModulePath]!.exports = FakeWebSocket
delete require.cache[require.resolve('./gateway-rpc')]
const { GatewayRPCClient } = require('./gateway-rpc') as typeof import('./gateway-rpc')

let testsPassed = 0
let testsFailed = 0

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✓ ${name}`)
    testsPassed++
  } catch (err: any) {
    console.error(`✗ ${name}`)
    console.error(`  ${err.message}`)
    testsFailed++
  }
}

async function withClient(fn: (client: InstanceType<typeof GatewayRPCClient>) => Promise<void>) {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-gateway-rpc-call-'))
  const originalHome = process.env.HOME
  const originalGatewayUrl = process.env.OPENCLAW_GATEWAY_URL
  const configDir = path.join(tempHome, '.openclaw')
  fs.mkdirSync(configDir, { recursive: true })
  fs.writeFileSync(path.join(configDir, 'openclaw.json'), JSON.stringify({
    gateway: {
      port: 19789,
      auth: { token: 'rpc-token' },
    },
  }))
  process.env.HOME = tempHome
  delete process.env.OPENCLAW_GATEWAY_URL
  FakeWebSocket.instances = []

  try {
    await fn(new GatewayRPCClient())
  } finally {
    if (typeof originalHome === 'undefined') delete process.env.HOME
    else process.env.HOME = originalHome
    if (typeof originalGatewayUrl === 'undefined') delete process.env.OPENCLAW_GATEWAY_URL
    else process.env.OPENCLAW_GATEWAY_URL = originalGatewayUrl
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
}

function currentSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
  assert(socket, 'Expected a WebSocket instance')
  return socket
}

function message(socket: FakeWebSocket, payload: unknown) {
  socket.emit('message', Buffer.from(JSON.stringify(payload)))
}

function authenticate(socket: FakeWebSocket) {
  message(socket, { event: 'connect.challenge', payload: { nonce: 'challenge-nonce' } })
  assert.strictEqual(socket.sent[0]?.method, 'connect')
  assert.strictEqual(socket.sent[0]?.params.auth.token, 'rpc-token')
  assert.strictEqual(socket.sent[0]?.params.scopes[0], 'operator.admin')
  message(socket, { type: 'res', ok: true })
}

async function run() {
  await test('call completes the challenge, authentication, and RPC response flow', async () => {
    await withClient(async (client) => {
      const pending = client.call('agents.list', { includeArchived: false })
      const socket = currentSocket()
      assert.strictEqual(socket.url, 'ws://127.0.0.1:19789')
      assert.strictEqual(socket.options.headers.Origin, 'http://127.0.0.1:19789')
      socket.emit('open')
      authenticate(socket)

      const request = socket.sent[1]
      assert.strictEqual(request.method, 'agents.list')
      assert.deepStrictEqual(request.params, { includeArchived: false })
      message(socket, { type: 'res', id: request.id, payload: { agents: [{ id: 'agent-1' }] } })

      assert.deepStrictEqual(await pending, { agents: [{ id: 'agent-1' }] })
      assert.strictEqual(socket.closed, true)
    })
  })

  await test('call rejects failed gateway authentication', async () => {
    await withClient(async (client) => {
      const pending = client.call('config.get')
      const socket = currentSocket()
      message(socket, { event: 'connect.challenge', payload: { nonce: 'nonce' } })
      message(socket, { type: 'res', ok: false, error: { message: 'bad token' } })
      await assert.rejects(pending, /Gateway auth failed: bad token/)
      assert.strictEqual(socket.closed, true)
    })
  })

  await test('call rejects method-level RPC errors after authentication', async () => {
    await withClient(async (client) => {
      const pending = client.call('config.patch', { raw: '{}' })
      const socket = currentSocket()
      authenticate(socket)
      const request = socket.sent[1]
      message(socket, { type: 'res', id: request.id, error: { message: 'patch rejected' } })
      await assert.rejects(pending, /Gateway RPC error: patch rejected/)
      assert.strictEqual(socket.closed, true)
    })
  })

  await test('call reports WebSocket transport errors', async () => {
    await withClient(async (client) => {
      const pending = client.call('config.get')
      currentSocket().emit('error', new Error('socket unavailable'))
      await assert.rejects(pending, /Gateway WebSocket error: socket unavailable/)
    })
  })

  await test('call reports a connection that closes before a response', async () => {
    await withClient(async (client) => {
      const pending = client.call('config.get')
      currentSocket().emit('close')
      await assert.rejects(pending, /Gateway connection closed before receiving response/)
    })
  })

  await test('call logs malformed messages and continues until a terminal socket event', async () => {
    await withClient(async (client) => {
      const originalError = console.error
      const logged: unknown[][] = []
      console.error = (...args: unknown[]) => { logged.push(args) }
      try {
        const pending = client.call('config.get')
        const socket = currentSocket()
        socket.emit('message', Buffer.from('{not-json'))
        socket.emit('error', new Error('closed after malformed response'))
        await assert.rejects(pending, /closed after malformed response/)
        assert(logged.some(args => String(args[0]).includes('Error parsing gateway message')))
      } finally {
        console.error = originalError
      }
    })
  })

  require.cache[wsModulePath]!.exports = originalWsExports
  console.log(`\nTests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  if (testsFailed > 0) process.exit(1)
  console.log('\nAll tests passed')
}

run().catch((err) => {
  require.cache[wsModulePath]!.exports = originalWsExports
  console.error(err)
  process.exit(1)
})
