import assert from 'assert'
import { filterAssignableAgents, isUserSkill, partitionSkillsBySource, toggleItemSelection, toggleVisibleSelections } from './skillsSelection'

function run() {
  const toggledOn = toggleItemSelection(new Set<string>(), 'github')
  assert.deepStrictEqual(Array.from(toggledOn), ['github'])

  const toggledOff = toggleItemSelection(new Set<string>(['github']), 'github')
  assert.deepStrictEqual(Array.from(toggledOff), [])

  const addVisible = toggleVisibleSelections(new Set<string>(['slack']), ['github', 'notion'])
  assert.deepStrictEqual(Array.from(addVisible).sort(), ['github', 'notion', 'slack'])

  const removeVisible = toggleVisibleSelections(new Set<string>(['github', 'notion', 'slack']), ['github', 'notion'])
  assert.deepStrictEqual(Array.from(removeVisible).sort(), ['slack'])

  const filteredAgents = filterAssignableAgents(['beta', 'alpha', 'gamma'], 'a')
  assert.deepStrictEqual(filteredAgents, ['alpha', 'beta', 'gamma'])

  assert.strictEqual(isUserSkill({ name: 'workspace-copy', description: '', source: 'workspace', variantOf: 'github' } as any), true)
  assert.strictEqual(isUserSkill({ name: 'github', description: '', source: 'bundled' } as any), false)

  const partitioned = partitionSkillsBySource([
    { name: 'github', description: '', source: 'bundled' } as any,
    { name: 'custom-tool', description: '', source: 'workspace' } as any,
    { name: 'github-copy', description: '', source: 'bundled', variantOf: 'github' } as any,
  ])
  assert.deepStrictEqual(partitioned.userSkills.map((skill) => skill.name), ['custom-tool', 'github-copy'])
  assert.deepStrictEqual(partitioned.builtInSkills.map((skill) => skill.name), ['github'])

  console.log('skillsSelection.test.ts: 8 tests passed')
}

run()
