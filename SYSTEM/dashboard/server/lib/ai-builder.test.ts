import assert from 'assert'
import { buildAiBuilderRecommendation } from './ai-builder'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('ai builder recommends team-template path for team-oriented prompts', () => {
  const result = buildAiBuilderRecommendation('I need a customer support team with handoffs and workflows')
  assert.equal(result.intent, 'team_template')
  assert.equal(result.recommendedPath.primaryAction.page, 'templates')
  assert.ok(result.testPlan.length > 0)
})

test('ai builder recommends skill-oriented path for integration prompts', () => {
  const result = buildAiBuilderRecommendation('I have an agent but it needs GitHub and Slack tools')
  assert.equal(result.intent, 'skill_or_integration')
  assert.equal(result.recommendedPath.primaryAction.page, 'skills')
})

test('ai builder prefers team templates for explicit team template prompts', () => {
  const result = buildAiBuilderRecommendation('Create or refine a team template for a peptides protocol support team with specialist roles')
  assert.equal(result.intent, 'team_template')
  assert.equal(result.recommendedPath.primaryAction.page, 'templates')
})

test('ai builder prefers agent templates over reuse when the prompt explicitly asks for a matching template', () => {
  const result = buildAiBuilderRecommendation('Use the Astro Guide agent template if it is a better fit than my current agents')
  assert.equal(result.intent, 'agent_template')
  assert.equal(result.recommendedPath.primaryAction.page, 'templates')
})

const routingCases: Array<{
  name: string
  prompt: string
  intent: ReturnType<typeof buildAiBuilderRecommendation>['intent']
  page: ReturnType<typeof buildAiBuilderRecommendation>['recommendedPath']['primaryAction']['page']
}> = [
  {
    name: 'greenfield prompt still prefers a strong existing team template when one matches well',
    prompt: 'Create something custom for robotics prototype planning from scratch',
    intent: 'team_template',
    page: 'templates',
  },
  {
    name: 'template adaptation prompt prefers team template',
    prompt: 'I want to start from an existing template but adapt it for legal intake operations',
    intent: 'team_template',
    page: 'templates',
  },
  {
    name: 'explicit template request beats current-agent wording',
    prompt: 'Use the Astro Guide agent template if it is a better fit than my current agents',
    intent: 'agent_template',
    page: 'templates',
  },
  {
    name: 'coordination-heavy support prompt prefers team template',
    prompt: 'Build a support escalation team with handoffs, workflows, and a final manager review',
    intent: 'team_template',
    page: 'templates',
  },
  {
    name: 'tool-capability prompt prefers skills',
    prompt: 'My agent needs GitHub access, Slack updates, and calendar integration',
    intent: 'skill_or_integration',
    page: 'skills',
  },
]

for (const routingCase of routingCases) {
  test(`ai builder routing case: ${routingCase.name}`, () => {
    const result = buildAiBuilderRecommendation(routingCase.prompt)
    assert.equal(result.intent, routingCase.intent)
    assert.equal(result.recommendedPath.primaryAction.page, routingCase.page)
  })
}
