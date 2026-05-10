import assert from 'assert'
import { deriveAgentRuntimeStatus } from './workspace'

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
