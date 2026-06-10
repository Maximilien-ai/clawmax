/**
 * Doctor gateway recovery route regression tests.
 *
 * Run with: npx ts-node --transpileOnly server/routes/doctor-gateway-recovery.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalOpenClawBin = process.env.OPENCLAW_BIN
const gatewayRpcModulePath = require.resolve('../lib/gateway-rpc')

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

function setupWorkspace(tmpHome: string) {
  const workspacePath = path.join(tmpHome, 'workspaces', 'doctor-workspace')
  fs.mkdirSync(path.join(workspacePath, 'AGENTS'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), '# Communities\n\n## Communities\n\n', 'utf-8')
  fs.writeFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), '# Groups\n\n## Groups\n\n', 'utf-8')

  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'doctor-workspace',
    workspaces: [{
      id: 'doctor-workspace',
      name: 'Doctor Workspace',
      path: workspacePath,
      createdAt: '2026-06-10T00:00:00.000Z',
      lastAccessedAt: '2026-06-10T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
  fs.writeFileSync(path.join(tmpHome, '.openclaw', 'openclaw.json'), JSON.stringify({ agents: { list: [] } }, null, 2))

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath
}

function getDoctorHandler() {
  delete require.cache[require.resolve('./agents')]
  const router = require('./agents').default
  const layer = router.stack.find((entry: any) => entry.route?.path === '/doctor' && entry.route?.methods?.post)
  if (!layer) throw new Error('Route POST /doctor not found')
  return layer.route.stack[0].handle as Function
}

async function withGatewayRpcStubs<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  delete require.cache[gatewayRpcModulePath]
  const gatewayRpc = require('../lib/gateway-rpc')
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, gatewayRpc[key]]))
  Object.assign(gatewayRpc, overrides)
  try {
    return await fn()
  } finally {
    Object.assign(gatewayRpc, originals)
    delete require.cache[require.resolve('./agents')]
  }
}

async function withChildProcessStubs<T>(overrides: Record<string, any>, fn: () => Promise<T> | T): Promise<T> {
  const childProcess = require('child_process')
  const originals = Object.fromEntries(Object.keys(overrides).map((key) => [key, childProcess[key]]))
  Object.assign(childProcess, overrides)
  delete require.cache[require.resolve('./agents')]
  try {
    return await fn()
  } finally {
    Object.assign(childProcess, originals)
    delete require.cache[require.resolve('./agents')]
  }
}

function writeFakeOpenClawCli(tmpHome: string): string {
  const cliPath = path.join(tmpHome, 'openclaw')
  fs.writeFileSync(cliPath, '#!/bin/sh\necho "openclaw 2026.5.26"\n', 'utf-8')
  fs.chmodSync(cliPath, 0o755)
  return cliPath
}

function makeReq(body: Record<string, any>) {
  return { params: {}, query: {}, body, headers: {} } as any
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

async function run() {
  console.log(`\n${YELLOW}=== Doctor Gateway Recovery Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-doctor-gateway-test-'))
  setupWorkspace(tmpHome)
  process.env.OPENCLAW_BIN = writeFakeOpenClawCli(tmpHome)

  await test('doctor auto-fix reports structured gateway restart success', async () => {
    let probeCalls = 0
    let runningCalls = 0
    await withGatewayRpcStubs({
      probeGatewayResponsive: async () => {
        probeCalls += 1
        return probeCalls === 1
          ? { running: false, port: 18789, error: 'connection refused' }
          : { running: true, port: 18789 }
      },
      isGatewayRunning: () => {
        runningCalls += 1
        return { running: runningCalls > 1, port: 18789 }
      },
      getConfiguredGatewayPort: () => 18789,
    }, async () => {
      await withChildProcessStubs({ execSync: () => 'Gateway restarted' }, async () => {
        const res = makeRes()
        await getDoctorHandler()(makeReq({ fix: true }), res)

        assert.strictEqual(res.statusCode, 200)
        assert.strictEqual(res.jsonBody?.platform?.gateway, true)
        assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.attempted, true)
        assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.status, 'restarted')
      })
    })
  })

  await test('doctor reports structured gateway recovery when auto-fix is not requested', async () => {
    await withGatewayRpcStubs({
      probeGatewayResponsive: async () => ({ running: false, port: 18789, error: 'connection refused' }),
      isGatewayRunning: () => ({ running: false, port: 18789 }),
      getConfiguredGatewayPort: () => 18789,
    }, async () => {
      const res = makeRes()
      await getDoctorHandler()(makeReq({ fix: false }), res)

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.attempted, false)
      assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.status, 'not-attempted')
      assert(/not running/i.test(res.jsonBody?.platform?.gatewayRecovery?.message || ''))
    })
  })

  await test('doctor auto-fix reports structured gateway restart failure', async () => {
    await withGatewayRpcStubs({
      probeGatewayResponsive: async () => ({ running: false, port: 18789, error: 'connection refused' }),
      isGatewayRunning: () => ({ running: false, port: 18789 }),
      getConfiguredGatewayPort: () => 18789,
    }, async () => {
      await withChildProcessStubs({
        execSync: () => {
          const err: any = new Error('restart exploded')
          err.stderr = 'gateway restart failed hard'
          throw err
        },
      }, async () => {
        const res = makeRes()
        await getDoctorHandler()(makeReq({ fix: true }), res)

        assert.strictEqual(res.statusCode, 200)
        assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.attempted, true)
        assert.strictEqual(res.jsonBody?.platform?.gatewayRecovery?.status, 'failed')
        assert(/gateway restart failed/i.test(res.jsonBody?.platform?.gatewayRecovery?.message || ''))
      })
    })
  })

  fs.rmSync(tmpHome, { recursive: true, force: true })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
  else process.env.OPENCLAW_BIN = originalOpenClawBin

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
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
  else process.env.OPENCLAW_BIN = originalOpenClawBin
  console.error(err)
  process.exit(1)
})
