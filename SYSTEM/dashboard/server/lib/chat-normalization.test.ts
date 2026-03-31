/**
 * Chat normalization test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/chat-normalization.test.ts
 */

import { normalizeChatMessage } from './chat-normalization'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Chat Normalization Test Suite ===${RESET}\n`)

test('extracts payload text from gateway json envelopes', () => {
  const raw = JSON.stringify({
    result: {
      payloads: [
        { text: 'First answer' },
        { text: 'Second answer' },
      ],
    },
  })
  const normalized = normalizeChatMessage(raw)
  assert(normalized === 'First answer\n\nSecond answer', `Unexpected normalized output: ${normalized}`)
})

test('extracts content from archived raw message arrays', () => {
  const raw = JSON.stringify([
    { id: '1', from: 'agent', content: 'Alpha' },
    { id: '2', from: 'agent', content: 'Beta' },
  ])
  const normalized = normalizeChatMessage(raw)
  assert(normalized === 'Alpha\n\nBeta', `Unexpected normalized output: ${normalized}`)
})

test('strips ansi and internal openclaw lines from plain text', () => {
  const raw = '\x1b[31mError header\x1b[0m\n🦞 OpenClaw debug\nUseful line\n(Command exited 0)'
  const normalized = normalizeChatMessage(raw)
  assert(normalized === 'Error header\nUseful line', `Unexpected normalized output: ${normalized}`)
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  console.log(`${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}All tests passed${RESET}`)
}
