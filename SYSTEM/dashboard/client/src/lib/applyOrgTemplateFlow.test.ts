import assert from 'assert'
import { buildApplyOrgCustomizeSteps, resolveInitialApplyOrgWizardStep } from './applyOrgTemplateFlow'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('apply-now organization templates enter the deploy step immediately', () => {
  assert.equal(resolveInitialApplyOrgWizardStep('apply-now'), 'deploy')
})

test('customize organization templates start on preview', () => {
  assert.equal(resolveInitialApplyOrgWizardStep('customize'), 'preview')
})

test('template apply customize steps include secrets only when required', () => {
  assert.deepEqual(
    buildApplyOrgCustomizeSteps(2).map((step) => step.id),
    ['team', 'context', 'secrets', 'workflows', 'agents'],
  )
  assert.deepEqual(
    buildApplyOrgCustomizeSteps(0).map((step) => step.id),
    ['team', 'context', 'workflows', 'agents'],
  )
})

console.log('applyOrgTemplateFlow.test.ts: ok')
