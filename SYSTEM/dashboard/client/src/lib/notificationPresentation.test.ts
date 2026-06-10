/**
 * Notification presentation helper tests
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/notificationPresentation.test.ts
 */

import {
  DashboardNotification,
  filterNotifications,
  getArtifactDisplayName,
  getNotificationFooterActionLabel,
  getNotificationCategory,
  groupNotificationsByCategory,
  notificationHasPrimaryOpenAction,
} from './notificationPresentation'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

function notification(overrides: Partial<DashboardNotification>): DashboardNotification {
  return {
    id: overrides.id || `n-${Math.random()}`,
    type: overrides.type || 'agent-offline',
    severity: overrides.severity || 'info',
    title: overrides.title || 'Notification',
    message: overrides.message || 'Message',
    createdAt: overrides.createdAt || '2026-06-10T10:00:00.000Z',
    ...overrides,
  }
}

test('categorizes notifications consistently for section grouping', () => {
  assert(getNotificationCategory(notification({ type: 'artifact-update' })) === 'results', 'Expected artifact updates in results')
  assert(getNotificationCategory(notification({ type: 'agent-error' })) === 'agent', 'Expected agent errors in agent category')
  assert(getNotificationCategory(notification({ type: 'workflow-failed' })) === 'workflow', 'Expected workflow failures in workflow category')
  assert(getNotificationCategory(notification({ type: 'cost-warning' })) === 'budget', 'Expected cost warnings in budget category')
  assert(getNotificationCategory(notification({ type: 'channel-activity' })) === 'communication', 'Expected channel activity in communication category')
})

test('filters by title, message, entity, type, and artifact path', () => {
  const notifications = [
    notification({ id: 'a', title: 'Budget warning', message: 'Cost limit nearing', type: 'cost-warning' }),
    notification({ id: 'b', title: 'New result', message: 'Report created', type: 'artifact-update', artifactPath: 'AGENTS/researcher/REPORT.md' }),
    notification({ id: 'c', title: 'Agent offline', message: 'Worker stopped', entityId: 'researcher' }),
  ]

  assert(filterNotifications(notifications, 'budget').map(n => n.id).join(',') === 'a', 'Expected title search to match')
  assert(filterNotifications(notifications, 'report.md').map(n => n.id).join(',') === 'b', 'Expected artifact path search to match')
  assert(filterNotifications(notifications, 'researcher').map(n => n.id).join(',') === 'b,c', 'Expected artifact path and entity search to match')
})

test('groups notifications by ordered categories', () => {
  const grouped = groupNotificationsByCategory([
    notification({ id: 'agent', type: 'agent-offline' }),
    notification({ id: 'result', type: 'artifact-update' }),
    notification({ id: 'budget', type: 'cost-warning' }),
  ])

  assert(Object.keys(grouped).join(',') === 'results,agent,budget', `Unexpected category order: ${Object.keys(grouped).join(',')}`)
  assert(grouped.results[0].id === 'result', 'Expected result notification in results group')
})

test('keeps grouped notifications from stealing the primary open action', () => {
  assert(!notificationHasPrimaryOpenAction(notification({
    type: 'artifact-update',
    grouped: true,
    artifactPath: 'AGENTS/a/REPORT.md',
  })), 'Expected grouped parent to avoid primary open action')

  assert(notificationHasPrimaryOpenAction(notification({
    type: 'artifact-update',
    artifactPath: 'AGENTS/a/REPORT.md',
  })), 'Expected standalone artifact notification to open')

  assert(notificationHasPrimaryOpenAction(notification({
    type: 'workflow-failed',
    entityType: 'workflow',
    entityId: 'wf-1',
  })), 'Expected workflow entity notification to open')
})

test('derives footer labels without duplicating non-open actions', () => {
  assert(getNotificationFooterActionLabel(notification({
    type: 'artifact-update',
    artifactPath: 'AGENTS/a/REPORT.md',
  })) === 'Open file', 'Expected artifact footer label')

  assert(getNotificationFooterActionLabel(notification({
    type: 'cost-warning',
    entityType: 'budget',
  })) === 'View budget', 'Expected budget footer label')

  assert(getNotificationFooterActionLabel(notification({
    type: 'agent-offline',
    entityType: 'agent',
    entityId: 'agent-a',
  })) === null, 'Expected agent cards to use dedicated inline actions only')
})

test('formats artifact display names from paths and urls', () => {
  assert(getArtifactDisplayName('AGENTS/a/REPORT.md') === 'REPORT.md', 'Expected workspace filename')
  assert(getArtifactDisplayName('https://example.com/files/report.pdf') === 'report.pdf', 'Expected URL filename')
  assert(getArtifactDisplayName(undefined) === 'Open file', 'Expected fallback label')
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`notificationPresentation.test.ts: ${passed} tests passed`)
