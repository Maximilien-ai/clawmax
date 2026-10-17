/**
 * Live chat output from the OpenClaw Gateway.
 *
 * `openclaw agent` prints its reply only after the turn ends, so the only incremental source is the
 * Gateway's `chat` delta event stream. These tests drive the observer against a fake Gateway that
 * speaks the same frames (connect.challenge -> connect req/res -> event frames).
 *
 * Run with: npx ts-node --transpileOnly server/lib/gateway-chat-stream.test.ts
 */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import { WebSocketServer, type WebSocket } from 'ws'
import { observeGatewayChatDeltas, openGatewayChatLiveOutput, type GatewayChatDelta } from './gateway-chat-stream'

type FakeGateway = {
  url: string
  connectRequests: any[]
  originHeaders: Array<string | undefined>
  emit: (event: string, payload: unknown) => void
  /** Cuts every open connection, as a Gateway restart or network blip would; the server stays up. */
  drop: () => void
  close: () => Promise<void>
}

async function startFakeGateway(respond: (request: any) => any = () => ({ ok: true, payload: { type: 'hello-ok', auth: { scopes: ['operator.read'] } } }), sendChallenge = true): Promise<FakeGateway> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const sockets: WebSocket[] = []
  const connectRequests: any[] = []
  const originHeaders: Array<string | undefined> = []
  server.on('connection', (socket, request) => {
    sockets.push(socket)
    originHeaders.push(request.headers.origin)
    if (sendChallenge) socket.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'n-1' } }))
    socket.on('message', (raw) => {
      const frame = JSON.parse(raw.toString())
      if (frame.method !== 'connect') return
      connectRequests.push(frame)
      socket.send(JSON.stringify({ type: 'res', id: frame.id, ...respond(frame) }))
    })
  })
  const { port } = server.address() as AddressInfo
  return {
    url: `ws://127.0.0.1:${port}`,
    connectRequests,
    originHeaders,
    emit: (event, payload) => sockets.forEach((socket) => { if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'event', event, payload })) }),
    drop: () => sockets.splice(0).forEach((socket) => socket.terminate()),
    close: () => new Promise((resolve) => {
      sockets.forEach((socket) => socket.terminate())
      server.close(() => resolve())
    }),
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
const KEY = 'agent:writer:explicit:dashboard-writer-gpt'
const delta = (sessionKey: string, runId: string, deltaText: string, extra: Record<string, unknown> = {}) => ({ runId, sessionKey, seq: 1, state: 'delta', deltaText, ...extra })
const runStart = (sessionKey: string, runId: string) => ({ runId, sessionKey, seq: 1, stream: 'lifecycle', ts: 1, data: { phase: 'start', startedAt: 1 } })

async function run() {
  // Subscribes as a loopback backend client and forwards only this session's run, in order.
  {
    const gateway = await startFakeGateway()
    const received: GatewayChatDelta[] = []
    const reasons: string[] = []
    const observer = observeGatewayChatDeltas({ wsUrl: gateway.url, token: 'secret-token', sessionKeys: [KEY, 'agent:writer:dashboard-chat'], onDelta: (d) => received.push(d), onUnavailable: (r) => reasons.push(r) })
    assert.equal(await observer.ready, true, 'A granted subscription must report ready')
    const params = gateway.connectRequests[0]?.params
    assert.equal(params.client.id, 'gateway-client')
    assert.equal(params.client.mode, 'backend')
    assert.deepEqual(params.scopes, ['operator.read'], 'Live output needs read access only')
    assert.deepEqual(params.auth, { token: 'secret-token' })
    assert.equal(gateway.originHeaders[0], undefined, 'An Origin header makes the Gateway strip a token-only client of its scopes')

    // A run already streaming on this key when the subscription opened (a stopped turn whose
    // Gateway run continues) never announces its start here, so none of its text is forwarded.
    gateway.emit('chat', delta(KEY, 'run-stale', 'stale text'))
    gateway.emit('agent', runStart('agent:other:explicit:x', 'run-other'))
    gateway.emit('chat', delta('agent:other:explicit:x', 'run-other', 'not mine'))
    gateway.emit('agent', runStart(KEY, 'run-1'))
    gateway.emit('agent', runStart(KEY, 'run-2'))
    gateway.emit('chat', delta(KEY, 'run-stale', 'still stale'))
    gateway.emit('chat', delta(KEY, 'run-1', 'Hello'))
    gateway.emit('agent', { runId: 'run-1', sessionKey: KEY, stream: 'assistant', data: { delta: 'duplicate channel' } })
    gateway.emit('chat', delta(KEY, 'run-2', 'interleaved run'))
    gateway.emit('chat', delta(KEY, 'run-1', ', world'))
    gateway.emit('chat', delta(KEY, 'run-1', 'Hello, world!', { replace: true }))
    gateway.emit('chat', { runId: 'run-1', sessionKey: KEY, seq: 9, state: 'final', message: {} })
    await settle()
    assert.deepEqual(received, [
      { text: 'Hello', replace: false },
      { text: ', world', replace: false },
      { text: 'Hello, world!', replace: true },
    ])

    observer.close()
    gateway.emit('chat', delta(KEY, 'run-1', 'after close'))
    await settle()
    assert.equal(received.length, 3, 'Nothing may be forwarded once the attempt has settled')
    assert.deepEqual(reasons, [], 'A normal close is not an outage')
    await gateway.close()
  }

  // The chat route's entry point: Gateway connection from the OpenClaw config, and the session's
  // keys from the agent store. A session migrated from the legacy dashboard-chat index keeps that
  // key, which the runtime reuses for `--session-id`, so its text must stream too.
  {
    const gateway = await startFakeGateway()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-chat-stream-'))
    const saved = { HOME: process.env.HOME, OPENCLAW_CONFIG_PATH: process.env.OPENCLAW_CONFIG_PATH, OPENCLAW_GATEWAY_URL: process.env.OPENCLAW_GATEWAY_URL }
    try {
      const storeDir = path.join(home, '.openclaw', 'agents', 'writer', 'agent')
      fs.mkdirSync(storeDir, { recursive: true })
      const { DatabaseSync } = require('node:sqlite')
      const db = new DatabaseSync(path.join(storeDir, 'openclaw-agent.sqlite'))
      db.exec("CREATE TABLE session_nodes (session_key TEXT PRIMARY KEY, current_session_id TEXT); INSERT INTO session_nodes VALUES ('agent:writer:dashboard-chat', 'dashboard-writer-gpt')")
      db.close()
      const configPath = path.join(home, 'openclaw.json')
      fs.writeFileSync(configPath, JSON.stringify({ gateway: { port: Number(new URL(gateway.url).port), auth: { mode: 'token', token: 'config-token' } } }))
      process.env.HOME = home
      process.env.OPENCLAW_CONFIG_PATH = configPath
      delete process.env.OPENCLAW_GATEWAY_URL

      const received: GatewayChatDelta[] = []
      const observer = await openGatewayChatLiveOutput('writer', 'dashboard-writer-gpt', (d) => received.push(d))
      assert(observer, 'A configured, reachable Gateway must yield an observer')
      assert.equal(gateway.connectRequests[0]?.params.auth.token, 'config-token', 'The token comes from the OpenClaw config')
      gateway.emit('agent', runStart('agent:writer:dashboard-chat', 'run-legacy'))
      gateway.emit('chat', delta('agent:writer:dashboard-chat', 'run-legacy', 'legacy key'))
      await settle()
      assert.deepEqual(received, [{ text: 'legacy key', replace: false }])
      observer.close()

      process.env.OPENCLAW_CONFIG_PATH = path.join(home, 'missing.json')
      assert.equal(await openGatewayChatLiveOutput('writer', 'dashboard-writer-gpt', () => {}), null, 'Without a Gateway the reply arrives whole')
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      fs.rmSync(home, { recursive: true, force: true })
      await gateway.close()
    }
  }

  // Snapshots, the final text, and stale frames, as the real Gateway sends them: the first text frame
  // a connection gets for a run carries `message`, the whole reply so far, which already includes
  // its deltaText; `final` carries the finished reply.
  {
    const gateway = await startFakeGateway()
    const received: GatewayChatDelta[] = []
    const observer = observeGatewayChatDeltas({ wsUrl: gateway.url, token: 't', sessionKeys: [KEY], onDelta: (d) => received.push(d), onUnavailable: () => {} })
    await observer.ready
    const message = (text: string) => ({ role: 'assistant', content: [{ type: 'text', text }], timestamp: 1 })
    gateway.emit('agent', runStart(KEY, 'run-1'))
    gateway.emit('chat', delta(KEY, 'run-1', 'H', { seq: 76, message: message('H') }))
    gateway.emit('chat', delta(KEY, 'run-1', 'ello', { seq: 140 }))
    gateway.emit('chat', delta(KEY, 'run-1', 'late duplicate', { seq: 90 }))
    gateway.emit('chat', { runId: 'run-1', sessionKey: KEY, seq: 145, state: 'final', message: message('Hello.') })
    await settle()
    assert.deepEqual(received, [
      { text: 'H', replace: true },
      { text: 'ello', replace: false },
      { text: 'Hello.', replace: true },
    ], 'A snapshot replaces (never appends twice), an older frame is dropped, and final text settles the bubble')
    observer.close()
    await gateway.close()
  }

  // An orphaned run on the same key (its CLI was killed, its Gateway run goes on) can restart
  // mid-run -- a retry, a tool loop, a model fallback -- after this turn subscribed. Only a run whose
  // first event (sequence 1) this observer saw begins this reply, so the orphan's text never streams into it.
  {
    const gateway = await startFakeGateway()
    const received: GatewayChatDelta[] = []
    const observer = observeGatewayChatDeltas({ wsUrl: gateway.url, token: 't', sessionKeys: [KEY], onDelta: (d) => received.push(d), onUnavailable: () => {} })
    await observer.ready
    gateway.emit('agent', { ...runStart(KEY, 'run-orphan'), seq: 40 })
    gateway.emit('agent', { runId: 'run-orphan', sessionKey: KEY, seq: 41, stream: 'codex_app_server.lifecycle', data: { phase: 'turn_starting' } })
    gateway.emit('chat', delta(KEY, 'run-orphan', 'orphaned text', { seq: 42 }))
    gateway.emit('agent', runStart(KEY, 'run-new'))
    gateway.emit('chat', delta(KEY, 'run-new', 'this turn', { seq: 2 }))
    await settle()
    assert.deepEqual(received, [{ text: 'this turn', replace: false }])
    observer.close()
    await gateway.close()
  }

  // A Codex app-server run (the runtime OpenClaw picks for openai/* models) announces the app server
  // before the run's own start, which then arrives as sequence 4. Recorded from OpenClaw 2026.9.7.
  {
    const gateway = await startFakeGateway()
    const received: GatewayChatDelta[] = []
    const observer = observeGatewayChatDeltas({ wsUrl: gateway.url, token: 't', sessionKeys: [KEY], onDelta: (d) => received.push(d), onUnavailable: () => {} })
    await observer.ready
    const codex = (seq: number, phase: string) => ({ runId: 'run-codex', sessionKey: KEY, seq, stream: 'codex_app_server.lifecycle', data: { phase } })
    const message = (text: string) => ({ role: 'assistant', content: [{ type: 'text', text }], timestamp: 1 })
    gateway.emit('agent', codex(1, 'startup'))
    gateway.emit('agent', codex(2, 'thread_ready'))
    gateway.emit('agent', codex(3, 'turn_starting'))
    gateway.emit('agent', { ...runStart(KEY, 'run-codex'), seq: 4 })
    gateway.emit('chat', delta(KEY, 'run-codex', 'HTTP', { seq: 10, message: message('HTTP') }))
    gateway.emit('chat', delta(KEY, 'run-codex', ' caching', { seq: 36, message: message('HTTP caching') }))
    gateway.emit('chat', { runId: 'run-codex', sessionKey: KEY, seq: 860, state: 'final', message: message('HTTP caching.') })
    await settle()
    assert.deepEqual(received, [
      { text: 'HTTP', replace: true },
      { text: 'HTTP caching', replace: true },
      { text: 'HTTP caching.', replace: true },
    ], 'A Codex runtime reply streams like a native one')
    observer.close()
    await gateway.close()
  }

  // A dropped connection mid-reply reconnects and resynchronizes from the next snapshot. The run's
  // start is not announced again, so the observer keeps following the run it latched.
  {
    const gateway = await startFakeGateway()
    const received: GatewayChatDelta[] = []
    const reasons: string[] = []
    const observer = observeGatewayChatDeltas({ wsUrl: gateway.url, token: 't', sessionKeys: [KEY], onDelta: (d) => received.push(d), onUnavailable: (r) => reasons.push(r), reconnectDelayMs: 10 })
    await observer.ready
    gateway.emit('agent', runStart(KEY, 'run-1'))
    gateway.emit('chat', delta(KEY, 'run-1', 'Part one', { seq: 5 }))
    await settle()
    gateway.drop()
    for (let wait = 0; wait < 40 && gateway.connectRequests.length < 2; wait++) await settle()
    assert.equal(gateway.connectRequests.length, 2, 'The observer reconnects after an unexpected close')
    await settle()
    gateway.emit('chat', delta(KEY, 'run-1', ' and two', { seq: 9, message: { role: 'assistant', content: [{ type: 'text', text: 'Part one, missed, and two' }] } }))
    gateway.emit('chat', delta(KEY, 'run-other', 'not mine', { seq: 10 }))
    await settle()
    assert.deepEqual(received, [
      { text: 'Part one', replace: false },
      { text: 'Part one, missed, and two', replace: true },
    ], 'Text sent while disconnected is recovered from the snapshot, not lost or doubled')
    assert.deepEqual(reasons, [], 'A recovered connection is not an outage')
    observer.close()
    await gateway.close()
  }

  // A Gateway that stays gone is given up on after a bounded number of attempts, and reported once.
  {
    const gateway = await startFakeGateway()
    const reasons: string[] = []
    const observer = observeGatewayChatDeltas({ wsUrl: gateway.url, token: 't', sessionKeys: [KEY], onDelta: () => {}, onUnavailable: (r) => reasons.push(r), reconnectDelayMs: 5, connectTimeoutMs: 200 })
    await observer.ready
    await gateway.close()
    for (let wait = 0; wait < 60 && reasons.length === 0; wait++) await settle()
    assert.equal(reasons.length, 1, 'Giving up is reported exactly once')
    observer.close()
  }

  // Refusals and outages report why and resolve false; the turn falls back to the final reply.
  {
    const refused = await startFakeGateway(() => ({ ok: false, error: { code: 'UNAVAILABLE', message: 'gateway starting; retry shortly' } }))
    const reasons: string[] = []
    const observer = observeGatewayChatDeltas({ wsUrl: refused.url, token: 't', sessionKeys: [KEY], onDelta: () => assert.fail('no deltas'), onUnavailable: (r) => reasons.push(r) })
    assert.equal(await observer.ready, false)
    assert.match(reasons[0] || '', /gateway starting/)
    await refused.close()

    const scopeless = await startFakeGateway(() => ({ ok: true, payload: { auth: { scopes: [] } } }))
    const scopeReasons: string[] = []
    const scopeObserver = observeGatewayChatDeltas({ wsUrl: scopeless.url, token: 't', sessionKeys: [KEY], onDelta: () => {}, onUnavailable: (r) => scopeReasons.push(r) })
    assert.equal(await scopeObserver.ready, false, 'A connection without read scope receives no chat events')
    assert.match(scopeReasons[0] || '', /read scope/)
    await scopeless.close()

    const silent = await startFakeGateway(undefined, false)
    const timeoutReasons: string[] = []
    const started = Date.now()
    const silentObserver = observeGatewayChatDeltas({ wsUrl: silent.url, token: 't', sessionKeys: [KEY], onDelta: () => {}, onUnavailable: (r) => timeoutReasons.push(r), connectTimeoutMs: 150 })
    assert.equal(await silentObserver.ready, false)
    assert(Date.now() - started < 2000, 'A silent Gateway must not delay the turn beyond the connect timeout')
    assert.match(timeoutReasons[0] || '', /in time/)
    await silent.close()

    const unreachableReasons: string[] = []
    const unreachable = observeGatewayChatDeltas({ wsUrl: 'ws://127.0.0.1:1', token: 't', sessionKeys: [KEY], onDelta: () => {}, onUnavailable: (r) => unreachableReasons.push(r) })
    assert.equal(await unreachable.ready, false)
    assert.equal(unreachableReasons.length, 1, 'An outage is reported exactly once')
  }

  console.log('gateway-chat-stream.test.ts: all assertions passed')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
