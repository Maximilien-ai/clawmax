#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const openClawRoot = path.resolve(process.argv[2] || process.cwd())
const distDir = path.join(openClawRoot, 'dist')
const packageFile = path.join(openClawRoot, 'package.json')
const metadata = fs.existsSync(packageFile) ? JSON.parse(fs.readFileSync(packageFile, 'utf8')) : {}

// 2026.9.5 moved secret writes into fs-safe and already avoids chmod when the
// directory mode is correct. Verify that contract instead of applying the old
// textual patch to unrelated code. Unknown versions/layouts still fail closed.
if (metadata.version === '2026.9.5') {
  assert.equal(metadata.dependencies?.['@openclaw/fs-safe'], '0.13.1', 'Unexpected fs-safe dependency')
  const dependency = path.dirname(path.dirname(createRequire(packageFile).resolve('@openclaw/fs-safe')))
  assert.equal(JSON.parse(fs.readFileSync(path.join(dependency, 'package.json'), 'utf8')).version, '0.13.1')
  const guards = fs.readdirSync(distDir).filter(name => /^private-dir-mode-[\w-]+\.mjs$/.test(name))
  assert.equal(guards.length, 1, 'Expected one private directory mode guard')
  const guard = fs.readFileSync(path.join(distDir, guards[0]), 'utf8')
  assert(guard.includes('if (((await handle.stat()).mode & 511) !== mode) await handle.chmod(mode);'), 'Missing async no-op chmod guard')
  assert(guard.includes('if ((fs.fstatSync(fd).mode & 511) !== mode) fs.fchmodSync(fd, mode);'), 'Missing sync no-op chmod guard')
  const { ownDirectoryMode } = await import(pathToFileURL(path.join(dependency, 'dist/directory-mode-owner.js')).href)
  let mode = 0o700
  let calls = 0
  const owner = ownDirectoryMode({ inspect: async () => mode, chmod: async next => { calls++; mode = next }, close: async () => {} })
  await owner.apply(0o700)
  await owner.apply(0o700, { beforeChmod: async () => {} })
  assert.equal(calls, 0, 'Correct modes must not trigger chmod')
  mode = 0o755
  await owner.apply(0o700)
  assert.equal(calls, 1, 'Incorrect modes must be tightened')
  assert.equal(mode, 0o700)
  await owner.close()
  console.log('Verified upstream OpenClaw 2026.9.5 no-op chmod safeguards; legacy patch not required')
  process.exit(0)
}
const candidates = fs.readdirSync(distDir)
  .filter((name) => /^secret-file-.*\.js$/.test(name))
  .map((name) => path.join(distDir, name))

const original = `async function enforcePrivatePathMode(resolvedPath, expectedMode, kind) {
\tif (process.platform === "win32") return;
\tawait fs$1.chmod(resolvedPath, expectedMode);
\tconst actualMode = (await fs$1.stat(resolvedPath)).mode & 511;
\tif (actualMode !== expectedMode) throw new Error(\`Private secret \${kind} \${resolvedPath} has insecure permissions \${actualMode.toString(8)}.\`);
}`

const replacement = `async function enforcePrivatePathMode(resolvedPath, expectedMode, kind) {
\tif (process.platform === "win32") return;
\tlet actualMode = (await fs$1.stat(resolvedPath)).mode & 511;
\tif (actualMode === expectedMode) return;
\tawait fs$1.chmod(resolvedPath, expectedMode);
\tactualMode = (await fs$1.stat(resolvedPath)).mode & 511;
\tif (actualMode !== expectedMode) throw new Error(\`Private secret \${kind} \${resolvedPath} has insecure permissions \${actualMode.toString(8)}.\`);
}`

let patched = 0
for (const targetPath of candidates) {
  const source = fs.readFileSync(targetPath, 'utf8')
  if (source.includes(replacement)) {
    patched++
    continue
  }
  if (!source.includes(original)) continue
  fs.writeFileSync(targetPath, source.replace(original, replacement), 'utf8')
  patched++
}

if (patched !== 1) {
  throw new Error(`Expected exactly one OpenClaw secret-file bundle to patch, found ${patched} in ${distDir}`)
}

console.log('Patched OpenClaw private-directory mode enforcement for inode-changing filesystems')
