import { summarizeAgentChatFailure } from './chatRuntimeErrors'

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
