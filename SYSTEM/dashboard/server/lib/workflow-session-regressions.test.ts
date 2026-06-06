import {
  runExclusiveAgentExecution,
  isOpenClawSessionLockError,
  getAgentExecutionRetryDelay,
} from './agent-execution'
import { detectParticipantReportedFailure } from './workflows'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Workflow Session Regression Tests ===${RESET}\n`)

  await test('embedded session takeover errors are treated as lock conflicts', async () => {
    assert(
      isOpenClawSessionLockError(new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')),
      'Expected embedded takeover error to be recognized as a lock conflict',
    )
  })

  await test('session takeover failures are surfaced as workflow participant failures', async () => {
    const detected = detectParticipantReportedFailure(
      'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /tmp/agent.jsonl',
    )
    assert(!!detected, 'Expected takeover error to be surfaced as a workflow failure')
  })

  await test('same-agent execution retries once after embedded session takeover', async () => {
    let attempts = 0
    const result = await runExclusiveAgentExecution('workflow-regression-agent', async () => {
      attempts++
      if (attempts === 1) {
        throw new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')
      }
      return 'ok'
    })
    assert(result === 'ok', `Expected retry to succeed, got ${result}`)
    assert(attempts === 2, `Expected exactly one retry, got ${attempts} attempts`)
  })

  await test('workflow retry delay remains bounded for repeated session conflicts', async () => {
    assert(getAgentExecutionRetryDelay(0) === 1500, `Expected 1500ms first retry delay, got ${getAgentExecutionRetryDelay(0)}`)
    assert(getAgentExecutionRetryDelay(4) === 5000, `Expected capped 5000ms retry delay, got ${getAgentExecutionRetryDelay(4)}`)
  })

  console.log(`\nTests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)

  if (testsFailed > 0) {
    console.log(`\n${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
