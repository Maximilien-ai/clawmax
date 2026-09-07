import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveWhatsAppDependencyPaths } from './whatsapp-dependencies'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (error) {
    console.error(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`)
    failed++
  }
}

function withTempDir(fn: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-wa-deps-'))
  try { fn(dir) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

function writePackage(root: string, subPath: string, name: string): string {
  const packageRoot = path.join(root, subPath)
  fs.mkdirSync(path.join(packageRoot, 'lib'), { recursive: true })
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify({ name }), 'utf-8')
  fs.writeFileSync(path.join(packageRoot, 'lib', 'index.js'), 'export {}\n', 'utf-8')
  return packageRoot
}

test('resolves OpenClaw 2 direct baileys dependencies from a pinned CLI wrapper', () => {
  withTempDir((dir) => {
    const targetRoot = path.join(dir, 'targets', 'v2026.8.2')
    const cliPath = path.join(targetRoot, 'bin', 'openclaw')
    fs.mkdirSync(path.dirname(cliPath), { recursive: true })
    fs.writeFileSync(cliPath, '#!/bin/sh\n', 'utf-8')
    const baileys = writePackage(path.join(targetRoot, 'src'), 'node_modules/baileys', 'baileys')
    const boom = writePackage(path.join(targetRoot, 'src'), 'node_modules/@hapi/boom', '@hapi/boom')
    assert.deepStrictEqual(resolveWhatsAppDependencyPaths({ cliPath, homeDir: dir }), { baileys, boom })
  })
})

test('resolves legacy scoped Baileys packages from the pnpm store', () => {
  withTempDir((dir) => {
    const repoRoot = path.join(dir, 'repo')
    const baileys = writePackage(repoRoot, 'node_modules/.pnpm/@whiskeysockets+baileys@6.7.0/node_modules/@whiskeysockets/baileys', '@whiskeysockets/baileys')
    const boom = writePackage(repoRoot, 'node_modules/.pnpm/@hapi+boom@9.1.4/node_modules/@hapi/boom', '@hapi/boom')
    assert.deepStrictEqual(resolveWhatsAppDependencyPaths({ repositoryRoot: repoRoot, homeDir: dir }), { baileys, boom })
  })
})

test('resolves dependencies from an external OpenClaw WhatsApp plugin project', () => {
  withTempDir((dir) => {
    const projectRoot = path.join(dir, '.openclaw', 'npm', 'projects', 'openclaw-whatsapp-test')
    const baileys = writePackage(projectRoot, 'node_modules/baileys', 'baileys')
    const boom = writePackage(projectRoot, 'node_modules/@hapi/boom', '@hapi/boom')
    assert.deepStrictEqual(resolveWhatsAppDependencyPaths({ homeDir: dir }), { baileys, boom })
  })
})

test('resolves dependencies beside a real global OpenClaw CLI target', () => {
  withTempDir((dir) => {
    const packageRoot = path.join(dir, 'lib', 'node_modules', 'openclaw')
    const cliTarget = path.join(packageRoot, 'openclaw.mjs')
    const cliLink = path.join(dir, 'bin', 'openclaw')
    fs.mkdirSync(path.dirname(cliLink), { recursive: true })
    fs.mkdirSync(packageRoot, { recursive: true })
    fs.writeFileSync(cliTarget, '', 'utf-8')
    fs.symlinkSync(cliTarget, cliLink)
    const baileys = writePackage(packageRoot, 'node_modules/baileys', 'baileys')
    const boom = writePackage(packageRoot, 'node_modules/@hapi/boom', '@hapi/boom')
    assert.deepStrictEqual(resolveWhatsAppDependencyPaths({ cliPath: cliLink, homeDir: dir }), {
      baileys: fs.realpathSync(baileys),
      boom: fs.realpathSync(boom),
    })
  })
})

test('rejects directories that only resemble the expected packages', () => {
  withTempDir((dir) => {
    writePackage(dir, 'node_modules/baileys', 'not-baileys')
    writePackage(dir, 'node_modules/@hapi/boom', 'not-boom')
    assert.deepStrictEqual(resolveWhatsAppDependencyPaths({ repositoryRoot: dir, homeDir: dir }), {
      baileys: null,
      boom: null,
    })
  })
})

console.log(`Tests passed: ${passed}`)
console.log(`Tests failed: ${failed}`)
if (failed > 0) process.exit(1)
console.log('All tests passed')
