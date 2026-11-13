import nodeAssert from 'assert'
import childProcess from 'child_process'
let assertionsRun = 0
const assert = Object.assign(
  (value: unknown, message?: string) => { assertionsRun++; nodeAssert(value, message) },
  {
    strictEqual: (a: unknown, b: unknown, message?: string) => { assertionsRun++; nodeAssert.strictEqual(a, b, message) },
    deepStrictEqual: (a: unknown, b: unknown, message?: string) => { assertionsRun++; nodeAssert.deepStrictEqual(a, b, message) },
  },
)

const cli = require('./openclaw-cli')
const originalResolve = cli.resolveOpenClawCliPath
const pinnedCli = '/synthetic/pinned/openclaw'
cli.resolveOpenClawCliPath = () => pinnedCli

const marker = '$(touch /tmp/clawmax-cron-injection)'
let gatewayJobs: unknown = { jobs: [] }
const originalExecFileSync = childProcess.execFileSync
const originalExecFile = childProcess.execFile
const invocations: Array<{ command: string; args: string[]; options: any }> = []
const asyncInvocations: Array<{ command: string; args: string[]; options: any }> = []
let namedRemovalAttempts = 0

;(childProcess as any).execFileSync = ((command: string, args: string[], options: any) => {
  invocations.push({ command, args, options })
  return args[1] === 'list' ? JSON.stringify(gatewayJobs) : ''
}) as typeof childProcess.execFileSync

// Answers like the real execFile's promisified form, which resolves { stdout, stderr }.
;(childProcess as any).execFile = ((command: string, args: string[], options: any, callback: Function) => {
  asyncInvocations.push({ command, args, options })
  if (args[1] === 'rm' && args[2] === 'job-deleted-workflow' && ++namedRemovalAttempts === 1) {
    const error: any = new Error('Gateway unavailable')
    error.stderr = 'Gateway unavailable'
    callback(error)
    return { kill() {} }
  }
  callback(null, { stdout: args[1] === 'list' ? JSON.stringify(gatewayJobs) : '', stderr: '' })
  return { kill() {} }
}) as typeof childProcess.execFile

async function run() {
try {
  const workflowPath = require.resolve('./workflows')
  delete require.cache[workflowPath]
  const { syncWorkflowToCron, removeLegacyWorkflowCronJobsAsync } = require('./workflows')

  // An id read from a workflow file is passed as one argv value, and only for a job the Gateway lists under
  // the legacy name; the user's own job named in the same file is not touched.
  gatewayJobs = { jobs: [
    { id: `job-1; ${marker}`, name: 'clawmax-security-test-security-agent', agentId: 'security-agent' },
    { id: '--force', name: 'nightly-backup' },
    { id: 'other-workflow', name: 'clawmax-security-test-nested-security-agent', agentId: 'security-agent' },
  ] }
  const result = syncWorkflowToCron({
    id: 'security-test',
    name: 'Security test',
    description: 'Cron command boundary',
    enabled: true,
    schedule: '0 8 * * *',
    timezone: 'UTC; touch /tmp/clawmax-timezone-injection',
    content: `Treat this as literal content: ${marker}`,
    cronJobId: `job-1; ${marker},--force,other-workflow`,
    targeting: { agents: [], groups: [], communities: [], tags: [] },
  })
  assert.deepStrictEqual(result, { ok: true }, 'Expected the stored legacy job to be removed')
  assert.deepStrictEqual(invocations.map((call) => call.args), [['cron', 'list', '--json', '--all'], ['cron', 'rm', `job-1; ${marker}`]], 'Expected one listing, one removal of the legacy job, and no registration')
  assert(invocations.every((call) => call.command === pinnedCli), 'Expected the pinned CLI, not an `openclaw` from PATH')
  assert(invocations.every((call) => call.options?.shell !== true), 'Cron execution must not enable a shell')

  // Startup: every legacy job goes, a deleted workflow's included, with one retry after a transient failure.
  gatewayJobs = { jobs: [
    { id: 'job-current', name: 'clawmax-daily-report-writer' },
    { id: 'job-deleted-workflow', name: 'clawmax-retired-flow-analyst' },
    { id: 'job-user', name: 'weekly-digest' },
  ] }
  assert.deepStrictEqual(await removeLegacyWorkflowCronJobsAsync(), { ok: true })
  assert.deepStrictEqual(
    asyncInvocations.map((call) => call.args.slice(1).join(' ')),
    ['list --json --all', 'rm job-current', 'rm job-deleted-workflow', 'rm job-deleted-workflow'],
    'Expected both legacy jobs removed (one retry after a transient Gateway failure) and the other job left alone'
  )
  assert(asyncInvocations.every((call) => call.command === pinnedCli), 'Expected async cron cleanup to use the pinned CLI')
  assert(asyncInvocations.every((call) => call.options?.shell !== true), 'Async cron execution must not enable a shell')

  // A list that is not the whole inventory removes nothing and is reported.
  asyncInvocations.length = 0
  gatewayJobs = { jobs: [{ id: 'job-current', name: 'clawmax-daily-report-writer' }], hasMore: true }
  const partial = await removeLegacyWorkflowCronJobsAsync()
  assert.strictEqual(partial.ok, false, 'Expected an incomplete list to be reported')
  assert.deepStrictEqual(asyncInvocations.map((call) => call.args[1]), ['list'], 'Expected no removal from a partial list')

  const owned = { id: 'owned-job', name: 'clawmax-security-test-writer', agentId: 'writer' }
  for (const inventory of [
    { jobs: [owned], total: 2 }, { jobs: [owned], total: 0 },
    { jobs: [owned], total: '1' }, { jobs: [owned], total: 1.5 },
    { jobs: [owned], hasMore: 'false' }, { jobs: [owned], nextOffset: 1 },
    { jobs: [owned], offset: 1 }, { jobs: [owned, owned] },
    { jobs: [owned, null] }, { jobs: [owned, { id: {}, name: 'bad' }] },
    { jobs: [{ id: '--force', name: owned.name }] }, { jobs: [{ ...owned, id: 'bad\njob' }] },
  ]) {
    gatewayJobs = inventory
    invocations.length = 0; asyncInvocations.length = 0
    const sync = syncWorkflowToCron({ id: 'security-test', cronJobId: 'owned-job' } as any)
    assert.strictEqual(sync.ok, false, 'Malformed or partial inventories must fail closed')
    assert.strictEqual(sync.cronJobId, 'owned-job', 'Keep the retry evidence when ownership cannot be established')
    assert.deepStrictEqual(invocations.map(call => call.args[1]), ['list'], 'No sync deletion from an invalid inventory')
    const async = await removeLegacyWorkflowCronJobsAsync()
    assert.strictEqual(async.ok, false)
    assert.deepStrictEqual(asyncInvocations.map(call => call.args[1]), ['list'], 'No async deletion from an invalid inventory')
  }
  gatewayJobs = { jobs: [owned, { id: 'unnamed-user-job' }], total: 2, offset: 0, hasMore: false, nextOffset: null }
  invocations.length = 0
  assert.deepStrictEqual(syncWorkflowToCron({ id: 'security-test', cronJobId: 'owned-job' } as any), { ok: true })
  assert.deepStrictEqual(invocations.map(call => call.args[1]), ['list', 'rm'], 'A complete pinned-CLI inventory still permits owned cleanup')
  gatewayJobs = { jobs: [{ id: 'ambiguous-job', name: owned.name }] }
  invocations.length = 0
  const ambiguous = syncWorkflowToCron({ id: 'security-test', cronJobId: 'ambiguous-job' } as any)
  assert.strictEqual(ambiguous.ok, false, 'Missing Gateway agent metadata cannot establish ownership')
  assert.strictEqual(ambiguous.cronJobId, 'ambiguous-job')
  assert.deepStrictEqual(invocations.map(call => call.args[1]), ['list'], 'Do not mutate ambiguously named jobs')
  gatewayJobs = { jobs: [{ ...owned, agentId: undefined, effectiveAgentId: 'writer' }] }
  assert.deepStrictEqual(syncWorkflowToCron({ id: 'security-test', cronJobId: 'owned-job' } as any), { ok: true }, 'The pinned CLI effective-agent field is authoritative when the raw field is absent')

  cli.resolveOpenClawCliPath = () => null
  const before = invocations.length + asyncInvocations.length
  const missing = syncWorkflowToCron({ id: 'missing-pin', cronJobId: 'job-current' } as any)
  assert.strictEqual(missing.ok, false)
  const missingAsync = await removeLegacyWorkflowCronJobsAsync()
  assert.strictEqual(missingAsync.ok, false)
  assert.strictEqual(invocations.length + asyncInvocations.length, before, 'An unavailable pin must not invoke global OpenClaw')
  console.log(`workflow-cron-security.test.ts: ${assertionsRun} tests passed`)
} finally {
  ;(childProcess as any).execFileSync = originalExecFileSync
  ;(childProcess as any).execFile = originalExecFile
  cli.resolveOpenClawCliPath = originalResolve
}
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
