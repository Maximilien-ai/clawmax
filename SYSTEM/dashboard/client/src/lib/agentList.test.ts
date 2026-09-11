import assert from 'node:assert/strict'
import { isAgentChatTargetCurrent, mergeAgentToFront } from './agentList'

{
  const merged = mergeAgentToFront(
    [{ id: 'alpha' }, { id: 'bravo' }, { id: 'charlie' }],
    { id: 'delta' },
  )

  assert.deepEqual(merged.map(agent => agent.id), ['delta', 'alpha', 'bravo', 'charlie'])
}

{
  const openChat = { id: 'collector', generation: 'generation-1' }
  assert.equal(isAgentChatTargetCurrent(openChat, [{ id: 'collector', generation: 'generation-1' }]), true)
  assert.equal(isAgentChatTargetCurrent(openChat, []), false, 'deleted agents must close an open chat')
  assert.equal(
    isAgentChatTargetCurrent(openChat, [{ id: 'collector', generation: 'generation-2' }]),
    false,
    'same-ID recreation must not retain the old chat panel',
  )
}

{
  const merged = mergeAgentToFront(
    [{ id: 'alpha' }, { id: 'bravo' }, { id: 'charlie' }],
    { id: 'bravo' },
  )

  assert.deepEqual(merged.map(agent => agent.id), ['bravo', 'alpha', 'charlie'])
}

console.log('agentList.test.ts: ok')
