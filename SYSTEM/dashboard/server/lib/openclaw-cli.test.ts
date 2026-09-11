import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveOpenClawCliInvocation, resolveOpenClawCliPath } from './openclaw-cli'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const originalOpenClawBin = process.env.OPENCLAW_BIN
const originalPath = process.env.PATH

console.log(`\n${YELLOW}=== OpenClaw CLI Resolver Test Suite ===${RESET}\n`)

test('resolveOpenClawCliPath prefers OPENCLAW_BIN override when executable', () => {
  withTempDir('clawmax-openclaw-cli-override-', (dir) => {
    const fakeCli = path.join(dir, process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw')
    fs.writeFileSync(fakeCli, process.platform === 'win32' ? '@echo test-openclaw\r\n' : '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    if (process.platform !== 'win32') fs.chmodSync(fakeCli, 0o755)
    process.env.OPENCLAW_BIN = fakeCli
    assert.strictEqual(resolveOpenClawCliPath(), fakeCli)
  })
})

test('resolveOpenClawCliPath returns PATH entry when available', () => {
  withTempDir('clawmax-openclaw-cli-path-', (dir) => {
    const binDir = path.join(dir, 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    const fakeCli = path.join(binDir, process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw')
    fs.writeFileSync(fakeCli, process.platform === 'win32' ? '@echo test-openclaw\r\n' : '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    if (process.platform !== 'win32') fs.chmodSync(fakeCli, 0o755)
    delete process.env.OPENCLAW_BIN
    process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`
    assert.strictEqual(resolveOpenClawCliPath(), fakeCli)
  })
})

test('resolveOpenClawCliPath falls back to PATH when OPENCLAW_BIN is not executable', () => {
  withTempDir('clawmax-openclaw-cli-fallback-', (dir) => {
    const badOverride = path.join(dir, 'not-executable-openclaw')
    const binDir = path.join(dir, 'bin')
    fs.mkdirSync(binDir, { recursive: true })
    const pathCli = path.join(binDir, process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw')
    fs.writeFileSync(badOverride, 'echo broken\n', 'utf-8')
    fs.writeFileSync(pathCli, process.platform === 'win32' ? '@echo test-openclaw\r\n' : '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    if (process.platform !== 'win32') fs.chmodSync(pathCli, 0o755)

    process.env.OPENCLAW_BIN = badOverride
    process.env.PATH = `${binDir}${path.delimiter}${originalPath || ''}`
    assert.strictEqual(resolveOpenClawCliPath(), pathCli)
  })
})

test('resolveOpenClawCliInvocation does not use a shell for normal executables', () => {
  withTempDir('clawmax-openclaw-cli-invocation-', (dir) => {
    const fakeCli = path.join(dir, process.platform === 'win32' ? 'openclaw.exe' : 'openclaw')
    fs.writeFileSync(fakeCli, process.platform === 'win32' ? 'test' : '#!/bin/sh\necho test-openclaw\n', 'utf-8')
    if (process.platform !== 'win32') fs.chmodSync(fakeCli, 0o755)
    process.env.OPENCLAW_BIN = fakeCli
    assert.deepStrictEqual(resolveOpenClawCliInvocation(['--version']), {
      command: fakeCli,
      args: ['--version'],
    })
  })
})

if (process.platform === 'win32') {
  test('resolveOpenClawCliInvocation unwraps the npm Windows shim', () => {
    withTempDir('clawmax-openclaw-cli-windows-', (dir) => {
      const fakeCli = path.join(dir, 'openclaw.cmd')
      const packageEntry = path.join(dir, 'node_modules', 'openclaw', 'openclaw.mjs')
      fs.mkdirSync(path.dirname(packageEntry), { recursive: true })
      fs.writeFileSync(fakeCli, '@echo off\r\n', 'utf-8')
      fs.writeFileSync(packageEntry, 'console.log("test")\n', 'utf-8')
      process.env.OPENCLAW_BIN = fakeCli
      assert.deepStrictEqual(resolveOpenClawCliInvocation(['--version']), {
        command: process.execPath,
        args: [packageEntry, '--version'],
      })
    })
  })
}

if (typeof originalOpenClawBin === 'undefined') delete process.env.OPENCLAW_BIN
else process.env.OPENCLAW_BIN = originalOpenClawBin
if (typeof originalPath === 'undefined') delete process.env.PATH
else process.env.PATH = originalPath

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  console.log(`${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}All tests passed${RESET}`)
}
