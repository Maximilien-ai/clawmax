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

console.log(`\n${YELLOW}=== Single Flight Edge-Case Test Suite ===${RESET}\n`)

test('beginSingleFlight keeps an already-locked ref locked', () => {
  const ref = { current: true }
  assert.strictEqual(beginSingleFlight(ref), false)
  assert.strictEqual(ref.current, true)
})

test('endSingleFlight is safe on an already-unlocked ref', () => {
  const ref = { current: false }
  endSingleFlight(ref)
  assert.strictEqual(ref.current, false)
})

test('multiple refs stay independent', () => {
  const first = { current: false }
  const second = { current: false }
  assert.strictEqual(beginSingleFlight(first), true)
  assert.strictEqual(beginSingleFlight(second), true)
  assert.strictEqual(beginSingleFlight(first), false)
  assert.strictEqual(beginSingleFlight(second), false)
  endSingleFlight(first)
  assert.strictEqual(beginSingleFlight(first), true)
  assert.strictEqual(second.current, true)
})

test('repeated unlocks still leave the ref reusable', () => {
  const ref = { current: false }
  assert.strictEqual(beginSingleFlight(ref), true)
  endSingleFlight(ref)
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
