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

console.log(`\n${YELLOW}=== Gateway Probe Handshake Tests ===${RESET}\n`)

test('probe connect params use dashboard operator identity and read-only scope', () => {
  const params = __test.buildGatewayProbeConnectParams('gateway-token')

  assert(params.minProtocol === __test.GATEWAY_PROTOCOL_VERSION, 'Expected min protocol to match gateway protocol')
  assert(params.maxProtocol === __test.GATEWAY_PROTOCOL_VERSION, 'Expected max protocol to match gateway protocol')
  assert(params.client.id === 'openclaw-dashboard', `Expected dashboard client id, got ${params.client.id}`)
  assert(params.client.mode === 'operator', `Expected operator client mode, got ${params.client.mode}`)
  assert(params.role === 'operator', `Expected operator role, got ${params.role}`)
  assert(Array.isArray(params.scopes) && params.scopes.length === 1 && params.scopes[0] === 'operator.read', 'Expected read-only operator scope')
  assert(params.auth.token === 'gateway-token', 'Expected auth token to be forwarded')
})

test('probe connect params do not use control-ui or admin capabilities', () => {
  const params = __test.buildGatewayProbeConnectParams('gateway-token')

  assert(params.client.id !== 'openclaw-control-ui', 'Expected probe not to use control-ui client id')
  assert(params.client.mode !== 'ui', 'Expected probe not to use ui mode')
  assert(!params.scopes.includes('operator.admin'), 'Expected probe not to request operator.admin')
  assert(Array.isArray(params.caps) && params.caps.length === 0, 'Expected probe not to request capabilities')
})

console.log(`\nTests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`\n${GREEN}All tests passed${RESET}`)
}
