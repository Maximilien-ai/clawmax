import assert from 'assert'
import { combineRegistrySearchResponses, normalizeRegistrySearchResponse } from './registrySearch'

const clawhub = normalizeRegistrySearchResponse('clawhub', {
  results: [{ name: 'github' }],
  total: 4,
})
const tessl = normalizeRegistrySearchResponse('tessl', {
  results: [{ name: 'review' }],
})
const combined = combineRegistrySearchResponses([clawhub, tessl])

assert.strictEqual(combined.total, 5)
assert.deepStrictEqual(combined.results.map((entry) => entry.registry_provider), ['clawhub', 'tessl'])
assert.deepStrictEqual(combineRegistrySearchResponses([]), { results: [], total: 0 })
assert.deepStrictEqual(normalizeRegistrySearchResponse('shipables', { results: null }), { results: [], total: 0 })

console.log('registrySearch.test.ts: 4 tests passed')
