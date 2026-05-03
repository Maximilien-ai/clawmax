import { __test } from './gateway-rpc'

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
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Gateway RPC Test Suite ===${RESET}\n`)

test('parseGatewayConfig falls back to gateway.remote.token when auth token is absent', () => {
  const parsed = __test.parseGatewayConfig({
    gateway: {
      port: 18889,
      auth: { mode: 'token' },
      remote: { token: 'remote-only-token' },
    },
  })

  assert(!!parsed, 'Expected config to parse')
  assert(parsed?.port === 18889, `Expected port 18889, got ${parsed?.port}`)
  assert(parsed?.auth.token === 'remote-only-token', `Expected remote token fallback, got ${parsed?.auth.token}`)
  assert(parsed?.auth.mode === 'token', `Expected auth mode preserved, got ${parsed?.auth.mode}`)
})

setTimeout(() => {
  console.log(`\nPassed: ${testsPassed}`)
  console.log(`Failed: ${testsFailed}`)

  if (testsFailed > 0) {
    console.log(`\n${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed!${RESET}`)
    process.exit(0)
  }
}, 50)
