#!/usr/bin/env node
// Offline on-prem data bundle. This entry point deliberately imports no server code.
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const API_VERSION = 'clawmax.offline-backup/v1'
const BUNDLE_KIND = 'clawmax-onprem-data'
const MIN_FREE_RESERVE = 256 * 1024 * 1024
const OPENCLAW_ARCHIVE = 'openclaw.tar.gz'
const MANIFEST = 'manifest.json'

export class OfflineBackupError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function assert(condition, code, message) {
  if (!condition) throw new OfflineBackupError(code, message)
}

function inside(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function safeRelative(value) {
  assert(typeof value === 'string' && value && !value.includes('\\') && !value.includes('\0'), 'invalid_manifest', 'Invalid asset path')
  const normalized = path.posix.normalize(value)
  assert(normalized === value && !value.startsWith('/') && !value.split('/').includes('..'), 'invalid_manifest', 'Unsafe asset path')
  return value
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(file, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    while (true) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (!count) break
      hash.update(buffer.subarray(0, count))
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

function nativeOpenClaw(args, home, openclawBin = 'openclaw') {
  const result = spawnSync(openclawBin, args, {
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      HOME: home,
      OPENCLAW_STATE_DIR: path.join(home, '.openclaw'),
      OPENCLAW_CONFIG_PATH: path.join(home, '.openclaw', 'openclaw.json'),
    },
  })
  if (result.status !== 0) {
    const code = /database is locked|SQLITE_BUSY|\bbusy\b|owner lock/i.test(`${result.stderr || ''}\n${result.stdout || ''}`)
      ? 'sqlite_busy' : 'openclaw_backup_failed'
    throw new OfflineBackupError(code, 'OpenClaw offline backup or verification failed; keep the source stopped and inspect private local diagnostics')
  }
}

function collectData(source, destination, entries, directories, relative = '') {
  for (const dirent of fs.readdirSync(path.join(source, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = relative ? `${relative}/${dirent.name}` : dirent.name
    if (child === '.home/.openclaw') continue // Native OpenClaw owns this tree.
    const sourcePath = path.join(source, child)
    const stat = fs.lstatSync(sourcePath, { bigint: true })
    assert(!stat.isSymbolicLink(), 'unsupported_symlink', 'A persisted data symlink requires an explicit mount mapping')
    if (stat.isDirectory()) {
      directories.push(child)
      fs.mkdirSync(path.join(destination, child), { recursive: true, mode: 0o700 })
      collectData(source, destination, entries, directories, child)
      continue
    }
    assert(stat.isFile(), 'unsupported_file', 'A persisted special file cannot be backed up')
    const target = path.join(destination, child)
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 })
    fs.copyFileSync(sourcePath, target, fs.constants.COPYFILE_EXCL)
    fs.chmodSync(target, 0o600)
    const after = fs.lstatSync(sourcePath, { bigint: true })
    const digest = sha256(target)
    assert(stat.ino === after.ino && stat.size === after.size && stat.mtimeNs === after.mtimeNs && digest === sha256(sourcePath),
      'source_changed', 'Persisted data changed during backup; stop all writers and retry')
    entries.push({ path: child, bytes: Number(stat.size), sha256: digest })
  }
}

function validateManifest(manifest) {
  assert(manifest && manifest.apiVersion === API_VERSION && manifest.kind === BUNDLE_KIND && manifest.schemaVersion === 1,
    'unsupported_bundle_version', 'Unsupported offline backup manifest')
  assert(typeof manifest.bundleId === 'string' && /^[0-9a-f-]{36}$/.test(manifest.bundleId), 'invalid_manifest', 'Invalid bundle ID')
  assert(Array.isArray(manifest.files) && Array.isArray(manifest.directories), 'invalid_manifest', 'Incomplete bundle inventory')
  const seen = new Set()
  for (const entry of manifest.files) {
    const name = safeRelative(entry?.path)
    assert(!seen.has(name) && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 && /^[a-f0-9]{64}$/.test(entry.sha256),
      'invalid_manifest', 'Invalid bundle file inventory')
    seen.add(name)
  }
  for (const name of manifest.directories) {
    safeRelative(name)
    assert(!seen.has(name), 'invalid_manifest', 'Duplicate bundle path')
    seen.add(name)
  }
  assert(manifest.openclaw?.archive === OPENCLAW_ARCHIVE && Number.isSafeInteger(manifest.openclaw.bytes)
    && /^[a-f0-9]{64}$/.test(manifest.openclaw.sha256), 'invalid_manifest', 'Missing OpenClaw archive inventory')
}

export function verifyBundle(bundle, { home, openclawBin = 'openclaw' } = {}) {
  assert(fs.lstatSync(bundle).isDirectory(), 'invalid_bundle', 'Bundle must be a real directory')
  const root = fs.realpathSync(bundle)
  assert(fs.lstatSync(path.join(root, MANIFEST)).isFile(), 'invalid_bundle', 'Manifest must be a regular file')
  const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8'))
  validateManifest(manifest)
  const expected = new Set([MANIFEST, OPENCLAW_ARCHIVE, 'dashboard'])
  for (const entry of manifest.files) expected.add(`dashboard/${entry.path}`)
  for (const name of manifest.directories) expected.add(`dashboard/${name}`)
  const actual = new Set()
  function walk(relative = '') {
    for (const dirent of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${dirent.name}` : dirent.name
      assert(dirent.isDirectory() || dirent.isFile(), 'integrity_failed', 'Bundle contains a symlink or special file')
      actual.add(name)
      if (dirent.isDirectory()) walk(name)
    }
  }
  walk()
  assert(actual.size === expected.size && [...actual].every(name => expected.has(name)), 'integrity_failed', 'Bundle contains missing or unexpected assets')
  for (const entry of manifest.files) {
    const file = path.join(root, 'dashboard', entry.path)
    const stat = fs.lstatSync(file)
    assert(stat.isFile() && stat.size === entry.bytes && sha256(file) === entry.sha256, 'integrity_failed', 'Dashboard asset checksum mismatch')
  }
  const archive = path.join(root, OPENCLAW_ARCHIVE)
  const archiveStat = fs.lstatSync(archive)
  assert(archiveStat.isFile() && archiveStat.size === manifest.openclaw.bytes && sha256(archive) === manifest.openclaw.sha256,
    'integrity_failed', 'OpenClaw archive checksum mismatch')
  nativeOpenClaw(['backup', 'verify', archive, '--json'], home || path.join(os.tmpdir(), 'clawmax-offline-verify'), openclawBin)
  return {
    apiVersion: API_VERSION, operation: 'verify', status: 'verified', bundleId: manifest.bundleId,
    dashboardVersion: manifest.dashboardVersion, openclawVersion: manifest.openclawVersion,
    assets: { files: manifest.files.length, bytes: manifest.files.reduce((sum, entry) => sum + entry.bytes, 0) + archiveStat.size },
    checks: { manifest: 'passed', hashes: 'passed', openclaw: 'passed' },
  }
}

export function createBundle({ dataRoot, output, writersStopped = false, openclawBin = 'openclaw' }) {
  assert(writersStopped, 'writers_not_confirmed', 'Stop all Dashboard, Gateway, and local state writers before backup')
  assert(path.isAbsolute(dataRoot) && path.isAbsolute(output), 'invalid_path', 'Data and output paths must be absolute')
  const source = fs.realpathSync(dataRoot)
  const home = path.join(source, '.home')
  const state = path.join(home, '.openclaw')
  assert(fs.existsSync(home) && fs.existsSync(state) && fs.existsSync(path.join(state, 'openclaw.json'))
    && fs.lstatSync(home).isDirectory() && fs.lstatSync(state).isDirectory()
    && fs.lstatSync(path.join(state, 'openclaw.json')).isFile(),
    'unsupported_layout', 'Expected the on-prem DATA/.home/.openclaw layout')
  const parent = fs.realpathSync(path.dirname(output))
  assert(!inside(source, parent), 'unsafe_output', 'Backup output must be outside the source data')
  assert(!fs.existsSync(output), 'output_exists', 'Backup output already exists')
  const free = fs.statfsSync(parent)
  const available = Number(free.bavail) * Number(free.bsize)
  assert(available >= MIN_FREE_RESERVE, 'insufficient_space', 'Not enough free space for a private backup')
  const staging = path.join(parent, `.${path.basename(output)}.partial-${crypto.randomUUID()}`)
  fs.mkdirSync(staging, { mode: 0o700 })
  try {
    const archive = path.join(staging, OPENCLAW_ARCHIVE)
    nativeOpenClaw(['backup', 'create', '--output', archive, '--verify', '--json'], home, openclawBin)
    assert(fs.existsSync(archive), 'openclaw_backup_failed', 'OpenClaw did not produce a verified archive')
    fs.chmodSync(archive, 0o600)
    const files = []
    const directories = []
    fs.mkdirSync(path.join(staging, 'dashboard'), { mode: 0o700 })
    collectData(source, path.join(staging, 'dashboard'), files, directories)
    const archiveStat = fs.statSync(archive)
    const manifest = {
      apiVersion: API_VERSION, kind: BUNDLE_KIND, schemaVersion: 1,
      bundleId: crypto.randomUUID(), createdAt: new Date().toISOString(),
      dashboardVersion: String(process.env.CLAWMAX_VERSION || 'unknown'),
      openclawVersion: String(process.env.OPENCLAW_VERSION || 'unknown'),
      sourceLayout: 'single-data-root-v1', sourceDataRoot: source,
      openclaw: { archive: OPENCLAW_ARCHIVE, bytes: archiveStat.size, sha256: sha256(archive) },
      directories, files,
    }
    fs.writeFileSync(path.join(staging, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    const verified = verifyBundle(staging, { home, openclawBin })
    assert(!fs.existsSync(output), 'output_exists', 'Backup output already exists')
    fs.renameSync(staging, output)
    return { ...verified, operation: 'backup', status: 'created' }
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

function parseOptions(args) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    assert(arg.startsWith('--'), 'invalid_request', 'Unexpected positional argument')
    if (arg === '--writers-stopped') { options.writersStopped = true; continue }
    assert(index + 1 < args.length && !args[index + 1].startsWith('--'), 'invalid_request', 'Missing option value')
    options[arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = args[++index]
  }
  return options
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let operation = process.argv[2] || ''
  try {
    const options = parseOptions(process.argv.slice(3))
    assert(operation === 'backup' || operation === 'verify', 'invalid_request', 'Expected backup or verify operation')
    const result = operation === 'backup' ? createBundle(options) : verifyBundle(options.bundle)
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    const code = error instanceof OfflineBackupError ? error.code : 'operation_failed'
    process.stdout.write(`${JSON.stringify({ apiVersion: API_VERSION, operation, status: 'blocked', code })}\n`)
    process.exitCode = 1
  }
}
