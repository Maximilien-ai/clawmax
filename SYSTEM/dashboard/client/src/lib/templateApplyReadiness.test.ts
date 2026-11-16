import assert from 'assert'
import { organizationTemplateCanApplyNow, organizationTemplateRequiresCustomization } from './templateApplyReadiness'
import { readWorkflowFields } from '../../../server/lib/workflow-required-fields'
import { replaceWorkflowFieldValue } from './localSecrets'

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

test('apply-now follows the inputs a workflow declares optional, like the apply form and the server', () => {
  const content = '## Run Inputs\n- **Food and drink plan:** [food and drink plan]'
  const declaredOptional = { workflows: [{ id: 'kickoff', content, inputs: [{ name: 'foodAndDrinkPlan', label: 'Food and drink plan', required: false }] }] }
  assert.equal(organizationTemplateCanApplyNow(declaredOptional), true)
  const undeclared = { workflows: [{ id: 'kickoff', content }] }
  assert.equal(organizationTemplateCanApplyNow(undeclared), false)
})

test('blank required fields are available to the form and replacement preserves adjacent fields and literal values', () => {
  const content = '- **Event name:**\n- **Venue:** supplied\n- **Notes (optional):**   \n'
  assert.equal(organizationTemplateCanApplyNow({ workflows: [{ content }] }), false)
  assert.deepEqual(readWorkflowFields(content).map(field => field.label), ['Event name', 'Venue', 'Notes (optional)'])
  const filled = replaceWorkflowFieldValue(content, 'Event name', 'Budget $& and $1')
  assert.equal(filled, '- **Event name:** Budget $& and $1\n- **Venue:** supplied\n- **Notes (optional):**   \n')
  assert.equal(organizationTemplateCanApplyNow({ workflows: [{ content: filled }] }), true)
})

console.log('templateApplyReadiness.test.ts: ok')
