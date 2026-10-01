// Opt-in real pinned-runtime qualification. Run with that runtime's tsx loader.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { preflight } = require('./sqlite-preflight.cjs')

const source = process.env.CLAWMAX_TEST_OPENCLAW_PACKAGE_ROOT
assert(source, 'Explicit pinned runtime source required')
assert(process.env.OPENCLAW_BIN, 'Explicit pinned runtime binary required')
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
  UPDATE schema_meta SET schema_version = 19 WHERE meta_key = 'primary';`)
legacy.close()
const legacyBefore = hash()
const old = preflight()
assert.equal(old.ready, false, 'Historical schema must not receive successful qualification')
assert.equal(hash(), legacyBefore, 'Refused historical schema must remain unchanged')
console.log('PASS: historical schema refused and unchanged')
console.log('Synthetic fixture retained for migration qualification:', root)
