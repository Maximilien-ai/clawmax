/**
 * Workspace dashboards test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workspace-dashboards.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  createWorkspaceDashboard,
  deleteWorkspaceDashboard,
  getWorkspaceDashboardByToken,
  listWorkspaceDashboards,
  regenerateWorkspaceDashboardToken,
  updateWorkspaceDashboard,
} from './workspace-dashboards'
import { resetWorkspaceManagerForTests } from './workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

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

function writeWorkspaceRegistry(tmpHome: string, workspaces: Array<{ id: string; name: string; path: string }>) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: workspaces[0].id,
    workspaces: workspaces.map((workspace) => ({
      ...workspace,
      createdAt: '2026-03-31T00:00:00.000Z',
      lastAccessedAt: '2026-03-31T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    })),
  }, null, 2))
}

console.log(`\n${YELLOW}=== Workspace Dashboards Test Suite ===${RESET}\n`)

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-dashboards-test-'))
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
resetWorkspaceManagerForTests()

test('createWorkspaceDashboard persists a dashboard with default sections', () => {
  const dashboard = createWorkspaceDashboard('workspace-a', {
    title: 'Marketing Summary',
    createdBy: 'tester',
  })
  assert(dashboard.title === 'Marketing Summary', 'Expected title to persist')
  assert(dashboard.sections.overview === true, 'Expected default overview section')
  assert(dashboard.createdBy === 'tester', 'Expected createdBy to persist')
  assert(listWorkspaceDashboards('workspace-a').length === 1, 'Expected one dashboard to be listed')
})

test('createWorkspaceDashboard merges provided section overrides', () => {
  const dashboard = createWorkspaceDashboard('workspace-a', {
    title: 'Limited Summary',
    sections: { costs: false, kickoff: false },
  })
  assert(dashboard.sections.costs === false, 'Expected costs section to be disabled')
  assert(dashboard.sections.kickoff === false, 'Expected kickoff section to be disabled')
  assert(dashboard.sections.results === true, 'Expected unspecified sections to stay enabled')
})

test('getWorkspaceDashboardByToken finds dashboards across workspaces', () => {
  const dashboard = createWorkspaceDashboard('workspace-b', { title: 'Ops Summary' })
  const found = getWorkspaceDashboardByToken(dashboard.token)
  assert(found?.id === dashboard.id, 'Expected token lookup to find the dashboard')
})

test('updateWorkspaceDashboard updates metadata and sections', () => {
  const dashboard = createWorkspaceDashboard('workspace-a', { title: 'Original' })
  const updated = updateWorkspaceDashboard('workspace-a', dashboard.id, {
    title: 'Updated',
    description: 'Sharable summary',
    sections: { notifications: false },
  })
  assert(updated?.title === 'Updated', 'Expected title update')
  assert(updated?.description === 'Sharable summary', 'Expected description update')
  assert(updated?.sections.notifications === false, 'Expected sections update')
})

test('regenerateWorkspaceDashboardToken replaces the existing token', () => {
  const dashboard = createWorkspaceDashboard('workspace-a', { title: 'Rotate' })
  const updated = regenerateWorkspaceDashboardToken('workspace-a', dashboard.id)
  assert(updated !== null, 'Expected dashboard to exist')
  assert(updated!.token !== dashboard.token, 'Expected token to rotate')
})

test('deleteWorkspaceDashboard removes the dashboard', () => {
  const dashboard = createWorkspaceDashboard('workspace-a', { title: 'Delete Me' })
  const deleted = deleteWorkspaceDashboard('workspace-a', dashboard.id)
  assert(deleted === true, 'Expected delete to succeed')
  assert(listWorkspaceDashboards('workspace-a').find(entry => entry.id === dashboard.id) === undefined, 'Expected dashboard to be removed')
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
