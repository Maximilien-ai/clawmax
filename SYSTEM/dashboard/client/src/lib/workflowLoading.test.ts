/**
 * Workflow loading helper tests
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/workflowLoading.test.ts
 */

import { getWorkflowWorkspaceLoadKey, shouldFetchWorkflowsForWorkspace } from './workflowLoading'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('normalizes missing workspace id to default load key', () => {
  assert(getWorkflowWorkspaceLoadKey(undefined) === 'default', 'Expected undefined workspace to use default key')
  assert(getWorkflowWorkspaceLoadKey('') === 'default', 'Expected empty workspace to use default key')
  assert(getWorkflowWorkspaceLoadKey(' test-1.8 ') === 'test-1.8', 'Expected workspace id to be trimmed')
})

test('fetches workflows once when active workspace has not loaded yet', () => {
  assert(shouldFetchWorkflowsForWorkspace({
    isActive: true,
    workspaceKey: 'empty-workspace',
    lastLoadedWorkspaceKey: null,
    rateLimitedUntilMs: 0,
    nowMs: 100,
  }), 'Expected first active workspace load to fetch workflows')
})

test('does not refetch only because loaded workspace still has zero workflows', () => {
  assert(!shouldFetchWorkflowsForWorkspace({
    isActive: true,
    workspaceKey: 'empty-workspace',
    lastLoadedWorkspaceKey: 'empty-workspace',
    rateLimitedUntilMs: 0,
    nowMs: 100,
  }), 'Expected already-loaded empty workspace not to refetch from render-only state changes')
})

test('defers workflow fetch while inactive or rate limited', () => {
  assert(!shouldFetchWorkflowsForWorkspace({
    isActive: false,
    workspaceKey: 'workspace-a',
    lastLoadedWorkspaceKey: null,
    rateLimitedUntilMs: 0,
    nowMs: 100,
  }), 'Expected inactive workflow page not to fetch')
  assert(!shouldFetchWorkflowsForWorkspace({
    isActive: true,
    workspaceKey: 'workspace-a',
    lastLoadedWorkspaceKey: null,
    rateLimitedUntilMs: 200,
    nowMs: 100,
  }), 'Expected rate-limited workflow page not to fetch')
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`workflowLoading.test.ts: ${passed} tests passed`)
