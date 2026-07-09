/**
 * agentRuntimeReload test suite
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/agentRuntimeReload.test.ts
 */

import { resolveReloadedAgentRuntime } from './agentRuntimeReload'

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

console.log(`\n${YELLOW}=== agentRuntimeReload Test Suite ===${RESET}\n`)

test('first load for a workspace adopts the loaded value', () => {
  const result = resolveReloadedAgentRuntime({
    currentValue: '',
    loadedValue: 'claude',
    loadedWorkspaceId: 'ws-a',
    lastSyncedWorkspaceId: null,
  })
  assert(result === 'claude', `expected 'claude', got '${result}'`)
})

test('first load with no configured runtime resolves to empty string', () => {
  const result = resolveReloadedAgentRuntime({
    currentValue: '',
    loadedValue: '',
    loadedWorkspaceId: 'ws-a',
    lastSyncedWorkspaceId: null,
  })
  assert(result === '', `expected '', got '${result}'`)
})

test('same-workspace reload preserves an unsaved in-progress selection', () => {
  const result = resolveReloadedAgentRuntime({
    currentValue: 'claude',
    loadedValue: 'openclaw',
    loadedWorkspaceId: 'ws-a',
    lastSyncedWorkspaceId: 'ws-a',
  })
  assert(result === 'claude', `expected the unsaved 'claude' selection to survive a same-workspace reload, got '${result}'`)
})

test('same-workspace reload adopts the fresh value when nothing is unsaved', () => {
  const result = resolveReloadedAgentRuntime({
    currentValue: '',
    loadedValue: 'droid',
    loadedWorkspaceId: 'ws-a',
    lastSyncedWorkspaceId: 'ws-a',
  })
  assert(result === 'droid', `expected 'droid', got '${result}'`)
})

test('regression: switching workspaces replaces a stale runtime selection instead of leaking it', () => {
  // Workspace A had 'claude' selected/synced; workspace B's own config says 'droid'.
  // Previously `current || loadedValue` would wrongly keep 'claude' here.
  const result = resolveReloadedAgentRuntime({
    currentValue: 'claude',
    loadedValue: 'droid',
    loadedWorkspaceId: 'ws-b',
    lastSyncedWorkspaceId: 'ws-a',
  })
  assert(result === 'droid', `expected the new workspace's own runtime 'droid' to replace the stale 'claude', got '${result}'`)
})

test('regression: switching to a workspace with no configured runtime clears a stale selection', () => {
  // This is the exact leak from the P1 finding: workspace A has 'claude' selected,
  // workspace B has never configured a runtime (loadedValue === ''). The stale
  // truthy 'claude' must not survive the switch and get written into B on save.
  const result = resolveReloadedAgentRuntime({
    currentValue: 'claude',
    loadedValue: '',
    loadedWorkspaceId: 'ws-b',
    lastSyncedWorkspaceId: 'ws-a',
  })
  assert(result === '', `expected the switch to workspace B to clear the stale 'claude' selection, got '${result}'`)
})

test('switching back to a previously visited workspace re-adopts its own loaded value, not leftover state', () => {
  // A -> B -> A: once synced to B, state left over from B must not leak back into A either.
  const result = resolveReloadedAgentRuntime({
    currentValue: 'droid',
    loadedValue: 'claude',
    loadedWorkspaceId: 'ws-a',
    lastSyncedWorkspaceId: 'ws-b',
  })
  assert(result === 'claude', `expected workspace A's own 'claude' to replace leftover 'droid' from B, got '${result}'`)
})

test('no active workspace on both sides is treated as a same-workspace reload', () => {
  const result = resolveReloadedAgentRuntime({
    currentValue: 'claude',
    loadedValue: 'openclaw',
    loadedWorkspaceId: null,
    lastSyncedWorkspaceId: null,
  })
  assert(result === 'claude', `expected the unsaved selection to survive when there is no workspace id on either side, got '${result}'`)
})

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
