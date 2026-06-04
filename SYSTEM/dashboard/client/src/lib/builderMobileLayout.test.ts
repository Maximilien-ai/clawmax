import assert from 'assert'
import { shouldReserveBuilderTranscriptSpace } from './builderMobileLayout'

let passed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`✓ ${name}`)
  } catch (err) {
    console.error(`✗ ${name}`)
    throw err
  }
}

test('fresh Builder mobile state does not reserve empty transcript space before the prompt composer', () => {
  assert.equal(shouldReserveBuilderTranscriptSpace({
    messageCount: 0,
    hasRecommendation: false,
    loading: false,
  }), false)
})

test('Builder reserves transcript space once a conversation or recommendation exists', () => {
  assert.equal(shouldReserveBuilderTranscriptSpace({
    messageCount: 1,
    hasRecommendation: false,
    loading: false,
  }), true)
  assert.equal(shouldReserveBuilderTranscriptSpace({
    messageCount: 0,
    hasRecommendation: true,
    loading: false,
  }), true)
})

test('Builder reserves transcript space while loading a response', () => {
  assert.equal(shouldReserveBuilderTranscriptSpace({
    messageCount: 0,
    hasRecommendation: false,
    loading: true,
  }), true)
})

console.log(`builderMobileLayout.test.ts: ok (${passed} tests)`)
