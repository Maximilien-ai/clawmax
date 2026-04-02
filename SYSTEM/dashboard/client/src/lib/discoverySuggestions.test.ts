/**
 * Discovery suggestions test suite
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/discoverySuggestions.test.ts
 */

import { getDiscoverySuggestions } from './discoverySuggestions'

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

console.log(`\n${YELLOW}=== Discovery Suggestions Test Suite ===${RESET}\n`)

const candidates = [
  {
    id: 'research-desk',
    name: 'Real-Time Research Desk',
    description: 'Multimodal research team for evidence synthesis',
    type: 'organization',
    category: 'science',
    tags: ['research', 'multimodal'],
    keywords: ['analyst', 'brief', 'evidence', 'senso'],
  },
  {
    id: 'meeting-prep',
    name: 'Meeting Prep Desk',
    description: 'Prepare people and company research before meetings',
    type: 'organization',
    category: 'personal',
    tags: ['meetings', 'research'],
    keywords: ['briefing', 'research', 'calendar'],
  },
  {
    id: 'sales-followup',
    name: 'Sales Follow-up',
    description: 'Track next steps after outreach',
    type: 'workflow',
    tags: ['sales'],
    keywords: ['crm', 'outreach'],
  },
]

test('getDiscoverySuggestions ranks close name matches highest', () => {
  const results = getDiscoverySuggestions('research', candidates)
  assert(results.length > 0, 'Expected suggestions')
  assert(results[0].id === 'research-desk', 'Expected research desk first')
})

test('getDiscoverySuggestions uses roles tags and keywords for weak search', () => {
  const results = getDiscoverySuggestions('calendar briefing', candidates)
  assert(results.length > 0, 'Expected suggestions')
  assert(results[0].id === 'meeting-prep', 'Expected meeting prep first')
})

test('getDiscoverySuggestions returns empty list for empty query', () => {
  const results = getDiscoverySuggestions('   ', candidates)
  assert(results.length === 0, 'Expected no suggestions')
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
