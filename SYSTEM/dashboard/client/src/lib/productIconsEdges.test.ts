import assert from 'assert'
import { resolveCategoryVisual, resolveSkillVisual, resolveTemplateVisual } from './productIconResolver'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('resolveSkillVisual normalizes hyphenated explicit icon keys', () => {
  const visual = resolveSkillVisual({ name: 'custom-skill', iconKey: 'view-details' })
  assert.strictEqual(visual.iconName, 'details')
  assert.strictEqual(visual.emoji, null)
})

test('resolveTemplateVisual falls back to explicit unknown icon as emoji', () => {
  const visual = resolveTemplateVisual({ name: 'Daily Status', icon: '🌀' })
  assert.strictEqual(visual.iconName, null)
  assert.strictEqual(visual.emoji, '🌀')
})

test('resolveTemplateVisual infers registry icon from hints', () => {
  const visual = resolveTemplateVisual({ name: 'Shipables Sync', description: 'Registry sync automation' })
  assert.strictEqual(visual.iconName, 'registry')
})

test('resolveCategoryVisual falls back to provided emoji when category is unknown', () => {
  const visual = resolveCategoryVisual('mystery-category', '🧭')
  assert.strictEqual(visual.iconName, null)
  assert.strictEqual(visual.emoji, '🧭')
})

console.log('productIconsEdges.test.ts: ok')
