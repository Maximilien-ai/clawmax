import { formatAgentWorkStatus, summarizeAgentChatFailure } from './chatRuntimeErrors'

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

console.log(`\n${YELLOW}=== Chat Runtime Errors Test Suite ===${RESET}\n`)

test('summarizeAgentChatFailure normalizes missing provider credentials', () => {
  const message = summarizeAgentChatFailure('No API key found for provider "openai"')
  assert(/No model provider credentials are configured for this chat/i.test(message), `Unexpected message: ${message}`)
  assert(!/provider "openai"/i.test(message), 'Expected raw provider string to be hidden')
})

test('summarizeAgentChatFailure normalizes invalid provider credentials', () => {
  const message = summarizeAgentChatFailure('FailoverError: 401 Incorrect API key provided: openai-cible.')
  assert(/api key was rejected/i.test(message), `Unexpected message: ${message}`)
})

test('summarizeAgentChatFailure normalizes missing execution path guidance', () => {
  const message = summarizeAgentChatFailure('No execution path configured. Add hosted provider keys, configure Ollama, or add an OpenAI-compatible endpoint in BYOK / workspace integrations.')
  assert(/No model execution path is configured for this chat/i.test(message), `Unexpected message: ${message}`)
  assert(/BYOK \/ workspace integrations/i.test(message), `Unexpected remediation guidance: ${message}`)
})

test('summarizeAgentChatFailure surfaces FsSafeError as a runtime state failure', () => {
  const message = summarizeAgentChatFailure('FsSafeError: directory changed during operation')
  assert(/runtime changed files while this chat was running/i.test(message), `Unexpected message: ${message}`)
  assert(/restart the runtime or disable unstable runtime plugins/i.test(message), `Unexpected remediation guidance: ${message}`)
})

test('summarizeAgentChatFailure preserves detailed unsupported-model remediation', () => {
  const detailed = 'This agent is configured with a model that the current runtime does not support: `openai/gpt-super-pro`. Choose a listed model. [Edit agent model](/agents?agent=agent0&action=edit)'
  const message = summarizeAgentChatFailure(detailed)
  assert(message === detailed, `Expected detailed error to remain intact: ${message}`)
})

test('summarizeAgentChatFailure explains incomplete tool turns', () => {
  const message = summarizeAgentChatFailure("Agent couldn't generate a response. Some tool actions may have already been executed.")
  assert(/used tools but did not produce a final reply/i.test(message), `Unexpected message: ${message}`)
  assert(/verify the requested results/i.test(message), `Expected verification guidance: ${message}`)
})

test('formatAgentWorkStatus distinguishes long tool-enabled requests', () => {
  assert(formatAgentWorkStatus(5_000) === 'Agent is working...', 'Expected concise initial status')
  assert(/45s elapsed/.test(formatAgentWorkStatus(45_000)), 'Expected seconds elapsed')
  assert(/1m 15s elapsed/.test(formatAgentWorkStatus(75_000)), 'Expected minutes elapsed')
  assert(/up to 3 minutes/.test(formatAgentWorkStatus(75_000)), 'Expected timeout expectation')
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
