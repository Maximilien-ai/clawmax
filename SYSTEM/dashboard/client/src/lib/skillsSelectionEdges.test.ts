import assert from 'assert'
import {
  filterAssignableAgents,
  partitionSelectedSkills,
  toggleItemSelection,
  toggleVisibleSelections,
} from './skillsSelection'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('toggleItemSelection preserves original set identity contract', () => {
  const initial = new Set(['github'])
  const next = toggleItemSelection(initial, 'slack')
  assert.notStrictEqual(next, initial)
  assert.deepStrictEqual(Array.from(initial), ['github'])
  assert.deepStrictEqual(Array.from(next).sort(), ['github', 'slack'])
})

test('toggleVisibleSelections leaves selection unchanged for empty visible lists', () => {
  const initial = new Set(['github'])
  const next = toggleVisibleSelections(initial, [])
  assert.deepStrictEqual(Array.from(next), ['github'])
})

test('filterAssignableAgents trims query whitespace before filtering', () => {
  assert.deepStrictEqual(filterAssignableAgents(['beta', 'alpha'], '  al '), ['alpha'])
})

test('partitionSelectedSkills ignores non-selected skills', () => {
  const result = partitionSelectedSkills(
    [
      { name: 'github', description: '', source: 'bundled' } as any,
      { name: 'custom-tool', description: '', source: 'workspace' } as any,
    ],
    new Set(['custom-tool']),
  )

  assert.deepStrictEqual(result.selectedSkills.map((skill) => skill.name), ['custom-tool'])
  assert.deepStrictEqual(result.deletableSkills.map((skill) => skill.name), ['custom-tool'])
  assert.deepStrictEqual(result.nonDeletableSkills.map((skill) => skill.name), [])
})

console.log('skillsSelectionEdges.test.ts: ok')
