import assert from 'assert'
import { summarizeSkillDeleteImpact } from './skillsDeletion'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('returns rows sorted by skill name regardless of input order', () => {
  const summary = summarizeSkillDeleteImpact(
    [
      { name: 'gamma-skill', description: '', source: 'workspace' } as any,
      { name: 'alpha-skill', description: '', source: 'workspace' } as any,
    ],
    new Map(),
  )

  assert.deepStrictEqual(summary.rows.map((row) => row.skillName), ['alpha-skill', 'gamma-skill'])
})

test('deduplicates affected agents across multiple skills', () => {
  const summary = summarizeSkillDeleteImpact(
    [
      { name: 'alpha-skill', description: '', source: 'workspace' } as any,
      { name: 'beta-skill', description: '', source: 'workspace' } as any,
    ],
    new Map([
      ['alpha-skill', ['agent-b', 'agent-a']],
      ['beta-skill', ['agent-a']],
    ]),
  )

  assert.strictEqual(summary.affectedAgentCount, 2)
  assert.deepStrictEqual(summary.affectedAgents, ['agent-a', 'agent-b'])
})

test('reports zero affected agents when nothing is assigned', () => {
  const summary = summarizeSkillDeleteImpact(
    [{ name: 'alpha-skill', description: '', source: 'workspace' } as any],
    new Map(),
  )

  assert.strictEqual(summary.assignedSkillCount, 0)
  assert.strictEqual(summary.affectedAgentCount, 0)
  assert.deepStrictEqual(summary.affectedAgents, [])
})

console.log('skillsDeletionEdges.test.ts: ok')
