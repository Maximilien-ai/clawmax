import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { verifyPluginEntries } from './verify-openclaw-plugin-entries.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-plugin-entries-'))
try {
  const plugin = path.join(root, 'dist/extensions/example')
  fs.mkdirSync(plugin, { recursive: true })
  const manifest = path.join(plugin, 'package.json')
  fs.writeFileSync(manifest, JSON.stringify({ openclaw: { extensions: ['./index.js'] } }))
  assert.throws(() => verifyPluginEntries(root), /example: missing/)
  fs.writeFileSync(path.join(plugin, 'index.js'), 'export {}')
  verifyPluginEntries(root)
  fs.writeFileSync(manifest, JSON.stringify({ openclaw: { extensions: ['../example/index.js', '../../outside.js'] } }))
  assert.throws(() => verifyPluginEntries(root), /outside/)
  fs.writeFileSync(manifest, '{')
  assert.throws(() => verifyPluginEntries(root), SyntaxError)
  console.log('Plugin entry validation tests passed')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
