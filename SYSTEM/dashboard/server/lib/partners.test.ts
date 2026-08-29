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
  assert(slugs.join(',') === 'senso,opik,github,resend,cognee,gmail,microsoft365,digo,agentforge', `Unexpected default partner slugs: ${slugs.join(',')}`)
})

test('legacy default allowlist gains newly shipped default partners', () => {
  process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'github,senso,opik,resend,cognee'
  const partners = listPartnerDefinitions()
  const slugs = partners.map((partner) => partner.slug)
  assert(slugs.join(',') === 'senso,opik,github,resend,cognee,gmail,microsoft365,digo,agentforge', `Unexpected migrated partners: ${slugs.join(',')}`)
})

test('custom partner allowlist remains explicit', () => {
  process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'github,resend'
  const partners = listPartnerDefinitions()
  const slugs = partners.map((partner) => partner.slug)
  assert(slugs.join(',') === 'github,resend', `Unexpected custom partners: ${slugs.join(',')}`)
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
  assert(partner.skills?.mode === 'curated-installer', 'Expected Cognee official plugin to use curated installer')
  assert(partner.skills?.commandId === 'cognee-openclaw', 'Expected Cognee curated installer command id')
  assert((partner.skills?.items || []).includes('@cognee/cognee-openclaw'), 'Expected official Cognee OpenClaw plugin in partner skills')
})

test('mail partners expose delegated OAuth metadata without password or token fields', () => {
  process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'gmail,microsoft365'
  const partners = listPartnerDefinitions()
  assert(partners.map((partner) => partner.slug).join(',') === 'gmail,microsoft365', 'Expected both public mail partners')
  for (const partner of partners) {
    assert(partner.skills?.mode === 'catalog', `Expected ${partner.slug} to expose the shipped mail skill`)
    assert((partner.skills?.items || []).includes('clawmax-mail'), `Expected ${partner.slug} to link clawmax-mail`)
    assert((partner.fields || []).length === 0, `Expected ${partner.slug} to avoid unusable password/token fields`)
    assert(/bounded mail skill/i.test(partner.skills?.label || ''), `Expected ${partner.slug} to explain the bounded skill`)
    assert(/delegated OAuth is available when the operator configures/i.test(partner.validation?.helperText || ''), `Expected ${partner.slug} to describe readiness honestly`)
  }
})

test('digo partner exposes server API key and HTTPS ingestion URL fields', () => {
  process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'digo'
  const partner = listPartnerDefinitions()[0]
  assert(partner.slug === 'digo', 'Expected digo partner')
  assert(partner.fields?.some((field) => field.key === 'apiKey' && field.secret === true && field.storage === 'server') === true, 'Expected Digo server-stored API key field')
  assert(partner.fields?.some((field) => field.key === 'apiUrl' && field.secret !== true) === true, 'Expected Digo ingestion URL field')
  assert(/consent/i.test(partner.validation?.helperText || ''), 'Expected Digo readiness copy to mention consent')
})

test('agentforge partner exposes NYU branding and server-managed Activity Export fields', () => {
  process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'agentforge'
  const partner = listPartnerDefinitions()[0]
  assert(partner.slug === 'agentforge', 'Expected agentforge partner')
  assert(partner.name === 'NYU - AgentForge', 'Expected NYU - AgentForge display name')
  assert(partner.fields?.some((field) => field.key === 'apiKey' && field.secret === true && field.storage === 'server') === true, 'Expected AgentForge server-stored Partner API key field')
  assert(partner.fields?.some((field) => field.key === 'apiUrl' && field.secret !== true && field.storage === 'server') === true, 'Expected AgentForge ingestion URL field')
  assert(/active AgentForge consent receipt/i.test(partner.validation?.helperText || ''), 'Expected AgentForge readiness copy to preserve the consent gate')
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
