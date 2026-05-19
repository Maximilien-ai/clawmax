import assert from 'node:assert/strict'
import { mergeAgentToFront } from './agentList'

{
  const merged = mergeAgentToFront(
    [{ id: 'alpha' }, { id: 'bravo' }, { id: 'charlie' }],
    { id: 'delta' },
  )

  assert.deepEqual(merged.map(agent => agent.id), ['delta', 'alpha', 'bravo', 'charlie'])
}

{
  const merged = mergeAgentToFront(
    [{ id: 'alpha' }, { id: 'bravo' }, { id: 'charlie' }],
    { id: 'bravo' },
  )

  assert.deepEqual(merged.map(agent => agent.id), ['bravo', 'alpha', 'charlie'])
}

console.log('agentList.test.ts: ok')
