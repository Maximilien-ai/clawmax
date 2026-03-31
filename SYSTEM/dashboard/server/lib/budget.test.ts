/**
 * Budget test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/budget.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  loadBudgetConfig,
  saveBudgetConfig,
  getBudgetStatus,
  checkBudgetBlock,
  validateAgentCostLimit,
} from './budget'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalOpikApiKey = process.env.OPIK_API_KEY

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function writeWorkspaceRegistry(tmpHome: string, workspaces: Array<{ id: string; name: string; path: string }>) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: workspaces[0].id,
    workspaces: workspaces.map((workspace) => ({
      ...workspace,
      createdAt: '2026-03-30T00:00:00.000Z',
      lastAccessedAt: '2026-03-30T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    })),
  }, null, 2))
}

console.log(`\n${YELLOW}=== Budget Test Suite ===${RESET}\n`)

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-budget-test-'))
const workspaceA = path.join(tmpHome, 'workspace-a')
const workspaceB = path.join(tmpHome, 'workspace-b')
fs.mkdirSync(path.join(workspaceA, 'SYSTEM'), { recursive: true })
fs.mkdirSync(path.join(workspaceB, 'SYSTEM'), { recursive: true })
writeWorkspaceRegistry(tmpHome, [
  { id: 'workspace-a', name: 'Workspace A', path: workspaceA },
  { id: 'workspace-b', name: 'Workspace B', path: workspaceB },
])

process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspaceA
delete process.env.OPIK_API_KEY
resetWorkspaceManagerForTests()

async function run() {
  await test('saveBudgetConfig isolates config by workspace ID', () => {
    saveBudgetConfig({ limitUsd: 11, warningPct: 80, enforced: true, paused: false }, 'workspace-a')
    saveBudgetConfig({ limitUsd: 22, warningPct: 90, enforced: false, paused: true }, 'workspace-b')

    const budgetA = loadBudgetConfig('workspace-a')
    const budgetB = loadBudgetConfig('workspace-b')

    assert(budgetA.limitUsd === 11, 'Expected workspace-a limit to persist independently')
    assert(budgetB.limitUsd === 22, 'Expected workspace-b limit to persist independently')
    assert(budgetA.enforced === true, 'Expected workspace-a enforced=true')
    assert(budgetB.enforced === false, 'Expected workspace-b enforced=false')
  })

  await test('getBudgetStatus reads the requested workspace config', async () => {
    saveBudgetConfig({ limitUsd: 33, warningPct: 75, enforced: true, paused: false }, 'workspace-b')

    const status = await getBudgetStatus('workspace-b')

    assert(status.config.limitUsd === 33, 'Expected status to use workspace-b budget')
    assert(status.config.warningPct === 75, 'Expected status to use workspace-b warning threshold')
    assert(status.currentSpendUsd === 0, 'Expected zero spend when Opik is disabled in test')
  })

  await test('checkBudgetBlock returns workflow-specific message', () => {
    saveBudgetConfig({ limitUsd: 44, warningPct: 80, enforced: true, paused: true }, 'workspace-a')
    const message = checkBudgetBlock({ workspaceId: 'workspace-a', operation: 'workflow' })
    assert(message === 'Workflow blocked: workspace budget exceeded ($44.00 limit). Increase budget or disable enforcement to continue.', 'Expected workflow-specific budget message')
  })

  await test('checkBudgetBlock returns agent-specific message', () => {
    saveBudgetConfig({ limitUsd: 55, warningPct: 80, enforced: true, paused: true }, 'workspace-b')
    const message = checkBudgetBlock({ workspaceId: 'workspace-b', operation: 'agent' })
    assert(message === 'Agent interaction blocked: workspace budget exceeded ($55.00 limit). Increase budget or disable enforcement to continue.', 'Expected agent-specific budget message')
  })

  await test('validateAgentCostLimit rejects limits above the workspace budget', () => {
    saveBudgetConfig({ limitUsd: 12, warningPct: 80, enforced: true, paused: false }, 'workspace-a')
    const message = validateAgentCostLimit(15, 'workspace-a')
    assert(message === 'Agent limit cannot exceed workspace budget ($12.00).', 'Expected agent limit validation error')
  })

  await test('validateAgentCostLimit allows null and in-range values', () => {
    saveBudgetConfig({ limitUsd: 20, warningPct: 80, enforced: true, paused: false }, 'workspace-b')
    assert(validateAgentCostLimit(null, 'workspace-b') === null, 'Expected null limit to be allowed')
    assert(validateAgentCostLimit(10, 'workspace-b') === null, 'Expected in-range agent limit to be allowed')
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome

  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace

  if (typeof originalOpikApiKey === 'undefined') delete process.env.OPIK_API_KEY
  else process.env.OPIK_API_KEY = originalOpikApiKey

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
