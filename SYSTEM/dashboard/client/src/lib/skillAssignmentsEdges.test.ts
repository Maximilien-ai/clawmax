import assert from 'assert'
import { getSkillAssignmentBuckets } from './skillAssignments'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('returns both buckets sorted even when input order is noisy', () => {
  const result = getSkillAssignmentBuckets(
    'slack',
    ['carol', 'bob', 'alice'],
    new Map([
      ['alice', ['slack']],
      ['bob', []],
      ['carol', ['slack']],
    ]),
  )

  assert.deepStrictEqual(result.assignedAgentIds, ['alice', 'carol'])
  assert.deepStrictEqual(result.unassignedAgentIds, ['bob'])
})

test('treats missing agent map entries as unassigned', () => {
  const result = getSkillAssignmentBuckets('github', ['zeta', 'alpha'], new Map([['alpha', ['slack']]]))
  assert.deepStrictEqual(result.assignedAgentIds, [])
  assert.deepStrictEqual(result.unassignedAgentIds, ['alpha', 'zeta'])
})

test('matches exact skill names only', () => {
  const result = getSkillAssignmentBuckets(
    'git',
    ['alpha', 'beta'],
    new Map([
      ['alpha', ['github']],
      ['beta', ['git']],
    ]),
  )

  assert.deepStrictEqual(result.assignedAgentIds, ['beta'])
  assert.deepStrictEqual(result.unassignedAgentIds, ['alpha'])
})

console.log('skillAssignmentsEdges.test.ts: ok')
