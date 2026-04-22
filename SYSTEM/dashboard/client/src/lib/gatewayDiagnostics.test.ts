import { detectGatewayDiagnostics } from './gatewayDiagnostics'

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

console.log(`\n${YELLOW}=== Gateway Diagnostics Test Suite ===${RESET}\n`)

test('detects gateway restart loop from token mismatch and port conflict logs', () => {
  const result = detectGatewayDiagnostics([
    'ws unauthorized ... reason=token_mismatch',
    'config change requires gateway restart (gateway.auth.token, gateway.tailscale)',
    'received SIGUSR1; restarting',
    'gateway already running',
    'Port 18789 is already in use',
  ])

  assert(result?.title === 'Gateway Restart Loop Detected', `Unexpected title: ${result?.title}`)
  assert(result?.severity === 'critical', `Unexpected severity: ${result?.severity}`)
})

test('detects session drift from token mismatch and websocket close', () => {
  const result = detectGatewayDiagnostics([
    'ws unauthorized ... reason=token_mismatch',
    'gateway connection closed before status completed',
  ])

  assert(result?.title === 'Gateway Session Drift Detected', `Unexpected title: ${result?.title}`)
  assert(result?.severity === 'warning', `Unexpected severity: ${result?.severity}`)
})

test('returns null for ordinary healthy logs', () => {
  const result = detectGatewayDiagnostics([
    'gateway started',
    'status ok',
    'logs tail connected',
  ])

  assert(result === null, 'Expected no diagnostics for healthy logs')
})

console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
console.log(`${RED}Failed: ${testsFailed}${RESET}`)

if (testsFailed > 0) {
  console.log(`\n${RED}Some tests failed${RESET}`)
  process.exit(1)
}

console.log(`\n${GREEN}All tests passed! ✓${RESET}`)
