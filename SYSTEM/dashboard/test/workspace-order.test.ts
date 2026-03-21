/**
 * Workspace order unit tests
 *
 * Run with: npx ts-node --transpileOnly dashboard/test/workspace-order.test.ts
 */

import {
  applyWorkspaceOrder,
  reorderWorkspaceList,
  serializeWorkspaceOrder,
} from '../client/src/lib/workspace-order'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

type WorkspaceFixture = {
  id: string
  name: string
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
  }
}

function assertOrder(workspaces: WorkspaceFixture[], expectedIds: string[], message: string) {
  const actualIds = workspaces.map(workspace => workspace.id)
  const actual = actualIds.join(',')
  const expected = expectedIds.join(',')
  assertEqual(actual, expected, message)
}

const fixtures: WorkspaceFixture[] = [
  { id: 'default', name: 'Default' },
  { id: 'client-a', name: 'Client A' },
  { id: 'sandbox', name: 'Sandbox' },
]

console.log(`\n${YELLOW}=== Workspace Order Test Suite ===${RESET}\n`)

test('applyWorkspaceOrder() uses saved order when ids match', () => {
  const ordered = applyWorkspaceOrder(fixtures, ['sandbox', 'default', 'client-a'])
  assertOrder(ordered, ['sandbox', 'default', 'client-a'], 'Should apply saved order')
})

test('applyWorkspaceOrder() appends unknown workspaces after saved ones', () => {
  const ordered = applyWorkspaceOrder(fixtures, ['client-a'])
  assertOrder(ordered, ['client-a', 'default', 'sandbox'], 'Unknown workspaces should stay after saved ids')
})

test('applyWorkspaceOrder() ignores unknown saved ids', () => {
  const ordered = applyWorkspaceOrder(fixtures, ['missing', 'sandbox', 'default'])
  assertOrder(ordered, ['sandbox', 'default', 'client-a'], 'Missing ids should be ignored')
})

test('reorderWorkspaceList() moves an item to a new index', () => {
  const reordered = reorderWorkspaceList(fixtures, 0, 2)
  assertOrder(reordered, ['client-a', 'sandbox', 'default'], 'Item should move to target index')
})

test('reorderWorkspaceList() returns original order for invalid indexes', () => {
  const reordered = reorderWorkspaceList(fixtures, -1, 2)
  assert(reordered === fixtures, 'Invalid reorder should return original array reference')
  assertOrder(reordered, ['default', 'client-a', 'sandbox'], 'Original order should be unchanged')
})

test('serializeWorkspaceOrder() returns ids in current order', () => {
  const reordered = reorderWorkspaceList(fixtures, 2, 0)
  const serialized = serializeWorkspaceOrder(reordered)
  assertEqual(serialized.join(','), 'sandbox,default,client-a', 'Serialized order should match list order')
})

console.log('')
if (testsFailed === 0) {
  console.log(`${GREEN}All tests passed${RESET} (${testsPassed} tests)\n`)
  process.exit(0)
} else {
  console.log(`${RED}${testsFailed} tests failed${RESET}, ${testsPassed} passed\n`)
  process.exit(1)
}
