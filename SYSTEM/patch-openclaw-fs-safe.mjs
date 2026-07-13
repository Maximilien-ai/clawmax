#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const openClawRoot = path.resolve(process.argv[2] || process.cwd())
const distDir = path.join(openClawRoot, 'dist')
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
