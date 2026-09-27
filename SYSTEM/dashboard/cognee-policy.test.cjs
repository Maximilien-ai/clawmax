const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')

const script = fs.readFileSync(path.join(__dirname, 'docker-entrypoint.sh'), 'utf8')
const source = script.split("node <<'NODE'\n")[1].split('\nNODE')[0]
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-cognee-policy-'))
const configPath = path.join(root, 'openclaw.json')
const hostPath = path.join(root, 'host.json')
const original = {
  plugins: { deny: ['other-blocked', 'cognee-openclaw'], entries: { other: { enabled: false } } },
  agents: { list: [{ id: 'test-agent', workspace: '/workspace/test-agent' }] },
  gateway: { auth: { token: 'synthetic-only' } },
  models: { providers: { example: { apiKey: 'synthetic-key' } } },
}
function run(remove = false, strict = true, bundle) {
  vm.runInNewContext(source, { require, process: { env: {
    WORKING_CONFIG: configPath, HOST_CONFIG: hostPath,
    STRICT_PLUGIN_POLICY: String(strict), CLAWMAX_REMOVE_LEGACY_COGNEE_DENY: String(remove),
    CLAWMAX_BUNDLED_COGNEE_PATH: bundle,
  } } })
  return JSON.parse(fs.readFileSync(configPath, 'utf8'))
}
try {
  fs.writeFileSync(configPath, JSON.stringify(original))
  assert.deepEqual(run(), original, 'unmarked administrator deny must survive by default')
  const expected = structuredClone(original)
  expected.plugins.deny = ['other-blocked']
  assert.deepEqual(run(true), expected, 'only the authorized Cognee deny may change')
  const backup = `${configPath}.pre-cognee-policy.json`
  assert.deepEqual(JSON.parse(fs.readFileSync(backup, 'utf8')), original)
  assert.equal(fs.statSync(backup).mode & 0o777, 0o600)
  assert.deepEqual(run(true), expected, 'migration must be idempotent')
  assert.deepEqual(JSON.parse(fs.readFileSync(backup, 'utf8')), original)

  fs.writeFileSync(hostPath, JSON.stringify({ plugins: original.plugins }))
  assert.deepEqual(run().plugins, original.plugins, 'host restrictions remain authoritative without opt-in')
  assert.deepEqual(run(true).plugins, expected.plugins)
  assert.deepEqual(JSON.parse(fs.readFileSync(hostPath, 'utf8')), { plugins: original.plugins }, 'never mutate host input')
  fs.unlinkSync(hostPath)

  fs.writeFileSync(configPath, JSON.stringify({ plugins: { deny: ['cognee-openclaw'] } }))
  assert.deepEqual(run(true, false), { plugins: {} }, 'cleanup works independently of strict-policy normalization')
  const enabled = { plugins: { allow: ['cognee-openclaw'], entries: { 'cognee-openclaw': { enabled: true } } } }
  fs.writeFileSync(configPath, JSON.stringify(enabled))
  assert.deepEqual(run(true), enabled, 'explicit Cognee enablement is preserved, not denied')
  fs.writeFileSync(configPath, '{malformed')
  assert.throws(() => run(true))
  assert.equal(fs.readFileSync(configPath, 'utf8'), '{malformed')
  const bundle = path.join(root, 'bundle')
  fs.mkdirSync(bundle)
  fs.writeFileSync(path.join(bundle, 'openclaw.plugin.json'), JSON.stringify({ id: 'cognee-openclaw' }))
  fs.writeFileSync(configPath, JSON.stringify(original))
  const bundled = run(false, true, bundle)
  assert.equal(bundled.plugins.entries['cognee-openclaw'].enabled, false)
  assert.deepEqual(bundled.plugins.deny, original.plugins.deny)
  assert.deepEqual(bundled.agents, original.agents)
  assert.deepEqual(bundled.gateway, original.gateway)
  assert.deepEqual(run(false, true, bundle), bundled, 'bundle registration is idempotent')
  bundled.plugins.entries['cognee-openclaw'] = { enabled: true, config: { synthetic: true } }
  fs.writeFileSync(configPath, JSON.stringify(bundled))
  assert.deepEqual(run(false, true, bundle), bundled, 'preserve explicit enablement and configuration')
  const customInstall = { plugins: { installs: { 'cognee-openclaw': { installPath: '/custom/plugin' } } } }
  fs.writeFileSync(configPath, JSON.stringify(customInstall))
  assert.deepEqual(run(false, true, bundle), customInstall, 'do not shadow existing installations')
  fs.writeFileSync(configPath, '{}')
  fs.writeFileSync(path.join(bundle, 'openclaw.plugin.json'), JSON.stringify({ id: 'wrong-plugin' }))
  assert.throws(() => run(false, true, bundle))
  assert.equal(fs.readFileSync(configPath, 'utf8'), '{}')
  console.log('Cognee policy migration tests passed')
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}
