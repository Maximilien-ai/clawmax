/**
 * Auth helper test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/auth.test.ts
 */

import { formatDashboardTokenPreview } from './auth'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Auth Helper Test Suite ===${RESET}\n`)

test('formatDashboardTokenPreview redacts long tokens', () => {
  const raw = '1234567890abcdef1234567890abcdef'
  const preview = formatDashboardTokenPreview(raw)
  assert(preview === '123456…cdef', `Unexpected preview: ${preview}`)
  assert(!preview.includes(raw), 'Preview must not contain the full token')
})

test('formatDashboardTokenPreview handles short tokens', () => {
  const preview = formatDashboardTokenPreview('abcdef12')
  assert(preview === 'abcd…12', `Unexpected short preview: ${preview}`)
})

test('formatDashboardTokenPreview handles empty tokens', () => {
  const preview = formatDashboardTokenPreview('')
  assert(preview === '(empty)', `Unexpected empty preview: ${preview}`)
})

console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
console.log(`${RED}Failed: ${testsFailed}${RESET}`)

if (testsFailed > 0) {
  process.exit(1)
}

console.log(`\n${GREEN}All tests passed! ✓${RESET}`)
