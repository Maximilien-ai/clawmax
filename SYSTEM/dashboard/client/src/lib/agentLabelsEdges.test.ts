import assert from 'assert'
import { formatAgentOptionLabel } from './agentLabels'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('trims surrounding whitespace from display names', () => {
  assert.strictEqual(formatAgentOptionLabel({ id: 'ceo-west', name: '  CEO  ' }), 'CEO (ceo-west)')
})

test('falls back to id when trimmed display name becomes empty', () => {
  assert.strictEqual(formatAgentOptionLabel({ id: 'ceo-west', name: '   ' }), 'ceo-west')
})

test('keeps name when only casing differs from id', () => {
  assert.strictEqual(formatAgentOptionLabel({ id: 'ceo', name: 'CEO' }), 'CEO (ceo)')
})

test('preserves punctuation in display names', () => {
  assert.strictEqual(formatAgentOptionLabel({ id: 'ops-west', name: 'Ops / West' }), 'Ops / West (ops-west)')
})

console.log('agentLabelsEdges.test.ts: ok')
