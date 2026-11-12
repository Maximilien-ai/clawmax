import assert from 'assert/strict'
import { deleteWorkflowBatch, requireWorkflowDeletion } from './workflowDeletion'

async function main() {
  await requireWorkflowDeletion({ ok: true, json: async () => { throw new Error('Success needs no body') } }, 'Fallback')
  await assert.rejects(() => requireWorkflowDeletion({ ok: false, json: async () => ({ code: 'workflow_legacy_cleanup_failed', error: '/private/runtime/token' }) }, 'Fallback'), /workflow was kept/)
  for (const body of [null, 'HTML', { error: '/private/runtime/token' }, { code: 'unknown' }]) {
    await assert.rejects(() => requireWorkflowDeletion({ ok: false, json: async () => body }, 'Fallback'), /^Error: Fallback$/)
  }
  await assert.rejects(() => requireWorkflowDeletion({ ok: false, json: async () => { throw new Error('HTML response') } }, 'Fallback'), /^Error: Fallback$/)
  let release!: () => void
  const held = new Promise<void>(resolve => { release = resolve })
  const calls: string[] = []
  let settled = false
  const pending = deleteWorkflowBatch(['retained', 'deleted', 'deleted'], async id => {
    calls.push(id)
    if (id === 'retained') throw new Error('The workflow was kept')
    await held
  }).then(result => { settled = true; return result })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(settled, false, 'A fast failure cannot leave other deletions in flight when the UI refreshes')
  release()
  assert.deepEqual(await pending, { deleted: ['deleted'], failed: [{ id: 'retained', error: 'The workflow was kept' }] })
  assert.deepEqual(calls, ['retained', 'deleted'], 'A retry set must not delete a successful item again')
  assert.deepEqual(await deleteWorkflowBatch(['retained'], async () => {}), { deleted: ['retained'], failed: [] })
  assert.deepEqual(await deleteWorkflowBatch([], async () => { throw new Error('No calls') }), { deleted: [], failed: [] })
  assert.deepEqual(await deleteWorkflowBatch(['kept'], () => { throw new Error('Synchronous failure') }), { deleted: [], failed: [{ id: 'kept', error: 'Synchronous failure' }] })
  console.log('Workflow deletion: 13 scenarios passed (retention, safe errors, settlement, partial success and retry)')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
