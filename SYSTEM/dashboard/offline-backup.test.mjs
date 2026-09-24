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
      error => error instanceof OfflineBackupError && error.code === 'unsupported_symlink')
    assert(!fs.existsSync(fx.output))
  } finally { cleanup(fx) }
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
