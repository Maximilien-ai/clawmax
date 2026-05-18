import assert from 'node:assert/strict'
import { resolveCategoryVisual, resolveSkillVisual, resolveTemplateVisual } from './productIconResolver'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

test('resolveSkillVisual prefers explicit icon key', () => {
  const visual = resolveSkillVisual({ name: 'custom-skill', iconKey: 'github', emoji: '🛠️' })
  assert.equal(visual.iconName, 'github')
  assert.equal(visual.emoji, null)
})

test('resolveSkillVisual falls back to category or tag mapping before emoji', () => {
  const visual = resolveSkillVisual({ name: 'mail-helper', tags: ['science'], emoji: '📫' })
  assert.equal(visual.iconName, 'science')
  assert.equal(visual.emoji, null)
})

test('resolveSkillVisual preserves emoji fallback when there is no known mapping', () => {
  const visual = resolveSkillVisual({ name: 'custom', emoji: '🧵' })
  assert.equal(visual.iconName, null)
  assert.equal(visual.emoji, '🧵')
})

test('resolveTemplateVisual maps workflow templates to workflow icon', () => {
  const visual = resolveTemplateVisual({ name: 'Daily Status', type: 'workflow' })
  assert.equal(visual.iconName, 'workflow')
})

test('resolveCategoryVisual maps template category keys', () => {
  const visual = resolveCategoryVisual('business', '💼')
  assert.equal(visual.iconName, 'business')
})
