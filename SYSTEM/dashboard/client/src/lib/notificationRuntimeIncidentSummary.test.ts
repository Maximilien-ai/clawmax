import {
  DashboardNotification,
  collapseSharedRuntimeAuthNotifications,
} from './notificationPresentation'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function notification(overrides: Partial<DashboardNotification>): DashboardNotification {
  return {
    id: overrides.id || `n-${Math.random()}`,
    type: overrides.type || 'agent-error',
    severity: overrides.severity || 'critical',
    title: overrides.title || 'Notification',
    message: overrides.message || 'Runtime auth error while contacting the configured model provider. Check the provider key/configuration and retry.',
    entityId: overrides.entityId,
    entityType: overrides.entityType || 'agent',
    createdAt: overrides.createdAt || '2026-06-30T23:00:00.000Z',
    ...overrides,
  }
}

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('collapses repeated shared runtime auth failures into one grouped incident', () => {
  const items = [
    notification({ id: 'a1', entityId: 'dev-team-engineer1', createdAt: '2026-06-30T23:00:00.000Z' }),
    notification({ id: 'a2', entityId: 'dev-team-engineer2', createdAt: '2026-06-30T23:01:00.000Z' }),
    notification({ id: 'a3', entityId: 'dev-team-tech-lead', createdAt: '2026-06-30T23:02:00.000Z' }),
    notification({ id: 'other', type: 'cost-warning', severity: 'warning', title: 'Budget', message: 'Budget warning: 90% used', entityType: 'budget', createdAt: '2026-06-30T23:03:00.000Z' }),
  ]

  const collapsed = collapseSharedRuntimeAuthNotifications(items)
  assert(collapsed.length === 2, `Expected grouped incident plus unrelated notification, got ${collapsed.length}`)
  const incident = collapsed[0]
  assert(incident.grouped === true, 'Expected synthetic auth incident to be grouped')
  assert(incident.groupedCount === 3, `Expected grouped count 3, got ${incident.groupedCount}`)
  assert((incident.groupedChildren || []).length === 3, 'Expected grouped children to be preserved')
  assert(/shared provider key\/configuration/i.test(incident.message), `Unexpected incident message: ${incident.message}`)
})

test('leaves sparse auth failures uncollapsed', () => {
  const items = [
    notification({ id: 'a1', entityId: 'dev-team-engineer1' }),
    notification({ id: 'a2', entityId: 'dev-team-engineer2' }),
  ]

  const collapsed = collapseSharedRuntimeAuthNotifications(items)
  assert(collapsed.length === 2, `Expected sparse failures to remain unchanged, got ${collapsed.length}`)
  assert(!collapsed[0].grouped, 'Expected no grouped incident for sparse failures')
})

test('does not collapse unrelated normalized failures', () => {
  const items = [
    notification({ id: 'wf1', type: 'workflow-failed', entityType: 'workflow', entityId: 'wf-1', message: 'COMMS FAIL: Unknown channel: leadership' }),
    notification({ id: 'wf2', type: 'workflow-failed', entityType: 'workflow', entityId: 'wf-2', message: 'COMMS FAIL: Unknown channel: leadership' }),
    notification({ id: 'wf3', type: 'workflow-failed', entityType: 'workflow', entityId: 'wf-3', message: 'COMMS FAIL: Unknown channel: leadership' }),
  ]

  const collapsed = collapseSharedRuntimeAuthNotifications(items)
  assert(collapsed.length === 3, `Expected unrelated failures to remain unchanged, got ${collapsed.length}`)
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`notificationRuntimeIncidentSummary.test.ts: ${passed} tests passed`)
