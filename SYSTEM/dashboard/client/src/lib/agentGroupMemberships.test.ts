import assert from 'node:assert/strict'
import { availableAgentGroups, changeAgentGroupMembership, loadAgentGroupOptions } from './agentGroupMemberships'

async function run() {
  const options = [{ name: 'opaque-team', displayName: 'Research Team', description: 'Sources and analysis' }, { name: 'joined', displayName: 'Existing Team' }]
  assert.deepEqual(availableAgentGroups(options, [options[1]], 'research'), [options[0]])
  assert.deepEqual(availableAgentGroups(options, [options[1]], 'analysis'), [options[0]])
  assert.deepEqual(availableAgentGroups(options, [options[1]], 'opaque'), [options[0]])
  assert.deepEqual(availableAgentGroups(options, [options[1]], 'existing'), [], 'Existing memberships cannot be added twice')

  const calls: Array<{ url: string; init?: RequestInit }> = []
  let groups = [{ name: 'joined' }, { name: 'added-elsewhere' }]
  let failWrite = false
  let persist = true
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url === '/api/groups') return { ok: true, json: async () => ({ groups: options }) }
    if (init?.method === 'POST') {
      if (failWrite) return { ok: false, status: 403, json: async () => ({ error: 'Membership change is not authorized' }) }
      if (persist) groups = JSON.parse(String(init.body)).groups.map((name: string) => ({ name }))
      return { ok: true, json: async () => ({ ok: true }) }
    }
    return { ok: true, json: async () => ({ groups, communities: [{ name: 'preserve-community' }] }) }
  }) as typeof fetch

  assert.deepEqual(await loadAgentGroupOptions(fakeFetch), options)
  assert.deepEqual((await changeAgentGroupMembership('agent one', 'opaque-team', true, fakeFetch)).map(group => group.name), ['joined', 'added-elsewhere', 'opaque-team'])
  const write = calls.find(call => call.init?.method === 'POST')!
  assert.equal(write.url, '/api/agents/agent%20one/communities')
  assert.deepEqual(JSON.parse(String(write.init?.body)), { groups: ['joined', 'added-elsewhere', 'opaque-team'] }, 'Fresh memberships are preserved and communities are not replaced')
  const removed = await changeAgentGroupMembership('agent one', 'joined', false, fakeFetch)
  assert.deepEqual(removed.map(group => group.name), ['added-elsewhere', 'opaque-team'])
  await changeAgentGroupMembership('agent one', 'opaque-team', true, fakeFetch)
  assert.equal(groups.filter(group => group.name === 'opaque-team').length, 1, 'Add is idempotent')
  failWrite = true
  await assert.rejects(changeAgentGroupMembership('agent one', 'opaque-team', false, fakeFetch), /not authorized/)
  assert(groups.some(group => group.name === 'opaque-team'), 'A failed removal does not change persisted memberships')
  failWrite = false
  persist = false
  await assert.rejects(changeAgentGroupMembership('agent one', 'opaque-team', false, fakeFetch), /did not persist/)
  const failedRead = (async () => ({ ok: false, status: 503, json: async () => ({ error: 'Groups unavailable' }) })) as unknown as typeof fetch
  await assert.rejects(loadAgentGroupOptions(failedRead), /Groups unavailable/)
  const malformed = (async () => ({ ok: true, json: async () => ({ groups: 'invalid' }) })) as unknown as typeof fetch
  await assert.rejects(loadAgentGroupOptions(malformed), /invalid group list/)
  await assert.rejects(changeAgentGroupMembership('agent one', 'x', true, malformed), /invalid group list/)
  console.log('agentGroupMemberships.test.ts: passed')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
