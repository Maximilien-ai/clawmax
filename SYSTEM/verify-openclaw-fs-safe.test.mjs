import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-upstream-fs-'))
const script = fileURLToPath(new URL('./patch-openclaw-fs-safe.mjs', import.meta.url))
const dependency = path.join(root, 'node_modules/@openclaw/fs-safe')
const run = () => execFileSync(process.execPath, [script, root], { encoding: 'utf8', stdio: 'pipe' })
try {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true })
  fs.mkdirSync(path.join(dependency, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '2026.9.5', dependencies: { '@openclaw/fs-safe': '0.13.1' } }))
  fs.writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({ version: '0.13.1', type: 'module', main: 'dist/index.js' }))
  fs.writeFileSync(path.join(dependency, 'dist/index.js'), 'export {}')
  const guard = path.join(root, 'dist/private-dir-mode-fixture.mjs')
  const guards = 'if (((await handle.stat()).mode & 511) !== mode) await handle.chmod(mode);\nif ((fs.fstatSync(fd).mode & 511) !== mode) fs.fchmodSync(fd, mode);'
  fs.writeFileSync(guard, guards)
  const owner = path.join(dependency, 'dist/directory-mode-owner.js')
  const implementation = `export function ownDirectoryMode(p) { return {
    apply: async (mode) => { if (await p.inspect() !== mode) await p.chmod(mode) },
    close: p.close,
  } }`
  fs.writeFileSync(owner, implementation)
  assert.match(run(), /Verified upstream/)
  assert.match(run(), /Verified upstream/)
  assert.equal(fs.readFileSync(guard, 'utf8'), guards, 'Verification must not rewrite upstream code')
  fs.writeFileSync(guard, guards.replace('!== mode', '=== mode'))
  assert.throws(run, /no-op chmod guard/)
  fs.writeFileSync(guard, guards)
  fs.writeFileSync(owner, implementation.replace('if (await p.inspect() !== mode) ', ''))
  assert.throws(run, /Correct modes must not trigger chmod/)
  fs.writeFileSync(owner, implementation)
  fs.writeFileSync(path.join(dependency, 'package.json'), JSON.stringify({ version: '0.13.2', type: 'module', main: 'dist/index.js' }))
  assert.throws(run, /AssertionError/)
  console.log('Upstream OpenClaw filesystem verification tests passed')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
