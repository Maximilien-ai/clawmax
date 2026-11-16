import assert from 'assert'
import { deriveAgentRuntimeStatus } from './workspace'
import { createAgentGatewayProbeCache } from './agent-gateway-probe-cache'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

async function main() {
  console.log(`\n${YELLOW}=== Workspace Status Test Suite ===${RESET}\n`)

  await test('healthy embedded gateway keeps idle agent online', () => {
    const now = Date.now()
    const derived = deriveAgentRuntimeStatus({
      gatewayRunning: true,
      latestMtime: now - (3 * 24 * 60 * 60 * 1000),
      now,
      hasIdentity: true,
    })
    assert.equal(derived.status, 'online')
  })

  await test('freshly created agent with healthy gateway is online even before activity', () => {
    const derived = deriveAgentRuntimeStatus({
      gatewayRunning: true,
      latestMtime: 0,
      hasIdentity: true,
    })
    assert.equal(derived.status, 'online')
  })

  await test('recent activity without gateway stays offline', () => {
    const now = Date.now()
    const derived = deriveAgentRuntimeStatus({
      gatewayRunning: false,
      latestMtime: now - (5 * 60 * 1000),
      now,
      hasIdentity: true,
    })
    assert.equal(derived.status, 'offline')
  })

  await test('agents sharing a gateway use one probe until its result expires', () => {
    let calls = 0
    let running = false
    const probe = createAgentGatewayProbeCache(() => {
      calls++
      return running
    }, 5000)
    const local = ['127.0.0.1']

    assert.equal(probe(18789, local, 1000), false)
    assert.equal(probe(18789, local, 1001), false)
    assert.equal(calls, 1)

    running = true
    assert.equal(probe(18889, local, 1001), true)
    assert.equal(probe(18789, ['localhost'], 1001), true)
    assert.equal(calls, 3, 'different endpoints must not share a result')

    assert.equal(probe(18789, local, 6000), true)
    assert.equal(calls, 4, 'expired failure must be checked again')
    running = false
    assert.equal(probe(18789, local, 6001), true)
    assert.equal(probe(18789, local, 11000), false)
    assert.equal(calls, 5, 'expired success must be checked again')
  })

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) process.exit(1)
}

main().catch((err: any) => {
  console.log(`${RED}Test suite crashed${RESET}`)
  console.log(`  Error: ${err?.message || String(err)}`)
  process.exit(1)
})
