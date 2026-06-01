/**
 * Chat route helper test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/chat.test.ts
 */

import { hasByokExecutionPathForProvider, shouldUseLocalChatExecution } from './chat'

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
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Chat Route Test Suite ===${RESET}\n`)

test('hasByokExecutionPathForProvider detects matching hosted provider keys', () => {
  assert(hasByokExecutionPathForProvider('openai', { openai: 'sk-test' }), 'Expected OpenAI BYOK key to match OpenAI provider')
  assert(hasByokExecutionPathForProvider('anthropic', { anthropic: 'sk-ant-test' }), 'Expected Anthropic BYOK key to match Anthropic provider')
  assert(hasByokExecutionPathForProvider('gemini', { gemini: 'AIza-test' }), 'Expected Gemini BYOK key to match Gemini provider')
  assert(!hasByokExecutionPathForProvider('openai', { anthropic: 'sk-ant-test' }), 'Expected Anthropic key not to satisfy OpenAI provider')
})

test('shouldUseLocalChatExecution prefers gateway for hosted BYOK models when gateway is running', () => {
  assert(!shouldUseLocalChatExecution({
    provider: 'openai',
    byok: { openai: 'sk-test' },
    gatewayRunning: true,
  }), 'Expected BYOK OpenAI chat to use gateway when available')
})

test('shouldUseLocalChatExecution still falls back to direct mode for hosted BYOK when gateway is down', () => {
  assert(shouldUseLocalChatExecution({
    provider: 'openai',
    byok: { openai: 'sk-test' },
    gatewayRunning: false,
  }), 'Expected BYOK OpenAI chat to use local execution when gateway is unavailable')
})

test('shouldUseLocalChatExecution uses gateway for hosted env-key execution when gateway is running', () => {
  assert(!shouldUseLocalChatExecution({
    provider: 'openai',
    byok: {},
    gatewayRunning: true,
  }), 'Expected server-key hosted chat to use gateway when available')
})

test('shouldUseLocalChatExecution always uses direct mode for local providers', () => {
  assert(shouldUseLocalChatExecution({
    provider: 'ollama',
    gatewayRunning: true,
  }), 'Expected Ollama chat to use local execution')
  assert(shouldUseLocalChatExecution({
    provider: 'openai-compatible',
    gatewayRunning: true,
  }), 'Expected OpenAI-compatible chat to use local execution')
})

setTimeout(() => {
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
}, 0)
