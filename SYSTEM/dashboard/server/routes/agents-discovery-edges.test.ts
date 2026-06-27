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
const modelDiscoveryModulePath = require.resolve('../lib/model-discovery')
const childProcessModulePath = require.resolve('child_process')

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
    activeWorkspaceId: 'discovery-workspace',
    workspaces: [{
      id: 'discovery-workspace',
      name: 'Discovery Workspace',
      path: workspacePath,
      createdAt: '2026-06-27T00:00:00.000Z',
      lastAccessedAt: '2026-06-27T00:00:00.000Z',
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

function getRouteHandler(method: 'get' | 'post', routePath: string) {
  delete require.cache[require.resolve('./agents')]
  const router = require('./agents').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[layer.route.stack.length - 1].handle as Function
}

async function withOverrides<T>(
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

async function run() {
  console.log(`\n${YELLOW}=== Agents Discovery Edge Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agents-discovery-test-'))
  const workspacePath = path.join(tmpHome, 'workspaces', 'discovery-workspace')
  ensureWorkspaceScaffold(workspacePath)
  writeWorkspaceRegistry(tmpHome, workspacePath)

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath

  await test('next route derives an id from cloneFrom and uses the returned free port', async () => {
    await withOverrides(workspaceModulePath, {
      getNextAgentId: (cloneFrom?: string) => {
        assert.strictEqual(cloneFrom, 'qa-lead')
        return 'qa-lead7'
      },
      findFreePort: async (preferredPort: number) => {
        assert.strictEqual(preferredPort, 19589, 'Expected suffix-based preferred port')
        return 19601
      },
    }, async () => {
      const handler = getRouteHandler('get', '/next')
      const res = makeRes()
      await handler(makeReq({ query: { cloneFrom: 'qa-lead' } }), res)
      assert.strictEqual(res.statusCode, 200)
      assert.deepStrictEqual(res.jsonBody, { id: 'qa-lead7', port: 19601 })
    })
  })

  await test('status route reports online offline and unknown agent counts from the workspace list', async () => {
    const childProcess = require(childProcessModulePath)
    const originalExecSync = childProcess.execSync
    try {
      childProcess.execSync = (command: string) => {
        if (command === 'which openclaw') return '/usr/local/bin/openclaw\n'
        if (command.includes('openclaw.*gateway')) return 'gateway-one\ngateway-two\n'
        throw new Error(`Unexpected command: ${command}`)
      }
      await withOverrides(workspaceModulePath, {
        listAgents: () => [
          { id: 'a1', status: 'online' },
          { id: 'a2', status: 'offline' },
          { id: 'a3', status: 'unknown' },
          { id: 'a4', status: 'online' },
        ],
      }, async () => {
        const handler = getRouteHandler('get', '/status')
        const res = makeRes()
        await handler(makeReq(), res)
        assert.strictEqual(res.statusCode, 200)
        assert.strictEqual(res.jsonBody?.total, 4)
        assert.strictEqual(res.jsonBody?.online, 2)
        assert.strictEqual(res.jsonBody?.offline, 1)
        assert.strictEqual(res.jsonBody?.unknown, 1)
        assert.strictEqual(res.jsonBody?.gatewayAvailable, true)
        assert.strictEqual(res.jsonBody?.runningGateways, 2)
      })
    } finally {
      childProcess.execSync = originalExecSync
      delete require.cache[require.resolve('./agents')]
    }
  })

  await test('models route returns a 500 when discovery throws', async () => {
    await withOverrides(modelDiscoveryModulePath, {
      discoverModels: async () => {
        throw new Error('discovery backend exploded')
      },
    }, async () => {
      const handler = getRouteHandler('get', '/models')
      const res = makeRes()
      await handler(makeReq({ query: { showAll: 'true' } }), res)
      assert.strictEqual(res.statusCode, 500)
      assert.strictEqual(res.jsonBody?.error, 'Failed to discover models')
    })
  })

  await test('models refresh returns a 500 after clearing cache when discovery throws', async () => {
    let cleared = 0
    await withOverrides(modelDiscoveryModulePath, {
      clearModelCache: () => { cleared += 1 },
      discoverModels: async () => {
        throw new Error('refresh discovery exploded')
      },
    }, async () => {
      const handler = getRouteHandler('post', '/models/refresh')
      const res = makeRes()
      await handler(makeReq({ body: { showAll: true } }), res)
      assert.strictEqual(cleared, 1, 'Expected cache clear before refresh discovery')
      assert.strictEqual(res.statusCode, 500)
      assert.strictEqual(res.jsonBody?.error, 'Failed to refresh models')
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
