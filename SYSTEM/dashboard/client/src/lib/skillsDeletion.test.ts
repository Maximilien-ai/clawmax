import assert from 'assert'
import { summarizeSkillDeleteImpact } from './skillsDeletion'

function run() {
  const summary = summarizeSkillDeleteImpact(
    [
      { name: 'alpha-skill', description: '', source: 'workspace' } as any,
      { name: 'beta-skill', description: '', source: 'managed' } as any,
      { name: 'gamma-skill', description: '', source: 'workspace' } as any,
    ],
    new Map([
      ['alpha-skill', ['agent-b', 'agent-a']],
      ['beta-skill', []],
      ['gamma-skill', ['agent-a']],
    ])
  )

  assert.deepStrictEqual(summary.rows, [
    { skillName: 'alpha-skill', assignedAgents: ['agent-a', 'agent-b'] },
    { skillName: 'beta-skill', assignedAgents: [] },
    { skillName: 'gamma-skill', assignedAgents: ['agent-a'] },
  ])
  assert.strictEqual(summary.assignedSkillCount, 2)
  assert.strictEqual(summary.affectedAgentCount, 2)
  assert.deepStrictEqual(summary.affectedAgents, ['agent-a', 'agent-b'])

  console.log('skillsDeletion.test.ts: 4 tests passed')
}

run()
