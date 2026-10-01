const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { test } = require('node:test')
const { checkSchemas, EXPECTED_AGENT_SCHEMA } = require('../openclaw-schema-gate.cjs')
test('large inventory accepts only matching schema markers without changing bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-gate-'))
  try {
    assert.deepEqual(checkSchemas(root), { ready: true, checked: 0 })
    const files = []
    for (let i = 0; i < 54; i++) {
      const file = path.join(root, 'agents', `fixture-${i}`, 'agent', 'openclaw-agent.sqlite')
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const db = new DatabaseSync(file)
      db.exec(`PRAGMA user_version=${EXPECTED_AGENT_SCHEMA}; CREATE TABLE schema_meta (meta_key TEXT, schema_version INTEGER); INSERT INTO schema_meta VALUES ('primary', ${EXPECTED_AGENT_SCHEMA});`)
      db.close()
      files.push([file, fs.readFileSync(file)])
    }
    assert.deepEqual(checkSchemas(root), { ready: true, checked: 54 })
    for (const [file, bytes] of files) assert.deepEqual(fs.readFileSync(file), bytes)
    for (const version of [19, 22]) {
      const db = new DatabaseSync(files[0][0]); db.exec(`PRAGMA user_version=${version}`); db.close()
      const before = fs.readFileSync(files[0][0])
      assert.equal(checkSchemas(root).code, 'agent_schema_maintenance_required')
      assert.deepEqual(fs.readFileSync(files[0][0]), before)
    }
    fs.writeFileSync(files[0][0], 'synthetic corrupt database')
    assert.equal(checkSchemas(root).code, 'agent_schema_inspection_failed')
    fs.writeFileSync(files[0][0], files[0][1])
    const mismatch = new DatabaseSync(files[0][0])
    mismatch.exec('UPDATE schema_meta SET schema_version=19')
    mismatch.close()
    assert.equal(checkSchemas(root).code, 'agent_schema_maintenance_required')
    fs.unlinkSync(files[0][0])
    fs.symlinkSync(path.join(root, 'missing-target'), files[0][0])
    assert.equal(checkSchemas(root).code, 'agent_schema_inspection_failed')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
