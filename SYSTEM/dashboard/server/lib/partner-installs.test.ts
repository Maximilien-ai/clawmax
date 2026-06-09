/**
 * Curated partner installer test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/partner-installs.test.ts
 */

import { getCuratedPartnerInstaller } from './partner-installs'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

console.log(`\n${YELLOW}=== Partner Installer Test Suite ===${RESET}\n`)

test('getCuratedPartnerInstaller rejects unknown command ids', () => {
  assert(getCuratedPartnerInstaller('rm-everything') === null, 'Expected unknown installer to be rejected')
})

test('getCuratedPartnerInstaller exposes only the allowlisted Cognee OpenClaw installer', () => {
  const installer = getCuratedPartnerInstaller('cognee-openclaw')
  assert(installer !== null, 'Expected Cognee OpenClaw installer')
  assert(installer?.installCommand.join(' ') === 'openclaw plugins install @cognee/cognee-openclaw@latest', `Unexpected Cognee installer command: ${installer?.installCommand.join(' ')}`)
  assert(installer?.uninstallCommand.join(' ') === 'openclaw plugins uninstall @cognee/cognee-openclaw', `Unexpected Cognee uninstall command: ${installer?.uninstallCommand.join(' ')}`)
  assert(installer?.source === 'openclaw', 'Expected OpenClaw installer source')
})

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
