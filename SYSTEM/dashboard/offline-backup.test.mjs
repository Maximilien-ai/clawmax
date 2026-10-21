import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { createBundle, OfflineBackupError, restoreBundle, verifyBundle } from './offline-backup.mjs'

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-offline-backup-'))
  const dataRoot = path.join(root, 'DATA')
  const state = path.join(dataRoot, '.home', '.openclaw')
  fs.mkdirSync(state, { recursive: true })
  fs.mkdirSync(path.join(dataRoot, 'default', 'AGENTS', 'agent-one'), { recursive: true })
  fs.mkdirSync(path.join(dataRoot, 'templates', 'organizations'), { recursive: true })
  fs.writeFileSync(path.join(state, 'openclaw.json'), '{"agents":{"entries":{"agent-one":{}}}}')
  fs.writeFileSync(path.join(state, 'auth-profiles.json'), '{"private":"fixture"}')
  fs.writeFileSync(path.join(dataRoot, 'default', 'AGENTS', 'agent-one', 'IDENTITY.md'), '# Agent One')
  fs.writeFileSync(path.join(dataRoot, 'templates', 'organizations', 'team.json'), '{"name":"Team"}')
  const openclawBin = path.join(root, 'fake-openclaw')
  fs.writeFileSync(openclawBin, [
    '#!/usr/bin/env node',
    "const fs = require('node:fs')",
    "const path = require('node:path')",
    'const args = process.argv.slice(2)',
    "if (args[0] === 'doctor') {",
    "  if (process.env.FAKE_DOCTOR_FAIL === 'true') process.exit(1)",
    "  if (process.env.FAKE_DOCTOR_LEAVES_LEGACY !== 'true') {",
    "    const legacy = path.join(process.env.HOME, '.openclaw', 'agents', 'agent-one', 'sessions', 'sessions.json')",
    "    if (fs.existsSync(legacy)) fs.rmSync(legacy)",
    "  }",
    "} else if (args[0] === 'backup' && args[1] === 'create') {",
    "  if (process.env.FAKE_OPENCLAW_LOCKED === 'true') { console.error('database is locked'); process.exit(1) }",
    "  const output = args[args.indexOf('--output') + 1]",
    "  fs.writeFileSync(output, 'verified-openclaw-archive')",
    "} else if (args[0] === 'backup' && args[1] === 'verify') {",
    "  if (fs.readFileSync(args[2], 'utf8') !== 'verified-openclaw-archive') process.exit(1)",
    "} else if (args[0] === 'backup' && args[1] === 'restore') {",
    "  const target = args[args.indexOf('--target') + 1]",
    "  const root = path.join(target, 'fixture-root')",
    "  const payload = path.join(root, 'payload', 'state')",
    "  fs.mkdirSync(path.join(payload, 'agents', 'agent-one', 'sessions'), { recursive: true })",
    "  fs.writeFileSync(path.join(payload, 'openclaw.json'), JSON.stringify({agents:{entries:{'agent-one':{}}}}))",
    "  fs.writeFileSync(path.join(payload, 'auth-profiles.json'), JSON.stringify({private:'fixture'}))",
    "  fs.writeFileSync(path.join(payload, 'agents', 'agent-one', 'sessions', 'sessions.json'), '{}')",
    "  const data = process.env.FAKE_DATA_ROOT",
    "  const source = process.env.FAKE_EXTERNAL_ASSET === 'true' ? '/outside/state' : path.join(data, '.home', '.openclaw')",
    "  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({schemaVersion:1,archiveRoot:'fixture-root',paths:{stateDir:source,configPath:path.join(source,'openclaw.json')},assets:[{kind:'state',sourcePath:source,archivePath:'fixture-root/payload/state'}]}))",
    "} else process.exit(2)",
  ].join('\n'), { mode: 0o700 })
  return { root, dataRoot, state, openclawBin, output: path.join(root, 'backup-one') }
}

function cleanup(value) {
  fs.rmSync(value.root, { recursive: true, force: true })
}

test('offline backup inventories Dashboard data and verifies OpenClaw state without copying it raw', () => {
  const fx = fixture()
  try {
    const created = createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    assert.equal(created.status, 'created')
    assert.equal(verifyBundle(fx.output, { openclawBin: fx.openclawBin }).status, 'verified')
    const manifest = JSON.parse(fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'))
    assert.equal(manifest.apiVersion, 'clawmax.offline-backup/v1')
    assert(manifest.files.some(entry => entry.path === 'default/AGENTS/agent-one/IDENTITY.md'))
    assert(manifest.files.some(entry => entry.path === 'templates/organizations/team.json'))
    assert(!manifest.files.some(entry => entry.path.includes('auth-profiles.json')))
    assert(!fs.existsSync(path.join(fx.output, 'dashboard', '.home', '.openclaw', 'auth-profiles.json')))
    assert.equal(fs.statSync(fx.output).mode & 0o077, 0)
    assert(fs.existsSync(path.join(fx.state, 'auth-profiles.json')))
  } finally { cleanup(fx) }
})

test('offline backup refuses unconfirmed writers, nested output and existing output', () => {
  const fx = fixture()
  try {
    assert.throws(() => createBundle({ dataRoot: fx.dataRoot, output: fx.output, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'writers_not_confirmed')
    assert.throws(() => createBundle({ dataRoot: fx.dataRoot, output: path.join(fx.dataRoot, 'backup'), writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'unsafe_output')
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    assert.throws(() => createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'output_exists')
  } finally { cleanup(fx) }
})

test('offline backup cleans interrupted staging and classifies SQLite lock failures', () => {
  const fx = fixture()
  try {
    process.env.FAKE_OPENCLAW_LOCKED = 'true'
    assert.throws(() => createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'sqlite_busy')
    assert(!fs.existsSync(fx.output))
    assert(!fs.readdirSync(fx.root).some(name => name.includes('.partial-')))
    delete process.env.FAKE_OPENCLAW_LOCKED
    assert.equal(createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin }).status, 'created')
  } finally { delete process.env.FAKE_OPENCLAW_LOCKED; cleanup(fx) }
})

test('offline verification rejects changed content, extra files and unsafe paths', () => {
  const fx = fixture()
  try {
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    const asset = path.join(fx.output, 'dashboard', 'templates', 'organizations', 'team.json')
    fs.writeFileSync(asset, 'tampered')
    assert.throws(() => verifyBundle(fx.output, { openclawBin: fx.openclawBin }), /checksum mismatch/)
    fs.writeFileSync(asset, '{"name":"Team"}')
    fs.writeFileSync(path.join(fx.output, 'dashboard', 'extra.txt'), 'extra')
    assert.throws(() => verifyBundle(fx.output, { openclawBin: fx.openclawBin }), /unexpected assets/)
    fs.rmSync(path.join(fx.output, 'dashboard', 'extra.txt'))
    const manifestPath = path.join(fx.output, 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.files[0].path = '../escape'
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    assert.throws(() => verifyBundle(fx.output, { openclawBin: fx.openclawBin }), /Unsafe asset path/)
  } finally { cleanup(fx) }
})

test('offline backup refuses symlinked supplemental data instead of following external paths', () => {
  const fx = fixture()
  try {
    fs.symlinkSync('/etc/passwd', path.join(fx.dataRoot, 'linked-secret'))
    assert.throws(() => createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'external_symlink')
    assert(!fs.existsSync(fx.output))
  } finally { cleanup(fx) }
})

test('RC57-style relative links are preserved without copying targets and survive candidate restore', () => {
  const fx = fixture()
  try {
    const links = []
    for (let index = 0; index < 15; index++) {
      const name = `agent-link-${index}`
      const link = path.join(fx.dataRoot, 'default', name)
      fs.symlinkSync('AGENTS/agent-one', link)
      links.push(link)
    }
    const nativeLink = path.join(fx.dataRoot, 'default', 'runtime-config')
    fs.symlinkSync('../.home/.openclaw/openclaw.json', nativeLink)
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    const manifest = JSON.parse(fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'))
    assert.equal(manifest.schemaVersion, 2)
    assert.equal(manifest.symlinks.length, 16)
    assert.equal(verifyBundle(fx.output, { openclawBin: fx.openclawBin }).assets.symlinks, 16)
    const original = path.join(fx.root, 'original-DATA')
    fs.renameSync(fx.dataRoot, original)
    fs.mkdirSync(path.join(fx.dataRoot, '.home', '.openclaw'), { recursive: true })
    process.env.FAKE_DATA_ROOT = fs.realpathSync(fx.dataRoot)
    const restored = restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot, writersStopped: true, openclawBin: fx.openclawBin })
    assert.equal(restored.assets.symlinks, 16)
    for (const link of links) {
      assert(fs.lstatSync(link).isSymbolicLink())
      assert.equal(fs.readlinkSync(link), 'AGENTS/agent-one')
    }
    assert(fs.lstatSync(nativeLink).isSymbolicLink())
    assert.equal(fs.readlinkSync(nativeLink), '../.home/.openclaw/openclaw.json')
    assert(fs.lstatSync(path.join(original, 'default', 'agent-link-0')).isSymbolicLink())
  } finally { delete process.env.FAKE_DATA_ROOT; cleanup(fx) }
})

test('relative escaping and changed bundle links fail with stable errors', () => {
  const fx = fixture()
  try {
    const link = path.join(fx.dataRoot, 'default', 'outside')
    fs.symlinkSync('../../../outside', link)
    assert.throws(() => createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'external_symlink')
    assert(!fs.existsSync(fx.output))
    fs.rmSync(link)
    fs.symlinkSync('AGENTS/agent-one', link)
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    const archived = path.join(fx.output, 'dashboard', 'default', 'outside')
    fs.rmSync(archived)
    fs.symlinkSync('AGENTS/other', archived)
    assert.throws(() => verifyBundle(fx.output, { openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'integrity_failed')
  } finally { cleanup(fx) }
})

test('source version provenance is separate from the running backup tool', () => {
  const fx = fixture()
  const previous = process.env.CLAWMAX_VERSION
  try {
    process.env.CLAWMAX_VERSION = '2.0.0-test-rc86'
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin,
      sourceDashboardVersion: '2.0.0-test-rc57', sourceOpenclawVersion: '2026.8.2' })
    const manifest = JSON.parse(fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'))
    assert.deepEqual(manifest.versions.dashboard, { value: '2.0.0-test-rc57', provenance: 'operator-attested-from-source-image' })
    assert.deepEqual(manifest.versions.openclaw, { value: '2026.8.2', provenance: 'operator-attested-from-source-image' })
    assert.deepEqual(manifest.versions.backupTool, { value: '2.0.0-test-rc86', provenance: 'running-backup-image' })
    assert.equal(verifyBundle(fx.output, { openclawBin: fx.openclawBin }).dashboardVersion, '2.0.0-test-rc57')
  } finally {
    if (previous === undefined) delete process.env.CLAWMAX_VERSION
    else process.env.CLAWMAX_VERSION = previous
    cleanup(fx)
  }
})

test('missing source versions stay unknown and CLI-attested RC57 versions are recorded', () => {
  const unknown = fixture()
  const attested = fixture()
  try {
    createBundle({ dataRoot: unknown.dataRoot, output: unknown.output, writersStopped: true, openclawBin: unknown.openclawBin })
    const unknownManifest = JSON.parse(fs.readFileSync(path.join(unknown.output, 'manifest.json'), 'utf8'))
    assert.deepEqual(unknownManifest.versions.dashboard, { value: 'unknown', provenance: 'not-provided' })
    assert.deepEqual(unknownManifest.versions.openclaw, { value: 'unknown', provenance: 'not-provided' })
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'offline-backup.mjs'),
      'backup', '--data-root', attested.dataRoot, '--output', attested.output, '--writers-stopped',
      '--openclaw-bin', attested.openclawBin, '--source-dashboard-version', '2.0.0-test-rc57',
      '--source-openclaw-version', '2026.8.2'], { encoding: 'utf8' })
    assert.equal(result.status, 0)
    const manifest = JSON.parse(fs.readFileSync(path.join(attested.output, 'manifest.json'), 'utf8'))
    assert.equal(manifest.versions.dashboard.value, '2.0.0-test-rc57')
    assert.equal(manifest.versions.openclaw.value, '2026.8.2')
  } finally { cleanup(unknown); cleanup(attested) }
})

test('schema 1 bundles remain verifiable and restorable without link inventory', () => {
  const fx = fixture()
  try {
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    const manifestPath = path.join(fx.output, 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    manifest.schemaVersion = 1
    manifest.dashboardVersion = '2.0.0-test-rc86'
    manifest.openclawVersion = '2026.9.5'
    delete manifest.versions
    delete manifest.symlinks
    fs.writeFileSync(manifestPath, JSON.stringify(manifest))
    assert.equal(verifyBundle(fx.output, { openclawBin: fx.openclawBin }).dashboardVersion, '2.0.0-test-rc86')
    fs.renameSync(fx.dataRoot, path.join(fx.root, 'original-DATA'))
    fs.mkdirSync(path.join(fx.dataRoot, '.home', '.openclaw'), { recursive: true })
    process.env.FAKE_DATA_ROOT = fs.realpathSync(fx.dataRoot)
    assert.equal(restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot,
      writersStopped: true, openclawBin: fx.openclawBin }).status, 'restored')
  } finally { delete process.env.FAKE_DATA_ROOT; cleanup(fx) }
})

test('interrupted restore with links leaves original intact and no success receipt', () => {
  const fx = fixture()
  try {
    fs.symlinkSync('AGENTS/agent-one', path.join(fx.dataRoot, 'default', 'linked-agent'))
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    const original = path.join(fx.root, 'original-DATA')
    fs.renameSync(fx.dataRoot, original)
    fs.mkdirSync(path.join(fx.dataRoot, '.home', '.openclaw'), { recursive: true })
    process.env.FAKE_DATA_ROOT = fs.realpathSync(fx.dataRoot)
    process.env.FAKE_DOCTOR_FAIL = 'true'
    assert.throws(() => restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot, writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'migration_failed')
    assert(!fs.existsSync(path.join(fx.dataRoot, '.clawmax-offline-restore.json')))
    assert(fs.lstatSync(path.join(original, 'default', 'linked-agent')).isSymbolicLink())
    assert(fs.existsSync(path.join(original, '.home', '.openclaw', 'auth-profiles.json')))
  } finally { delete process.env.FAKE_DATA_ROOT; delete process.env.FAKE_DOCTOR_FAIL; cleanup(fx) }
})

test('offline CLI emits one versioned JSON result without private diagnostics', () => {
  const fx = fixture()
  try {
    const failed = spawnSync(process.execPath, [path.join(import.meta.dirname, 'offline-backup.mjs'),
      'backup', '--data-root', fx.dataRoot, '--output', fx.output, '--openclaw-bin', fx.openclawBin], { encoding: 'utf8' })
    assert.equal(failed.status, 1)
    assert.deepEqual(JSON.parse(failed.stdout), {
      apiVersion: 'clawmax.offline-backup/v1', operation: 'backup', status: 'blocked', code: 'writers_not_confirmed',
    })
    assert.equal(failed.stderr, '')
    const created = spawnSync(process.execPath, [path.join(import.meta.dirname, 'offline-backup.mjs'),
      'backup', '--data-root', fx.dataRoot, '--output', fx.output, '--writers-stopped', '--openclaw-bin', fx.openclawBin], { encoding: 'utf8' })
    assert.equal(created.status, 0)
    assert.equal(JSON.parse(created.stdout).status, 'created')
    assert.equal(created.stdout.trim().split('\n').length, 1)
  } finally { cleanup(fx) }
})

test('offline restore migrates an empty candidate while retaining the original volume', () => {
  const fx = fixture()
  try {
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    const original = path.join(fx.root, 'original-DATA')
    fs.renameSync(fx.dataRoot, original)
    fs.mkdirSync(path.join(fx.dataRoot, '.home', '.openclaw'), { recursive: true })
    process.env.FAKE_DATA_ROOT = fs.realpathSync(fx.dataRoot)
    const result = restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot, writersStopped: true, openclawBin: fx.openclawBin })
    assert.equal(result.status, 'restored')
    assert.equal(result.checks.migration, 'passed')
    assert(fs.existsSync(path.join(fx.dataRoot, '.home', '.openclaw', 'auth-profiles.json')))
    assert(!fs.existsSync(path.join(fx.dataRoot, '.home', '.openclaw', 'agents', 'agent-one', 'sessions', 'sessions.json')))
    assert(fs.existsSync(path.join(fx.dataRoot, 'default', 'AGENTS', 'agent-one', 'IDENTITY.md')))
    assert(fs.existsSync(path.join(fx.dataRoot, '.clawmax-offline-restore.json')))
    assert(fs.existsSync(path.join(original, '.home', '.openclaw', 'auth-profiles.json')), 'Original auth must be untouched')
    assert(fs.existsSync(path.join(original, 'default', 'AGENTS', 'agent-one', 'IDENTITY.md')), 'Original workspace must be untouched')
  } finally { delete process.env.FAKE_DATA_ROOT; cleanup(fx) }
})

test('offline restore rejects populated candidates, external paths and failed migration', () => {
  const fx = fixture()
  try {
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    process.env.FAKE_DATA_ROOT = fs.realpathSync(fx.dataRoot)
    assert.throws(() => restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot, writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'candidate_not_empty')
    const original = path.join(fx.root, 'original-DATA')
    fs.renameSync(fx.dataRoot, original)
    fs.mkdirSync(path.join(fx.dataRoot, '.home', '.openclaw'), { recursive: true })
    process.env.FAKE_EXTERNAL_ASSET = 'true'
    assert.throws(() => restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot, writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'external_path_unmapped')
    assert.deepEqual(fs.readdirSync(path.join(fx.dataRoot, '.home', '.openclaw')), [], 'External path must fail before copying')
    delete process.env.FAKE_EXTERNAL_ASSET
    process.env.FAKE_DOCTOR_FAIL = 'true'
    assert.throws(() => restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot, writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'migration_failed')
    assert(!fs.existsSync(path.join(fx.dataRoot, '.clawmax-offline-restore.json')), 'Failed candidate must not have a success receipt')
    assert(fs.existsSync(path.join(original, '.home', '.openclaw', 'auth-profiles.json')), 'Original must survive migration failure')
  } finally {
    delete process.env.FAKE_DATA_ROOT
    delete process.env.FAKE_EXTERNAL_ASSET
    delete process.env.FAKE_DOCTOR_FAIL
    cleanup(fx)
  }
})

test('offline restore blocks if Doctor leaves the legacy session index behind', () => {
  const fx = fixture()
  try {
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    fs.renameSync(fx.dataRoot, path.join(fx.root, 'original-DATA'))
    fs.mkdirSync(path.join(fx.dataRoot, '.home', '.openclaw'), { recursive: true })
    process.env.FAKE_DATA_ROOT = fs.realpathSync(fx.dataRoot)
    process.env.FAKE_DOCTOR_LEAVES_LEGACY = 'true'
    assert.throws(() => restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot, writersStopped: true, openclawBin: fx.openclawBin }),
      error => error instanceof OfflineBackupError && error.code === 'migration_failed')
    assert(!fs.existsSync(path.join(fx.dataRoot, '.clawmax-offline-restore.json')))
  } finally { delete process.env.FAKE_DATA_ROOT; delete process.env.FAKE_DOCTOR_LEAVES_LEGACY; cleanup(fx) }
})

test('offline restore CLI reports a blocked result without leaking paths or secrets', () => {
  const fx = fixture()
  try {
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'offline-backup.mjs'),
      'restore', '--bundle', fx.output, '--candidate-root', fx.dataRoot,
      '--writers-stopped', '--openclaw-bin', fx.openclawBin], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.deepEqual(JSON.parse(result.stdout), {
      apiVersion: 'clawmax.offline-backup/v1', operation: 'restore', status: 'blocked', code: 'candidate_not_empty',
    })
    assert.equal(result.stderr, '')
  } finally { cleanup(fx) }
})

test('offline restore rejects insufficient candidate space without writing data', () => {
  const fx = fixture()
  const statfs = fs.statfsSync
  try {
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin: fx.openclawBin })
    fs.renameSync(fx.dataRoot, path.join(fx.root, 'original-DATA'))
    fs.mkdirSync(fx.dataRoot)
    fs.statfsSync = () => ({ bavail: 0, bsize: 4096 })
    assert.throws(() => restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot,
      writersStopped: true, openclawBin: fx.openclawBin }),
    error => error instanceof OfflineBackupError && error.code === 'insufficient_space')
    assert.deepEqual(fs.readdirSync(fx.dataRoot), [])
  } finally { fs.statfsSync = statfs; cleanup(fx) }
})

test('pinned OpenClaw emits the expected native archive layout', { skip: !process.env.CLAWMAX_TEST_NATIVE_OPENCLAW }, () => {
  const fx = fixture()
  try {
    const openclawBin = process.env.CLAWMAX_TEST_NATIVE_OPENCLAW
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin })
    assert.equal(verifyBundle(fx.output, { openclawBin }).status, 'verified')
    const extracted = fs.mkdtempSync(path.join(fx.root, 'native-extracted-'))
    const result = spawnSync(openclawBin,
      ['backup', 'restore', path.join(fx.output, 'openclaw.tar.gz'), '--target', extracted, '--json'],
      { encoding: 'utf8', env: { ...process.env, HOME: path.join(fx.dataRoot, '.home'),
        OPENCLAW_STATE_DIR: fx.state, OPENCLAW_CONFIG_PATH: path.join(fx.state, 'openclaw.json') } })
    assert.equal(result.status, 0, result.stderr)
    const roots = fs.readdirSync(extracted)
    assert.equal(roots.length, 1)
    const nativeManifest = JSON.parse(fs.readFileSync(path.join(extracted, roots[0], 'manifest.json'), 'utf8'))
    assert.equal(nativeManifest.schemaVersion, 1)
    assert.equal(nativeManifest.archiveRoot, roots[0])
    assert(nativeManifest.assets.some(asset => asset.kind === 'state' && asset.sourcePath === fs.realpathSync(fx.state)))
  } finally { cleanup(fx) }
})

test('pinned OpenClaw migrates an isolated candidate', { skip: !process.env.CLAWMAX_TEST_NATIVE_OPENCLAW }, () => {
  const fx = fixture()
  try {
    const openclawBin = process.env.CLAWMAX_TEST_NATIVE_OPENCLAW
    createBundle({ dataRoot: fx.dataRoot, output: fx.output, writersStopped: true, openclawBin })
    fs.renameSync(fx.dataRoot, path.join(fx.root, 'original-DATA'))
    fs.mkdirSync(path.join(fx.dataRoot, '.home', '.openclaw'), { recursive: true })
    const result = restoreBundle({ bundle: fx.output, candidateRoot: fx.dataRoot, writersStopped: true, openclawBin })
    assert.equal(result.status, 'restored')
    assert(fs.existsSync(path.join(fx.dataRoot, 'default', 'AGENTS', 'agent-one', 'IDENTITY.md')))
    assert(fs.existsSync(path.join(fx.root, 'original-DATA', '.home', '.openclaw', 'auth-profiles.json')))
  } finally { cleanup(fx) }
})
