import assert from 'assert'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import express from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { createInstanceChatRouter, type CliTemplateExecution } from './instance-chat'
import type { AgentChatTransport } from './chat'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-chat-contract-'))
  let calls = 0
  let generation = 'generation-one'
  let mode = 'success'
  let pending: AgentChatTransport | undefined
  let lastBody: any
  let authorized = true
  let templateEnabled = false
  let templateCalls = 0
  let templateRevision = 'revision-one'
  let templateCleaned = false
  let revokeDuringVerification = false
  const templateAgent = 'tr-0123456789abcdef-agent-0123456789ab'
  const app = express()
  app.use(express.json({ limit: '2mb' }))
  app.use('/unconfigured/:workspaceId', createInstanceChatRouter({
    authorize: () => ({ actorId: 'alice', workspaceId: 'test', workspacePath: root, assertAuthorized() {}, run: async fn => fn() }),
    execute: async () => { throw new Error('Reserved Template must never reach browser executor') },
  }))
  app.use('/api/cli/v1/workspaces/:workspaceId', createInstanceChatRouter({
    authorize(req, res) {
      const actorId = req.get('authorization')
      if (!actorId) { res.status(401).end(); return null }
      if (req.params.workspaceId !== 'test') { res.status(403).end(); return null }
      return {
        actorId, workspaceId: 'test', workspacePath: root,
        run: async fn => fn(),
        assertAuthorized() { if (!authorized) throw new Error('revoked') },
      }
    },
    generation: id => id === 'analyst' ? generation : null,
    templateExecution: context => {
      if (!templateEnabled) throw new Error('Template execution disabled')
      // Synthetic server composition: coordinator enforcement is tested separately.
      return {
        store: { workspaceId: 'test', workspacePath: root, history: () => [{ id: templateRevision, actorId: 'alice', cleanedAt: templateCleaned ? 'now' : undefined, resources: { agents: { analyst: templateAgent } } }] },
        coordinator: { workspaceId: 'test', workspacePath: root,
          verifyStagedExecution: async () => { if (revokeDuringVerification) authorized = false },
          executeNoToolsAgent: async (actor: string, revision: string, input: any, _authority: unknown, _policies: unknown, _runtime: unknown, assertAuthorized: () => void) => {
            assertAuthorized()
            assert.strictEqual(actor, context.actorId)
            assert.strictEqual(revision, templateRevision)
            assert.strictEqual(input.agentId, templateAgent)
            templateCalls++
            return { text: 'Template reply', runId: 'synthetic', replayed: false }
          },
        }, authority: {}, policies: {}, runtime: {}, assertStopped() {},
      } as unknown as CliTemplateExecution
    },
    execute: async (req, res, transport) => {
      calls++
      lastBody = req.body
      assert.strictEqual(req.params.id, 'analyst')
      assert.strictEqual(req.headers['x-clawmax-agent-generation'], generation)
      assert(transport)
      transport.open()
      transport.assertAuthorized()
      if (mode === 'throw') throw new Error('secret-provider-key')
      if (mode === 'reject') { transport.reject(400, 'secret-provider-key'); return }
      if (mode === 'pending') { pending = transport; return }
      if (mode === 'empty') transport.send('complete', { text: '' })
      else if (mode === 'error') {
        transport.send('error', 'secret-provider-key')
        transport.send('complete', { text: 'must not follow terminal' })
      } else if (mode === 'large') transport.send('delta', { text: 'x'.repeat(2 * 1024 * 1024 + 1) })
      else {
        if (mode !== 'complete-only') transport.send('delta', { text: 'Hello 🌍' })
        transport.send('complete', { text: 'Hello 🌍' })
      }
      if (!res.writableEnded) res.end()
    },
  }))
  const server = http.createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as import('net').AddressInfo
  const base = `http://127.0.0.1:${address.port}/api/cli/v1/workspaces`
  const body = (key: string, extra = {}) => ({ apiVersion: 'clawmax.instance/v1', kind: 'AgentChatRequest', message: 'Greet me', idempotencyKey: key, ...extra })
  const request = async (input: any, actor = 'alice', workspace = 'test', agent = 'analyst', headers = {}) => {
    const response = await fetch(`${base}/${workspace}/agents/${agent}/chat/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(actor ? { authorization: actor } : {}), ...headers }, body: JSON.stringify(input),
    })
    const text = await response.text()
    return { status: response.status, type: response.headers.get('content-type'), text,
      events: text.trim() ? text.trim().split('\n').map(line => JSON.parse(line)) : [] }
  }
  let passed = 0
  const test = async (name: string, fn: () => Promise<void>) => { await fn(); passed++; console.log(`✓ ${name}`) }
  try {
    await test('unconfigured Template execution remains blocked', async () => {
      const response = await fetch(`http://127.0.0.1:${address.port}/unconfigured/test/agents/${templateAgent}/chat/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body('default-off')),
      })
      assert.strictEqual(response.status, 409)
      const payload = await response.json() as { error: { code: string } }
      assert.strictEqual(payload.error.code, 'template_runtime_unavailable')
    })
    await test('authentication and workspace isolation precede execution', async () => {
      assert.strictEqual((await request(body('unauth'), '')).status, 401)
      assert.strictEqual((await request(body('forbidden'), 'alice', 'other')).status, 403)
      assert.strictEqual(calls, 0)
    })
    await test('reject invalid envelopes, overrides, keys, and empty messages', async () => {
      for (const extra of [{ kind: 'bad' }, { message: ' ' }, { byok: { openai: 'secret' } }, { sessionId: '../escape' }, { idempotencyKey: [] }]) {
        assert.strictEqual((await request(body('invalid', extra))).status, 400)
      }
      assert.strictEqual((await request(body('key'), 'alice', 'test', 'analyst', { 'idempotency-key': 'different' })).status, 400)
      assert.strictEqual((await request(body('missing'), 'alice', 'test', 'missing')).status, 404)
      assert.strictEqual((await request(body('reserved'), 'alice', 'test', templateAgent)).status, 503)
      assert.strictEqual(calls, 0)
    })
    let first: Awaited<ReturnType<typeof request>>
    await test('public chat produces strict correlated NDJSON and a server-owned session', async () => {
      first = await request(body('first'))
      assert.strictEqual(first.status, 200)
      assert(first.type?.startsWith('application/x-ndjson'))
      assert.deepStrictEqual(first.events.map(e => e.type), ['start', 'delta', 'done'])
      first.events.forEach((event, i) => {
        assert.strictEqual(event.sequence, i + 1)
        assert.strictEqual(event.apiVersion, 'clawmax.instance/v1')
        assert.strictEqual(event.kind, 'ChatEvent')
        assert.strictEqual(event.workspaceId, 'test')
        assert.strictEqual(event.agentId, 'analyst')
        assert.strictEqual(event.sessionId, first.events[0].sessionId)
        assert.strictEqual(event.requestId, first.events[0].requestId)
        assert.deepStrictEqual(Object.keys(event).sort(), [...['apiVersion', 'kind', 'requestId', 'workspaceId', 'agentId', 'sessionId', 'sequence', 'type'], ...(event.type === 'delta' ? ['content'] : [])].sort())
      })
      assert.deepStrictEqual(Object.keys(lastBody).sort(), ['message', 'sessionId'])
      assert(lastBody.sessionId.startsWith('cli-'))
    })
    await test('durable idempotent replay and conflict do not execute twice', async () => {
      const before = calls
      assert.strictEqual((await request(body('first'))).text, first.text)
      assert.strictEqual((await request(body('first', { message: 'different' }))).status, 409)
      assert.strictEqual(calls, before)
    })
    await test('session continuation is actor-owned and generation-bound', async () => {
      const sessionId = first.events[0].sessionId
      assert.strictEqual((await request(body('continue', { sessionId }))).status, 200)
      assert.strictEqual((await request(body('steal', { sessionId }), 'bob')).status, 404)
      generation = 'replacement'
      assert.strictEqual((await request(body('replaced', { sessionId }))).status, 404)
      assert.strictEqual((await request(body('first'))).status, 409)
      generation = 'generation-one'
    })
    await test('runtime failures, empty output, and overflow terminate once without secret leakage', async () => {
      for (const value of ['throw', 'reject', 'empty', 'error', 'large']) {
        mode = value
        const result = await request(body(value))
        assert.deepStrictEqual(result.events.map(e => e.type), ['start', 'error'])
        assert(!result.text.includes('secret-provider-key'))
      }
    })
    await test('complete-only runtime output still supplies a nonempty delta', async () => {
      mode = 'complete-only'
      assert.deepStrictEqual((await request(body('complete-only'))).events.map(e => e.type), ['start', 'delta', 'done'])
    })
    await test('pending durable claim prevents duplicate dispatch and survives disconnect', async () => {
      mode = 'pending'
      const controller = new AbortController()
      const response = await fetch(`${base}/test/agents/analyst/chat/sessions`, {
        method: 'POST', headers: { authorization: 'alice', 'content-type': 'application/json' },
        body: JSON.stringify(body('pending')), signal: controller.signal,
      })
      assert.strictEqual(response.status, 200)
      controller.abort()
      const before = calls
      assert.strictEqual((await request(body('pending'))).status, 409)
      assert.strictEqual(calls, before)
      pending!.send('complete', { text: 'Survived disconnect' })
      assert.deepStrictEqual((await request(body('pending'))).events.map(e => e.type), ['start', 'delta', 'done'])
    })
    await test('authorization revocation fails closed before dispatch', async () => {
      authorized = false
      const before = calls
      assert.strictEqual((await request(body('revoked'))).status, 503)
      assert.strictEqual(calls, before)
      authorized = true
    })
    await test('durable receipts are private and never retain the raw prompt', async () => {
      const directory = path.join(root, '.clawmax', 'cli-chat')
      for (const actor of fs.readdirSync(directory)) for (const file of fs.readdirSync(path.join(directory, actor))) {
        const full = path.join(directory, actor, file)
        assert.strictEqual(fs.statSync(full).mode & 0o777, 0o600)
        assert(!fs.readFileSync(full, 'utf8').includes('Greet me'))
      }
    })
    await test('Template chat uses its server-owned executor and durable replay, never browser chat', async () => {
      templateEnabled = true
      const before = calls
      const first = await request(body('template-first'), 'alice', 'test', templateAgent)
      assert.deepStrictEqual(first.events.map(e => e.type), ['start', 'delta', 'done'])
      assert.strictEqual(first.events[1].content, 'Template reply')
      assert.strictEqual((await request(body('template-first'), 'alice', 'test', templateAgent)).text, first.text)
      assert.strictEqual(templateCalls, 1)
      assert.strictEqual(calls, before)
      assert.strictEqual((await request(body('template-session', { sessionId: first.events[0].sessionId }), 'alice', 'test', templateAgent)).status, 409)
      assert.strictEqual((await request(body('template-first'), 'bob', 'test', templateAgent)).status, 404)
      templateCleaned = true
      assert.strictEqual((await request(body('template-first'), 'alice', 'test', templateAgent)).status, 404)
      templateCleaned = false
      templateRevision = 'revision-two'
      assert.strictEqual((await request(body('template-first'), 'alice', 'test', templateAgent)).status, 409)
      assert.strictEqual(templateCalls, 1)
    })
    await test('Template verification rechecks workspace authorization after gateway waits', async () => {
      revokeDuringVerification = true
      const result = await request(body('template-revoked'), 'alice', 'test', templateAgent)
      assert.strictEqual(result.status, 503)
      assert.strictEqual(templateCalls, 1)
      authorized = true
      revokeDuringVerification = false
    })
    if (process.argv[2]) await test('real CLI Go client accepts the public stream and durable replay', async () => {
      mode = 'success'
      const cli = path.resolve(process.argv[2])
      assert(fs.existsSync(path.join(cli, 'go.mod')), 'Expected CLI checkout')
      const { stdout } = await promisify(execFile)('go', [
        'run', path.resolve(__dirname, '../../scripts/fixtures/chat-cli-contract.go'),
        `http://127.0.0.1:${address.port}`,
      ], { cwd: cli, timeout: 120000, maxBuffer: 65536 })
      process.stdout.write(stdout)
    })
    console.log(`${passed} instance chat contract tests passed`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
