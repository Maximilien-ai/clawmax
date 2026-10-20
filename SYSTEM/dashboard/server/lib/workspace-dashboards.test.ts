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
  normalizeWorkspaceDashboardSlug,
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
  assert(dashboard.displayMode === 'standard', 'Expected default display mode')
  assert(dashboard.companyFocusKind === 'workspace', 'Expected default workspace company focus')
  assert(dashboard.companyFocusValue === null, 'Expected default focus value to be null')
  assert(dashboard.sections.overview === true, 'Expected default overview section')
  assert(dashboard.sections.groupChats === true, 'Expected default group chats section')
  assert(dashboard.createdBy === 'tester', 'Expected createdBy to persist')
  assert(dashboard.slug === 'marketing-summary', 'Expected a readable slug derived from title')
  assert(dashboard.refreshEnabled === false, 'Expected refresh to be opt-in')
  assert(dashboard.refreshIntervalSeconds === 30, 'Expected the default refresh interval')
  assert(dashboard.sections.interactions === false, 'Expected interactions to be opt-in')
  assert(listWorkspaceDashboards('workspace-a').length === 1, 'Expected one dashboard to be listed')
})

test('dashboard slugs are unique but do not authorize public access', () => {
  const first = createWorkspaceDashboard('workspace-a', { title: 'Shared Board', slug: 'team-board' })
  const second = createWorkspaceDashboard('workspace-b', { title: 'Another Board', slug: 'team-board' })
  assert(first.slug === 'team-board', 'Expected requested slug to be preserved')
  assert(second.slug === 'team-board-2', 'Expected a collision-safe suffix')
  assert(getWorkspaceDashboardByToken(second.slug) === null, 'Expected readable slug not to grant dashboard access')
  assert(getWorkspaceDashboardByToken(second.token)?.id === second.id, 'Expected random token lookup to find dashboard')
})

test('createWorkspaceDashboard merges provided section overrides', () => {
  const dashboard = createWorkspaceDashboard('workspace-a', {
    title: 'Limited Summary',
    displayMode: 'compact',
    companyFocusKind: 'team',
    companyFocusValue: 'b2b-root',
    companyFocusLabel: 'B2B Company',
    sections: { costs: false, kickoff: false },
  })
  assert(dashboard.displayMode === 'compact', 'Expected compact display mode')
  assert(dashboard.companyFocusKind === 'team', 'Expected team focus kind')
  assert(dashboard.companyFocusValue === 'b2b-root', 'Expected company focus value')
  assert(dashboard.companyFocusLabel === 'B2B Company', 'Expected company focus label')
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
    displayMode: 'detail',
    companyFocusKind: 'prefix',
    companyFocusValue: 'b2b',
    companyFocusLabel: 'B2B',
    sections: { notifications: false },
    slug: 'updated-board',
    refreshEnabled: true,
    refreshIntervalSeconds: 90,
  })
  assert(updated?.title === 'Updated', 'Expected title update')
  assert(updated?.description === 'Sharable summary', 'Expected description update')
  assert(updated?.displayMode === 'detail', 'Expected display mode update')
  assert(updated?.companyFocusKind === 'prefix', 'Expected company focus kind update')
  assert(updated?.companyFocusValue === 'b2b', 'Expected company focus value update')
  assert(updated?.companyFocusLabel === 'B2B', 'Expected company focus label update')
  assert(updated?.sections.notifications === false, 'Expected sections update')
  assert(updated?.slug === 'updated-board', 'Expected slug update')
  assert(updated?.refreshEnabled === true && updated.refreshIntervalSeconds === 90, 'Expected refresh settings update')
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

test('legacy dashboard records normalize missing fields without changing stored data', () => {
  const filePath = path.join(workspaceB, 'SYSTEM', 'workspace-dashboards.json')
  const legacy = { id: 'legacy', workspaceId: 'workspace-b', title: 'Old Board', token: 'legacy-token', updatedAt: '2025-01-01T00:00:00Z', sections: { costs: false } }
  fs.writeFileSync(filePath, JSON.stringify({ dashboards: [legacy] }))
  const loaded = listWorkspaceDashboards('workspace-b').find((entry) => entry.id === 'legacy')
  assert(loaded?.slug === 'old-board', 'Expected title-derived legacy slug')
  assert(loaded?.refreshEnabled === false && loaded.refreshIntervalSeconds === 30, 'Expected safe refresh defaults')
  assert(loaded?.sections.costs === false && loaded.sections.agents === true, 'Expected merged section defaults')
  assert(JSON.parse(fs.readFileSync(filePath, 'utf-8')).dashboards[0].slug === undefined, 'Read must not rewrite legacy file')
  fs.writeFileSync(filePath, '{broken')
  assert(listWorkspaceDashboards('workspace-b').length === 0, 'Corrupt store must read as empty')
  fs.writeFileSync(filePath, JSON.stringify({ dashboards: null }))
  assert(listWorkspaceDashboards('workspace-b').length === 0, 'Malformed collection must read as empty')
})

test('slug normalization and collision handling preserve separate workspace identities', () => {
  assert(normalizeWorkspaceDashboardSlug('  Sales & Ops / 2026!  ') === 'sales-ops-2026', 'Expected safe URL slug')
  const blank = createWorkspaceDashboard('workspace-a', { title: '?!', slug: '  ' })
  assert(blank.slug === 'dashboard-workspace-a', 'Expected a safe fallback for blank slugs')
  const first = createWorkspaceDashboard('workspace-a', { title: 'Sales One', slug: 'sales' })
  const second = createWorkspaceDashboard('workspace-a', { title: 'Sales Two', slug: 'sales' })
  const updated = updateWorkspaceDashboard('workspace-a', first.id, { slug: 'sales' })
  assert(updated?.slug === 'sales', 'Self-collision must be excluded on update')
  assert(second.slug === 'sales-2', 'Other dashboard collision must get suffix')
})

test('optional updates can clear description and focus without resetting untouched fields', () => {
  const dashboard = createWorkspaceDashboard('workspace-a', {
    title: 'Options', description: 'Shared', companyFocusKind: 'prefix', companyFocusValue: ' alpha ',
    companyFocusLabel: ' Alpha ', refreshIntervalSeconds: 2, sectionOrder: ['agents', 'costs'], compactColumns: { agents: 'left' },
  })
  assert(dashboard.refreshIntervalSeconds === 10, 'Create must clamp low refresh intervals')
  assert(dashboard.companyFocusValue === 'alpha', 'Create must trim focus')
  assert(dashboard.sectionOrder.join(',') === 'agents,costs' && dashboard.compactColumns.agents === 'left', 'Create must preserve layout')
  const updated = updateWorkspaceDashboard('workspace-a', dashboard.id, {
    title: ' ', slug: ' ', description: null, companyFocusValue: null, companyFocusLabel: '',
    refreshIntervalSeconds: 5000, sectionOrder: [], compactColumns: { agents: 'right' },
  })
  assert(updated?.title === 'Options' && updated.slug === dashboard.slug, 'Blank title and slug must be ignored')
  assert(updated?.description === null && updated.companyFocusValue === null && updated.companyFocusLabel === null, 'Optional text must clear')
  assert(updated?.refreshIntervalSeconds === 3600, 'Update must clamp high refresh intervals')
  assert(updated?.sectionOrder.join(',') === 'agents,costs' && updated.compactColumns.agents === 'right', 'Empty order must be ignored while columns update')
  assert(updateWorkspaceDashboard('workspace-a', dashboard.id, { refreshIntervalSeconds: Number.NaN })?.refreshIntervalSeconds === 3600, 'Nonfinite interval must be ignored')
})

test('unknown IDs cannot rotate or delete an unrelated dashboard', () => {
  const before = listWorkspaceDashboards('workspace-a').length
  assert(regenerateWorkspaceDashboardToken('workspace-a', 'missing') === null, 'Unknown rotation must fail closed')
  assert(updateWorkspaceDashboard('workspace-a', 'missing', { title: 'Changed' }) === null, 'Unknown update must fail closed')
  assert(deleteWorkspaceDashboard('workspace-a', 'missing') === false, 'Unknown deletion must fail closed')
  assert(listWorkspaceDashboards('workspace-a').length === before, 'Unknown operations must preserve all dashboards')
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
