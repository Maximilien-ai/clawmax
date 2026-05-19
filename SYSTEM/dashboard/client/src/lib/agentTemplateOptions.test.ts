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

console.log(`\n${YELLOW}=== Agent Template Option Test Suite ===${RESET}\n`)

test('normalizeAgentTemplateOption preserves the server slug when present', () => {
  const option = normalizeAgentTemplateOption({
    name: 'Competitor Analyst',
    slug: 'competitor-analyst-v2',
    description: 'Analyze competitors',
  })

  assert(option.slug === 'competitor-analyst-v2', `Expected exact server slug, got ${option.slug}`)
})

test('fallbackAgentTemplateSlug still slugifies legacy template names', () => {
  const slug = fallbackAgentTemplateSlug('Competitor Analyst')
  assert(slug === 'competitor-analyst', `Expected slugified fallback, got ${slug}`)
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
