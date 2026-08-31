import assert from 'assert'
import { hasExplicitBuilderEntityAction, requiredBuilderCreateTargets, selectBuilderSecondaryActions } from './builderExplicitActions'

let testsPassed = 0

function test(name: string, fn: () => void): void {
  try {
    fn()
    testsPassed++
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

const targetCases: Array<{ prompt: string; targets: ReturnType<typeof requiredBuilderCreateTargets> }> = [
  { prompt: 'Create an agent for customer support', targets: ['agent'] },
  { prompt: 'Build me an assistant that prepares customer briefs', targets: ['agent'] },
  { prompt: 'Design a specialist for municipal permit intake', targets: ['agent'] },
  { prompt: 'Generate a helper for release notes', targets: ['agent'] },
  { prompt: 'Make a customer support agent', targets: ['agent'] },
  { prompt: 'Set up an agent for customer research', targets: ['agent'] },
  { prompt: 'Spin up a new agent for incident triage', targets: ['agent'] },
  { prompt: 'I want a new agent for customer briefs', targets: ['agent'] },
  { prompt: 'Create a team of agents', targets: ['team'] },
  { prompt: 'Build a team template for release operations', targets: ['team'] },
  { prompt: 'Create a company of agents', targets: ['company'] },
  { prompt: 'Design an organization template with finance and sales teams', targets: ['company'] },
  { prompt: 'Create a workflow for weekly reporting', targets: ['workflow'] },
  { prompt: 'Draft a skill for GitHub triage', targets: ['skill'] },
  { prompt: 'Create a team of agents with a workflow and skill', targets: ['team', 'workflow', 'skill'] },
  { prompt: 'Build an agent, a workflow, and a skill for customer onboarding', targets: ['agent', 'workflow', 'skill'] },
  { prompt: 'Create an agent. Then create a company of agents.', targets: ['agent', 'company'] },
  { prompt: 'Create a company of agents. Then create an agent for its front desk.', targets: ['agent', 'company'] },
  { prompt: 'Create a workflow using my existing agent', targets: ['workflow'] },
  { prompt: 'Create a skill for my current support agent', targets: ['skill'] },
  { prompt: 'Create an agent that reviews existing workflows', targets: ['agent'] },
  { prompt: 'Create an agent to manage workflows and skills', targets: ['agent'] },
  { prompt: 'I need an agent to create workflows for customers', targets: ['agent'] },
  { prompt: 'Create an agent that can build workflows and skills', targets: ['agent'] },
  { prompt: 'Create a workflow that can generate a specialist report', targets: ['workflow'] },
  { prompt: 'How do I create a workflow?', targets: [] },
  { prompt: 'Tell me how to build an agent', targets: [] },
  { prompt: 'Can an agent create a workflow?', targets: [] },
  { prompt: 'Can you create a workflow for me?', targets: ['workflow'] },
  { prompt: 'Use my existing research agent', targets: [] },
  { prompt: 'Review the closest existing agent', targets: [] },
  { prompt: 'Update an agent for customer support', targets: [] },
  { prompt: 'Refine my current workflow', targets: [] },
  { prompt: 'Improve this skill for GitHub triage', targets: [] },
  { prompt: 'I need an agent for customer briefs', targets: ['agent'] },
  { prompt: 'I need a workflow and a skill for customer reviews', targets: ['workflow', 'skill'] },
  { prompt: 'I need my existing agent to review customer briefs', targets: [] },
  { prompt: 'I need a new workflow for weekly reviews', targets: ['workflow'] },
  { prompt: 'Use my existing workflow for weekly reviews', targets: [] },
  { prompt: 'Create a workflow for an existing support agent', targets: ['workflow'] },
]

for (const scenario of targetCases) {
  test(`detects explicit create targets: ${scenario.prompt}`, () => {
    assert.deepEqual(requiredBuilderCreateTargets(scenario.prompt), scenario.targets)
  })
}

test('entity helper follows the same explicit-create contract', () => {
  assert.equal(hasExplicitBuilderEntityAction('Create an agent for customer support', 'agent'), true)
  assert.equal(hasExplicitBuilderEntityAction('Update an agent for customer support', 'agent'), false)
  assert.equal(hasExplicitBuilderEntityAction('Create a workflow for weekly reporting', 'workflow'), true)
  assert.equal(hasExplicitBuilderEntityAction('Review the current workflow', 'workflow'), false)
  assert.equal(hasExplicitBuilderEntityAction('Create a skill for GitHub triage', 'skill'), true)
  assert.equal(hasExplicitBuilderEntityAction('Improve this skill', 'skill'), false)
})

test('required AI Create actions survive the usual secondary-action limit', () => {
  assert.deepEqual(
    selectBuilderSecondaryActions([
      { label: 'Open Templates' },
      { label: 'Review Workflows' },
      { label: 'AI Create Team Template' },
      { label: 'AI Create Workflow' },
      { label: 'AI Create Skill' },
    ]).map((action) => action.label),
    ['AI Create Team Template', 'AI Create Workflow', 'AI Create Skill'],
  )
})

test('ordinary secondary actions still respect a custom limit', () => {
  assert.deepEqual(
    selectBuilderSecondaryActions([
      { label: 'AI Create Agent' },
      { label: 'Open Templates' },
      { label: 'Review Agents' },
      { label: 'Plan a test' },
    ], 3).map((action) => action.label),
    ['AI Create Agent', 'Open Templates', 'Review Agents'],
  )
})

console.log(`builderExplicitActions.test.ts: ${testsPassed} tests passed`)
