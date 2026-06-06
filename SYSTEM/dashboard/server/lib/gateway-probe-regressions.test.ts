import { __test } from './gateway-rpc'

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

console.log(`\n${YELLOW}=== Gateway Probe Regression Tests ===${RESET}\n`)

test('dashboard probe client uses operator identity instead of control-ui mode', () => {
  const client = __test.buildGatewayProbeClient()
  assert(client.id === 'openclaw-dashboard', `Expected openclaw-dashboard id, got ${client.id}`)
  assert(client.mode === 'operator', `Expected operator mode, got ${client.mode}`)
})

test('dashboard probe display name stays stable for diagnostics', () => {
  const client = __test.buildGatewayProbeClient()
  assert(client.displayName === 'Dashboard Probe', `Expected Dashboard Probe display name, got ${client.displayName}`)
})

console.log(`\nTests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`\n${GREEN}All tests passed${RESET}`)
}
