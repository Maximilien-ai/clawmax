const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

function callerFixture(t) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-skill-isolation-'))
 t.after(() => fs.rmSync(root, { recursive: true, force: true }))
 const fixtureHome = path.join(root, 'home')
 const originalWorkspace = path.join(root, 'personal')
 const liveWorkspace = path.join(root, 'live-runtime')
 for (const directory of [path.join(fixtureHome, '.openclaw'), originalWorkspace, liveWorkspace]) fs.mkdirSync(directory, { recursive: true })
 const registry = path.join(fixtureHome, '.openclaw/dashboard-workspaces.json')
 const original = JSON.stringify({ version: '1.0.0', activeWorkspaceId: 'default', workspaces: [{ id: 'default', name: 'Synthetic Personal', path: originalWorkspace, createdAt: '2026-01-01T00:00:00Z', lastAccessedAt: '2026-01-01T00:00:00Z' }] })
 fs.writeFileSync(registry, original)
 const env = { ...process.env, HOME: fixtureHome, OPENCLAW_WORKSPACE: liveWorkspace }
 for (const key of ['CLAWMAX_TEST_WORKSPACE', 'CLAWMAX_WORKSPACE_REGISTRY_PATH', 'OPENCLAW_CONFIG_PATH', 'OPENCLAW_STATE_DIR', 'OPENCLAW_GATEWAY_TOKEN', 'OPENCLAW_GATEWAY_PORT']) delete env[key]
 const dashboard = path.join(__dirname, 'dashboard')
 return { root, registry, original, liveWorkspace, fixtureHome, env, dashboard }
}
function assertPreserved({ registry, original, liveWorkspace }, result) {
 assert.equal(fs.readFileSync(registry, 'utf8'), original, 'Unit fixtures must preserve every byte of the caller registry')
 assert.deepEqual(fs.readdirSync(liveWorkspace), [], 'Unit fixtures must not initialize the caller live workspace')
 assert.equal(result.status, 0, (result.stderr || result.stdout || String(result.error)).slice(-2000))
}
test('standalone skill-import tests preserve the caller registry and live workspace', t => {
 const fixture = callerFixture(t)
 const result = spawnSync(process.execPath, [path.join(fixture.dashboard, 'node_modules/ts-node/dist/bin.js'), '--transpileOnly', 'server/routes/skills-import-edges.test.ts'], { cwd: fixture.dashboard, env: fixture.env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 })
 assertPreserved(fixture, result)
 assert.match(result.stdout, /All tests passed/)
})
test('the unit-phase boundary isolates implicit WorkspaceManager defaults and restores the caller environment', t => {
 const fixture = callerFixture(t)
 const script = [
  'set -eu',
  '. "$1"',
  'clawmax_enter_unit_environment',
  'unit_fixture_home="$HOME"',
  'node -r ts-node/register/transpile-only -e "$2"',
  'for unit_case in server/routes/skills.test.ts server/lib/workflows.test.ts server/lib/template-registry.test.ts; do',
  '  node -r ts-node/register/transpile-only "$unit_case"',
  'done',
  'clawmax_leave_unit_environment',
  '[ ! -d "$unit_fixture_home" ]',
  '[ "$HOME" = "$CLAWMAX_EXPECT_CALLER_HOME" ]',
  '[ "$OPENCLAW_WORKSPACE" = "$CLAWMAX_EXPECT_CALLER_WORKSPACE" ]',
 ].join('\n')
 const probe = 'const assert=require("node:assert/strict"); const {WorkspaceManager}=require("./server/lib/workspace-manager"); const manager=new WorkspaceManager(); const registry=manager.loadRegistry(); assert.notEqual(process.env.HOME,process.env.CLAWMAX_EXPECT_CALLER_HOME); assert.equal(registry.workspaces[0].path,process.env.OPENCLAW_WORKSPACE);'
 const env = { ...fixture.env, CLAWMAX_EXPECT_CALLER_HOME: fixture.fixtureHome, CLAWMAX_EXPECT_CALLER_WORKSPACE: fixture.liveWorkspace }
 const result = spawnSync('bash', ['-c', script, 'unit-boundary-probe', path.join(__dirname, 'test-unit-environment.sh'), probe], { cwd: fixture.dashboard, env, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 })
 assertPreserved(fixture, result)
})
