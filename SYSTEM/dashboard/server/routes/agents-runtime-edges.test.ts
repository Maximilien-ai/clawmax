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

const workspaceModulePath = require.resolve('../lib/workspace')
const workflowsModulePath = require.resolve('../lib/workflows')

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
    activeWorkspaceId: 'runtime-workspace',
    workspaces: [{
      id: 'runtime-workspace',
      name: 'Runtime Workspace',
      path: workspacePath,
      createdAt: '2026-06-25T00:00:00.000Z',
      lastAccessedAt: '2026-06-25T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
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

function getRouteHandler(method: 'get', routePath: string) {
  delete require.cache[require.resolve('./agents')]
  const router = require('./agents').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

async function withModuleOverrides<T>(
  modulePath: string,
  overrides: Record<string, any>,
  fn: () => Promise<T> | T,
): Promise<T> {
  delete require.cache[modulePath]
  const mod = require(modulePath)
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

async function withChildProcessExecSync<T>(stub: (command: string, options: any) => string, fn: () => Promise<T> | T): Promise<T> {
  const childProcess = require('child_process')
  const original = childProcess.execSync
  childProcess.execSync = stub
  delete require.cache[require.resolve('./agents')]
  try {
    return await fn()
  } finally {
    childProcess.execSync = original
    delete require.cache[require.resolve('./agents')]
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Agents Runtime Edge Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agents-runtime-test-'))
  const workspacePath = path.join(tmpHome, 'workspaces', 'runtime-workspace')
  ensureWorkspaceScaffold(workspacePath)
  writeWorkspaceRegistry(tmpHome, workspacePath)

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath

  const baseAgent = {
    id: 'runtime-agent',
    communities: [{ name: 'Ops Hub' }],
    groups: [{ name: 'Support Desk' }],
  }

  await test('health uses profile mode when a profile state directory exists', async () => {
    fs.mkdirSync(path.join(tmpHome, '.openclaw-runtime-agent'), { recursive: true })

    await withModuleOverrides(workspaceModulePath, {
      listAgents: () => [baseAgent],
    }, async () => {
      await withChildProcessExecSync((command) => {
        assert(command.includes('openclaw --profile runtime-agent health --json'), `Expected profile health command, got ${command}`)
        return JSON.stringify({ ok: true, agent: 'runtime-agent' })
      }, async () => {
        const handler = getRouteHandler('get', '/:id/health')
        const res = makeRes()
        await handler(makeReq({ params: { id: 'runtime-agent' } }), res)
        assert.strictEqual(res.statusCode, 200, 'Expected health route success')
        assert.strictEqual(res.jsonBody?.ok, true, 'Expected parsed health JSON response')
      })
    })
  })

  await test('health returns a 500 with the exec error message when the CLI health check fails', async () => {
    await withModuleOverrides(workspaceModulePath, {
      listAgents: () => [baseAgent],
    }, async () => {
      await withChildProcessExecSync(() => {
        throw new Error('health check failed')
      }, async () => {
        const handler = getRouteHandler('get', '/:id/health')
        const res = makeRes()
        await handler(makeReq({ params: { id: 'runtime-agent' } }), res)
        assert.strictEqual(res.statusCode, 500, 'Expected failed health command to return HTTP 500')
        assert(/health check failed/i.test(res.jsonBody?.error || ''), 'Expected CLI error to surface')
      })
    })
  })

  await test('gateway-status returns command output for valid agents', async () => {
    await withModuleOverrides(workspaceModulePath, {
      listAgents: () => [baseAgent],
    }, async () => {
      await withChildProcessExecSync((command) => {
        assert(command.includes('gateway status'), `Expected gateway status command, got ${command}`)
        return 'Gateway is healthy'
      }, async () => {
        const handler = getRouteHandler('get', '/:id/gateway-status')
        const res = makeRes()
        await handler(makeReq({ params: { id: 'runtime-agent' } }), res)
        assert.strictEqual(res.statusCode, 200, 'Expected gateway-status success')
        assert.strictEqual(res.jsonBody?.status, 'Gateway is healthy', 'Expected raw gateway status output')
      })
    })
  })

  await test('communities route returns community and group names for the resolved agent', async () => {
    await withModuleOverrides(workspaceModulePath, {
      listAgents: () => [baseAgent],
    }, async () => {
      const handler = getRouteHandler('get', '/:id/communities')
      const res = makeRes()
      await handler(makeReq({ params: { id: 'runtime-agent' } }), res)
      assert.strictEqual(res.statusCode, 200, 'Expected communities success')
      assert.deepStrictEqual(res.jsonBody, {
        communities: ['Ops Hub'],
        groups: ['Support Desk'],
      })
    })
  })

  await test('workflows route returns only workflows targeting the requested agent', async () => {
    await withModuleOverrides(workspaceModulePath, {
      listAgents: () => [baseAgent, { id: 'other-agent', communities: [], groups: [] }],
    }, async () => {
      await withModuleOverrides(workflowsModulePath, {
        listWorkflows: () => [
          { id: 'wf-1', name: 'Daily Standup', description: 'sync', enabled: true, schedule: 'manual' },
          { id: 'wf-2', name: 'Other Flow', description: 'other', enabled: false, schedule: '0 9 * * *' },
        ],
        resolveParticipants: (workflow: any) =>
          workflow.id === 'wf-1'
            ? [{ agentId: 'runtime-agent' }]
            : [{ agentId: 'other-agent' }],
      }, async () => {
        const handler = getRouteHandler('get', '/:id/workflows')
        const res = makeRes()
        await handler(makeReq({ params: { id: 'runtime-agent' } }), res)
        assert.strictEqual(res.statusCode, 200, 'Expected workflows success')
        assert.deepStrictEqual(res.jsonBody?.workflows, [{
          id: 'wf-1',
          name: 'Daily Standup',
          description: 'sync',
          enabled: true,
          schedule: 'manual',
        }])
      })
    })
  })

  await test('workflows route returns a structured 500 when participant resolution fails', async () => {
    await withModuleOverrides(workspaceModulePath, {
      listAgents: () => [baseAgent],
    }, async () => {
      await withModuleOverrides(workflowsModulePath, {
        listWorkflows: () => [{ id: 'wf-1', name: 'Broken Flow', description: 'broken', enabled: true, schedule: 'manual' }],
        resolveParticipants: () => {
          throw new Error('participant resolution exploded')
        },
      }, async () => {
        const handler = getRouteHandler('get', '/:id/workflows')
        const res = makeRes()
        await handler(makeReq({ params: { id: 'runtime-agent' } }), res)
        assert.strictEqual(res.statusCode, 500, 'Expected workflows failure to return HTTP 500')
        assert.strictEqual(res.jsonBody?.error, 'Failed to get agent workflows')
        assert(/participant resolution exploded/i.test(res.jsonBody?.message || ''), 'Expected underlying failure message')
      })
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
