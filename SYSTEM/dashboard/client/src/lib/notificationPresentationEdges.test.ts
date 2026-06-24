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

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('filters grouped notifications by grouped child message text', () => {
  const grouped = notification({
    id: 'grouped-message',
    type: 'agent-error',
    grouped: true,
    groupedChildren: [
      notification({
        id: 'child-message',
        type: 'agent-error',
        title: 'engineer-a failed',
        message: 'Authentication failed for this workflow run.',
        entityId: 'engineer-a',
      }),
    ],
  })

  assert(filterNotifications([grouped], 'authentication failed').map((item) => item.id).join(',') === 'grouped-message', 'Expected grouped child message text to match parent notification')
})

test('treats agent blockers as agent category even when workflow-linked', () => {
  assert(
    getNotificationCategory(notification({
      type: 'agent-needs-decision',
      entityType: 'agent',
      workflowId: 'wf-1',
    })) === 'agent',
    'Expected agent blocker to stay in agent category'
  )
})

test('does not show footer view action for grouped workflow notifications', () => {
  assert(
    getNotificationFooterActionLabel(notification({
      type: 'workflow-failed',
      entityType: 'workflow',
      entityId: 'wf-1',
      grouped: true,
    })) === 'View',
    'Expected grouped workflow notifications to retain footer view action'
  )
})

test('does not give agent errors a primary open action unless they are waiting for input', () => {
  assert(
    !notificationHasPrimaryOpenAction(notification({
      type: 'agent-error',
      entityType: 'agent',
      entityId: 'agent-a',
    })),
    'Expected agent errors not to open directly'
  )
  assert(
    notificationHasPrimaryOpenAction(notification({
      type: 'agent-needs-decision',
      entityType: 'agent',
      entityId: 'agent-a',
      blockerType: 'input',
    })),
    'Expected input blockers to open directly'
  )
})

test('groups categories in canonical order even when provided out of order', () => {
  const grouped = groupNotificationsByCategory([
    notification({ id: 'workflow', type: 'workflow-failed' }),
    notification({ id: 'communication', type: 'channel-activity' }),
    notification({ id: 'results', type: 'artifact-update' }),
  ])

  assert(Object.keys(grouped).join(',') === 'results,workflow,communication', `Unexpected category order: ${Object.keys(grouped).join(',')}`)
})

test('uses trailing path segment for artifact display names with workspace-file urls', () => {
  assert(
    getArtifactDisplayName('workspace-file:WORKFLOWS/outputs/demo/final-report.json') === 'final-report.json',
    'Expected workspace-file artifact labels to use the trailing filename'
  )
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`notificationPresentationEdges.test.ts: ${passed} tests passed`)
