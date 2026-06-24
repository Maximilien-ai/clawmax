import assert from 'assert'
import { addVisitedPage } from './appNavigationState'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('adding to an empty visited set returns a new set with the page', () => {
  const initial = new Set<string>()
  const next = addVisitedPage(initial, 'builder')
  assert.notStrictEqual(next, initial)
  assert.deepStrictEqual(Array.from(next), ['builder'])
})

test('preserves insertion order when adding a new page', () => {
  const next = addVisitedPage(new Set(['docs', 'agents']), 'workflows')
  assert.deepStrictEqual(Array.from(next), ['docs', 'agents', 'workflows'])
})

test('preserves object identity when page already exists even with larger sets', () => {
  const initial = new Set(['docs', 'agents', 'workflows'])
  const next = addVisitedPage(initial, 'agents')
  assert.strictEqual(next, initial)
})

test('supports arbitrary string page identifiers such as plugin routes', () => {
  const next = addVisitedPage(new Set(['builder']), 'plugin:lab-notes')
  assert.deepStrictEqual(Array.from(next), ['builder', 'plugin:lab-notes'])
})

console.log('appNavigationStateEdges.test.ts: ok')
