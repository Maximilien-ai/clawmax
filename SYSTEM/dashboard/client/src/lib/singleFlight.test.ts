import assert from 'assert'
import { beginSingleFlight, endSingleFlight } from './singleFlight'

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

console.log(`\n${YELLOW}=== Single Flight Helper Test Suite ===${RESET}\n`)

test('beginSingleFlight allows the first call and blocks re-entry until reset', () => {
  const ref = { current: false }
  assert.strictEqual(beginSingleFlight(ref), true)
  assert.strictEqual(beginSingleFlight(ref), false)
  endSingleFlight(ref)
  assert.strictEqual(beginSingleFlight(ref), true)
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
