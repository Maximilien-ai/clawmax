// Opt-in real pinned-runtime qualification. Run with that runtime's tsx loader.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
const require = createRequire(import.meta.url)
const { preflight } = require('./sqlite-preflight.cjs')
const { checkSchemas, EXPECTED_AGENT_SCHEMA } = require('../openclaw-schema-gate.cjs')

const source = process.env.CLAWMAX_TEST_OPENCLAW_PACKAGE_ROOT
assert(source, 'Explicit pinned runtime source required')
assert(process.env.OPENCLAW_BIN, 'Explicit pinned runtime binary required')
// Upstream maintenance heartbeat workers resolve workspace package aliases from
// their working directory as well as the parent loader's tsconfig.
process.chdir(source)
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-sqlite-persisted-')))
const state = path.join(root, 'state')
const config = path.join(root, 'openclaw.json')
Object.assign(process.env, { OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: config, OPENCLAW_WORKSPACE: path.join(root, 'workspace') })
delete process.env.OPENCLAW_PROFILE
const load = relative => import(pathToFileURL(path.join(source, relative)).href)
const agent = await load('src/state/openclaw-agent-db.ts')
const shared = await load('src/state/openclaw-state-db.ts')
const fixtures = await load('src/state/openclaw-agent-db.test-support.ts')
fs.writeFileSync(config, JSON.stringify({ gateway: { mode: 'local' }, plugins: { enabled: false }, agents: { entries: { 'fixture-agent': { default: true } } } }), { mode: 0o600 })
const databasePath = agent.openOpenClawAgentDatabase({ agentId: 'fixture-agent', env: process.env }).path
agent.closeOpenClawAgentDatabasesForTest()
shared.closeOpenClawStateDatabaseForTest()
const hash = () => createHash('sha256').update(fs.readFileSync(databasePath)).digest('hex')
const before = hash()
const current = preflight()
assert.equal(current.ready, false, 'Uninspected persisted inventory must not qualify')
assert.equal(current.code, 'sqlite_preflight_inventory_incomplete')
assert.equal(hash(), before, 'Validation must preserve database bytes')
console.log('PASS: SQLite-only inventory omission rejected; database unchanged')
const legacy = new DatabaseSync(databasePath)
fixtures.removeCanonicalValidationFromHistoricalAgentFixture(legacy)
legacy.exec(`DROP TABLE session_transcript_cold_archives;
  PRAGMA user_version = 19;
  UPDATE schema_meta SET schema_version = 19 WHERE meta_key = 'primary';
  INSERT INTO session_nodes (session_key, current_session_id, entry_json, updated_at)
    VALUES ('agent:fixture-agent:history', 'fixture-window', '{"sessionId":"fixture-window","updatedAt":20}', 20);
  INSERT INTO session_windows (session_id, session_key, created_at, updated_at)
    VALUES ('fixture-window', 'agent:fixture-agent:history', 10, 20);
  INSERT INTO transcript_events (session_id, seq, event_json, created_at)
    VALUES ('fixture-window', 1, '{"type":"message","text":"synthetic preservation check"}', 11);`)
const tables = ['session_nodes', 'session_windows', 'transcript_events']
// Schema 21 deliberately rebuilds entry_valid, a derived validation projection.
// Preserve every other column and assert the rebuilt projection separately.
const snapshot = database => tables.map(table => database.prepare(`SELECT * FROM ${table}`).all().map(row => {
  const copy = { ...row }
  if (table === 'session_nodes') delete copy.entry_valid
  return copy
}))
const retained = snapshot(legacy)
legacy.close()
const legacyBefore = hash()
const old = preflight()
assert.equal(old.ready, false, 'Historical schema must not receive successful qualification')
assert.equal(hash(), legacyBefore, 'Refused historical schema must remain unchanged')
console.log('PASS: historical schema refused and unchanged')
const { OPENCLAW_AGENT_SCHEMA_VERSION } = await load('src/state/openclaw-agent-db-contract.ts')
if (process.env.CLAWMAX_TEST_PACKAGED_STARTUP === 'true') {
  const reservation = net.createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  const token = 'synthetic-isolated-gateway-token'
  const cfg = JSON.parse(fs.readFileSync(config, 'utf8'))
  cfg.gateway = { mode: 'local', bind: 'loopback', port, auth: { mode: 'token', token }, controlUi: { enabled: false } }
  cfg.agents.defaults = { workspace: path.join(root, 'workspace'), heartbeat: { every: '0m' } }
  cfg.cron = { enabled: false }
  fs.writeFileSync(config, JSON.stringify(cfg), { mode: 0o600 })
  const log = fs.openSync(path.join(root, 'gateway.log'), 'w', 0o600)
  const gateway = spawn(process.env.OPENCLAW_BIN, ['gateway', 'run', '--port', String(port), '--bind', 'loopback'], {
    env: { ...process.env, OPENCLAW_NO_RESPAWN: '1', OPENCLAW_SKIP_CHANNELS: '1', OPENCLAW_DISABLE_BONJOUR: '1' },
    cwd: root, detached: true, stdio: ['ignore', log, log],
  })
  let spawnError
  gateway.on('error', error => { spawnError = error })
  try {
    let ready = false
    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      assert(!spawnError && gateway.exitCode === null && gateway.signalCode === null, 'Isolated gateway exited before authenticated readiness')
      const probe = spawnSync(process.env.OPENCLAW_BIN, ['gateway', 'call', 'health', '--json', '--timeout', '3000', '--url', `ws://127.0.0.1:${port}`, '--token', token], { env: process.env, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 })
      if (probe.status === 0) { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    assert(ready, 'Packaged runtime failed authenticated startup within 180 seconds')
  } finally {
    if (gateway.pid && gateway.exitCode === null && gateway.signalCode === null) {
      process.kill(-gateway.pid, 'SIGTERM')
      const deadline = Date.now() + 30000
      while (gateway.exitCode === null && gateway.signalCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
      if (gateway.exitCode === null && gateway.signalCode === null) {
        process.kill(-gateway.pid, 'SIGKILL')
        throw new Error('Isolated gateway did not settle after graceful stop')
      }
    }
    fs.closeSync(log)
  }
  const db = new DatabaseSync(databasePath, { readOnly: true })
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 19)
    assert.deepEqual(snapshot(db), retained)
  } finally { db.close() }
  assert.equal(checkSchemas(state).code, 'agent_schema_maintenance_required')
  console.log('PASS: schema gate rejects legacy storage despite authenticated gateway health; history preserved')
}
await agent.withAgentDatabaseMaintenanceLease({ env: process.env }, async maintenance => {
  await agent.migrateOpenClawAgentDatabaseForMaintenance({ agentId: 'fixture-agent', pathname: databasePath }, maintenance)
})
const migrated = agent.openOpenClawAgentDatabase({ agentId: 'fixture-agent', env: process.env })
assert.equal(migrated.db.prepare('PRAGMA user_version').get().user_version, OPENCLAW_AGENT_SCHEMA_VERSION)
assert.equal(EXPECTED_AGENT_SCHEMA, OPENCLAW_AGENT_SCHEMA_VERSION, 'Startup gate must match the pinned runtime schema')
assert.deepEqual(checkSchemas(state), { ready: true, checked: 1 })
assert.equal(migrated.db.prepare('SELECT entry_valid FROM session_nodes').get().entry_valid, 1)
assert.deepEqual(snapshot(migrated.db), retained, 'Migration must preserve synthetic history exactly')
agent.closeOpenClawAgentDatabasesForTest()
shared.closeOpenClawStateDatabaseForTest()
const reopened = agent.openOpenClawAgentDatabase({ agentId: 'fixture-agent', env: process.env })
assert.deepEqual(snapshot(reopened.db), retained, 'Preserved history must survive reopening')
agent.closeOpenClawAgentDatabasesForTest()
shared.closeOpenClawStateDatabaseForTest()
console.log('PASS: upstream leased schema migration preserves history across database reopen')
const failing = new DatabaseSync(databasePath)
fixtures.removeCanonicalValidationFromHistoricalAgentFixture(failing)
failing.exec(`DROP TABLE session_transcript_cold_archives;
  PRAGMA user_version = 19;
  UPDATE schema_meta SET schema_version = 19 WHERE meta_key = 'primary';
  CREATE TRIGGER reject_fixture_migration BEFORE UPDATE ON schema_meta
  WHEN NEW.schema_version = ${OPENCLAW_AGENT_SCHEMA_VERSION}
  BEGIN SELECT RAISE(ABORT, 'synthetic schema publication failure'); END;`)
const failureHistory = snapshot(failing)
failing.close()
await assert.rejects(agent.withAgentDatabaseMaintenanceLease({ env: process.env }, async maintenance => {
  await agent.migrateOpenClawAgentDatabaseForMaintenance({ agentId: 'fixture-agent', pathname: databasePath }, maintenance)
}), /synthetic schema publication failure/)
const afterFailure = new DatabaseSync(databasePath, { readOnly: true })
assert.equal(afterFailure.prepare('PRAGMA user_version').get().user_version, 19)
assert.equal(afterFailure.prepare('SELECT schema_version FROM schema_meta').get().schema_version, 19)
assert.deepEqual(snapshot(afterFailure), failureHistory)
afterFailure.close()
shared.closeOpenClawStateDatabaseForTest()
console.log('PASS: failed schema publication rolls back version markers and preserves history')
console.log('Synthetic fixture retained for migration qualification:', root)
