import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-packaging-'))
const script = fileURLToPath(new URL('./configure-openclaw-packaging.mjs', import.meta.url))
const run = () => execFileSync(process.execPath, [script, root], { stdio: 'pipe' })
try {
  const manifest = JSON.stringify({ name: 'packaging-fixture', version: '2026.9.7', bundleDependencies: ['bundled-fixture'], dependencies: { 'bundled-fixture': 'file:./bundled', 'workspace-fixture': 'workspace:*' } })
  fs.writeFileSync(path.join(root, 'package.json'), manifest)
  const workspace = path.join(root, 'pnpm-workspace.yaml')
  fs.writeFileSync(workspace, "packages: ['packages/*']\nnodeLinker: isolated\n")
  run(); run()
  assert.equal(fs.readFileSync(workspace, 'utf8'), "packages: ['packages/*']\nnodeLinker: hoisted\n")
  assert.equal(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), manifest)
  if (process.env.TEST_PINNED_PNPM === 'true') {
    fs.mkdirSync(path.join(root, 'packages/local'), { recursive: true })
    fs.writeFileSync(path.join(root, 'packages/local/package.json'), JSON.stringify({ name: 'workspace-fixture', version: '1.2.3' }))
    fs.mkdirSync(path.join(root, 'bundled'))
    fs.writeFileSync(path.join(root, 'bundled/package.json'), JSON.stringify({ name: 'bundled-fixture', version: '1.0.0', main: 'index.js' }))
    fs.writeFileSync(path.join(root, 'bundled/index.js'), 'module.exports = 42\n')
    const pnpm = (...args) => execFileSync('npx', ['--yes', 'pnpm@12.5.1', ...args], { cwd: root, stdio: 'pipe', timeout: 300000, env: { ...process.env, CI: 'true' } })
    pnpm('install', '--ignore-scripts')
    pnpm('--config.ignore-scripts=true', 'pack')
    const archive = path.join(root, 'packaging-fixture-2026.9.7.tgz')
    const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
    assert.match(entries, /package\/node_modules\/bundled-fixture\/index.js/)
    const packed = JSON.parse(execFileSync('tar', ['-xOzf', archive, 'package/package.json'], { encoding: 'utf8' }))
    assert.equal(packed.dependencies['workspace-fixture'], '1.2.3')
    console.log('Pinned pnpm install/pack retained the bundled runtime payload')
  }
  fs.writeFileSync(workspace, 'nodeLinker: unknown\n')
  assert.throws(run)
  fs.writeFileSync(workspace, 'nodeLinker: isolated\nnodeLinker: hoisted\n')
  assert.throws(run)
  console.log('OpenClaw packaging configuration tests passed')
} finally { fs.rmSync(root, { recursive: true, force: true }) }
