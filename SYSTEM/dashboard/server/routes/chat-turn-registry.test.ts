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
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.stack || err.message}`)
    testsFailed++
  }
}

function makeReq(overrides: Record<string, any> = {}) {
  return { params: {}, query: {}, body: {}, headers: {}, ...overrides } as any
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
 *  actual ~/.openclaw. */
async function withScratchHome<T>(fn: () => Promise<T>): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-chat-turn-registry-'))
  const originalHome = process.env.HOME
  process.env.HOME = dir
  try {
    return await fn()
  } finally {
    process.env.HOME = originalHome
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

/** Common readiness wiring for the openclaw (default-runtime) branch: an ollama provider skips
 *  the real gateway probe (waitForGatewayResponsive) entirely instead of waiting out its own
 *  network timeout, which is the only thing that would make these tests slow or flaky. */
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
    await withScratchHome(async () => {
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
