const assert = require('node:assert/strict')
const { test } = require('node:test')
const { summarize, preflight, discoverAgents } = require('./sqlite-preflight.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const result = (issues = 0) => ({ status: 0, stdout: JSON.stringify({ mode: 'validate', targets: [{ private: 'never-publish' }], totals: { targets: 1, issues } }) })
test('emits only bounded counts and readiness', () => {
  assert.deepEqual(summarize(result()), { ready: true, code: 'sqlite_preflight_validated', targets: 1, issues: 0 })
  assert.equal(summarize(result(1)).ready, false)
})
test('nonzero exit, timeout, signals and malformed reports fail closed', () => {
  for (const value of [{ status: 1 }, { error: new Error('private') }, { signal: 'SIGTERM' },
    { status: 0, stdout: '' }, { status: 0, stdout: 'null' }, { status: 0, stdout: '{}' }]) {
    assert.equal(summarize(value).ready, false)
    assert(!JSON.stringify(summarize(value)).includes('private'))
  }
})
test('rejects negative, fractional, and inconsistent totals', () => {
  for (const targets of [-1, 0.5, 2]) {
    const report = JSON.parse(result().stdout)
    report.totals.targets = targets
    assert.equal(summarize({ status: 0, stdout: JSON.stringify(report) }).ready, false)
  }
})
test('invokes only explicitly selected CLI validation mode with bounded output and duration', () => {
  preflight((binary, args, options) => {
    assert.equal(binary, '/synthetic/pinned/openclaw')
    assert.deepEqual(args, ['doctor', '--session-sqlite', 'validate', '--session-sqlite-all-agents', '--json'])
    assert.equal(options.timeout, 420000)
    assert.equal(options.maxBuffer, 8388608)
    assert(!options.shell)
    return result()
  }, '/synthetic/pinned/openclaw', '/synthetic/absent-state')
})
test('zero or unrelated targets cannot qualify an existing database', () => {
  assert.equal(summarize(result(), ['existing-agent']).code, 'sqlite_preflight_inventory_incomplete')
  const empty = { status: 0, stdout: JSON.stringify({ mode: 'validate', targets: [], totals: { targets: 0, issues: 0 } }) }
  assert.equal(summarize(empty, ['existing-agent']).ready, false)
})
test('discovers SQLite-only agents and refuses linked inventories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-inventory-test-'))
  try {
    const dir = path.join(root, 'agents', 'fixture', 'agent')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'openclaw-agent.sqlite'), 'synthetic')
    assert.deepEqual(discoverAgents(root), ['fixture'])
    fs.symlinkSync(dir, path.join(root, 'agents', 'linked'))
    assert.throws(() => discoverAgents(root), /Unsupported inventory/)
    assert.equal(preflight(() => { throw new Error('must not execute') }, '/unused', root).code, 'sqlite_preflight_inventory_unreadable')
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
