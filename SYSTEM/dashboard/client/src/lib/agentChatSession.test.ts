import assert from 'node:assert/strict'
import { buildPersistentDashboardChatSessionId, resolveDashboardChatSessionId } from './agentChatSession'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

test('buildPersistentDashboardChatSessionId uses a stable agent-scoped key', () => {
  assert.equal(buildPersistentDashboardChatSessionId('ceo'), 'agent:ceo:dashboard-chat')
  assert.equal(
    buildPersistentDashboardChatSessionId('astro-guide'),
    'agent:astro-guide:dashboard-chat'
  )
})

test('resolveDashboardChatSessionId adopts automatic recovery sessions from start events', () => {
  assert.equal(
    resolveDashboardChatSessionId('stale-session', {
      type: 'start',
      data: { resumeSessionId: 'fresh-recovery-session' },
    }),
    'fresh-recovery-session',
  )
  assert.equal(
    resolveDashboardChatSessionId('current-session', { type: 'delta', data: { resumeSessionId: 'ignored' } }),
    'current-session',
  )
})
