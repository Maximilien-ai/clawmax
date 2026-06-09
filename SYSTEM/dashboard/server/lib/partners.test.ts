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
  assert(slugs.join(',') === 'senso,opik,github,resend,cognee', `Unexpected default partner slugs: ${slugs.join(',')}`)
})

test('listPartnerDefinitions respects configured allowlist', () => {
  process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'github,senso,opik,resend,cognee'
  const partners = listPartnerDefinitions()
  const slugs = partners.map((partner) => partner.slug)
  assert(slugs.join(',') === 'github,senso,opik,resend,cognee', `Unexpected visible partners: ${slugs.join(',')}`)
})

test('resend partner exposes server-stored API key field and skill catalog', () => {
  process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'resend'
  const partner = listPartnerDefinitions()[0]
  assert(partner.slug === 'resend', 'Expected resend partner')
  assert(partner.fields?.some((field) => field.key === 'apiKey' && field.secret === true && field.storage === 'server') === true, 'Expected resend server-stored apiKey field')
  assert(partner.skills?.mode === 'catalog', 'Expected resend catalog-mode skills')
  assert((partner.skills?.items || []).includes('clawmax-resend'), 'Expected clawmax-resend in partner skills')
  assert((partner.skills?.items || []).includes('resend-cli'), 'Expected resend-cli in partner skills')
  assert(partner.skills?.sourceUrl === 'https://github.com/resend/resend-skills', 'Expected resend source URL for one-click import')
})

test('cognee partner exposes cloud/self-hosted fields and official OpenClaw plugin note', () => {
  process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'cognee'
  const partner = listPartnerDefinitions()[0]
  assert(partner.slug === 'cognee', 'Expected cognee partner')
  assert(partner.fields?.some((field) => field.key === 'apiKey' && field.secret === true && field.storage === 'server') === true, 'Expected Cognee server-stored apiKey field')
  assert(partner.fields?.some((field) => field.key === 'baseUrl' && field.secret !== true) === true, 'Expected Cognee Base URL field')
  assert(partner.fields?.some((field) => field.key === 'datasetName' && field.secret !== true) === true, 'Expected Cognee dataset field')
  assert(partner.skills?.mode === 'planned', 'Expected Cognee official plugin to stay planned until installer is verified')
  assert((partner.skills?.items || []).includes('@cognee/cognee-openclaw'), 'Expected official Cognee OpenClaw plugin in partner skills')
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
