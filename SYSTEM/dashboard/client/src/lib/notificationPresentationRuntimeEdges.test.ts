import {
  DashboardNotification,
  getNotificationDisplayMessage,
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

test('normalizes agent notification auth/provider failures', () => {
  const message = getNotificationDisplayMessage(notification({
    type: 'agent-error',
    entityType: 'agent',
    message: 'Incorrect API key provided: sk-bad',
  }))
  assert(/api key was rejected/i.test(message), `Unexpected agent notification message: ${message}`)
  assert(!/sk-bad/i.test(message), 'Expected raw key detail to be hidden')
})

test('normalizes workflow notification communication failures', () => {
  const message = getNotificationDisplayMessage(notification({
    type: 'workflow-failed',
    entityType: 'workflow',
    message: 'COMMS FAIL: Unknown channel: leadership',
  }))
  assert(/communication delivery failed/i.test(message), `Unexpected workflow notification message: ${message}`)
  assert(!/Unknown channel/i.test(message), 'Expected raw channel failure detail to be hidden')
})

test('leaves unrelated notification messages unchanged', () => {
  const message = getNotificationDisplayMessage(notification({
    type: 'cost-warning',
    entityType: 'budget',
    message: 'Budget warning: 90% used',
  }))
  assert(message === 'Budget warning: 90% used', `Unexpected unchanged message: ${message}`)
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`notificationPresentationRuntimeEdges.test.ts: ${passed} tests passed`)
