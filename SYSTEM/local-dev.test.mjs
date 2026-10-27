import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { isolatedEnv, stop, waitForDashboard, openBrowser, checkDevPorts } from './local-dev.mjs'

test('local dev isolates credentials, profile, plugins and registry', () => {
  const names = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENCLAW_PROFILE', 'CLAWMAX_PLUGIN_PATHS', 'CLAWMAX_TEST_WORKSPACE', 'OPENCLAW_STATE_DIR']
  const saved = names.map(name => process.env[name])
  try {
    names.forEach(name => { process.env[name] = 'host-secret-or-path' })
    const env = isolatedEnv('/tmp/dev', '/cache/openclaw', { token: 'isolated', apiPort: 3005, clientPort: 5178, gatewayPort: 19000 })
    for (const name of names.slice(0, -1)) assert.equal(env[name], undefined)
    assert.equal(env.HOME, '/tmp/dev/home')
    assert.equal(env.OPENCLAW_STATE_DIR, '/tmp/dev/home/.openclaw')
    assert.equal(env.OPENCLAW_CONFIG_PATH, '/tmp/dev/home/.openclaw/openclaw.json')
    assert.equal(env.CLAWMAX_WORKSPACE_REGISTRY_PATH, '/tmp/dev/registry.json')
    assert.equal(env.CLAWMAX_SKIP_GATEWAY_BOOTSTRAP, 'true')
    assert.equal(env.DASHBOARD_HOST, '127.0.0.1')
    assert.equal(env.OPENCLAW_GATEWAY_TOKEN, 'isolated')
  } finally {
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i] })
  }
})

const expected = { version: 'review-sha', workspace: '/isolated/workspace' }
test('occupied dev port explains existing session, saved ports and safe recovery', async () => {
  const checked = []
  await assert.rejects(checkDevPorts({ apiPort: 3005, clientPort: 5178, gatewayPort: 19000 }, async port => {
    checked.push(port)
    throw Object.assign(new Error('occupied'), { code: 'EADDRINUSE' })
  }), error => {
    for (const text of ['Port 3005', 'http://localhost:5178', 'Ctrl-C', 'lsof', '--root restart retains its saved ports', 'No existing process was stopped']) assert(error.message.includes(text))
    return true
  })
  assert.deepEqual(checked, [3005])
})
const readiness = { apiUrl: 'http://api', uiUrl: 'http://ui', ...expected, interval: 1, timeout: 1000 }
test('readiness waits for both servers and the frontend proxy to reach the expected instance', async () => {
  let round = 0
  const requested = []
  await waitForDashboard({ ...readiness, request: async url => {
    requested.push(url)
    if (url === 'http://api/api/system') round++
    return { ok: round > 1, json: async () => ({ ...expected, version: round > 2 ? expected.version : 'other-instance' }) }
  } })
  assert.equal(round, 3)
  assert(requested.includes('http://ui/api/system'))
})
test('failed startup times out without reporting ready', async () => {
  await assert.rejects(waitForDashboard({ ...readiness, timeout: 0, request: async () => { throw Error('connection refused') } }), /did not become ready.*Browser was not opened/)
})
test('readiness stops immediately when the supervised process exits', async () => {
  let requested = false
  await assert.rejects(waitForDashboard({ ...readiness, check: () => { throw Error('Dashboard exited') }, request: async () => { requested = true } }), /Dashboard exited/)
  assert.equal(requested, false)
})
test('browser launch uses the ready URL and failure leaves manual opening available', () => {
  const calls = []
  assert.equal(openBrowser('http://localhost:5178', { platform: 'darwin', launch: (...args) => calls.push(args) }), true)
  assert.deepEqual(calls[0].slice(0, 2), ['open', ['http://localhost:5178']])
  assert.equal(openBrowser('http://localhost:5178', { platform: 'linux', launch: () => { throw Error('headless') } }), false)
})

test('stop terminates only its detached process group', async () => {
  const own = spawn(process.execPath, ['-e', 'console.log("ready");setInterval(()=>{},1000)'], { detached: true })
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true })
  try {
    await once(own.stdout, 'data')
    await stop(own)
    assert.notEqual(own.signalCode, null)
    assert.equal(unrelated.exitCode, null)
    assert.equal(unrelated.signalCode, null)
  } finally { await stop(own); await stop(unrelated) }
})
