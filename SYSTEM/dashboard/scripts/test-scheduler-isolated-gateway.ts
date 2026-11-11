/** Real pinned Gateway cleanup; only the owning isolated launcher may run this. No agent turns. */
import assert from 'assert/strict'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { syncWorkflowToCron, removeLegacyWorkflowCronJobsAsync } from '../server/lib/workflows'
import { resolveOpenClawCliPath } from '../server/lib/openclaw-cli'

async function main() {
  assert.equal(process.env.CLAWMAX_TEST_ISOLATED_GATEWAY, 'true')
  const state = fs.realpathSync(process.env.OPENCLAW_STATE_DIR!)
  const root = path.dirname(state)
  assert(path.basename(root).startsWith('clawmax-test-runtime-'))
  assert.equal(process.env.OPENCLAW_CONFIG_PATH, path.join(state, 'openclaw.json'))
  assert.equal(process.env.CLAWMAX_WORKSPACE_REGISTRY_PATH, path.join(root, 'registry.json'))
  assert.equal(process.env.OPENCLAW_WORKSPACE, path.join(root, 'workspace'))
  const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH!, 'utf8'))
  assert.equal(config.cron.enabled, false, 'The test Gateway must never execute cron jobs')
  const binary = resolveOpenClawCliPath()
  assert(binary && binary === process.env.OPENCLAW_BIN, 'Use only the prepared runtime')
  const run = (args: string[]) => JSON.parse(execFileSync(binary, ['cron', ...args], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] }))
  const list = () => run(['list', '--all', '--json']).jobs as Array<{ id: string; name: string; enabled: boolean }>
  const baseline = list()
  assert(baseline.every(job => !job.name.startsWith('clawmax-')), 'An isolated fixture must not inherit Dashboard legacy jobs')
  const baselineIds = baseline.map(job => job.id)
  const workflowId = `native-scheduler-${process.pid}`
  const add = (name: string) => {
    const job = run(['add', '--name', name, '--agent', 'main', '--cron', '0 0 1 1 *', '--message', 'Synthetic disabled scheduler fixture', '--disabled', '--no-deliver', '--json'])
    assert.equal(job.enabled, false)
    return job.id as string
  }
  const created: string[] = []
  try {
    const owned = add(`clawmax-${workflowId}-main`); created.push(owned)
    const other = add(`clawmax-${workflowId}-nested-main`); created.push(other)
    const foreign = add(`external-scheduler-${process.pid}`); created.push(foreign)
    assert.deepEqual(syncWorkflowToCron({ id: workflowId, cronJobId: [owned, other, foreign].join(',') } as any), { ok: true })
    assert.deepEqual(new Set(list().map(job => job.id)), new Set([...baselineIds, other, foreign]), 'Per-workflow cleanup must preserve foreign jobs')
    assert.deepEqual(await removeLegacyWorkflowCronJobsAsync(), { ok: true })
    assert.deepEqual(new Set(list().map(job => job.id)), new Set([...baselineIds, foreign]), 'Startup removes orphaned legacy jobs, never user jobs')
    assert.deepEqual(await removeLegacyWorkflowCronJobsAsync(), { ok: true })
    assert.deepEqual(new Set(list().map(job => job.id)), new Set([...baselineIds, foreign]), 'Cleanup is idempotent')
    console.log('Native scheduler Gateway: passed (scoped cleanup, foreign-job preservation, orphan cleanup, idempotency; no agent turns)')
  } finally {
    for (const job of list()) if (created.includes(job.id)) run(['rm', job.id])
    assert.deepEqual(new Set(list().map(job => job.id)), new Set(baselineIds), 'Synthetic jobs are cleaned up and native jobs retained')
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
