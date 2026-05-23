/**
 * Dashboard version resolution test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/version.test.ts
 */

import { getDashboardVersion } from './workspace'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalVersion = process.env.CLAWMAX_VERSION

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Version Test Suite ===${RESET}\n`)

async function run() {
  await test('getDashboardVersion prefers explicit CLAWMAX_VERSION', () => {
    process.env.CLAWMAX_VERSION = 'v1.3.3'
    assert(getDashboardVersion() === 'v1.3.3', 'Expected explicit CLAWMAX_VERSION to win')
  })

  await test('getDashboardVersion prefers prerelease package versions for hack builds', () => {
    process.env.CLAWMAX_VERSION = 'dev'
    const packageJsonPath = require('path').join(__dirname, '..', '..', 'package.json')
    const fs = require('fs')
    const original = fs.readFileSync(packageJsonPath, 'utf-8')
    const parsed = JSON.parse(original)
    parsed.version = '1.4.0-hack'
    fs.writeFileSync(packageJsonPath, JSON.stringify(parsed, null, 2), 'utf-8')
    try {
      assert(getDashboardVersion() === '1.4.0-hack', `Expected prerelease package version, got ${getDashboardVersion()}`)
    } finally {
      fs.writeFileSync(packageJsonPath, original, 'utf-8')
    }
  })

  await test('getDashboardVersion ignores placeholder env values and prefers git/source version', () => {
    process.env.CLAWMAX_VERSION = 'dev'
    const resolved = getDashboardVersion()
    assert(
      resolved.startsWith('v') || /^\d+\.\d+\.\d+(?:-[0-9a-f]{7}\*?)?$/.test(resolved),
      `Expected a real fallback version, got ${resolved}`,
    )
  })

  await test('getDashboardVersion includes short sha when HEAD is past the latest stable tag', () => {
    process.env.CLAWMAX_VERSION = 'dev'
    const resolved = getDashboardVersion()
    if (/^\d+\.\d+\.\d+-[0-9a-f]{7}\*?$/.test(resolved)) {
      return
    }
    if (/^\d+\.\d+\.\d+$/.test(resolved)) {
      return
    }
    assert(
      resolved.startsWith('v'),
      `Expected exact tagged releases to keep their tag form when tags are available, got ${resolved}`,
    )
  })

  if (typeof originalVersion === 'undefined') delete process.env.CLAWMAX_VERSION
  else process.env.CLAWMAX_VERSION = originalVersion

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
