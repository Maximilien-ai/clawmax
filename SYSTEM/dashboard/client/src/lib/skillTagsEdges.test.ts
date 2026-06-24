import assert from 'assert'
import { collectSkillTags, matchesSelectedSkillTags } from './skillTags'
import type { OpenClawSkill } from '../types'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

const sampleSkills = [
  {
    name: 'github',
    description: 'GitHub skill',
    filePath: '/tmp/github/SKILL.md',
    bundled: true,
    source: 'bundled',
    tags: [' devtools ', '', 'git', 'devtools'],
  },
] as OpenClawSkill[]

test('collectSkillTags trims, deduplicates, and drops blank tags', () => {
  assert.deepStrictEqual(collectSkillTags(sampleSkills), ['devtools', 'git'])
})

test('matchesSelectedSkillTags trims skill tags before matching', () => {
  assert.strictEqual(matchesSelectedSkillTags(sampleSkills[0], new Set(['devtools'])), true)
})

test('matchesSelectedSkillTags does not trim selected tags implicitly', () => {
  assert.strictEqual(matchesSelectedSkillTags(sampleSkills[0], new Set([' devtools '])), false)
})

test('matchesSelectedSkillTags treats empty skill tag arrays as non-matching when selections exist', () => {
  const skill = { ...sampleSkills[0], tags: [] }
  assert.strictEqual(matchesSelectedSkillTags(skill, new Set(['git'])), false)
})

console.log('skillTagsEdges.test.ts: ok')
