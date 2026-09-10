import assert from 'assert'
import childProcess from 'child_process'

const originalExecFileSync = childProcess.execFileSync
const originalExecFile = childProcess.execFile
const invocations: Array<{ command: string; args: string[]; options: any }> = []
const asyncInvocations: Array<{ command: string; args: string[]; options: any }> = []
let asyncAddAttempts = 0

;(childProcess as any).execFileSync = ((command: string, args: string[], options: any) => {
  invocations.push({ command, args, options })
  if (args.includes('list')) return JSON.stringify([])
  return JSON.stringify({ id: 'cron-security-test' })
}) as typeof childProcess.execFileSync

;(childProcess as any).execFile = ((command: string, args: string[], options: any, callback: Function) => {
  asyncInvocations.push({ command, args, options })
  if (args.includes('add')) {
    asyncAddAttempts += 1
    if (asyncAddAttempts === 1) {
      const error: any = new Error('Gateway unavailable')
      error.stderr = 'Gateway unavailable'
      callback(error, '', 'Gateway unavailable')
      return { kill() {} }
    }
  }
  callback(null, args.includes('list') ? JSON.stringify({ jobs: [] }) : JSON.stringify({ id: 'cron-security-async' }), '')
  return { kill() {} }
}) as typeof childProcess.execFile

async function run() {
try {
  const workflowPath = require.resolve('./workflows')
  delete require.cache[workflowPath]
  const { syncWorkflowToCron, syncWorkflowToCronAsync } = require('./workflows')
  const marker = '$(touch /tmp/clawmax-cron-injection)'
  const result = syncWorkflowToCron({
    id: 'security-test',
    name: 'Security test',
    description: 'Cron command boundary',
    enabled: true,
    schedule: '0 8 * * *',
    timezone: 'UTC; touch /tmp/clawmax-timezone-injection',
    content: `Treat this as literal content: ${marker}`,
    targeting: { agents: [], groups: [], communities: [], tags: [] },
  }, ['security-agent'])

  assert(result.ok, 'Expected stubbed cron synchronization to succeed')
  assert(invocations.length >= 2, 'Expected list and add subprocess calls')
  assert(invocations.every((call) => call.command === 'openclaw'), 'Expected a fixed executable')
  assert(invocations.every((call) => Array.isArray(call.args) && call.args[0] === 'cron'), 'Expected argument-array cron invocation')
  assert(invocations.every((call) => call.options?.shell !== true), 'Cron execution must not enable a shell')

  const add = invocations.find((call) => call.args.includes('add'))
  assert(add, 'Expected cron add invocation')
  const cronArgIndex = add!.args.indexOf('--cron')
  assert(cronArgIndex >= 0, 'Expected cron schedule flag')
  assert.strictEqual(add!.args[cronArgIndex + 1], '0 8 * * *', 'Expected the complete five-field cron expression as one argv value without embedded quotes')
  assert(add!.args.includes('UTC; touch /tmp/clawmax-timezone-injection'), 'Expected timezone metacharacters to remain one literal argument')
  assert(add!.args.some((arg) => arg.includes(marker)), 'Expected workflow content metacharacters to remain literal data')

  const asyncResult = await syncWorkflowToCronAsync({
    id: 'security-async-test',
    name: 'Async security test',
    enabled: true,
    schedule: '0 */2 * * *',
    timezone: 'UTC',
    content: 'Async cron registration',
  }, ['security-agent'])
  assert(asyncResult.ok, 'Expected bounded retry to recover a transient Gateway failure')
  assert.strictEqual(asyncAddAttempts, 2, 'Expected one bounded retry after a transient Gateway failure')
  assert(asyncInvocations.every((call) => call.command === 'openclaw'), 'Expected async cron sync to use a fixed executable')
  assert(asyncInvocations.every((call) => call.args[0] === 'cron'), 'Expected async cron sync to use structured argv')
  assert(asyncInvocations.every((call) => call.options?.shell !== true), 'Async cron execution must not enable a shell')
  const asyncAdd = asyncInvocations.find((call) => call.args.includes('add'))
  assert(asyncAdd, 'Expected async cron add invocation')
  const asyncCronArgIndex = asyncAdd!.args.indexOf('--cron')
  assert.strictEqual(asyncAdd!.args[asyncCronArgIndex + 1], '0 */2 * * *', 'Expected async five-field cron expression without embedded quotes')

  console.log('workflow-cron-security.test.ts: 17 tests passed')
} finally {
  ;(childProcess as any).execFileSync = originalExecFileSync
  ;(childProcess as any).execFile = originalExecFile
}
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
