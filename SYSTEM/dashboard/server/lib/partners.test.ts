/**
 * Partner definition test suite
 *
 * Run with: npx ts-node --transpile-only server/lib/partners.test.ts
 */

import { getEnabledPartnerSlugs, listPartnerDefinitions } from './partners'

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
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

console.log(`\n${YELLOW}=== Partner Definition Test Suite ===${RESET}\n`)

const previous = process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES

test('getEnabledPartnerSlugs defaults to current partner parity set', () => {
  delete process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES
  const slugs = getEnabledPartnerSlugs()
  assert(slugs.join(',') === 'senso,opik,github', `Unexpected default partner slugs: ${slugs.join(',')}`)
})

test('listPartnerDefinitions respects configured allowlist', () => {
  process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'github,senso,opik'
  const partners = listPartnerDefinitions()
  const slugs = partners.map((partner) => partner.slug)
  assert(slugs.join(',') === 'github,senso,opik', `Unexpected visible partners: ${slugs.join(',')}`)
})

if (typeof previous === 'undefined') delete process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES
else process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = previous

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
