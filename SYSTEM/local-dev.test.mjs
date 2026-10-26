import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { isolatedEnv, stop } from './local-dev.mjs'

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
