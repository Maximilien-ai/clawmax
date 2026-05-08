import assert from 'assert'
import {
  buildCommunicationCacheKey,
  mergeTypingAgents,
  removeRespondedAgentsFromPending,
  shouldUpdateChannelMessages,
} from './communicationMessages'

function run() {
  assert.strictEqual(buildCommunicationCacheKey('group', 'Leadership'), 'group:Leadership')

  const base = [
    { id: '1', from: 'alice', content: 'hello', timestamp: 1 },
    { id: '2', from: 'bob', content: 'hi', timestamp: 2 },
  ]

  assert.strictEqual(shouldUpdateChannelMessages(base, [...base]), false)
  assert.strictEqual(
    shouldUpdateChannelMessages(base, [...base, { id: '3', from: 'carol', content: 'new', timestamp: 3 }]),
    true
  )
  assert.strictEqual(
    shouldUpdateChannelMessages(base, [
      { id: '1', from: 'alice', content: 'hello edited', timestamp: 1 },
      { id: '2', from: 'bob', content: 'hi', timestamp: 2 },
    ]),
    true
  )

  const merged = mergeTypingAgents(new Set(['alice', 'bob']), new Set(['bob', 'carol']))
  assert.deepStrictEqual(Array.from(merged).sort(), ['alice', 'bob', 'carol'])

  const pendingAfterResponse = removeRespondedAgentsFromPending(
    new Set(['alice', 'bob']),
    [
      { id: '1', from: 'User', content: 'hello', timestamp: 1 },
      { id: '2', from: 'alice', content: 'reply', timestamp: 2 },
    ],
    1
  )
  assert.deepStrictEqual(Array.from(pendingAfterResponse).sort(), ['bob'])

  const pendingAfterNamedResponse = removeRespondedAgentsFromPending(
    new Set(['agent-a', 'agent-b']),
    [
      { id: '1', from: 'User', content: 'hello', timestamp: 1 },
      { id: '2', from: 'Briefing Writer', content: 'reply', timestamp: 2 },
    ],
    1,
    [
      { id: 'agent-a', name: 'Briefing Writer' },
      { id: 'agent-b', name: 'Research Analyst' },
    ]
  )
  assert.deepStrictEqual(Array.from(pendingAfterNamedResponse).sort(), ['agent-b'])

  console.log('communicationMessages.test.ts: 7 tests passed')
}

run()
