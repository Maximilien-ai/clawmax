import assert from 'assert'
import { buildCommunicationCacheKey, shouldUpdateChannelMessages } from './communicationMessages'

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

  console.log('communicationMessages.test.ts: 4 tests passed')
}

run()
