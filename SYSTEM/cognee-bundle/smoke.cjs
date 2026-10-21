const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const bundle = process.env.CLAWMAX_BUNDLED_COGNEE_PATH
assert(bundle, 'bundled path is required')
const pkg = JSON.parse(fs.readFileSync(path.join(bundle, 'package.json'), 'utf8'))
assert.equal(pkg.version, '2026.9.2')
assert.equal(JSON.parse(fs.readFileSync(path.join(bundle, 'openclaw.plugin.json'), 'utf8')).id, 'cognee-openclaw')
for (const entry of pkg.openclaw.extensions) assert(fs.statSync(path.join(bundle, entry)).isFile())
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cognee-image-smoke-'))
try {
  const script = fs.readFileSync(process.env.CLAWMAX_ENTRYPOINT_PATH || '/app/SYSTEM/dashboard/docker-entrypoint.sh', 'utf8')
  const source = script.split("node <<'NODE'\n")[1].split('\nNODE')[0]
  const configPath = path.join(root, 'openclaw.json')
  vm.runInNewContext(source, { require, process: { env: {
    WORKING_CONFIG: configPath, CLAWMAX_BUNDLED_COGNEE_PATH: bundle,
  } } })
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  assert.equal(config.plugins.entries['cognee-openclaw'].enabled, false)
  assert.deepEqual(config.plugins.load.paths, [bundle])
  assert(!config.plugins.deny)
  const output = execFileSync('openclaw', ['plugins', 'list', '--json'], {
    env: { ...process.env, OPENCLAW_CONFIG_PATH: configPath, OPENCLAW_STATE_DIR: root },
    timeout: 60000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })
  const inventory = JSON.parse(output)
  const plugin = inventory.plugins.find(entry => entry.id === 'cognee-openclaw')
  assert(plugin, 'OpenClaw must discover bundled Cognee')
  assert.equal(plugin.enabled, false, 'unconfigured plugin must remain inactive')
  assert.notEqual(plugin.status, 'error', 'discovery must not fail')
  console.log('Pinned Cognee package and inactive startup registration verified')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
