import fs from 'fs'
import os from 'os'
import path from 'path'
import { getHostAgentStatus } from './host-agent-status'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

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

console.log(`\n${YELLOW}=== Host Agent Status Test Suite ===${RESET}\n`)

const originalPath = process.env.OPENCLAW_HOST_AGENT_STATE_PATH
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-host-agent-status-'))
const statePath = path.join(tmpDir, 'host-agent-state.json')
process.env.OPENCLAW_HOST_AGENT_STATE_PATH = statePath

async function run() {
  await test('host agent status surfaces unauthorized reconnect guidance', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      hostAgent: {
        connected: false,
        last_error: 'status writeback unauthorized; reconnect this Mac from Web to refresh local agent credentials',
      },
    }, null, 2))

    const status = getHostAgentStatus()
    assert(status?.state === 'unauthorized', 'Expected unauthorized state')
    assert(Boolean(status?.hint.includes('Reconnect this Mac')), 'Expected reconnect hint')
  })

  await test('host agent status surfaces unreachable when connected=false without auth message', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      hostAgent: {
        connected: false,
        last_error: 'connection timed out while polling local agent status',
      },
    }, null, 2))

    const status = getHostAgentStatus()
    assert(Boolean(status?.state === 'unreachable'), 'Expected unreachable state')
  })

  await test('host agent status returns null when no relevant connectivity error exists', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      hostAgent: {
        connected: true,
        status: 'connected',
      },
    }, null, 2))

    const status = getHostAgentStatus()
    assert(status === null, 'Expected null when no host-agent warning exists')
  })

  if (originalPath === undefined) delete process.env.OPENCLAW_HOST_AGENT_STATE_PATH
  else process.env.OPENCLAW_HOST_AGENT_STATE_PATH = originalPath

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
}

run().catch((err) => {
  if (originalPath === undefined) delete process.env.OPENCLAW_HOST_AGENT_STATE_PATH
  else process.env.OPENCLAW_HOST_AGENT_STATE_PATH = originalPath
  console.error(err)
  process.exit(1)
})
