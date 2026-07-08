/**
 * Builder mention helper tests
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/builderMentions.test.ts
 */

import { findActiveBuilderMention, insertBuilderMention } from './builderMentions'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

test('finds an active mention at the cursor', () => {
  const match = findActiveBuilderMention('Ask @mar', 8)
  assert(!!match, 'Expected active mention match')
  assert(match?.query === 'mar', 'Expected mention query to be captured')
})

test('ignores email-like text', () => {
  const match = findActiveBuilderMention('email me@work.com', 16)
  assert(match === null, 'Expected email address not to trigger mention')
})

test('replaces the active mention with the selected agent label', () => {
  const match = findActiveBuilderMention('Ask @mar about follow-up', 8)
  assert(!!match, 'Expected active mention before replacement')
  const next = insertBuilderMention('Ask @mar about follow-up', match!, 'maria')
  assert(next === 'Ask @maria about follow-up', 'Expected selected agent mention to be inserted')
})

let passed = 0
for (const entry of tests) {
  entry.run()
  passed += 1
  console.log(`✓ ${entry.name}`)
}

console.log(`builderMentions.test.ts: ${passed} tests passed`)
