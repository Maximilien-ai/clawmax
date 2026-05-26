import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {
  applyAiBuilderLlmFallback,
  buildAiBuilderRecommendation,
  shouldUseAiBuilderLlmFallback,
} from './ai-builder'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

const cases = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'ai-builder-evals.json'), 'utf8'),
) as Array<{
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
  topOrganizationTemplateIncludes?: string
  topOrganizationTemplateExcludes?: string
  topOrganizationTemplateFamily?: ReturnType<typeof buildAiBuilderRecommendation>['matchedAssets']['organizationTemplates'][number]['family']
  suggestedActionIdsInclude?: string[]
  suggestedActionIdsExclude?: string[]
  suggestedActionPagesInclude?: Array<ReturnType<typeof buildAiBuilderRecommendation>['suggestedActions'][number]['page']>
  confirmationLabelsInclude?: string[]
  confirmationLabelsExclude?: string[]
}>

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
    if (scenario.topOrganizationTemplateIncludes) {
      assert.equal(result.matchedAssets.organizationTemplates[0]?.name, scenario.topOrganizationTemplateIncludes)
    }
    if (scenario.topOrganizationTemplateExcludes) {
      assert.notEqual(result.matchedAssets.organizationTemplates[0]?.name, scenario.topOrganizationTemplateExcludes)
    }
    if (scenario.topOrganizationTemplateFamily) {
      assert.equal(result.matchedAssets.organizationTemplates[0]?.family, scenario.topOrganizationTemplateFamily)
    }
    if (scenario.confirmationOptionsMin) {
      assert(result.confirmationOptions.length >= scenario.confirmationOptionsMin, `Expected at least ${scenario.confirmationOptionsMin} confirmation options`)
    }
    if (scenario.suggestedActionIdsInclude) {
      const actionIds = result.suggestedActions.map((action) => action.id)
      for (const expectedId of scenario.suggestedActionIdsInclude) {
        assert(actionIds.includes(expectedId), `Expected suggested actions to include ${expectedId}, got ${actionIds.join(', ')}`)
      }
    }
    if (scenario.suggestedActionIdsExclude) {
      const actionIds = result.suggestedActions.map((action) => action.id)
      for (const unexpectedId of scenario.suggestedActionIdsExclude) {
        assert(!actionIds.includes(unexpectedId), `Expected suggested actions to exclude ${unexpectedId}, got ${actionIds.join(', ')}`)
      }
    }
    if (scenario.suggestedActionPagesInclude) {
      const actionPages = result.suggestedActions.map((action) => action.page)
      for (const expectedPage of scenario.suggestedActionPagesInclude) {
        assert(actionPages.includes(expectedPage), `Expected suggested action pages to include ${expectedPage}, got ${actionPages.join(', ')}`)
      }
    }
    if (scenario.confirmationLabelsInclude) {
      const labels = result.confirmationOptions.map((option) => option.label)
      for (const expectedLabel of scenario.confirmationLabelsInclude) {
        assert(labels.includes(expectedLabel), `Expected confirmation labels to include ${expectedLabel}, got ${labels.join(', ')}`)
      }
    }
    if (scenario.confirmationLabelsExclude) {
      const labels = result.confirmationOptions.map((option) => option.label)
      for (const unexpectedLabel of scenario.confirmationLabelsExclude) {
        assert(!labels.includes(unexpectedLabel), `Expected confirmation labels to exclude ${unexpectedLabel}, got ${labels.join(', ')}`)
      }
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

test('llm fallback triggers for low-confidence team template recommendations', () => {
  const result = buildAiBuilderRecommendation('Create a team of agents for a nonprofit food pantry to coordinate donors, volunteers, and weekly distribution')
  assert.equal(result.confidence, 'low')
  assert.equal(shouldUseAiBuilderLlmFallback(result), true)
})

test('llm fallback can steer a team recommendation to create-new while preserving refine as an alternative', () => {
  const base = buildAiBuilderRecommendation('create a team of agents to help me manage monthly shows at incline gallery https://www.inclinegallerysf.com/')
  const next = applyAiBuilderLlmFallback(base, 'create a team of agents to help me manage monthly shows at incline gallery https://www.inclinegallerysf.com/', {
    grouping: 'creative venue operations',
    rationale: 'This looks like a recurring gallery operations workflow with specialized community coordination.',
    candidateGroupings: ['event operations', 'arts program operations'],
    strategy: 'create_new_template',
    suggestedScope: 'team',
    suggestedFamily: 'other',
  })

  assert.equal(next.usedLlmFallback, true)
  assert.equal(next.operation, 'create_new')
  assert.equal(next.groupingSuggestion?.label, 'creative venue operations')
  assert.equal(next.recommendedPath.primaryAction.action, 'create-ai')
  assert(next.alternativePaths.some((path) => path.action.templateRefineMode), 'Expected refine-template alternative to remain available')
})

test('llm fallback can steer a team recommendation to refine an existing template', () => {
  const base = buildAiBuilderRecommendation('I want to start from an existing template but adapt it for legal intake operations')
  const next = applyAiBuilderLlmFallback(base, 'I want to start from an existing template but adapt it for legal intake operations', {
    grouping: 'legal intake operations',
    rationale: 'The closest existing operations template already has the right multi-role structure, but it needs domain-specific refinement.',
    candidateGroupings: ['intake operations', 'service operations'],
    strategy: 'refine_existing_template',
    suggestedScope: 'team',
    suggestedFamily: 'operations_general',
  })

  assert.equal(next.usedLlmFallback, true)
  assert.equal(next.operation, 'refine_template')
  assert.equal(next.recommendedPath.primaryAction.templateRefineMode, true)
  assert(next.alternativePaths.some((path) => path.action.action === 'create-ai'), 'Expected create-new alternative to remain available')
})

test('existing-agent recurring process includes workflow generation follow-through', () => {
  const result = buildAiBuilderRecommendation('I already have a client success agent. I want a weekly renewal review process with final approval')
  const workflowAction = result.suggestedActions.find((action) => action.id === 'create-workflow' || action.id === 'review-existing-workflow')
  assert(workflowAction, 'Expected workflow follow-through action')
  if (workflowAction?.id === 'create-workflow') {
    assert.equal(workflowAction.action, 'create-ai')
    assert(typeof workflowAction.prefillPrompt === 'string' && workflowAction.prefillPrompt.includes('weekly renewal review process'))
  }
})

test('skill or integration recommendation includes create skill with AI follow-through', () => {
  const result = buildAiBuilderRecommendation('I already have a people ops agent. It needs Slack, Gmail, and calendar integrations before I create anything new')
  const skillAction = result.suggestedActions.find((action) => action.id === 'create-skill')
  assert(skillAction, 'Expected create skill follow-through action')
  assert.equal(skillAction?.action, 'create-ai')
  assert.equal(skillAction?.page, 'skills')
})
