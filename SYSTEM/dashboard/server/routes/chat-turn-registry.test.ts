/**
 * Regression coverage for the turn-registry wiring in routes/chat.ts.
 *
 * Every case here reproduces one of the confirmed leaks: the openclaw branch (the default
 * runtime) used to never call releaseTurn on any exit path, the claude/droid missingCliError
 * early return skipped it too, and the openclaw cancel path had no group-kill/SIGKILL-escalation
 * so a wedged CLI with an escaped grandchild could hang the turn (and the per-agent lock behind
 * it) forever. Each test drives the real POST /:id/chat handler end to end and asserts against
 * the real, unmocked agent-turns.ts registry -- not a mock of it -- so a regression here would
 * actually leak in production the same way it fails here.
 *
 * Run with: npx ts-node server/routes/chat-turn-registry.test.ts
 */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { activeTurnCount, cancelTurn, listActiveTurns } from '../lib/agent-turns'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const agentExecutionModulePath = require.resolve('../lib/agent-execution')
const agentRuntimeModulePath = require.resolve('../lib/agent-runtime')
const workspaceIntegrationsModulePath = require.resolve('../lib/workspace-integrations')
const safeEnvModulePath = require.resolve('../lib/safe-env')
const skillsModulePath = require.resolve('../lib/skills')
const openclawCliModulePath = require.resolve('../lib/openclaw-cli')
const clawmaxResendModulePath = require.resolve('../lib/clawmax-resend-command')

async function test(name: string, fn: () => Promise<void>) {
  try {
    // These cases exercise turn settlement, not agent deletion. Supply an
    // explicit synthetic generation instead of consulting installed agents;
    // lifecycle rejection has separate coverage in chat-route-edges.test.ts.
    await withModuleOverrides(require.resolve('../lib/workspace'), {
      getActiveAgentLifecycleGeneration: () => 'turn-registry-fixture-v1',
    }, () => withModuleOverrides(require.resolve('../lib/gateway-rpc'), {
      isGatewayRunning: () => ({ running: false }),
      isGatewayConfigured: () => false,
      waitForGatewayResponsive: async () => ({ running: false }),
    }, fn))
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.stack || err.message}`)
    testsFailed++
  }
}

function makeReq(overrides: Record<string, any> = {}) {
  return { params: {}, query: {}, body: {}, headers: {}, get: () => undefined, socket: {}, ...overrides } as any
}

/** SSE-flavored res mock: parses the `data: {...}\n\n` frames chat.ts's send() helper writes, and
 *  exposes a `done` promise that resolves the first time end() is called. */
function makeSseRes() {
  const events: { type: string; data: any }[] = []
  let ended = false
  let resolveDone: () => void = () => {}
  const done = new Promise<void>((resolve) => { resolveDone = resolve })
  return {
    statusCode: 200,
    writeHead() { return this },
    flushHeaders() {},
    write(chunk: string) {
      const match = /^data: (.*)\n\n$/.exec(String(chunk))
      if (match) {
        try { events.push(JSON.parse(match[1])) } catch {}
      }
    },
    end() {
      if (!ended) {
        ended = true
        resolveDone()
      }
    },
    get writableEnded() { return ended },
    events,
    done,
  }
}

function getRouteHandler(method: 'get' | 'post', routePath: string) {
  delete require.cache[require.resolve('./chat')]
  const router = require('./chat').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

async function withModuleOverrides<T>(modulePath: string, overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  delete require.cache[modulePath]
  const mod = require(modulePath)
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, mod[key]]))
  Object.assign(mod, overrides)
  delete require.cache[require.resolve('./chat')]
  try {
    return await fn()
  } finally {
    Object.assign(mod, originals)
    delete require.cache[require.resolve('./chat')]
  }
}

/** Points HOME at a scratch dir for the duration of the test so persistDashboardChatSession and
 *  the persisted-session lookups chat.ts does on a real completion never touch the developer's
 *  actual ~/.openclaw. The tests' fake CLI stands in for OpenClaw, so a pinned OpenClaw from the
 *  environment (CI exports OPENCLAW_BIN) is set aside too: chat would otherwise refuse to run
 *  without that pin's package root. */
async function withScratchHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-chat-turn-registry-'))
  const original = { HOME: process.env.HOME, OPENCLAW_BIN: process.env.OPENCLAW_BIN, OPENCLAW_PACKAGE_ROOT: process.env.OPENCLAW_PACKAGE_ROOT }
  process.env.HOME = dir
  delete process.env.OPENCLAW_BIN
  delete process.env.OPENCLAW_PACKAGE_ROOT
  try {
    return await fn(dir)
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function writeFakeCli(dir: string, name: string, body: string): string {
  // chat.ts spawns the openclaw CLI with the curated `executionEnv` from userExecutionEnv(), which
  // deliberately carries no PATH -- so a `#!/usr/bin/env node` shebang can't resolve `node` and the
  // process fails at exec with ENOENT/127 before this script ever runs. The absolute interpreter
  // path sidesteps PATH lookup entirely.
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, `#!${process.execPath}\n${body}\n`, 'utf-8')
  fs.chmodSync(filePath, 0o755)
  return filePath
}

/** The turn releases via withRegisteredTurn's `finally`, several promise-chain hops after
 *  res.end() (through runExclusiveAgentExecution's own await/finally and back). res.done
 *  resolving proves the response finished; it does not prove that unwind has completed yet, so
 *  release-state assertions poll briefly instead of checking immediately. */
async function waitForActiveTurnCount(expected: number, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (activeTurnCount() !== expected) {
    if (Date.now() > deadline) return // let the final assert report the real mismatch
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

/** Common readiness wiring for the openclaw branch. Gateway discovery is
 * isolated by test(); the ollama fixture selects the local fake CLI path. */
async function withOpenclawReadiness<T>(
  agentId: string,
  opts: { skillIds?: string[] },
  fn: () => Promise<T>,
): Promise<T> {
  return withModuleOverrides(agentExecutionModulePath, {
    resolveAgentExecutionConfig: () => ({
      workspace: `/tmp/workspace/AGENTS/${agentId}`,
      model: 'ollama/llama3',
      provider: 'ollama',
    }),
    deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
  }, () => withModuleOverrides(workspaceIntegrationsModulePath, {
    readWorkspaceIntegrationConfig: () => ({}),
    hasWorkspaceManagedPartnerSecrets: () => false,
  }, () => withModuleOverrides(safeEnvModulePath, {
    userExecutionEnv: () => ({ OLLAMA_BASE_URL: 'http://fake-ollama:11434' }),
  }, () => withModuleOverrides(skillsModulePath, {
    getAgentSkills: () => opts.skillIds || [],
  }, fn))))
}

console.log(`\n${YELLOW}=== Chat Route Turn Registry Test Suite ===${RESET}\n`)

async function run() {
  await test('openclaw success path releases the turn -- it used to leak on every completed chat', async () => {
    await withScratchHome(async (home) => {
      const { DatabaseSync } = require('node:sqlite')
      const nativeStorePath = path.join(home, '.openclaw', 'agents', 'openclaw-success-agent', 'agent', 'openclaw-agent.sqlite')
      fs.mkdirSync(path.dirname(nativeStorePath), { recursive: true })
      const nativeStore = new DatabaseSync(nativeStorePath)
      nativeStore.exec('CREATE TABLE session_key_contract (id INTEGER PRIMARY KEY)')
      nativeStore.close()
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-fake-openclaw-'))
      const cli = writeFakeCli(dir, 'openclaw', `
        process.stdout.write('Hello from the agent')
        process.exit(0)
      `)
      await withOpenclawReadiness('openclaw-success-agent', {}, () =>
        withModuleOverrides(openclawCliModulePath, { resolveOpenClawCliPath: () => cli }, async () => {
          const before = activeTurnCount()
          const handler = getRouteHandler('post', '/:id/chat')
          const res = makeSseRes()
          const req = makeReq({ params: { id: 'openclaw-success-agent' }, body: { message: 'hi' }, on() {} })
          await Promise.all([handler(req, res), res.done])
          assert(res.events.some((e) => e.type === 'complete' && e.data?.text === 'Hello from the agent'),
            `Expected a normal completion, got: ${JSON.stringify(res.events)}`)
          await waitForActiveTurnCount(before)
          assert.strictEqual(activeTurnCount(), before, 'the completed turn must not remain in the registry')
          assert.ok(!listActiveTurns().some((t) => t.agentId === 'openclaw-success-agent'), 'GET /turns/active must not show a finished openclaw chat')
          assert.ok(
            !fs.existsSync(path.join(home, '.openclaw', 'agents', 'openclaw-success-agent', 'sessions', 'sessions.json')),
            'OpenClaw 2 chat must not recreate the retired sessions.json index',
          )
        }))
      fs.rmSync(dir, { recursive: true, force: true })
    })
  })

  await test('claude/droid missingCliError still releases the turn', async () => {
    await withScratchHome(async () => {
      await withModuleOverrides(agentExecutionModulePath, {
        resolveAgentExecutionConfig: () => ({
          workspace: '/tmp/workspace/AGENTS/claude-missing-cli-agent',
          model: 'anthropic/claude-sonnet-4-20250514',
          provider: 'anthropic',
          runtime: 'claude',
        }),
        deriveWorkspaceRootFromAgentWorkspace: () => '/tmp/workspace',
      }, () => withModuleOverrides(workspaceIntegrationsModulePath, {
        readWorkspaceIntegrationConfig: () => ({}),
        hasWorkspaceManagedPartnerSecrets: () => false,
      }, () => withModuleOverrides(safeEnvModulePath, {
        userExecutionEnv: () => ({ ANTHROPIC_API_KEY: 'sk-test' }),
      }, () => withModuleOverrides(skillsModulePath, {
        getAgentSkills: () => [],
      }, () => withModuleOverrides(agentRuntimeModulePath, {
        // The exact shape executeAgentRuntimeTurn returns when plan.cliPath is null.
        executeAgentRuntimeTurn: async (o: any) => {
          o.onPlan?.({ cliPath: null, args: [], missingCliError: 'unused', streamsDeltas: false })
          return { text: '', missingCliError: 'Claude Code CLI is not available in this runtime.' }
        },
      }, async () => {
        const before = activeTurnCount()
        const handler = getRouteHandler('post', '/:id/chat')
        const res = makeSseRes()
        const req = makeReq({ params: { id: 'claude-missing-cli-agent' }, body: { message: 'hi' }, on() {} })
        await Promise.all([handler(req, res), res.done])
        assert(res.events.some((e) => e.type === 'error' && /not available/i.test(String(e.data))),
          `Expected the missing-CLI error to reach the client, got: ${JSON.stringify(res.events)}`)
        await waitForActiveTurnCount(before)
        assert.strictEqual(activeTurnCount(), before, 'the missingCliError early return must not leak the turn')
      })))))
    })
  })

  await test('resend-dispatch chat registers and releases a turn -- it used to never register at all', async () => {
    await withScratchHome(async () => {
      await withOpenclawReadiness('resend-agent', { skillIds: ['clawmax-resend'] }, () =>
        withModuleOverrides(clawmaxResendModulePath, {
          executeClawmaxResendSend: async () => ({ message: 'Email sent to test@example.com.' }),
        }, async () => {
          const before = activeTurnCount()
          const handler = getRouteHandler('post', '/:id/chat')
          const res = makeSseRes()
          const req = makeReq({ params: { id: 'resend-agent' }, body: { message: 'send status to test@example.com' }, on() {} })
          await Promise.all([handler(req, res), res.done])
          assert(res.events.some((e) => e.type === 'complete' && /Email sent/.test(String(e.data?.text))),
            `Expected the resend send to complete, got: ${JSON.stringify(res.events)}`)
          await waitForActiveTurnCount(before)
          assert.strictEqual(activeTurnCount(), before, 'the resend-dispatch turn must be released once the send finishes')
        }))
    })
  })

  // `openclaw agent` prints a Gateway-run reply only when the turn ends. The Gateway streams it as
  // chat events meanwhile; the browser must receive those live, once, then the authoritative
  // `complete` -- and the public CLI transport must keep its one-shot stdout contract untouched.
  for (const viaTransport of [false, true]) {
    await test(viaTransport
      ? 'the CLI transport keeps its stdout-only contract and never subscribes to Gateway output'
      : 'a Gateway-run turn streams live deltas to the browser once, then the authoritative complete', async () => {
      await withScratchHome(async () => {
        const { WebSocketServer } = require('ws')
        const { scopeSessionIdToModel } = require('../lib/agent-execution')
        const agentId = 'live-output-agent'
        const sessionKey = `agent:${agentId}:explicit:${scopeSessionIdToModel('live-session', 'ollama/llama3')}`
        const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
        await new Promise<void>((resolve) => server.once('listening', () => resolve()))
        const port = server.address().port
        const observers: any[] = []
        server.on('connection', (socket: any) => {
          socket.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'n' } }))
          socket.on('message', (raw: Buffer) => {
            const text = raw.toString()
            if (text === 'run') {
              // The fake CLI's cue: the Gateway run starts and streams before the CLI prints.
              const emit = (event: string, payload: object) => observers.forEach((o) => o.send(JSON.stringify({ type: 'event', event, payload })))
              emit('agent', { runId: 'run-1', sessionKey, stream: 'lifecycle', data: { phase: 'start' } })
              emit('chat', { runId: 'run-1', sessionKey, state: 'delta', deltaText: 'Hello' })
              emit('chat', { runId: 'run-1', sessionKey, state: 'delta', deltaText: ', wrld' })
              emit('chat', { runId: 'run-1', sessionKey, state: 'delta', deltaText: 'Hello, world!', replace: true })
              setTimeout(() => socket.send('streamed'), 100)
              return
            }
            const frame = JSON.parse(text)
            if (frame.method !== 'connect') return
            observers.push(socket)
            socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: { auth: { scopes: ['operator.read'] } } }))
          })
        })
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-fake-openclaw-'))
        const cli = writeFakeCli(dir, 'openclaw', `
          const ws = new WebSocket('ws://127.0.0.1:${port}')
          ws.onopen = () => ws.send('run')
          ws.onmessage = (message) => {
            if (message.data !== 'streamed') return
            process.stdout.write('Hello, world!\\n')
            ws.close()
            process.exit(0)
          }
        `)
        try {
          await withOpenclawReadiness(agentId, {}, () =>
            withModuleOverrides(openclawCliModulePath, { resolveOpenClawCliPath: () => cli }, () =>
              withModuleOverrides(require.resolve('../lib/gateway-rpc'), {
                isGatewayRunning: () => ({ running: true, port }),
                isGatewayConfigured: () => true,
                waitForGatewayResponsive: async () => ({ running: true, port }),
                loadGatewayConfigFromDisk: () => ({ port, host: '127.0.0.1', wsUrl: `ws://127.0.0.1:${port}`, auth: { mode: 'token', token: 'fixture-token' } }),
              }, async () => {
                // Re-require so the observer module sees this test's Gateway config.
                delete require.cache[require.resolve('../lib/gateway-chat-stream')]
                const res = makeSseRes()
                const req = makeReq({ params: { id: agentId }, body: { message: 'hi', sessionId: 'live-session' }, on() {} })
                const sent: Array<{ type: string; data: any }> = []
                const transport = {
                  actor: { userId: 'u', login: 'u', email: null },
                  open() {},
                  send(type: string, data: any) { sent.push({ type, data }); if (type === 'complete') res.end() },
                  reject(status: number, message: string) { throw new Error(`${status} ${message}`) },
                  assertAuthorized() {},
                }
                const { executeAgentChat } = require('./chat')
                await Promise.all([viaTransport ? executeAgentChat(req, res, transport) : getRouteHandler('post', '/:id/chat')(req, res), res.done])
                const events = viaTransport ? sent : res.events
                const deltas = events.filter((e) => e.type === 'delta').map((e) => e.data)
                const complete = events.find((e) => e.type === 'complete')
                if (viaTransport) {
                  assert.deepStrictEqual(deltas, [{ text: 'Hello, world!\n' }], 'The CLI transport receives only the CLI\'s own output')
                  assert.strictEqual(observers.length, 0, 'No Gateway subscription for the CLI transport')
                } else {
                  assert.deepStrictEqual(deltas, [{ text: 'Hello', live: true }, { text: ', wrld', live: true }, { text: 'Hello, world!', replace: true, live: true }],
                    `Expected the live deltas and not the CLI's one-shot copy, got ${JSON.stringify(deltas)}`)
                  const lastDelta = events.map((e) => e.type).lastIndexOf('delta')
                  assert(lastDelta < events.findIndex((e) => e.type === 'complete'), 'Live text arrives before the turn completes')
                  assert.strictEqual(observers.length, 1)
                  const deadline = Date.now() + 1000
                  while (observers[0].readyState !== 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
                  assert.strictEqual(observers[0].readyState, 3, 'The Gateway subscription must close once the turn settles')
                }
                assert.strictEqual(complete?.data?.text, 'Hello, world!')
                assert(events.findIndex((e) => e.type === 'start') < events.findIndex((e) => e.type === 'delta'), 'start precedes the first delta')
                assert.strictEqual(events.find((e) => e.type === 'start')?.data?.liveOutput, !viaTransport,
                  'start says whether this turn streams live, so the panel never claims it falsely')
              })))
        } finally {
          // A leaked subscription must fail the assertion above, not hang the suite in close().
          server.clients.forEach((client: any) => client.terminate())
          await new Promise((resolve) => server.close(resolve))
          fs.rmSync(dir, { recursive: true, force: true })
        }
      })
    })
  }

  // Live streaming regression: text the Gateway emits over time must reach the browser while the model is
  // still writing -- each chunk as it comes, not buffered until the end -- and a turn whose Gateway sends
  // only the finished reply shows it but must not be claimed as streaming live.
  for (const scenario of [
    { name: 'delayed chunks reach the browser one by one, before the turn completes', chunks: ['Stre', 'aming ', 'works.'], reply: 'Streaming works.', leadMs: 0 },
    // A turn that works (tools, reasoning) before it writes: the text still streams once it starts.
    { name: 'chunks after a long silent phase still stream before the turn completes', chunks: ['After ', 'the ', 'tools.'], reply: 'After the tools.', leadMs: 400 },
    { name: 'a finished reply alone is shown but never claimed as live streaming', chunks: [], reply: 'Finished reply.', leadMs: 0 },
  ]) {
    await test(`live output: ${scenario.name}`, async () => {
      await withScratchHome(async () => {
        const { WebSocketServer } = require('ws')
        const { scopeSessionIdToModel } = require('../lib/agent-execution')
        const { applyAgentChatDelta } = require('../../client/src/lib/agentChatStream')
        const agentId = 'live-chunks-agent'
        const sessionKey = `agent:${agentId}:explicit:${scopeSessionIdToModel('chunk-session', 'ollama/llama3')}`
        const chunkDelayMs = 80
        const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
        await new Promise<void>((resolve) => server.once('listening', () => resolve()))
        const port = server.address().port
        const observers: any[] = []
        server.on('connection', (socket: any) => {
          socket.send(JSON.stringify({ type: 'event', event: 'connect.challenge', payload: { nonce: 'n' } }))
          socket.on('message', async (raw: Buffer) => {
            const text = raw.toString()
            if (text === 'run') {
              const emit = (event: string, payload: object) => observers.forEach((o) => o.send(JSON.stringify({ type: 'event', event, payload })))
              const message = (body: string) => ({ role: 'assistant', content: [{ type: 'text', text: body }], timestamp: 1 })
              emit('agent', { runId: 'run-1', sessionKey, seq: 1, stream: 'lifecycle', data: { phase: 'start' } })
              await new Promise((resolve) => setTimeout(resolve, scenario.leadMs))
              let sofar = ''
              for (const [index, chunk] of scenario.chunks.entries()) {
                await new Promise((resolve) => setTimeout(resolve, chunkDelayMs))
                sofar += chunk
                // As the Gateway sends them: the first text frame carries the reply so far, later ones only their delta.
                emit('chat', { runId: 'run-1', sessionKey, seq: index + 2, state: 'delta', deltaText: chunk, ...(index === 0 ? { message: message(sofar) } : {}) })
              }
              await new Promise((resolve) => setTimeout(resolve, chunkDelayMs))
              emit('chat', { runId: 'run-1', sessionKey, seq: 99, state: 'final', message: message(scenario.reply) })
              setTimeout(() => socket.send('streamed'), 50)
              return
            }
            const frame = JSON.parse(text)
            if (frame.method !== 'connect') return
            observers.push(socket)
            socket.send(JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: { auth: { scopes: ['operator.read'] } } }))
          })
        })
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-fake-openclaw-'))
        // Like `openclaw agent` through the Gateway: it prints the reply only once the run has finished.
        const cli = writeFakeCli(dir, 'openclaw', `
          const ws = new WebSocket('ws://127.0.0.1:${port}')
          ws.onopen = () => ws.send('run')
          ws.onmessage = (message) => {
            if (message.data !== 'streamed') return
            process.stdout.write(${JSON.stringify(`${scenario.reply}\n`)})
            ws.close()
            process.exit(0)
          }
        `)
        try {
          await withOpenclawReadiness(agentId, {}, () =>
            withModuleOverrides(openclawCliModulePath, { resolveOpenClawCliPath: () => cli }, () =>
              withModuleOverrides(require.resolve('../lib/gateway-rpc'), {
                isGatewayRunning: () => ({ running: true, port }),
                isGatewayConfigured: () => true,
                waitForGatewayResponsive: async () => ({ running: true, port }),
                loadGatewayConfigFromDisk: () => ({ port, host: '127.0.0.1', wsUrl: `ws://127.0.0.1:${port}`, auth: { mode: 'token', token: 'fixture-token' } }),
              }, async () => {
                delete require.cache[require.resolve('../lib/gateway-chat-stream')]
                const res = makeSseRes()
                // When each event reached the browser's stream.
                const arrivedAt: number[] = []
                const write = res.write.bind(res)
                res.write = (chunk: string) => { write(chunk); while (arrivedAt.length < res.events.length) arrivedAt.push(Date.now()) }
                const req = makeReq({ params: { id: agentId }, body: { message: 'hi', sessionId: 'chunk-session' }, on() {} })
                await Promise.all([getRouteHandler('post', '/:id/chat')(req, res), res.done])
                const events = res.events.map((event, index) => ({ ...event, at: arrivedAt[index] }))
                const complete = events.find((e) => e.type === 'complete')
                const deltas = events.filter((e) => e.type === 'delta')
                const live = deltas.filter((e) => e.data?.live === true)
                assert.strictEqual(complete?.data?.text, scenario.reply, 'The CLI\'s reply stays the authoritative complete text')

                // What the panel shows after each delta (the same reducer it uses), and that text never doubles.
                let bubble = ''
                const shown = deltas.map((e) => (bubble = applyAgentChatDelta(bubble, e.data)))
                assert.strictEqual(bubble, scenario.reply, `The bubble ends with the reply exactly once, got ${JSON.stringify(bubble)}`)

                if (scenario.chunks.length) {
                  const growing = scenario.chunks.map((_, index) => scenario.chunks.slice(0, index + 1).join(''))
                  assert.deepStrictEqual(shown.slice(0, live.length), growing,
                    'Each chunk appears as it arrives: intermediate text before the whole reply')
                  for (const [index, event] of live.entries()) {
                    assert(event.at < complete!.at, `Chunk ${index + 1} must arrive before the turn completes`)
                    if (index > 0) {
                      assert(event.at - live[index - 1].at >= chunkDelayMs / 2,
                        `Chunk ${index + 1} arrived ${event.at - live[index - 1].at} ms after the previous one: the stream was buffered, not live`)
                    }
                  }
                  assert(complete!.at - live[0].at >= chunkDelayMs * scenario.chunks.length - chunkDelayMs / 2,
                    'The first chunk is visible for the rest of the generation, not only at the end')
                } else {
                  assert.strictEqual(live.length, 0, `Only the finished reply arrived: nothing may claim live streaming, got ${JSON.stringify(deltas.map((e) => e.data))}`)
                }
                // The Gateway's final snapshot is the finished text: shown and kept (marked final), never presented as streaming.
                const finalSnapshot = deltas[deltas.length - 1]
                assert.deepStrictEqual(finalSnapshot?.data, { text: scenario.reply, replace: true, final: true }, 'The final snapshot settles the bubble without a live claim')
              })))
        } finally {
          server.clients.forEach((client: any) => client.terminate())
          await new Promise((resolve) => server.close(resolve))
          fs.rmSync(dir, { recursive: true, force: true })
        }
      })
    })
  }

  await test('openclaw cancel escalates to SIGKILL and settles even when a grandchild holds stdout open, and releases the turn', async () => {
    // Mirrors agent-runtime.test.ts's equivalent runOnce coverage, but exercised through chat.ts's
    // own spawn/kill logic: before this fix, the openclaw branch only sent SIGTERM to the direct
    // child and resolved off 'close', which a detached grandchild holding the inherited stdout
    // pipe open would make wait forever -- wedging this request and the per-agent execution lock
    // behind it for every future chat, workflow, and channel turn for the same agent.
    await withScratchHome(async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-fake-openclaw-leaky-'))
      const cli = writeFakeCli(dir, 'openclaw', `
        process.on('SIGTERM', () => {}) // ignore, forcing escalation to SIGKILL
        const { spawn } = require('child_process')
        // detached => its own process group, so a group SIGTERM/SIGKILL sent to this script's
        // group cannot reach it; it inherits stdout, so the pipe stays open after this exits.
        const grandchild = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
          detached: true, stdio: ['ignore', 'inherit', 'ignore'],
        })
        grandchild.unref()
        process.stdout.write('partial reply before cancel')
        setInterval(() => {}, 1000)
      `)
      await withOpenclawReadiness('leaky-agent', {}, () =>
        withModuleOverrides(openclawCliModulePath, { resolveOpenClawCliPath: () => cli }, async () => {
          const before = activeTurnCount()
          const handler = getRouteHandler('post', '/:id/chat')
          const res = makeSseRes()
          const req = makeReq({ params: { id: 'leaky-agent' }, body: { message: 'go' }, on() {} })
          const handlerPromise = handler(req, res)

          // Let the CLI actually spawn and the turn register before cancelling it.
          await new Promise((resolve) => setTimeout(resolve, 300))
          const active = listActiveTurns().find((t) => t.agentId === 'leaky-agent')
          assert.ok(active, 'expected the turn to be registered while the CLI runs')
          assert.strictEqual(cancelTurn(active!.turnId), true)

          const outcome = await Promise.race([
            Promise.all([handlerPromise, res.done]).then(() => 'settled'),
            new Promise((resolve) => setTimeout(() => resolve('HUNG'), 8000)),
          ])
          assert.strictEqual(outcome, 'settled', 'cancel must settle within the SIGKILL escalation window even though close never fires')
          await waitForActiveTurnCount(before)
          assert.strictEqual(activeTurnCount(), before, 'the force-settled attempt must still release its turn')
        }))
      fs.rmSync(dir, { recursive: true, force: true })
    })
  })

  await test('a turn that fails with no output reports the failure instead of replaying the previous reply', async () => {
    await withScratchHome(async (home) => {
      // The session already holds an earlier exchange; this turn's CLI fails with nothing on stdout.
      // Reply recovery reads the latest persisted reply, which is the previous turn's.
      const { DatabaseSync } = require('node:sqlite')
      const { scopeSessionIdToModel } = require('../lib/agent-execution')
      const agentId = 'failed-turn-agent'
      const sessionId = scopeSessionIdToModel('failed-session', 'ollama/llama3')
      const storePath = path.join(home, '.openclaw', 'agents', agentId, 'agent', 'openclaw-agent.sqlite')
      fs.mkdirSync(path.dirname(storePath), { recursive: true })
      const store = new DatabaseSync(storePath)
      store.exec('CREATE TABLE session_nodes (session_key TEXT, current_session_id TEXT); CREATE TABLE transcript_events (session_id TEXT, seq INTEGER, event_json TEXT)')
      const insert = store.prepare('INSERT INTO transcript_events VALUES (?, ?, ?)')
      insert.run(sessionId, 1, JSON.stringify({ type: 'message', id: 'evt-q1', message: { role: 'user', content: 'first question' } }))
      insert.run(sessionId, 2, JSON.stringify({ type: 'message', id: 'evt-a1', message: { role: 'assistant', content: [{ type: 'text', text: 'Answer to the first question.' }] } }))
      store.close()
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-fake-openclaw-'))
      const cli = writeFakeCli(dir, 'openclaw', `
        process.stderr.write('Error: model provider unavailable\\n')
        process.exit(1)
      `)
      try {
        await withOpenclawReadiness(agentId, {}, () =>
          withModuleOverrides(openclawCliModulePath, { resolveOpenClawCliPath: () => cli }, async () => {
            const res = makeSseRes()
            const req = makeReq({ params: { id: agentId }, body: { message: 'second question', sessionId: 'failed-session' }, on() {} })
            await Promise.all([getRouteHandler('post', '/:id/chat')(req, res), res.done])
            const complete = res.events.find((e) => e.type === 'complete')
            assert.strictEqual(complete?.data?.text, '', `The failed turn must not complete with the previous reply, got ${JSON.stringify(complete)}`)
            assert(res.events.some((e) => e.type === 'error'), 'The failure must be reported')
          }))
      } finally {
        fs.rmSync(dir, { recursive: true, force: true })
      }
    })
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
