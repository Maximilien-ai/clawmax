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
const statePath = path.join(tmpDir, 'state.json')
process.env.OPENCLAW_HOST_AGENT_STATE_PATH = statePath

async function run() {
  await test('host agent status surfaces unauthorized reconnect guidance', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      desired_state: 'running',
      last_error: 'status writeback unauthorized; reconnect this Mac from Web to refresh local agent credentials',
      last_status_summary: 'worker unauthorized',
      last_seen_at: new Date().toISOString(),
    }, null, 2))

    const status = getHostAgentStatus('127.0.0.1:3201')
    assert(status?.state === 'unauthorized', 'Expected unauthorized state')
    assert(Boolean(status?.hint.includes('Reconnect this Mac')), 'Expected reconnect hint')
  })

  await test('host agent status surfaces unreachable when desired_state is running and last_seen_at is stale', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      desired_state: 'running',
      last_error: 'connection timed out while polling local agent status',
      last_status_summary: 'last contact lost',
      last_seen_at: '2026-01-01T00:00:00.000Z',
    }, null, 2))

    const status = getHostAgentStatus('127.0.0.1:3201')
    assert(Boolean(status?.state === 'unreachable'), 'Expected unreachable state')
  })

  await test('host agent status surfaces degraded when reconcile result is failed', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      desired_state: 'running',
      last_reconcile_result: 'failed',
      last_error: 'local reconcile failed while applying actions',
      last_seen_at: new Date().toISOString(),
    }, null, 2))

    const status = getHostAgentStatus('127.0.0.1:3201')
    assert(status?.state === 'warning', 'Expected degraded warning state')
  })

  await test('host agent status returns null when reconcile is healthy and no reconnect problem exists', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      desired_state: 'running',
      last_reconcile_result: 'healthy',
      last_status_summary: 'running normally',
      last_seen_at: new Date().toISOString(),
    }, null, 2))

    const status = getHostAgentStatus('127.0.0.1:3201')
    assert(status === null, 'Expected null when no host-agent warning exists')
  })

  await test('host agent status stays hidden when the current dashboard host does not match the stored dashboard url', () => {
    fs.writeFileSync(statePath, JSON.stringify({
      desired_state: 'running',
      last_error: 'action polling unauthorized; reconnect this Mac from Web to refresh local agent credentials',
      last_status_summary: 'worker unauthorized',
      last_seen_at: new Date().toISOString(),
      last_dashboard_url: 'http://127.0.0.1:3201',
    }, null, 2))

    const status = getHostAgentStatus('localhost:3001')
    assert(status === null, 'Expected reconnect banner suppressed for a different dashboard host')
  })

  await test('missing and malformed state never invent host warnings', () => {
    process.env.OPENCLAW_HOST_AGENT_STATE_PATH = path.join(tmpDir, 'missing.json')
    assert(getHostAgentStatus() === null, 'Missing state must be silent')
    process.env.OPENCLAW_HOST_AGENT_STATE_PATH = statePath
    for (const value of ['invalid JSON', 'null', '[]', '"text"', '{}']) {
      fs.writeFileSync(statePath, value)
      assert(getHostAgentStatus() === null, `Unexpected warning for ${value}`)
    }
  })

  await test('missing and invalid heartbeats explain unreachable hosts without exposing credentials', () => {
    for (const lastSeen of [undefined, 'invalid date']) {
      fs.writeFileSync(statePath, JSON.stringify({ desired_state: 'RUNNING', last_seen_at: lastSeen, worker_key: 'private-worker', refresh_token: 'private-refresh' }))
      const status = getHostAgentStatus()
      assert(status?.state === 'unreachable', 'Running host without valid heartbeat must be unreachable')
      assert(!!status?.detail.includes('stopped checking in'), 'Expected useful default detail')
      assert(status?.summary === undefined, 'Missing summary must remain absent')
      assert(!JSON.stringify(status).includes('private-'), 'Credentials must never appear in status')
    }
    fs.writeFileSync(statePath, JSON.stringify({ desired_state: 'stopped', last_seen_at: 'invalid date' }))
    assert(getHostAgentStatus() === null, 'Stopped host must not be reported unreachable')
  })

  await test('host aliases and legacy host-only URLs retain correctly scoped warnings', () => {
    for (const [stored, current] of [['http://localhost:3201', '127.0.0.1:3201'], ['localhost', '127.0.0.1'], ['localhost:3201', 'localhost:3201']]) {
      fs.writeFileSync(statePath, JSON.stringify({ last_dashboard_url: stored, last_error: 'action polling unauthorized' }))
      const status = getHostAgentStatus(current)
      assert(status?.state === 'unauthorized', `Expected equivalent hosts ${stored} and ${current}`)
      assert(status?.summary === undefined && status?.lastSeenAt === undefined, 'Absent metadata must remain absent')
    }
    fs.writeFileSync(statePath, JSON.stringify({ last_reconcile_result: 'FAILED' }))
    const status = getHostAgentStatus('  ')
    assert(status?.state === 'warning', 'Failed reconcile without host must be visible')
    assert(status?.detail === 'The local host agent reported a failed reconcile.', 'Expected default reconcile detail')
    assert(status?.summary === undefined && status?.lastSeenAt === undefined, 'Missing optional metadata must remain absent')
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
