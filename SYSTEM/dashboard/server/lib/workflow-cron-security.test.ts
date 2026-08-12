import assert from 'assert'
import childProcess from 'child_process'

const originalExecFileSync = childProcess.execFileSync
const invocations: Array<{ command: string; args: string[]; options: any }> = []

;(childProcess as any).execFileSync = ((command: string, args: string[], options: any) => {
  invocations.push({ command, args, options })
  if (args.includes('list')) return JSON.stringify([])
  return JSON.stringify({ id: 'cron-security-test' })
}) as typeof childProcess.execFileSync

try {
  const workflowPath = require.resolve('./workflows')
  delete require.cache[workflowPath]
  const { syncWorkflowToCron } = require('./workflows')
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
  assert(add!.args.includes('UTC; touch /tmp/clawmax-timezone-injection'), 'Expected timezone metacharacters to remain one literal argument')
  assert(add!.args.some((arg) => arg.includes(marker)), 'Expected workflow content metacharacters to remain literal data')

  console.log('workflow-cron-security.test.ts: 8 tests passed')
} finally {
  ;(childProcess as any).execFileSync = originalExecFileSync
}
