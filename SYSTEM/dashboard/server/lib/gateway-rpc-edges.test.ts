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

test('gateway CLI config calls serialize params without shell interpolation', () => {
  const args = __test.buildGatewayCliCallArgs('config.patch', {
    raw: JSON.stringify({ agents: { entries: { lead: { workspace: '/tmp/lead' } } } }),
    baseHash: 'hash-1',
  })

  assert(args.slice(0, 6).join(' ') === 'gateway call config.patch --json --timeout 120000', 'Expected canonical gateway call arguments')
  assert(args[6] === '--params', 'Expected params flag')
  assert(JSON.parse(args[7]).baseHash === 'hash-1', 'Expected params to be serialized as one argv value')
})

test('gateway CLI lifecycle calls can extend the bounded timeout', () => {
  const args = __test.buildGatewayCliCallArgs('agents.create', { name: 'agent-1' }, 180000)
  assert(args.slice(0, 6).join(' ') === 'gateway call agents.create --json --timeout 180000', 'Expected lifecycle timeout override')
  assert(JSON.parse(args[7]).name === 'agent-1', 'Expected lifecycle params to remain one argv value')
})

test('config RPC falls back only for scope and transport failures', () => {
  assert(__test.shouldFallbackConfigCallToCli(new Error('missing scope: operator.read')), 'Expected scope rejection to use paired CLI')
  assert(__test.shouldFallbackConfigCallToCli(new Error('Gateway RPC timeout for method: config.get')), 'Expected RPC timeout to use paired CLI')
  assert(__test.shouldFallbackConfigCallToCli(new Error('Gateway WebSocket error: ECONNREFUSED')), 'Expected WebSocket failure to use paired CLI')
  assert(!__test.shouldFallbackConfigCallToCli(new Error('invalid agent model')), 'Expected application errors not to be retried through CLI')
})

test('gateway CLI output parsing accepts strings and buffers without masking invalid output', () => {
  assert(__test.parseGatewayCliOutput('{"ok":true}')?.ok === true, 'Expected string output to parse')
  assert(__test.parseGatewayCliOutput(Buffer.from('{"hash":"abc"}'))?.hash === 'abc', 'Expected buffer output to parse')
  assert(__test.parseGatewayCliOutput('not json') === null, 'Expected invalid JSON to remain unparsed')
})

test('only persisted config.patch recovery restarts are treated as successful writes', () => {
  const persistedRestart = {
    ok: false,
    error: {
      type: 'gateway_request_error',
      code: 'UNAVAILABLE',
      message: 'config.patch persisted and updated the active Gateway, but a recovery restart is required; wait for the Gateway to restart',
    },
  }

  assert(__test.isPersistedConfigPatchRestartOutcome('config.patch', persistedRestart), 'Expected exact persisted restart response to be accepted')
  assert(!__test.isPersistedConfigPatchRestartOutcome('config.get', persistedRestart), 'Expected non-patch method to fail')
  assert(!__test.isPersistedConfigPatchRestartOutcome('config.patch', {
    ...persistedRestart,
    error: { ...persistedRestart.error, message: 'Gateway unavailable before config.patch persisted' },
  }), 'Expected an ordinary unavailable response to fail')
})

test('only closed CLI transport responses qualify for a Gateway recovery wait', () => {
  const closedTransport = {
    ok: false,
    error: {
      type: 'gateway_transport_error',
      kind: 'closed',
      message: 'Gateway not reachable at ws://127.0.0.1:18789 (ECONNREFUSED).',
      reason: 'connect ECONNREFUSED 127.0.0.1:18789',
    },
  }

  assert(__test.isGatewayCliClosedTransportOutcome(closedTransport), 'Expected closed refused transport to trigger recovery wait')
  assert(!__test.isGatewayCliClosedTransportOutcome({
    ...closedTransport,
    error: { ...closedTransport.error, type: 'gateway_request_error' },
  }), 'Expected request failures not to trigger a transport recovery wait')
  assert(!__test.isGatewayCliClosedTransportOutcome({
    ...closedTransport,
    error: { ...closedTransport.error, kind: 'timeout', message: 'Gateway request timed out' },
  }), 'Expected non-closed transport failures not to trigger this recovery wait')
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
