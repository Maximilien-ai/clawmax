import assert from 'assert'
import { filterAssignableAgents, toggleItemSelection, toggleVisibleSelections } from './skillsSelection'

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

  console.log('skillsSelection.test.ts: 5 tests passed')
}

run()
