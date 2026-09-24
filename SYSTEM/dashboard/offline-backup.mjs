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
const RESTORE_RECEIPT = '.clawmax-offline-restore.json'

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

function nativeOpenClaw(args, home, openclawBin = 'openclaw', failureCode = 'openclaw_backup_failed') {
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
      ? 'sqlite_busy' : failureCode
    throw new OfflineBackupError(code, 'OpenClaw offline backup or verification failed; keep the source stopped and inspect private local diagnostics')
  }
  return result.stdout
}

function isMountedAt(target) {
  if (process.platform !== 'linux' || !fs.existsSync('/proc/self/mountinfo')) return false
  const escaped = target.replace(/ /g, '\\040')
  return fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some(line => line.split(' ')[4] === escaped)
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
  assert(typeof manifest.sourceDataRoot === 'string' && path.isAbsolute(manifest.sourceDataRoot)
    && typeof manifest.nestedStateMount === 'boolean', 'invalid_manifest', 'Missing source mount inventory')
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
      nestedStateMount: isMountedAt(state),
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

function assertEmptyCandidate(candidate, nestedStateMount) {
  assert(path.isAbsolute(candidate) && fs.existsSync(candidate) && fs.lstatSync(candidate).isDirectory(),
    'invalid_candidate', 'Candidate must be an existing directory')
  const home = path.join(candidate, '.home')
  const state = path.join(home, '.openclaw')
  const entries = fs.readdirSync(candidate)
  assert(entries.length === 0 || (entries.length === 1 && entries[0] === '.home'
    && fs.lstatSync(home).isDirectory()
    && fs.readdirSync(home).every(name => name === '.openclaw')
    && (!fs.existsSync(state) || (fs.lstatSync(state).isDirectory() && fs.readdirSync(state).length === 0))),
  'candidate_not_empty', 'Candidate contains existing data')
  assert(!nestedStateMount || (fs.existsSync(state) && isMountedAt(state)),
    'mount_mismatch', 'Candidate is missing the required nested OpenClaw state mount')
}

function copyRestoredTree(source, destination) {
  const stat = fs.lstatSync(source)
  assert(!stat.isSymbolicLink(), 'unsupported_symlink', 'Restored asset contains a symlink requiring operator review')
  if (stat.isDirectory()) {
    if (fs.existsSync(destination)) assert(fs.lstatSync(destination).isDirectory(), 'conflicting_asset', 'Restored assets conflict')
    else fs.mkdirSync(destination, { mode: 0o700 })
    for (const name of fs.readdirSync(source)) copyRestoredTree(path.join(source, name), path.join(destination, name))
    return
  }
  assert(stat.isFile(), 'unsupported_file', 'Restored asset contains a special file')
  if (fs.existsSync(destination)) {
    assert(fs.lstatSync(destination).isFile() && sha256(source) === sha256(destination),
      'conflicting_asset', 'Dashboard and OpenClaw archives contain different versions of one file')
    return
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
  fs.chmodSync(destination, 0o600)
}

function findOpenClawExtraction(staging) {
  const roots = fs.readdirSync(staging, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(staging, entry.name, MANIFEST)))
  assert(roots.length === 1, 'invalid_openclaw_archive', 'OpenClaw restore did not produce one archive root')
  const root = path.join(staging, roots[0].name)
  const manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST), 'utf8'))
  assert(manifest.schemaVersion === 1 && manifest.archiveRoot === roots[0].name && Array.isArray(manifest.assets),
    'invalid_openclaw_archive', 'OpenClaw archive manifest is not supported')
  return { root, manifest }
}

function assertNativePathsMapped(manifest, candidate) {
  const paths = manifest.paths || {}
  const declared = [paths.stateDir, paths.configPath, paths.oauthDir,
    ...(Array.isArray(paths.workspaceDirs) ? paths.workspaceDirs : []),
    ...(Array.isArray(paths.agentRoots) ? paths.agentRoots.map(entry => entry?.sourcePath) : []),
    ...(Array.isArray(manifest.skipped) ? manifest.skipped.map(entry => entry?.sourcePath) : []),
  ].filter(value => value !== undefined && value !== null)
  for (const value of declared) {
    assert(typeof value === 'string' && path.isAbsolute(value) && inside(candidate, value),
      'external_path_unmapped', 'OpenClaw references a path outside the candidate data mount')
  }
}

function legacyMigrationSources(state) {
  const agents = path.join(state, 'agents')
  if (!fs.existsSync(agents)) return []
  const pending = []
  for (const entry of fs.readdirSync(agents, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    for (const relative of ['agent/auth-profiles.json', 'sessions/sessions.json']) {
      if (fs.existsSync(path.join(agents, entry.name, relative))) pending.push(`${entry.name}/${relative}`)
    }
  }
  return pending
}

export function restoreBundle({ bundle, candidateRoot, writersStopped = false, openclawBin = 'openclaw' }) {
  assert(writersStopped, 'writers_not_confirmed', 'Stop all state writers before candidate restore')
  const verified = verifyBundle(bundle, { openclawBin })
  const bundleRoot = fs.realpathSync(bundle)
  const manifest = JSON.parse(fs.readFileSync(path.join(bundleRoot, MANIFEST), 'utf8'))
  const candidate = fs.realpathSync(candidateRoot)
  assert(candidate === manifest.sourceDataRoot, 'mount_mismatch', 'Candidate must be mounted at the source canonical data path')
  assertEmptyCandidate(candidate, manifest.nestedStateMount)
  const free = fs.statfsSync(candidate)
  assert(Number(free.bavail) * Number(free.bsize) >= verified.assets.bytes + MIN_FREE_RESERVE,
    'insufficient_space', 'Candidate does not have enough free space for restore and migration')

  // Native extraction is outside the candidate data root. It is not a running
  // OpenClaw state store, and failure leaves only a disposable candidate.
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-openclaw-restore-'))
  fs.chmodSync(staging, 0o700)
  try {
    nativeOpenClaw(['backup', 'restore', path.join(bundleRoot, OPENCLAW_ARCHIVE), '--target', staging, '--json'],
      path.join(candidate, '.home'), openclawBin, 'openclaw_restore_failed')
    const { root, manifest: nativeManifest } = findOpenClawExtraction(staging)
    assertNativePathsMapped(nativeManifest, candidate)
    const mapped = nativeManifest.assets.map(asset => {
      assert(typeof asset?.sourcePath === 'string' && path.isAbsolute(asset.sourcePath) && inside(candidate, asset.sourcePath),
        'external_path_unmapped', 'OpenClaw archive refers to a path outside the candidate data mount')
      const archivePath = safeRelative(asset.archivePath)
      assert(archivePath.startsWith(`${nativeManifest.archiveRoot}/payload/`),
        'invalid_openclaw_archive', 'OpenClaw asset path is outside its payload')
      const from = path.join(staging, archivePath)
      assert(inside(root, from) && fs.existsSync(from), 'invalid_openclaw_archive', 'OpenClaw asset is missing')
      return { from, to: path.join(candidate, path.relative(candidate, asset.sourcePath)) }
    })

    for (const name of manifest.directories) fs.mkdirSync(path.join(candidate, name), { recursive: true, mode: 0o700 })
    for (const entry of manifest.files) copyRestoredTree(path.join(bundleRoot, 'dashboard', entry.path), path.join(candidate, entry.path))
    for (const asset of mapped) copyRestoredTree(asset.from, asset.to)

    const state = path.join(candidate, '.home', '.openclaw')
    assert(fs.existsSync(path.join(state, 'openclaw.json')), 'verification_failed', 'Restored OpenClaw config is missing')
    nativeOpenClaw(['doctor', '--fix', '--non-interactive', '--yes'], path.join(candidate, '.home'), openclawBin, 'migration_failed')
    assert(legacyMigrationSources(state).length === 0, 'migration_failed', 'Legacy auth or session index remains after migration')
    for (const entry of manifest.files) {
      const restored = path.join(candidate, entry.path)
      assert(fs.existsSync(restored) && fs.lstatSync(restored).isFile()
        && fs.statSync(restored).size === entry.bytes && sha256(restored) === entry.sha256,
      'verification_failed', 'Dashboard asset failed post-migration verification')
    }
    const receipt = {
      apiVersion: API_VERSION, kind: 'candidate-restore', bundleId: manifest.bundleId,
      migratedAt: new Date().toISOString(), dashboardVersion: String(process.env.CLAWMAX_VERSION || 'unknown'),
      openclawArchiveVerified: true, legacySourcesRemaining: 0,
      dashboardFilesVerified: manifest.files.length,
    }
    fs.writeFileSync(path.join(candidate, RESTORE_RECEIPT), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    return { apiVersion: API_VERSION, operation: 'restore', status: 'restored', bundleId: manifest.bundleId,
      checks: { bundle: 'passed', migration: 'passed', dashboardFiles: 'passed', legacySources: 'absent' },
      assets: { files: manifest.files.length } }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
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
    assert(['backup', 'verify', 'restore'].includes(operation), 'invalid_request', 'Expected backup, verify, or restore operation')
    const result = operation === 'backup' ? createBundle(options)
      : operation === 'verify' ? verifyBundle(options.bundle) : restoreBundle(options)
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } catch (error) {
    const code = error instanceof OfflineBackupError ? error.code : 'operation_failed'
    process.stdout.write(`${JSON.stringify({ apiVersion: API_VERSION, operation, status: 'blocked', code })}\n`)
    process.exitCode = 1
  }
}
