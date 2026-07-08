/**
 * Chat perf classification test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/chat-perf-classification.test.ts
 */

import {
  classifyAgentChatPayloadForPerf,
  classifyCurlChatStatusForPerf,
  classifyPerfModelAvailability,
} from './chat-perf-classification'

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

console.log(`\n${YELLOW}=== Chat Perf Classification Test Suite ===${RESET}\n`)

test('accepts response-shaped JSON payloads', () => {
  const result = classifyAgentChatPayloadForPerf(JSON.stringify({ response: 'HELLO' }))
  assert(result.ok === true, `Expected ok result, got ${JSON.stringify(result)}`)
  assert(result.text === 'HELLO', `Expected HELLO text, got ${result.text}`)
})

test('classifies plain-text timeout output as an error note', () => {
  const result = classifyAgentChatPayloadForPerf('Agent timeout (3 minutes)')
  assert(result.ok === false, 'Expected timeout to classify as non-ok')
  assert(result.note === 'error:Agent timeout (3 minutes)', `Unexpected timeout note: ${result.note}`)
})

test('classifies stream error payloads as skipped credential issues when appropriate', () => {
  const result = classifyAgentChatPayloadForPerf('data: {"type":"error","data":"No model provider credentials are configured for this chat."}')
  assert(result.ok === false, 'Expected non-ok result')
  assert(result.note.startsWith('skipped:no-credentials:'), `Unexpected note: ${result.note}`)
})

test('maps curl timeout exit code to a transport timeout note', () => {
  const note = classifyCurlChatStatusForPerf(28)
  assert(note === 'error:transport-timeout:curl timed out waiting for chat response', `Unexpected curl note: ${note}`)
})

test('skips unavailable provider samples before patching model state', () => {
  const note = classifyPerfModelAvailability('anthropic/claude-sonnet-4-20250514', { openai: true })
  assert(note === 'skipped:no-credentials:anthropic provider is not configured for perf sampling', `Unexpected availability note: ${note}`)
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
