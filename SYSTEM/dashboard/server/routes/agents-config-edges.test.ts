import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

const agentModelModulePath = require.resolve('../lib/agent-model')

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

function ensureWorkspaceScaffold(workspacePath: string) {
  fs.mkdirSync(path.join(workspacePath, 'AGENTS'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n', 'utf-8')
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'config-workspace',
    workspaces: [{
      id: 'config-workspace',
      name: 'Config Workspace',
      path: workspacePath,
      createdAt: '2026-06-26T00:00:00.000Z',
      lastAccessedAt: '2026-06-26T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

function writeAgentFiles(workspacePath: string, agentId: string) {
  const agentDir = path.join(workspacePath, 'AGENTS', agentId)
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), [
    '# IDENTITY.md',
    '',
    '- **Name:** plain-agent',
    '- **Model:** openai/gpt-4o-mini',
    '- **Tags:** alpha, beta',
    '',
    '## Identity',
    '',
    'Helpful operator.',
  ].join('\n'), 'utf-8')
  fs.writeFileSync(path.join(agentDir, 'SOUL.md'), '# SOUL\n\nOriginal soul\n', 'utf-8')
  fs.writeFileSync(path.join(agentDir, 'TOOLS.md'), '# TOOLS\n\nOriginal tools\n', 'utf-8')
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
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

function getRouteHandler(method: 'get' | 'post' | 'put' | 'patch', routePath: string) {
  delete require.cache[require.resolve('./agents')]
  const router = require('./agents').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

async function withAgentModelOverrides<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  delete require.cache[agentModelModulePath]
  const mod = require(agentModelModulePath)
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, mod[key]]))
  Object.assign(mod, overrides)
  delete require.cache[require.resolve('./agents')]
  try {
    return await fn()
  } finally {
    Object.assign(mod, originals)
    delete require.cache[require.resolve('./agents')]
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Agents Config Edge Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agents-config-test-'))
  const workspacePath = path.join(tmpHome, 'workspaces', 'config-workspace')
  ensureWorkspaceScaffold(workspacePath)
  writeWorkspaceRegistry(tmpHome, workspacePath)
  writeAgentFiles(workspacePath, 'plain-agent')
  fs.mkdirSync(path.join(tmpHome, '.openclaw', 'agents'), { recursive: true })
  fs.writeFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), JSON.stringify({ agents: { list: [] } }, null, 2))

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath

  await test('cost-limit routes accept valid updates and return persisted values', async () => {
    const putHandler = getRouteHandler('put', '/:id/cost-limit')
    let res = makeRes()
    await putHandler(makeReq({ params: { id: 'plain-agent' }, body: { limitUsd: 5 } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected valid cost limit update success')
    assert.strictEqual(res.jsonBody?.limitUsd, 5, 'Expected updated cost limit in response')

    const getHandler = getRouteHandler('get', '/:id/cost-limit')
    res = makeRes()
    await getHandler(makeReq({ params: { id: 'plain-agent' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected cost limit fetch success')
    assert.strictEqual(res.jsonBody?.limitUsd, 5, 'Expected persisted cost limit value')
  })

  await test('tags route updates IDENTITY.md and returns the new tags', async () => {
    const handler = getRouteHandler('patch', '/:id/tags')
    const res = makeRes()
    await handler(makeReq({ params: { id: 'plain-agent' }, body: { tags: ['support', 'night-shift'] } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected tags update success')
    assert.deepStrictEqual(res.jsonBody?.tags, ['support', 'night-shift'])

    const identity = fs.readFileSync(path.join(workspacePath, 'AGENTS', 'plain-agent', 'IDENTITY.md'), 'utf-8')
    assert(identity.includes('- **Tags:** support, night-shift'), 'Expected tags line updated in IDENTITY.md')
  })

  await test('config routes read current files and validate clean edits', async () => {
    const getHandler = getRouteHandler('get', '/:id/config')
    let res = makeRes()
    await getHandler(makeReq({ params: { id: 'plain-agent' } }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected config fetch success')
    assert(/Helpful operator\./.test(res.jsonBody?.identity || ''), 'Expected identity content in response')
    assert(/Original soul/.test(res.jsonBody?.soul || ''), 'Expected soul content in response')
    assert(/Original tools/.test(res.jsonBody?.tools || ''), 'Expected tools content in response')

    const validateHandler = getRouteHandler('post', '/validate-config')
    res = makeRes()
    await validateHandler(makeReq({
      body: {
        expectedId: 'plain-agent',
        identity: '# IDENTITY.md\n\n- **Name:** plain-agent\n- **Model:** openai/gpt-4o-mini\n',
        soul: '# SOUL\n\nUpdated soul\n',
        tools: '# TOOLS\n\nUpdated tools\n',
      },
    }), res)
    assert.strictEqual(res.statusCode, 200, 'Expected config validation success')
    assert.strictEqual(typeof res.jsonBody?.valid, 'boolean', 'Expected validation result payload')
  })

  await test('config update writes files, returns warnings, and resets runtime when the model changes', async () => {
    let resetCalls = 0
    await withAgentModelOverrides({
      upsertAgentModelInConfigFile: () => ({ ok: true, changed: true, model: 'openai/gpt-5' }),
      resetAgentSessionsForModelChange: () => {
        resetCalls += 1
        return { ok: true }
      },
    }, async () => {
      const handler = getRouteHandler('put', '/:id/config')
      const res = makeRes()
      await handler(makeReq({
        params: { id: 'plain-agent' },
        body: {
          identity: '# IDENTITY.md\n\n- **Name:** plain-agent\n- **Model:** openai/gpt-5\n',
          soul: '# SOUL\n\nUpdated soul\n',
          tools: '# TOOLS\n\nUpdated tools\n',
        },
      }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected config update success')
      assert.strictEqual(res.jsonBody?.ok, true, 'Expected ok response')
      assert.strictEqual(res.jsonBody?.model, 'openai/gpt-5', 'Expected returned normalized model')
      assert.strictEqual(resetCalls, 1, 'Expected runtime reset after model change')
      assert(/openai\/gpt-5/.test(fs.readFileSync(path.join(workspacePath, 'AGENTS', 'plain-agent', 'IDENTITY.md'), 'utf-8')), 'Expected updated identity model written')
      assert(/Updated soul/.test(fs.readFileSync(path.join(workspacePath, 'AGENTS', 'plain-agent', 'SOUL.md'), 'utf-8')), 'Expected updated SOUL written')
      assert(/Updated tools/.test(fs.readFileSync(path.join(workspacePath, 'AGENTS', 'plain-agent', 'TOOLS.md'), 'utf-8')), 'Expected updated TOOLS written')
    })
  })

  await test('config update surfaces model-config write failures as HTTP 500', async () => {
    await withAgentModelOverrides({
      upsertAgentModelInConfigFile: () => ({ ok: false, error: 'config write failed' }),
    }, async () => {
      const handler = getRouteHandler('put', '/:id/config')
      const res = makeRes()
      await handler(makeReq({
        params: { id: 'plain-agent' },
        body: {
          identity: '# IDENTITY.md\n\n- **Name:** plain-agent\n- **Model:** openai/gpt-5\n',
          soul: '# SOUL\n\nUpdated soul\n',
          tools: '# TOOLS\n\nUpdated tools\n',
        },
      }), res)
      assert.strictEqual(res.statusCode, 500, 'Expected config write failure to return HTTP 500')
      assert(/config write failed/i.test(res.jsonBody?.error || ''), 'Expected config update error surfaced')
    })
  })

  await test('model route updates IDENTITY.md and skips runtime reset when the model is unchanged', async () => {
    let resetCalls = 0
    await withAgentModelOverrides({
      upsertAgentModelInConfigFile: () => ({ ok: true, changed: false, model: 'openai/gpt-4o-mini' }),
      resetAgentSessionsForModelChange: () => {
        resetCalls += 1
        return { ok: true }
      },
    }, async () => {
      const handler = getRouteHandler('patch', '/:id/model')
      const res = makeRes()
      await handler(makeReq({
        params: { id: 'plain-agent' },
        body: { model: 'gpt-4o-mini' },
      }), res)
      assert.strictEqual(res.statusCode, 200, 'Expected model patch success')
      assert.strictEqual(res.jsonBody?.model, 'openai/gpt-4o-mini', 'Expected normalized model response')
      assert.strictEqual(resetCalls, 0, 'Expected no reset when the model did not change')
      assert(/openai\/gpt-4o-mini/.test(fs.readFileSync(path.join(workspacePath, 'AGENTS', 'plain-agent', 'IDENTITY.md'), 'utf-8')), 'Expected updated model in identity content')
    })
  })

  console.log(`\nTests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  if (testsFailed > 0) {
    console.log(`\n${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
