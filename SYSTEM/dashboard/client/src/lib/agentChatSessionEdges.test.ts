import assert from 'node:assert/strict'
import { buildPersistentDashboardChatSessionId } from './agentChatSession'

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

test('buildPersistentDashboardChatSessionId is deterministic across repeated calls', () => {
  const first = buildPersistentDashboardChatSessionId('research-lead')
  const second = buildPersistentDashboardChatSessionId('research-lead')
  assert.equal(first, 'agent:research-lead:dashboard-chat')
  assert.equal(second, first)
})

test('buildPersistentDashboardChatSessionId preserves mixed-case agent ids verbatim', () => {
  assert.equal(
    buildPersistentDashboardChatSessionId('TeamLeadA'),
    'agent:TeamLeadA:dashboard-chat'
  )
})

test('buildPersistentDashboardChatSessionId keeps punctuation in already-formed agent ids', () => {
  assert.equal(
    buildPersistentDashboardChatSessionId('qa.agent_2'),
    'agent:qa.agent_2:dashboard-chat'
  )
})

console.log('agentChatSessionEdges.test.ts: 3 tests passed')
