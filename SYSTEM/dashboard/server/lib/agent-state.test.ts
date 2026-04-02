/**
 * Agent state test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-state.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { getAgentCostLimit, setAgentCostLimit } from './agent-state'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

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
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function writeWorkspaceRegistry(tmpHome: string, activeWorkspaceId: string, workspaces: Array<{ id: string; name: string; path: string }>) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId,
    workspaces: workspaces.map((workspace) => ({
      ...workspace,
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessedAt: '2026-04-02T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    })),
  }, null, 2))
}

console.log(`\n${YELLOW}=== Agent State Test Suite ===${RESET}\n`)

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-state-test-'))
const workspaceA = path.join(tmpHome, 'workspace-a')
const workspaceB = path.join(tmpHome, 'workspace-b')
fs.mkdirSync(path.join(workspaceA, 'SYSTEM'), { recursive: true })
fs.mkdirSync(path.join(workspaceB, 'SYSTEM'), { recursive: true })
const workspaces = [
  { id: 'workspace-a', name: 'Workspace A', path: workspaceA },
  { id: 'workspace-b', name: 'Workspace B', path: workspaceB },
]
writeWorkspaceRegistry(tmpHome, 'workspace-a', workspaces)

process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspaceA
resetWorkspaceManagerForTests()

async function run() {
  await test('per-agent cost limits are isolated by active workspace', () => {
    setAgentCostLimit('agent-a', 5)
    assert(getAgentCostLimit('agent-a') === 5, 'Expected workspace-a limit to persist')

    process.env.OPENCLAW_WORKSPACE = workspaceB
    writeWorkspaceRegistry(tmpHome, 'workspace-b', workspaces)
    resetWorkspaceManagerForTests()
    assert(getAgentCostLimit('agent-a') === null, 'Expected workspace-b to start without workspace-a limit')

    setAgentCostLimit('agent-a', 9)
    assert(getAgentCostLimit('agent-a') === 9, 'Expected workspace-b limit to persist independently')

    process.env.OPENCLAW_WORKSPACE = workspaceA
    writeWorkspaceRegistry(tmpHome, 'workspace-a', workspaces)
    resetWorkspaceManagerForTests()
    assert(getAgentCostLimit('agent-a') === 5, 'Expected workspace-a limit to remain unchanged')
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  resetWorkspaceManagerForTests()

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
  console.error(err)
  process.exit(1)
})
