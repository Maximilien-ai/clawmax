import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resetWorkspaceManagerForTests } from '../lib/workspace-manager'

const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-secret-broker-routes-'))
const workspace = path.join(tempHome, 'workspace')
fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
fs.mkdirSync(path.join(workspace, 'AGENTS', 'route-agent'), { recursive: true })
fs.mkdirSync(path.join(tempHome, '.openclaw'), { recursive: true })
fs.writeFileSync(path.join(tempHome, '.openclaw', 'openclaw.json'), JSON.stringify({
  agents: { list: [{
    id: 'route-agent',
    name: 'Route Agent',
    workspace: path.join(workspace, 'AGENTS', 'route-agent'),
    skills: ['clawmax-secret-test'],
  }] },
}, null, 2))
process.env.HOME = tempHome
process.env.OPENCLAW_WORKSPACE = workspace
process.env.CLAWMAX_TEST_WORKSPACE = workspace
process.env.CLAWMAX_SECRET_MASTER_KEY = 'route-test-master-key-that-is-longer-than-thirty-two'
resetWorkspaceManagerForTests()

const routes = require('./skill-secret-broker')
const broker = require('../lib/skill-secret-broker') as typeof import('../lib/skill-secret-broker')
let passed = 0
let failed = 0

function handler(router: any, method: string, routePath: string): Function {
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle
}

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this },
    json(body: any) { this.body = body; return this },
  }
}

async function invoke(router: any, method: string, routePath: string, req: any) {
  const res = response()
  await handler(router, method, routePath)(req, res)
  return res
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (error: any) {
    console.error(`✗ ${name}: ${error.message}`)
    failed++
  }
}

async function run() {
  let grantId = ''
  await test('status exposes masked inventory contract only', async () => {
    const res = await invoke(routes.skillSecretBrokerRouter, 'get', '/status', { params: {}, body: {}, headers: {} })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.body.configured, true)
    assert.deepStrictEqual(res.body.secrets, [])
    assert.deepStrictEqual(res.body.registeredSkills, ['clawmax-secret-test'])
  })

  await test('secret write returns summary without plaintext', async () => {
    const res = await invoke(routes.skillSecretBrokerRouter, 'put', '/secrets/:key', {
      params: { key: 'CLAWMAX_TEST_SECRET' }, body: { value: 'route-secret-sentinel-7712' }, headers: {},
    })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.body.secrets[0].key, 'CLAWMAX_TEST_SECRET')
    assert(!JSON.stringify(res.body).includes('route-secret-sentinel-7712'))
  })

  await test('grant route binds assigned skill and exact key', async () => {
    const res = await invoke(routes.skillSecretBrokerRouter, 'post', '/grants', {
      params: {}, body: { agentId: 'route-agent', skillId: 'clawmax-secret-test', keys: ['CLAWMAX_TEST_SECRET'] }, headers: {},
    })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.body.grant.agentId, 'route-agent')
    grantId = res.body.grant.id
  })

  await test('admin test route runs masked fixed action', async () => {
    const res = await invoke(routes.skillSecretBrokerRouter, 'post', '/grants/:grantId/test', {
      params: { grantId }, body: { action: 'check' }, headers: {},
    })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(JSON.parse(res.body.stdout).secretAvailable, true)
    assert(!JSON.stringify(res.body).includes('route-secret-sentinel-7712'))
  })

  await test('runtime route rejects missing capability', async () => {
    const res = await invoke(routes.skillSecretBrokerRuntimeRouter, 'post', '/execute', {
      params: {}, body: { skillId: 'clawmax-secret-test', action: 'check' }, headers: {},
    })
    assert.strictEqual(res.statusCode, 401)
  })

  await test('runtime route derives agent identity from signed capability', async () => {
    const token = broker.createBrokerCapabilityToken('route-agent', workspace)
    const res = await invoke(routes.skillSecretBrokerRuntimeRouter, 'post', '/execute', {
      params: {}, body: { skillId: 'clawmax-secret-test', action: 'check', agentId: 'spoofed-agent' }, headers: { authorization: `Bearer ${token}` },
    })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(JSON.parse(res.body.stdout).secretAvailable, true)
  })

  await test('revocation route blocks the next runtime execution', async () => {
    const revoked = await invoke(routes.skillSecretBrokerRouter, 'delete', '/grants/:grantId', {
      params: { grantId }, body: {}, headers: {},
    })
    assert.strictEqual(revoked.statusCode, 200)
    const token = broker.createBrokerCapabilityToken('route-agent', workspace)
    const denied = await invoke(routes.skillSecretBrokerRuntimeRouter, 'post', '/execute', {
      params: {}, body: { skillId: 'clawmax-secret-test', action: 'check' }, headers: { authorization: `Bearer ${token}` },
    })
    assert.strictEqual(denied.statusCode, 403)
    assert(/No active secret grant/i.test(denied.body.error))
  })

  await test('malformed keys return a client error', async () => {
    const res = await invoke(routes.skillSecretBrokerRouter, 'put', '/secrets/:key', {
      params: { key: 'bad.key' }, body: { value: 'ignored' }, headers: {},
    })
    assert.strictEqual(res.statusCode, 400)
  })

  console.log(`\nTests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  if (failed > 0) process.exitCode = 1
}

run().finally(() => {
  fs.rmSync(tempHome, { recursive: true, force: true })
})
