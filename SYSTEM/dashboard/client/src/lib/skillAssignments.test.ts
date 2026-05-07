import assert from 'assert'
import { getSkillAssignmentBuckets } from './skillAssignments'

function run() {
  const map = new Map<string, string[]>([
    ['alice', ['github', 'slack']],
    ['bob', ['slack']],
    ['carol', []],
  ])

  const slack = getSkillAssignmentBuckets('slack', ['carol', 'bob', 'alice'], map)
  assert.deepStrictEqual(slack.assignedAgentIds, ['alice', 'bob'])
  assert.deepStrictEqual(slack.unassignedAgentIds, ['carol'])

  const github = getSkillAssignmentBuckets('github', ['carol', 'bob', 'alice'], map)
  assert.deepStrictEqual(github.assignedAgentIds, ['alice'])
  assert.deepStrictEqual(github.unassignedAgentIds, ['bob', 'carol'])

  const missing = getSkillAssignmentBuckets('notion', ['carol', 'bob', 'alice'], map)
  assert.deepStrictEqual(missing.assignedAgentIds, [])
  assert.deepStrictEqual(missing.unassignedAgentIds, ['alice', 'bob', 'carol'])

  console.log('skillAssignments.test.ts: 3 tests passed')
}

run()
