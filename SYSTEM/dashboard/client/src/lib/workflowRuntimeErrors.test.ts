import assert from 'assert'
import { summarizeWorkflowParticipantFailure } from './workflowRuntimeErrors'

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

function run() {
  console.log(`\n${YELLOW}=== Workflow Runtime Errors Test Suite ===${RESET}\n`)

  test('summarizeWorkflowParticipantFailure normalizes missing provider credentials', () => {
    const message = summarizeWorkflowParticipantFailure('No API key found for provider "openai"')
    assert(/No model provider credentials are configured for this workflow run/i.test(message), `Unexpected message: ${message}`)
    assert(!/provider "openai"/i.test(message), 'Expected raw provider detail to be hidden')
  })

  test('summarizeWorkflowParticipantFailure normalizes cooldown and timeout failures', () => {
    const timeoutMessage = summarizeWorkflowParticipantFailure('Agent reported failure: request timed out while waiting for model response')
    assert(/temporarily cooling down/i.test(timeoutMessage), `Unexpected timeout message: ${timeoutMessage}`)

    const cooldownMessage = summarizeWorkflowParticipantFailure('openai is in cooldown (suspending lanes) after repeated failures')
    assert(/temporarily cooling down/i.test(cooldownMessage), `Unexpected cooldown message: ${cooldownMessage}`)
  })

  test('summarizeWorkflowParticipantFailure normalizes communication delivery failures', () => {
    const commsMessage = summarizeWorkflowParticipantFailure('COMMS FAIL: Unknown channel: leadership')
    assert(/Communication delivery failed/i.test(commsMessage), `Unexpected comms message: ${commsMessage}`)
    assert(!/Unknown channel:/i.test(commsMessage), 'Expected raw channel failure detail to be hidden')
  })

  test('summarizeWorkflowParticipantFailure normalizes missing execution path guidance', () => {
    const message = summarizeWorkflowParticipantFailure('No execution path configured. Add hosted provider keys or configure a local runtime in BYOK / workspace integrations.')
    assert(/No model execution path is configured/i.test(message), `Unexpected message: ${message}`)
  })

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) process.exit(1)
  console.log(`${GREEN}All tests passed${RESET}`)
}

run()
