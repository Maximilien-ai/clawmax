import { fallbackAgentTemplateSlug, normalizeAgentTemplateOption } from './agentTemplateOptions'

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

console.log(`\n${YELLOW}=== Agent Template Option Edge Test Suite ===${RESET}\n`)

test('fallbackAgentTemplateSlug trims outer punctuation and spaces', () => {
  const slug = fallbackAgentTemplateSlug('  --- Research Lead ++  ')
  assert(slug === 'research-lead', `Expected trimmed slug fallback, got ${slug}`)
})

test('fallbackAgentTemplateSlug collapses repeated separators', () => {
  const slug = fallbackAgentTemplateSlug('QA / Support // Lead')
  assert(slug === 'qa-support-lead', `Expected collapsed separators, got ${slug}`)
})

test('normalizeAgentTemplateOption provides empty collections when optional fields are missing', () => {
  const option = normalizeAgentTemplateOption({
    name: 'Ops Starter',
  })

  assert(option.slug === 'ops-starter', `Expected slug fallback, got ${option.slug}`)
  assert(Array.isArray(option.tags) && option.tags.length === 0, 'Expected tags to default to an empty array')
  assert(Array.isArray(option.agents) && option.agents.length === 0, 'Expected agents to default to an empty array')
  assert(typeof option.metadata === 'object' && option.metadata !== null, 'Expected metadata to default to an object')
})

test('normalizeAgentTemplateOption preserves provided tags metadata and agents', () => {
  const option = normalizeAgentTemplateOption({
    name: 'Ops Starter',
    tags: ['ops', 'starter'],
    metadata: { tier: 'lightweight' },
    agents: [{ id: 'ops-lead' }],
  })

  assert(option.tags?.join(',') === 'ops,starter', `Expected tags to be preserved, got ${option.tags?.join(',')}`)
  assert(option.metadata?.tier === 'lightweight', `Expected metadata to be preserved, got ${JSON.stringify(option.metadata)}`)
  assert(option.agents?.length === 1 && option.agents[0].id === 'ops-lead', 'Expected agents to be preserved')
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
