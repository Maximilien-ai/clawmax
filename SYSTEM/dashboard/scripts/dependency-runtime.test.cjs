const assert = require('node:assert/strict')
const { once } = require('node:events')
const { test } = require('node:test')
const express = require('express')
const { rateLimit } = require('express-rate-limit')
const cron = require('node-cron')
const WebSocket = require('ws')

// Exercise real dependency behavior; no provider, gateway or operator state.
test('a stopped scheduled task retains its timezone and executes only on request', async (t) => {
  let executions = 0
  const task = cron.createTask('15 9 * * *', () => { executions += 1 }, { timezone: 'America/New_York' })
  t.after(() => task.destroy())
  assert.equal(task.getStatus(), 'stopped')
  assert.equal(executions, 0)
  task.start()
  const next = task.getNextRun()
  assert(next instanceof Date)
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(next)
  assert.equal(local, '09:15')
  task.stop()
  await task.execute()
  assert.equal(executions, 1)
  assert.equal(task.getStatus(), 'stopped')
})

test('the limiter permits its quota then returns JSON 429 and standard headers', async (t) => {
  const app = express()
  app.set('trust proxy', false)
  app.use('/api', rateLimit({ windowMs: 60000, max: 2, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many auth attempts' } }))
  app.get('/api/auth', (_req, res) => res.json({ ok: true }))
  app.get('/health', (_req, res) => res.json({ ok: true }))
  const server = app.listen(0, '127.0.0.1')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  for (let i = 0; i < 2; i++) {
    const response = await fetch(base + '/api/auth', { signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.equal(response.headers.get('x-ratelimit-limit'), null)
    assert.equal(response.headers.get('ratelimit-limit'), '2')
  }
  const denied = await fetch(base + '/api/auth', { signal: AbortSignal.timeout(5000) })
  assert.equal(denied.status, 429)
  assert.deepEqual(await denied.json(), { error: 'Too many auth attempts' })
  assert(Number(denied.headers.get('retry-after')) > 0)
  const health = await fetch(base + '/health', { signal: AbortSignal.timeout(5000) })
  assert.equal(health.status, 200)
  await health.body.cancel()
})

async function socketPair(t) {
  const server = new WebSocket.WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 64 })
  t.after(() => new Promise(resolve => {
    for (const socket of server.clients) socket.terminate()
    server.close(resolve)
  }))
  await once(server, 'listening')
  const connection = once(server, 'connection')
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  t.after(() => client.terminate())
  const [peer] = await connection
  await once(client, 'open')
  return { client, peer }
}

test('WebSocket messages retain text/binary identity and settle graceful closure', { timeout: 5000 }, async (t) => {
  const { client, peer } = await socketPair(t)
  peer.on('message', (bytes, isBinary) => peer.send(bytes, { binary: isBinary }))
  const textReply = once(client, 'message')
  client.send('synthetic gateway reply')
  const [text, textBinary] = await textReply
  assert.equal(text.toString(), 'synthetic gateway reply')
  assert.equal(textBinary, false)
  const bytes = Buffer.from([0, 1, 127, 255])
  const binaryReply = once(client, 'message')
  client.send(bytes)
  const [binary, isBinary] = await binaryReply
  assert.deepEqual(binary, bytes)
  assert.equal(isBinary, true)
  const closed = once(client, 'close')
  client.close(1000, 'complete')
  const [code, reason] = await closed
  assert.equal(code, 1000)
  assert.equal(reason.toString(), 'complete')
})

test('oversized WebSocket messages are refused before message delivery', { timeout: 5000 }, async (t) => {
  const { client, peer } = await socketPair(t)
  let delivered = false
  peer.on('message', () => { delivered = true })
  const failure = once(peer, 'error')
  const closed = once(client, 'close')
  client.send(Buffer.alloc(65))
  const [error] = await failure
  assert.equal(error.code, 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH')
  assert.equal((await closed)[0], 1009)
  assert.equal(delivered, false)
})
