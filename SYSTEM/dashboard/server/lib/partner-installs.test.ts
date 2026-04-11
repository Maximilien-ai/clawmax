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

test('getCuratedPartnerInstaller returns allowlisted Blaxel installer', () => {
  const installer = getCuratedPartnerInstaller('blaxel-agent-skills')
  assert(!!installer, 'Expected curated installer')
  assert(installer?.command[0] === 'npx', 'Expected npx command')
  assert(installer?.command.join(' ') === 'npx -y skills add blaxel-ai/agent-skills --yes --global', 'Expected exact Blaxel install command')
})

test('getCuratedPartnerInstaller returns allowlisted Redis installer', () => {
  const installer = getCuratedPartnerInstaller('redis-agent-skills')
  assert(!!installer, 'Expected curated installer')
  assert(installer?.command[0] === 'npx', 'Expected npx command')
  assert(installer?.command.join(' ') === 'npx -y skills add redis/agent-skills --yes --global', 'Expected exact Redis install command')
})

test('getCuratedPartnerInstaller rejects unknown command ids', () => {
  assert(getCuratedPartnerInstaller('rm-everything') === null, 'Expected unknown installer to be rejected')
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
