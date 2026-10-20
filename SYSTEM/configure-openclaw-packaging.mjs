import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = path.resolve(process.argv[2] || '.')
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.equal(metadata.version, '2026.9.7', 'Review packaging for this OpenClaw version')
assert(Array.isArray(metadata.bundleDependencies) && metadata.bundleDependencies.length > 0)
const file = path.join(root, 'pnpm-workspace.yaml')
const source = fs.readFileSync(file, 'utf8')
const entries = source.match(/^nodeLinker: (isolated|hoisted)\r?$/gm) || []
assert.equal(entries.length, 1, 'Expected one explicit nodeLinker setting')
// Use the same real hoisted layout for install and pack. Merely overriding pack
// or dropping bundleDependencies can silently omit required runtime payloads.
fs.writeFileSync(file, source.replace(/^nodeLinker: isolated\r?$/m, 'nodeLinker: hoisted'))
console.log('Configured hoisted OpenClaw packaging; bundled dependency declarations preserved')
