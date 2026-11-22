import assert from 'node:assert/strict'
import { resumeWorkflows, scheduleGuidance } from './workflowReadiness'

async function main() {
  assert.match(scheduleGuidance('manual', true, false), /on demand/)
  assert.match(scheduleGuidance('manual', false, false), /Resume.*on demand/)
  assert.match(scheduleGuidance('@daily', false, false), /Enable/)
  assert.match(scheduleGuidance('@daily', true, false), /next scheduled run/)
  assert.match(scheduleGuidance('manual', true, true), /Pipeline paused/)
  assert.match(scheduleGuidance('@daily', true, true), /Pipeline paused/)
  for (const statuses of [[200, 200], [503, 503], [200, 503], [0, 200]]) {
    const ids = ['first', 'second']
    const enabled = new Set<string>()
    const failed = await resumeWorkflows(ids, async (url, options) => {
      const id = String(url).split('/').pop()!
      assert.equal(options?.method, 'PUT')
      assert.deepEqual(JSON.parse(String(options?.body)), { enabled: true })
      const status = statuses[ids.indexOf(id)]
      if (!status) throw new Error('Disconnected')
      if (status === 200) enabled.add(id)
      return new Response(null, { status })
    })
    assert.deepEqual(failed, ids.filter((_, index) => statuses[index] !== 200))
    assert.deepEqual(ids.filter(id => !failed.includes(id)), [...enabled])
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
