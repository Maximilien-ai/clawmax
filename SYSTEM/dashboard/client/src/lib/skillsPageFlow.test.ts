import assert from 'assert'
import { buildRegistryCompatibilityNote, buildSkillsPageCountLabel } from './skillsPageFlow'

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

console.log('skillsPageFlow.test.ts: ok')
