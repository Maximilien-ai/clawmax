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

const cases: Array<{
  name: string
  prompt: string
  intent: ReturnType<typeof buildAiBuilderRecommendation>['intent']
  scope: ReturnType<typeof buildAiBuilderRecommendation>['scope']
  operation?: ReturnType<typeof buildAiBuilderRecommendation>['operation']
  confidence?: ReturnType<typeof buildAiBuilderRecommendation>['confidence']
  page?: ReturnType<typeof buildAiBuilderRecommendation>['recommendedPath']['primaryAction']['page']
  action?: ReturnType<typeof buildAiBuilderRecommendation>['recommendedPath']['primaryAction']['action']
  confirmationOptionsMin?: number
  titleIncludes?: string
}> = [
  {
    name: 'explicit team request maps to team template',
    prompt: 'I need a customer support team with handoffs and workflows',
    intent: 'team_template',
    scope: 'team',
    confidence: 'high',
    page: 'templates',
  },
  {
    name: 'teams of teams request maps to team template and higher scope',
    prompt: 'Design a team of teams for product launch planning across strategy, content, and delivery',
    intent: 'team_template',
    scope: 'team_of_teams',
    confidence: 'high',
    page: 'templates',
  },
  {
    name: 'integration prompt maps to skills',
    prompt: 'I have an agent but it needs GitHub and Slack tools',
    intent: 'skill_or_integration',
    scope: 'single_agent',
    page: 'skills',
  },
  {
    name: 'explicit team template refine request maps to team template',
    prompt: 'Create or refine a team template for a peptides protocol support team with specialist roles',
    intent: 'team_template',
    scope: 'team',
    operation: 'refine_template',
    page: 'templates',
  },
  {
    name: 'niche team request prefers creating a new team template over a generic existing one',
    prompt: 'Team of agents to optimize my peptide usage',
    intent: 'team_template',
    scope: 'team',
    page: 'templates',
    action: 'create-ai',
    titleIncludes: 'Create a new team template',
  },
  {
    name: 'explicit agent template request beats existing-agent wording',
    prompt: 'Use the Astro Guide agent template if it is a better fit than my current agents',
    intent: 'agent_template',
    scope: 'single_agent',
    operation: 'use_template',
    confidence: 'high',
    page: 'templates',
  },
  {
    name: 'explicit existing agent improvement prefers existing agent',
    prompt: 'Improve my current research agent so it handles competitor reviews better',
    intent: 'existing_agent',
    scope: 'single_agent',
    operation: 'improve_existing',
    page: 'agents',
  },
  {
    name: 'template adaptation prompt prefers team template',
    prompt: 'I want to start from an existing template but adapt it for legal intake operations',
    intent: 'team_template',
    scope: 'team',
    operation: 'refine_template',
    page: 'templates',
  },
  {
    name: 'greenfield prompt with strong team template match still prefers team template',
    prompt: 'Create something custom for robotics prototype planning from scratch',
    intent: 'team_template',
    scope: 'unknown',
    page: 'templates',
  },
  {
    name: 'coordination-heavy support prompt prefers team template',
    prompt: 'Build a support escalation team with handoffs, workflows, and a final manager review',
    intent: 'team_template',
    scope: 'team',
    page: 'templates',
  },
  {
    name: 'tool-capability prompt prefers skills',
    prompt: 'My agent needs GitHub access, Slack updates, and calendar integration',
    intent: 'skill_or_integration',
    scope: 'single_agent',
    page: 'skills',
  },
  {
    name: 'single helper prompt stays single-agent oriented even when it needs generation',
    prompt: 'Design an agent that drafts astronomy lesson plans for parents and students',
    intent: 'ai_generate',
    scope: 'single_agent',
    page: 'agents',
  },
  {
    name: 'new single-agent prompt can still recommend ai generate when there is no close match',
    prompt: 'Create a new agent for amateur radio repeater interference triage',
    intent: 'ai_generate',
    scope: 'single_agent',
    operation: 'create_new',
    page: 'agents',
  },
  {
    name: 'ambiguous mixed prompt surfaces low confidence and confirmation options',
    prompt: 'Maybe use my current agent or a template for product research, whichever fits best',
    intent: 'agent_template',
    scope: 'single_agent',
    confidence: 'low',
    confirmationOptionsMin: 2,
  },
  {
    name: 'ambiguous team prompt surfaces low confidence when reuse and template paths compete',
    prompt: 'Use my current setup or maybe a team template for customer onboarding operations',
    intent: 'team_template',
    scope: 'team',
    confidence: 'low',
    confirmationOptionsMin: 2,
  },
]

for (const scenario of cases) {
  test(`ai builder routing: ${scenario.name}`, () => {
    const result = buildAiBuilderRecommendation(scenario.prompt)
    assert.equal(result.intent, scenario.intent)
    assert.equal(result.scope, scenario.scope)
    if (scenario.operation) assert.equal(result.operation, scenario.operation)
    if (scenario.confidence) assert.equal(result.confidence, scenario.confidence)
    if (scenario.page) assert.equal(result.recommendedPath.primaryAction.page, scenario.page)
    if (scenario.action) assert.equal(result.recommendedPath.primaryAction.action, scenario.action)
    if (scenario.titleIncludes) assert(result.recommendedPath.title.includes(scenario.titleIncludes), `Expected title to include ${scenario.titleIncludes}`)
    if (scenario.confirmationOptionsMin) {
      assert(result.confirmationOptions.length >= scenario.confirmationOptionsMin, `Expected at least ${scenario.confirmationOptionsMin} confirmation options`)
    }
  })
}

test('low-confidence recommendation summary explicitly says confirmation is needed', () => {
  const result = buildAiBuilderRecommendation('Maybe use my current agent or a template for product research, whichever fits best')
  assert.equal(result.confidence, 'low')
  assert(result.summary.toLowerCase().includes('not fully confident'), 'Expected low-confidence summary language')
})

test('high-confidence recommendation does not add confirmation options', () => {
  const result = buildAiBuilderRecommendation('Use the Astro Guide agent template if it is a better fit than my current agents')
  assert.equal(result.confidence, 'high')
  assert.equal(result.confirmationOptions.length, 0)
})
