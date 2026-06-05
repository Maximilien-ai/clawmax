import assert from 'assert'
import { buildSkillExportFilename, getSelectedSkillForExport } from './skillExport'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('skill export filename uses the skill name with skill markdown suffix', () => {
  assert.equal(buildSkillExportFilename('react-email'), 'react-email.skill.md')
})

test('selected skill export returns null when zero skills are selected', () => {
  const selected = getSelectedSkillForExport([{ name: 'react-email' } as any], new Set<string>())
  assert.equal(selected, null)
})

test('selected skill export returns null when multiple skills are selected', () => {
  const selected = getSelectedSkillForExport(
    [{ name: 'react-email' } as any, { name: 'resend-cli' } as any],
    new Set<string>(['react-email', 'resend-cli'])
  )
  assert.equal(selected, null)
})

test('selected skill export returns the single selected skill', () => {
  const selected = getSelectedSkillForExport(
    [{ name: 'react-email' } as any, { name: 'resend-cli' } as any],
    new Set<string>(['resend-cli'])
  )
  assert.equal(selected?.name, 'resend-cli')
})

console.log('skillExport.test.ts: ok')
