import {
  runExclusiveAgentExecution,
  isOpenClawSessionLockError,
  getAgentExecutionRetryDelay,
} from './agent-execution'
import {
  detectParticipantReportedFailure,
  parseWorkflowAgentResultPayload,
  repairWorkflowSessionEntryForRun,
  throwIfWorkflowAgentResultNeedsRetry,
} from './workflows'
import fs from 'fs'
import os from 'os'
import path from 'path'

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

  await test('embedded CLI result text enters the repaired session retry path', async () => {
    let attempts = 0
    const result = await runExclusiveAgentExecution('workflow-embedded-result-agent', async () => {
      attempts++
      const text = attempts === 1
        ? 'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /tmp/workflow-agent.jsonl'
        : 'completed'
      throwIfWorkflowAgentResultNeedsRetry(text)
      return text
    })

    assert(result === 'completed', `Expected embedded result retry to succeed, got ${result}`)
    assert(attempts === 2, `Expected exactly one retry for embedded result text, got ${attempts}`)
  })

  await test('non-JSON CLI diagnostics enter the repaired session retry path', async () => {
    let attempts = 0
    const result = await runExclusiveAgentExecution('workflow-diagnostic-result-agent', async () => {
      attempts++
      return parseWorkflowAgentResultPayload(attempts === 1
        ? '[provider-transport-fetch] status=200\nEmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /tmp/workflow-agent.jsonl'
        : 'plain text completion')
    })

    assert(result.text === 'plain text completion', `Expected diagnostic retry to succeed, got ${result.text}`)
    assert(attempts === 2, `Expected exactly one retry for non-JSON diagnostic text, got ${attempts}`)
  })

  await test('workflow retry hook repairs stale session pointers before retry', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-retry-repair-home-'))
    const sessionsDir = path.join(home, '.openclaw', 'agents', 'agent-a', 'sessions')
    fs.mkdirSync(sessionsDir, { recursive: true })
    const staleSessionFile = path.join(sessionsDir, 'legacy.jsonl')
    fs.writeFileSync(staleSessionFile, [
      JSON.stringify({ type: 'session', id: 'workflow-legacy-execution-agent-a' }),
      JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
    ].join('\n'), 'utf-8')
    const sessionsPath = path.join(sessionsDir, 'sessions.json')
    fs.writeFileSync(sessionsPath, JSON.stringify({
      'agent:agent-a:main': {
        sessionId: 'wf-previous-agent-a',
        sessionFile: staleSessionFile,
        updatedAt: Date.now(),
      },
    }, null, 2), 'utf-8')

    let attempts = 0
    const result = await runExclusiveAgentExecution('agent-a', async () => {
      attempts++
      if (attempts === 1) {
        throw new Error('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released')
      }
      return 'ok'
    }, {
      onSessionLockRetry: () => {
        const changed = repairWorkflowSessionEntryForRun('agent-a', 'wf-current-agent-a', home)
        assert(changed, 'Expected retry hook to repair stale workflow session pointer')
      },
    })

    const repaired = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
    assert(result === 'ok', `Expected retry-hook repair to succeed, got ${result}`)
    assert(!repaired['agent:agent-a:main'].sessionFile, 'Expected retry repair to remove stale sessionFile pointer')
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
