import assert from 'assert'
import { verifyCorePersistentStateReadable } from './startup-readiness'

const result = verifyCorePersistentStateReadable([
  { name: 'agents', read: () => [{ id: 'agent-a' }] },
  { name: 'templates', read: () => [{ slug: 'custom-template' }, { slug: 'organization-template' }] },
  { name: 'groups', read: () => [] },
  { name: 'workflows', read: () => ({ scheduled: true }) },
])

assert.strictEqual(result.ready, true)
assert.deepStrictEqual(result.stores, { agents: 1, templates: 2, groups: 0, workflows: 1 })
assert(Number.isFinite(Date.parse(result.checkedAt)), 'Expected a valid readiness timestamp')

assert.throws(() => verifyCorePersistentStateReadable([
  { name: 'agents', read: () => [] },
  { name: 'templates', read: () => { throw new Error('ENOSPC') } },
  { name: 'workflows', read: () => [] },
]), /Required persistent store "templates" is unreadable: ENOSPC/)

console.log('startup-readiness.test.ts: 5 tests passed')
