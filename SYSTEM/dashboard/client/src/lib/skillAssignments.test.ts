import assert from 'assert'
import { getSkillAssignmentBuckets, toggleSkillAssignment } from './skillAssignments'

async function run() {
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

  const notices: string[] = []
  const original = ['github']
  let stored = original
  let finishSave!: () => void
  const pending = toggleSkillAssignment('gtm-agent', 'slack', original, async (id, skills) => {
    assert.strictEqual(id, 'gtm-agent')
    await new Promise<void>(resolve => { finishSave = resolve })
    stored = skills
  }, message => notices.push(message))
  assert.deepStrictEqual(notices, [])
  assert.deepStrictEqual(stored, ['github'])
  finishSave()
  assert.strictEqual(await pending, true)
  assert.deepStrictEqual(stored, ['github', 'slack'])
  assert.deepStrictEqual(original, ['github'])
  assert.deepStrictEqual(notices, ['Assigned slack to gtm-agent.'])

  assert.strictEqual(await toggleSkillAssignment('gtm-agent', 'slack', stored, async (_id, skills) => {
    stored = skills
  }, message => notices.push(message)), false)
  assert.deepStrictEqual(stored, ['github'])
  assert.strictEqual(notices[1], 'Removed slack from gtm-agent.')

  await assert.rejects(toggleSkillAssignment('gtm-agent', 'slack', stored, async () => {
    throw new Error('Assignment rejected')
  }, message => notices.push(message)), /Assignment rejected/)
  assert.strictEqual(notices.length, 2)
  assert.deepStrictEqual(stored, ['github'])
  await assert.rejects(toggleSkillAssignment('', 'slack', [], async () => {
    assert.fail('Must not save without an agent')
  }, message => notices.push(message)), /Select an agent/)
  assert.strictEqual(notices.length, 2)

  console.log('skillAssignments.test.ts: 7 tests passed')
}

run().catch(error => { console.error(error); process.exit(1) })
