import assert from 'node:assert'
import {
  canSendDashboardInteraction,
  DASHBOARD_INTERACTION_LIMIT,
  MAX_DASHBOARD_INTERACTION_MESSAGE_LENGTH,
  pruneDashboardInteractionAttempts,
  validateDashboardInteractionMessage,
} from './workspaceDashboardInteractionGuard'

assert.strictEqual(validateDashboardInteractionMessage('  '), 'Enter a message before sending.')
assert.strictEqual(validateDashboardInteractionMessage('hello'), null)
assert.match(validateDashboardInteractionMessage('x'.repeat(MAX_DASHBOARD_INTERACTION_MESSAGE_LENGTH + 1)) || '', /limited/) 
assert.strictEqual(canSendDashboardInteraction(Array.from({ length: DASHBOARD_INTERACTION_LIMIT }, (_, index) => ({ at: 1000 + index })), 2000), false)
assert.strictEqual(canSendDashboardInteraction([{ at: 0 }], 61_000), true)
assert.deepStrictEqual(pruneDashboardInteractionAttempts([{ at: 0 }, { at: 60_001 }], 61_000), [{ at: 60_001 }])
console.log('workspace dashboard interaction guard tests passed')
