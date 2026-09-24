import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { createBundle, OfflineBackupError, verifyBundle } from './offline-backup.mjs'

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
    'const args = process.argv.slice(2)',
    "if (args[0] !== 'backup') process.exit(2)",
    "if (args[1] === 'create') {",
    "  if (process.env.FAKE_OPENCLAW_LOCKED === 'true') { console.error('database is locked'); process.exit(1) }",
    "  const output = args[args.indexOf('--output') + 1]",
    "  fs.writeFileSync(output, 'verified-openclaw-archive')",
    "} else if (args[1] === 'verify') {",
    "  if (fs.readFileSync(args[2], 'utf8') !== 'verified-openclaw-archive') process.exit(1)",
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
