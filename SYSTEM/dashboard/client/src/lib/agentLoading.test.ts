/**
 * Agent loading helper tests
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/agentLoading.test.ts
 */

import { getAgentWorkspaceLoadKey, shouldFetchAgentsForWorkspace } from './agentLoading'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('normalizes missing workspace id to default load key', () => {
  assert(getAgentWorkspaceLoadKey(undefined) === 'default', 'Expected undefined workspace to use default key')
  assert(getAgentWorkspaceLoadKey('') === 'default', 'Expected empty workspace to use default key')
  assert(getAgentWorkspaceLoadKey(' test-1.8 ') === 'test-1.8', 'Expected workspace id to be trimmed')
})

test('fetches agents when the active workspace has not loaded yet', () => {
  assert(shouldFetchAgentsForWorkspace({
    isActive: true,
    workspaceKey: 'workspace-a',
    lastLoadedWorkspaceKey: null,
    lastFetchStartedAtMs: 0,
    nowMs: 100,
  }), 'Expected first workspace load to fetch agents')
})

test('skips duplicate agent refreshes immediately after the same workspace loaded', () => {
  assert(!shouldFetchAgentsForWorkspace({
    isActive: true,
    workspaceKey: 'workspace-a',
    lastLoadedWorkspaceKey: 'workspace-a',
    lastFetchStartedAtMs: 100,
    nowMs: 1200,
    cooldownMs: 5000,
  }), 'Expected duplicate same-workspace fetch to be skipped during cooldown')
})

test('allows agent refresh after cooldown expires for the same workspace', () => {
  assert(shouldFetchAgentsForWorkspace({
    isActive: true,
    workspaceKey: 'workspace-a',
    lastLoadedWorkspaceKey: 'workspace-a',
    lastFetchStartedAtMs: 100,
    nowMs: 6100,
    cooldownMs: 5000,
  }), 'Expected same workspace to refresh after cooldown')
})

test('does not fetch agents while inactive', () => {
  assert(!shouldFetchAgentsForWorkspace({
    isActive: false,
    workspaceKey: 'workspace-a',
    lastLoadedWorkspaceKey: null,
    lastFetchStartedAtMs: 0,
    nowMs: 100,
  }), 'Expected inactive agent page not to fetch')
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`agentLoading.test.ts: ${passed} tests passed`)
