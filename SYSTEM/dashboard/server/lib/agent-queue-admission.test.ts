import assert from 'assert'
import { runExclusiveAgentExecution } from './agent-execution'

async function main() {
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const first = runExclusiveAgentExecution('queue-admission-test', () => held)
  let authorized = true
  let checks = 0
  let executions = 0
  const queued = runExclusiveAgentExecution('queue-admission-test', async () => { executions++ }, {
    assertAuthorized: async () => { checks++; if (!authorized) throw new Error('revoked') },
  })
  const denied = assert.rejects(queued, /revoked/)
  assert.equal(checks, 0, 'Authorization must wait for queue ownership')
  authorized = false
  release()
  await first
  await denied
  assert.equal(checks, 1)
  assert.equal(executions, 0)
  assert.equal(await runExclusiveAgentExecution('queue-admission-test', async () => 'next'), 'next', 'Denied admission releases the queue')

  const order: string[] = []
  await runExclusiveAgentExecution('queue-async-check', async () => { order.push('execute') }, {
    assertAuthorized: async () => { order.push('checking'); await Promise.resolve(); order.push('checked') },
  })
  assert.deepEqual(order, ['checking', 'checked', 'execute'])

  let attempts = 0
  let retryChecks = 0
  await assert.rejects(runExclusiveAgentExecution('queue-retry-check', async () => {
    attempts++
    throw new Error('EmbeddedAttemptSessionTakeoverError: synthetic session conflict')
  }, {
    assertAuthorized: () => { if (++retryChecks === 2) throw new Error('revoked during retry') },
    maxSessionLockRetries: 1,
  }), /revoked during retry/)
  assert.equal(attempts, 1)
  assert.equal(retryChecks, 2)
  let admissionRetries = 0
  await assert.rejects(runExclusiveAgentExecution('queue-check-error', async () => { throw new Error('must not execute') }, {
    assertAuthorized: () => { throw new Error('EmbeddedAttemptSessionTakeoverError: denied admission') },
    onSessionLockRetry: () => { admissionRetries++ },
  }), /denied admission/)
  assert.equal(admissionRetries, 0, 'Admission errors must never trigger runtime recovery')

  let reservedChecks = 0
  await assert.rejects(runExclusiveAgentExecution('tr-0123456789abcdef-agent-0123456789ab', async () => { executions++ }, {
    assertAuthorized: () => { reservedChecks++ },
  }), /execution is unavailable/)
  assert.equal(reservedChecks, 0)
  assert.equal(executions, 0)
  console.log('agent-queue-admission.test.ts: 6 checks passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
