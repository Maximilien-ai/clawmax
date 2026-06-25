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

console.log(`\n${YELLOW}=== Gateway RPC Edge Test Suite ===${RESET}\n`)

test('parseGatewayConfig returns null when port or token is missing', () => {
  assert(__test.parseGatewayConfig({ gateway: { auth: { token: 'abc' } } }) === null, 'Expected missing port to return null')
  assert(__test.parseGatewayConfig({ gateway: { port: 18789 } }) === null, 'Expected missing token to return null')
})

test('parseGatewayConfig ignores invalid OPENCLAW_GATEWAY_URL overrides', () => {
  const originalGatewayUrl = process.env.OPENCLAW_GATEWAY_URL
  process.env.OPENCLAW_GATEWAY_URL = 'notaurl'

  try {
    const parsed = __test.parseGatewayConfig({
      gateway: {
        port: 18889,
        auth: { mode: 'token', token: 'gateway-token' },
      },
    })

    assert(!!parsed, 'Expected config to parse with invalid override ignored')
    assert(parsed?.port === 18889, `Expected original port, got ${parsed?.port}`)
    assert(parsed?.host === '127.0.0.1', `Expected default host, got ${parsed?.host}`)
    assert(parsed?.httpUrl === 'http://127.0.0.1:18889', `Expected default httpUrl, got ${parsed?.httpUrl}`)
  } finally {
    if (typeof originalGatewayUrl === 'undefined') delete process.env.OPENCLAW_GATEWAY_URL
    else process.env.OPENCLAW_GATEWAY_URL = originalGatewayUrl
  }
})

test('parseGatewayConfig upgrades https OPENCLAW_GATEWAY_URL overrides to wss websocket URLs', () => {
  const originalGatewayUrl = process.env.OPENCLAW_GATEWAY_URL
  process.env.OPENCLAW_GATEWAY_URL = 'https://dashboard.example.com:444/gateway?debug=1'

  try {
    const parsed = __test.parseGatewayConfig({
      gateway: {
        port: 18889,
        auth: { mode: 'token', token: 'gateway-token' },
      },
    })

    assert(!!parsed, 'Expected config to parse')
    assert(parsed?.port === 444, `Expected override port 444, got ${parsed?.port}`)
    assert(parsed?.httpUrl === 'https://dashboard.example.com:444', `Expected normalized https httpUrl, got ${parsed?.httpUrl}`)
    assert(parsed?.wsUrl === 'wss://dashboard.example.com:444', `Expected secure websocket url, got ${parsed?.wsUrl}`)
  } finally {
    if (typeof originalGatewayUrl === 'undefined') delete process.env.OPENCLAW_GATEWAY_URL
    else process.env.OPENCLAW_GATEWAY_URL = originalGatewayUrl
  }
})

test('normalizeGatewayHttpUrl strips paths and rejects unsupported protocols', () => {
  assert(__test.normalizeGatewayHttpUrl('https://gateway.example.com:443/foo/bar?x=1#frag') === 'https://gateway.example.com', 'Expected normalized https url without path')
  assert(__test.normalizeGatewayHttpUrl('ftp://gateway.example.com') === null, 'Expected unsupported protocol to return null')
  assert(__test.normalizeGatewayHttpUrl('') === null, 'Expected blank gateway url to return null')
})

test('getGatewayOrigin prefers explicit httpUrl and falls back to localhost port', () => {
  assert(
    __test.getGatewayOrigin({
      port: 18789,
      httpUrl: 'http://127.0.0.1:18789',
      auth: { mode: 'token', token: 'abc' },
    } as any) === 'http://127.0.0.1:18789',
    'Expected explicit httpUrl to be preferred',
  )

  assert(
    __test.getGatewayOrigin({
      port: 18890,
      auth: { mode: 'token', token: 'abc' },
    } as any) === 'http://localhost:18890',
    'Expected localhost fallback origin',
  )
})

test('gateway probe connect params preserve protocol version and read-only operator scope', () => {
  const params = __test.buildGatewayProbeConnectParams('secret-token')

  assert(params.minProtocol === __test.GATEWAY_PROTOCOL_VERSION, 'Expected min protocol to match current version')
  assert(params.maxProtocol === __test.GATEWAY_PROTOCOL_VERSION, 'Expected max protocol to match current version')
  assert(params.auth.token === 'secret-token', 'Expected auth token to be passed through')
  assert(Array.isArray(params.scopes) && params.scopes.length === 1 && params.scopes[0] === 'operator.read', 'Expected read-only operator scope')
  assert(params.client.id === 'openclaw-dashboard', 'Expected dashboard probe client id')
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
