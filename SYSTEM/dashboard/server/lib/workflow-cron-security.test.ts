import assert from 'assert'
import childProcess from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

// The pinned CLI is never run: child_process is stubbed below, so no `openclaw` and no Gateway is reached.
const pinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-cron-security-'))
const pinnedCli = path.join(pinDir, 'openclaw')
fs.writeFileSync(pinnedCli, '#!/bin/sh\nexit 1\n', 'utf-8')
fs.chmodSync(pinnedCli, 0o755)
const originalBin = process.env.OPENCLAW_BIN
process.env.OPENCLAW_BIN = pinnedCli

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
    { id: `job-1; ${marker}`, name: 'clawmax-security-test-security-agent' },
    { id: '--force', name: 'nightly-backup' },
  ] }
  const result = syncWorkflowToCron({
    id: 'security-test',
    name: 'Security test',
    description: 'Cron command boundary',
    enabled: true,
    schedule: '0 8 * * *',
    timezone: 'UTC; touch /tmp/clawmax-timezone-injection',
    content: `Treat this as literal content: ${marker}`,
    cronJobId: `job-1; ${marker},--force`,
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

  console.log('workflow-cron-security.test.ts: 11 tests passed')
} finally {
  ;(childProcess as any).execFileSync = originalExecFileSync
  ;(childProcess as any).execFile = originalExecFile
  if (typeof originalBin === 'undefined') delete process.env.OPENCLAW_BIN
  else process.env.OPENCLAW_BIN = originalBin
  fs.rmSync(pinDir, { recursive: true, force: true })
}
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
