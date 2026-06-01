import assert from 'assert'
import { organizationTemplateCanApplyNow, organizationTemplateRequiresCustomization } from './templateApplyReadiness'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('apply-now is blocked when required secret requirements are present', () => {
  const template = {
    secretRequirements: [
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', required: true },
    ],
    workflows: [],
  }

  assert.equal(organizationTemplateRequiresCustomization(template), true)
  assert.equal(organizationTemplateCanApplyNow(template), false)
})

test('apply-now is blocked when workflow content still contains required placeholders', () => {
  const template = {
    workflows: [
      {
        id: 'kickoff',
        content: [
          '## Run Inputs',
          '- **Research goal:** [Describe the goal]',
          '- **Notes (optional):** [Optional extra notes]',
        ].join('\n'),
      },
    ],
  }

  assert.equal(organizationTemplateRequiresCustomization(template), true)
  assert.equal(organizationTemplateCanApplyNow(template), false)
})

test('apply-now is allowed when only optional placeholders remain', () => {
  const template = {
    workflows: [
      {
        id: 'kickoff',
        content: '- **Notes (optional):** [Optional extra notes]',
      },
    ],
  }

  assert.equal(organizationTemplateRequiresCustomization(template), false)
  assert.equal(organizationTemplateCanApplyNow(template), true)
})

console.log('templateApplyReadiness.test.ts: ok')
