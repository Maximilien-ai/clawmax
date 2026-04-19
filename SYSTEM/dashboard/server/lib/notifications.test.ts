/**
 * Notifications API Test Suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/notifications.test.ts
 */

import fs from 'fs'
import path from 'path'
import {
  loadNotifications,
  createNotification,
  dismissNotification,
  dismissAllNotifications,
  resolveByFingerprint,
  resolveNotificationAction,
  getWorkflowBlockers,
  getActiveNotifications,
  getGroupedActiveNotifications,
} from './notifications'
import { getWorkspacePath } from './workspace'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

// Backup and restore notifications
const notifPath = path.join(getWorkspacePath(), 'SYSTEM', 'notifications.json')
let backup: string | null = null
try { backup = fs.readFileSync(notifPath, 'utf-8') } catch {}

function cleanup() {
  if (backup) fs.writeFileSync(notifPath, backup, 'utf-8')
  else try { fs.unlinkSync(notifPath) } catch {}
}

// Clear for tests
try { fs.writeFileSync(notifPath, '[]', 'utf-8') } catch {}

console.log(`\n${YELLOW}=== Notifications Test Suite ===${RESET}\n`)

// ============================================================================
// Create
// ============================================================================

test('createNotification creates a notification', () => {
  const n = createNotification({
    type: 'agent-error',
    title: 'Test Error',
    message: 'Something went wrong',
    entityId: 'test-agent',
    entityType: 'agent',
    fingerprint: 'test-create-1',
  })
  assert(n !== null, 'Should return notification')
  assert(n!.id.length > 0, 'Should have an ID')
  assert(n!.severity === 'critical', 'agent-error should be critical')
  assert(n!.title === 'Test Error', 'Title should match')
})

test('createNotification deduplicates by fingerprint', () => {
  const n1 = createNotification({
    type: 'agent-offline',
    title: 'Duplicate Test',
    message: 'First',
    fingerprint: 'test-dedup-1',
  })
  const n2 = createNotification({
    type: 'agent-offline',
    title: 'Duplicate Test',
    message: 'Second',
    fingerprint: 'test-dedup-1',
  })
  assert(n1 !== null, 'First should create')
  assert(n2 === null, 'Duplicate should be null')
})

test('createNotification with blocker fields', () => {
  const n = createNotification({
    type: 'workflow-blocked',
    title: 'Need approval',
    message: 'Draft ready',
    fingerprint: 'test-blocker-1',
    blockerType: 'approval',
    workflowId: 'test-wf',
  })
  assert(n !== null, 'Should create')
  assert(n!.blockerType === 'approval', 'Should have blockerType')
  assert(n!.workflowId === 'test-wf', 'Should have workflowId')
})

test('createNotification with choice options', () => {
  const n = createNotification({
    type: 'agent-needs-decision',
    title: 'Choose topic',
    message: 'Pick one',
    fingerprint: 'test-choice-1',
    blockerType: 'choice',
    blockerOptions: ['Option A', 'Option B', 'Option C'],
  })
  assert(n !== null, 'Should create')
  assert(n!.blockerOptions?.length === 3, 'Should have 3 options')
})

test('createNotification with progress updates existing', () => {
  createNotification({
    type: 'workflow-progress',
    title: 'Progress 50%',
    message: 'Halfway',
    fingerprint: 'test-progress-1',
    progress: 50,
  })
  // Same fingerprint, different progress — should update
  createNotification({
    type: 'workflow-progress',
    title: 'Progress 75%',
    message: 'Almost done',
    fingerprint: 'test-progress-1',
    progress: 75,
  })
  const all = loadNotifications()
  const prog = all.find(n => n.fingerprint === 'test-progress-1')
  assert(prog?.progress === 75, `Progress should be 75, got ${prog?.progress}`)
})

test('getGroupedActiveNotifications groups similar agent artifact bursts', () => {
  fs.writeFileSync(notifPath, '[]', 'utf-8')
  createNotification({
    type: 'artifact-update',
    title: 'content-writer1 created MEMORY.md',
    message: 'New workspace artifact from content-writer1: MEMORY.md',
    entityId: 'content-writer1',
    entityType: 'agent',
    fingerprint: 'test-group-artifact-1',
    artifactPath: 'AGENTS/content-writer1/MEMORY.md',
  })
  createNotification({
    type: 'artifact-update',
    title: 'content-writer2 created MEMORY.md',
    message: 'New workspace artifact from content-writer2: MEMORY.md',
    entityId: 'content-writer2',
    entityType: 'agent',
    fingerprint: 'test-group-artifact-2',
    artifactPath: 'AGENTS/content-writer2/MEMORY.md',
  })
  const grouped = getGroupedActiveNotifications()
  assert(grouped.length === 1, `Expected 1 grouped notification, got ${grouped.length}`)
  assert(grouped[0].grouped === true, 'Expected grouped notification')
  assert(grouped[0].groupedCount === 2, `Expected groupedCount 2, got ${grouped[0].groupedCount}`)
  assert(grouped[0].title.includes('2 agents'), `Expected grouped title, got ${grouped[0].title}`)
})

test('getGroupedActiveNotifications keeps unrelated agent notifications separate', () => {
  fs.writeFileSync(notifPath, '[]', 'utf-8')
  createNotification({
    type: 'artifact-update',
    title: 'content-writer1 created MEMORY.md',
    message: 'New workspace artifact from content-writer1: MEMORY.md',
    entityId: 'content-writer1',
    entityType: 'agent',
    fingerprint: 'test-group-separate-1',
    artifactPath: 'AGENTS/content-writer1/MEMORY.md',
  })
  createNotification({
    type: 'artifact-update',
    title: 'content-writer2 created post.md',
    message: 'New workspace artifact from content-writer2: post.md',
    entityId: 'content-writer2',
    entityType: 'agent',
    fingerprint: 'test-group-separate-2',
    artifactPath: 'AGENTS/content-writer2/post.md',
  })
  const grouped = getGroupedActiveNotifications()
  assert(grouped.length === 2, `Expected 2 notifications, got ${grouped.length}`)
})

// ============================================================================
// Dismiss
// ============================================================================

test('dismissNotification dismisses by ID', () => {
  const n = createNotification({
    type: 'cost-warning',
    title: 'Dismiss test',
    message: 'Test',
    fingerprint: 'test-dismiss-1',
  })
  assert(n !== null, 'Should create')
  const ok = dismissNotification(n!.id)
  assert(ok === true, 'Should return true')
  const active = getActiveNotifications()
  assert(!active.find(a => a.id === n!.id), 'Should not be in active list')
})

test('dismissNotification returns false for invalid ID', () => {
  const ok = dismissNotification('nonexistent-id')
  assert(ok === false, 'Should return false')
})

test('dismissed notification stays dismissed (dedup)', () => {
  const n = createNotification({
    type: 'agent-offline',
    title: 'Stay dismissed',
    message: 'Test',
    fingerprint: 'test-stay-dismissed',
  })
  dismissNotification(n!.id)
  const n2 = createNotification({
    type: 'agent-offline',
    title: 'Stay dismissed',
    message: 'Test again',
    fingerprint: 'test-stay-dismissed',
  })
  assert(n2 === null, 'Dismissed fingerprint should not recreate')
})

test('dismissAllNotifications clears all active', () => {
  // Create a few
  createNotification({ type: 'agent-offline', title: 'A', message: 'A', fingerprint: 'test-all-1' })
  createNotification({ type: 'agent-offline', title: 'B', message: 'B', fingerprint: 'test-all-2' })
  const count = dismissAllNotifications()
  assert(count >= 0, 'Should return count')
  const active = getActiveNotifications()
  assert(active.length === 0, `Should be empty, got ${active.length}`)
})

// ============================================================================
// Resolve
// ============================================================================

// Reset for resolve tests
fs.writeFileSync(notifPath, '[]', 'utf-8')

test('resolveByFingerprint resolves notification', () => {
  createNotification({ type: 'workflow-stuck', title: 'Resolve test', message: 'Test', fingerprint: 'test-resolve-1' })
  const ok = resolveByFingerprint('test-resolve-1')
  assert(ok === true, 'Should return true')
  const active = getActiveNotifications()
  assert(!active.find(a => a.fingerprint === 'test-resolve-1'), 'Should not be active')
})

test('resolveNotificationAction resolves with action data', () => {
  const n = createNotification({
    type: 'workflow-blocked',
    title: 'Action test',
    message: 'Test',
    fingerprint: 'test-action-1',
    blockerType: 'approval',
  })
  const ok = resolveNotificationAction(n!.id, 'approve', undefined, 'user')
  assert(ok === true, 'Should return true')
  const all = loadNotifications()
  const resolved = all.find(a => a.id === n!.id)
  assert(resolved?.blockerResolution?.action === 'approve', 'Should have resolution')
  assert(resolved?.resolvedAt !== undefined, 'Should have resolvedAt')
})

test('resolveNotificationAction returns false for invalid ID', () => {
  const ok = resolveNotificationAction('nonexistent', 'approve')
  assert(ok === false, 'Should return false')
})

// ============================================================================
// Blockers
// ============================================================================

fs.writeFileSync(notifPath, '[]', 'utf-8')

test('getWorkflowBlockers returns blockers for workflow', () => {
  createNotification({
    type: 'workflow-blocked',
    title: 'Blocker 1',
    message: 'Test',
    fingerprint: 'test-wb-1',
    workflowId: 'wf-test',
    blockerType: 'approval',
  })
  createNotification({
    type: 'agent-needs-decision',
    title: 'Blocker 2',
    message: 'Test',
    fingerprint: 'test-wb-2',
    workflowId: 'wf-test',
    blockerType: 'choice',
  })
  createNotification({
    type: 'agent-error',
    title: 'Not a blocker',
    message: 'Test',
    fingerprint: 'test-wb-3',
    workflowId: 'wf-other',
  })
  const blockers = getWorkflowBlockers('wf-test')
  assert(blockers.length === 2, `Should have 2 blockers, got ${blockers.length}`)
})

test('getWorkflowBlockers returns empty for unknown workflow', () => {
  const blockers = getWorkflowBlockers('nonexistent')
  assert(blockers.length === 0, 'Should be empty')
})

// ============================================================================
// Severity mapping
// ============================================================================

test('severity mapping is correct for all types', () => {
  const cases: Array<[string, string]> = [
    ['agent-error', 'critical'],
    ['agent-offline', 'info'],
    ['agent-needs-feedback', 'warning'],
    ['agent-needs-decision', 'warning'],
    ['workflow-failed', 'critical'],
    ['workflow-stuck', 'warning'],
    ['workflow-blocked', 'warning'],
    ['workflow-progress', 'info'],
    ['cost-warning', 'warning'],
    ['cost-exceeded', 'critical'],
    ['channel-activity', 'info'],
  ]
  for (const [type, expected] of cases) {
    const n = createNotification({
      type: type as any,
      title: `Severity ${type}`,
      message: 'Test',
      fingerprint: `test-severity-${type}`,
    })
    if (n) {
      assert(n.severity === expected, `${type} should be ${expected}, got ${n.severity}`)
    }
  }
})

// Cleanup
cleanup()

// Summary
setTimeout(() => {
  console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
  if (testsFailed > 0) {
    console.log(`${RED}Failed: ${testsFailed}${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed! ✓${RESET}\n`)
    process.exit(0)
  }
}, 100)
