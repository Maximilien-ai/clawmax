/**
 * Workflow integration defaults test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workflow-integration-defaults.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { createWorkflow, getExecution, triggerWorkflow, deleteWorkflow } from './workflows'
import { writeWorkspaceIntegrationConfig } from './workspace-integrations'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0
const createdWorkflowIds: string[] = []

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

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'workflow-test',
    workspaces: [{
      id: 'workflow-test',
      name: 'Workflow Test',
      path: workspacePath,
      createdAt: '2026-04-02T00:00:00.000Z',
      lastAccessedAt: '2026-04-02T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

console.log(`\n${YELLOW}=== Workflow Integration Defaults Test Suite ===${RESET}\n`)

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-defaults-test-'))
const workspacePath = path.join(tmpHome, 'workspace')
fs.mkdirSync(path.join(workspacePath, 'WORKFLOWS', 'executions'), { recursive: true })
writeWorkspaceRegistry(tmpHome, workspacePath)

process.env.HOME = tmpHome
process.env.OPENCLAW_WORKSPACE = workspacePath
resetWorkspaceManagerForTests()

test('triggerWorkflow stores workspace integration defaults in execution inputs', () => {
  writeWorkspaceIntegrationConfig({
    githubDefaultRepo: 'Maximilien-ai/clawmax',
    sensoContextLabel: 'Launch / Demo',
  })

  const created = createWorkflow({
    name: 'Integration Defaults Test',
    description: 'Test runtime defaults',
    schedule: 'manual',
    content: '# Integration Defaults\nRun this workflow.',
    executionMode: 'managed',
    owner: 'test-owner',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })

  assert(created.success, `Expected workflow create success: ${created.error}`)
  createdWorkflowIds.push(created.id!)

  const triggered = triggerWorkflow(created.id!, { manual: true })
  assert(triggered.success, `Expected trigger success: ${triggered.error}`)

  const execution = getExecution(created.id!, triggered.executionId!)
  assert(execution !== null, 'Expected execution record')
  assert(execution?.inputs?.['GitHub repo'] === 'Maximilien-ai/clawmax', 'Expected GitHub repo input')
  assert(execution?.inputs?.['Senso context'] === 'Launch / Demo', 'Expected Senso context input')
})

for (const workflowId of createdWorkflowIds) {
  deleteWorkflow(workflowId)
}

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
