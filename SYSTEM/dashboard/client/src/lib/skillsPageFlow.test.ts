import assert from 'assert'
import { buildRegistryCompatibilityNote, buildSkillsPageCountLabel, partitionSkillsBySection } from './skillsPageFlow'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('skills page count label reflects filtered and total catalog size', () => {
  assert.equal(buildSkillsPageCountLabel(12, 52), 'Showing 12 of 52 skills')
})

test('skills page registry note is Linux-specific on Linux runtimes', () => {
  assert.equal(buildRegistryCompatibilityNote('linux'), 'Showing skills compatible with this Linux runtime.')
})

test('skills page registry note is macOS-specific on darwin runtimes', () => {
  assert.equal(buildRegistryCompatibilityNote('darwin'), 'Showing skills compatible with this macOS runtime.')
})

test('skills page partitions partner-backed workspace skills into a dedicated section', () => {
  const partitioned = partitionSkillsBySection(
    [
      { name: 'custom-notes', source: 'workspace' as const },
      { name: 'resend', source: 'workspace' as const },
      { name: 'github', source: 'bundled' as const },
    ],
    ['resend', 'resend-cli']
  )

  assert.deepEqual(partitioned.userSkills.map((skill) => skill.name), ['custom-notes'])
  assert.deepEqual(partitioned.partnerSkills.map((skill) => skill.name), ['resend'])
  assert.deepEqual(partitioned.builtInSkills.map((skill) => skill.name), ['github'])
})

console.log('skillsPageFlow.test.ts: ok')
