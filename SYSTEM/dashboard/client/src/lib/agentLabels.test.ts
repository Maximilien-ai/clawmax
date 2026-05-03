/**
 * Agent label helper test suite
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/agentLabels.test.ts
 */

import { formatAgentOptionLabel } from './agentLabels'

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

console.log(`\n${YELLOW}=== Agent Label Helper Test Suite ===${RESET}\n`)

test('formatAgentOptionLabel includes id when display name differs', () => {
  assert(
    formatAgentOptionLabel({ id: 'ceo-west', name: 'CEO' }) === 'CEO (ceo-west)',
    'Expected duplicate-prone agent name to include id'
  )
})

test('formatAgentOptionLabel collapses to id when name is missing or identical', () => {
  assert(formatAgentOptionLabel({ id: 'ceo' }) === 'ceo', 'Expected bare id when name is missing')
  assert(formatAgentOptionLabel({ id: 'ceo', name: 'ceo' }) === 'ceo', 'Expected bare id when name matches id')
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  process.exit(1)
}

console.log(`${GREEN}All tests passed${RESET}`)

