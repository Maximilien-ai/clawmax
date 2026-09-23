import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {
  applyAiBuilderLlmFallback,
  buildAiBuilderRecommendation,
  requiredAiBuilderCreateTargets,
  shouldUseAiBuilderLlmFallback,
} from './ai-builder'

function withCatalogs(catalog: { agents?: any[]; skills?: any[]; templates?: any[]; workflows?: any[] }, fn: () => void) {
  const modules = [require('./workspace'), require('./skills'), require('./templates'), require('./workflows')]
  const names = ['listAgents', 'listAvailableSkills', 'listTemplates', 'listWorkflows']
  const values = [catalog.agents || [], catalog.skills || [], catalog.templates || [], catalog.workflows || []]
  const originals = modules.map((module, i) => module[names[i]])
  modules.forEach((module, i) => { module[names[i]] = () => values[i] })
  try { fn() } finally { modules.forEach((module, i) => { module[names[i]] = originals[i] }) }
}

test('empty catalogs offer creation without inventing existing assets', () => {
  withCatalogs({}, () => {
    for (const [prompt, intent] of [
      ['Create a new agent for municipal permits', 'ai_generate'],
      ['Create a company template for municipal permits', 'team_template'],
      ['Improve my existing permits agent', 'existing_agent'],
      ['Create a new skill for municipal permits', 'skill_or_integration'],
      ['Refine my existing permits skill', 'skill_or_integration'],
    ]) {
      const result = buildAiBuilderRecommendation(prompt)
      assert.strictEqual(result.intent, intent, prompt)
      assert(Object.values(result.matchedAssets).every((assets) => assets.length === 0))
      assert(result.testPlan.length > 0)
      assert(!result.suggestedActions.some((action) => action.agentId || action.templateId))
    }
  })
})

test('workspace matches exclude archived agents and preserve actionable chat and workflow targets', () => {
  withCatalogs({
    agents: [
      { id: 'atlas', name: 'Atlas', status: 'idle', tags: ['research'], skills: ['catalog'], groups: [{ name: 'Research' }], communities: [{ name: 'Science' }] },
      { id: 'atlas-archived', name: 'Atlas Archived', archived: true },
      { id: 'minimal', status: 'unknown' },
    ],
    skills: [{ name: 'catalog', source: 'workspace', description: 'Research catalog integration', tags: ['research'], registryCategories: ['research'], requires: { bins: ['catalog-cli'] } }, { name: 'minimal', source: 'workspace' }],
    workflows: [{ id: 'weekly-research', name: 'Weekly Research', description: 'weekly research workflow', targeting: { groups: ['Research'], communities: ['Science'], tags: ['research'] } }, { id: 'minimal', name: 'Minimal' }],
  }, () => {
    const chat = buildAiBuilderRecommendation('Chat with Atlas')
    assert.strictEqual(chat.intent, 'existing_agent')
    assert.strictEqual(chat.recommendedPath.primaryAction.action, 'chat')
    assert.strictEqual(chat.recommendedPath.primaryAction.agentId, 'atlas')
    assert(!chat.matchedAssets.agents.some((agent) => agent.id === 'atlas-archived'))
    const workflow = buildAiBuilderRecommendation('Improve my Atlas agent with a weekly research workflow')
    assert.strictEqual(workflow.intent, 'existing_agent')
    assert(workflow.suggestedActions.some((action) => action.id === 'review-existing-workflow'))
    const skill = buildAiBuilderRecommendation('Add catalog integration to my Atlas agent')
    assert.strictEqual(skill.intent, 'skill_or_integration')
    assert.strictEqual(skill.matchedAssets.skills[0].id, 'catalog')
    assert(skill.suggestedActions.some((action) => action.id === 'create-skill' && action.agentId === 'atlas'))
    const minimal = buildAiBuilderRecommendation('Use my minimal agent')
    assert.strictEqual(minimal.matchedAssets.agents[0].name, 'minimal')
    assert.strictEqual(minimal.matchedAssets.agents[0].summary, 'Existing workspace agent')
  })
})

test('template catalogs support sparse metadata and organization context without workspace agents', () => {
  withCatalogs({ templates: [
    { type: 'agent', name: 'Permit Agent', source: 'workspace', agents: [{ id: 'permit', role: 'Permit Agent' }] },
    { type: 'organization', name: 'Research Team', source: 'workspace', agents: [{ id: 'research', role: 'Researcher' }], communities: [{ name: 'Science' }], groups: [{ name: 'Research' }], teams: [{ name: 'Research' }], workflows: [{ id: 'review', name: 'Review' }] },
    { type: 'organization', name: 'Sparse Team', source: 'workspace', agents: [] },
  ] }, () => {
    const agent = buildAiBuilderRecommendation('Use the Permit Agent template')
    assert.strictEqual(agent.intent, 'agent_template')
    assert.strictEqual(agent.matchedAssets.agentTemplates[0].id, 'Permit Agent')
    const team = buildAiBuilderRecommendation('Refine the Research Team template for science research')
    assert.strictEqual(team.intent, 'team_template')
    assert.strictEqual(team.matchedAssets.organizationTemplates[0].id, 'Research Team')
    assert.strictEqual(team.recommendedPath.primaryAction.templateRefineMode, true)
    assert.strictEqual(team.recommendedPath.primaryAction.prefillPrompt, 'Refine the Research Team template for science research')
  })
})

test('fallback decisions distinguish confidence, template availability and family knowledge', () => {
  withCatalogs({}, () => {
    const base = buildAiBuilderRecommendation('Create a company template for permits')
    for (const confidence of ['high', 'medium', 'low'] as const) {
      assert.strictEqual(shouldUseAiBuilderLlmFallback({ ...base, intent: 'ai_generate', confidence }), confidence === 'low')
      assert.strictEqual(shouldUseAiBuilderLlmFallback({ ...base, confidence }), true)
      for (const family of [undefined, 'other', 'research_analysis'] as const) {
        const matchedAssets = { ...base.matchedAssets, organizationTemplates: [{ id: 'research', name: 'Research', family }] as any }
        assert.strictEqual(shouldUseAiBuilderLlmFallback({ ...base, confidence, matchedAssets }), confidence === 'low' || family !== 'research_analysis')
      }
    }
  })
})

for (const strategy of ['keep_current', 'create_new_template', 'use_existing_template', 'refine_existing_template'] as const) {
  for (const hasTemplate of [false, true]) {
    test(`fallback ${strategy} with existing template=${hasTemplate} preserves explicit choices`, () => {
      withCatalogs({}, () => {
        const prompt = 'Create a company template for permits'
        const base = buildAiBuilderRecommendation(prompt)
        base.confidence = 'high'
        if (hasTemplate) base.matchedAssets.organizationTemplates = [{ id: 'permits', name: 'Permits', type: 'organization-template', summary: 'Permit operations', source: 'workspace', score: 10 }]
        const before = JSON.stringify(base)
        const result = applyAiBuilderLlmFallback(base, prompt, {
          grouping: 'Permit operations', rationale: 'Needs several operating lanes', strategy,
          candidateGroupings: ['', 'Permit operations', 'A', 'B', 'C', 'D'],
        })
        assert.strictEqual(JSON.stringify(base), before)
        assert.strictEqual(result.confidence, 'medium')
        assert.strictEqual(result.scope, base.scope)
        assert.deepStrictEqual(result.groupingSuggestion?.alternatives, ['A', 'B', 'C'])
        assert.strictEqual(result.usedLlmFallback, true)
        if (strategy === 'create_new_template') {
          assert.strictEqual(result.operation, 'create_new')
          assert.strictEqual(result.recommendedPath.primaryAction.templateDraftTarget, 'company')
          assert.strictEqual(result.recommendedPath.primaryAction.prefillPrompt, prompt)
        } else if (hasTemplate && strategy !== 'keep_current') {
          assert.strictEqual(result.operation, strategy === 'use_existing_template' ? 'use_template' : 'refine_template')
          assert.strictEqual(result.recommendedPath.primaryAction.templateId, 'permits')
          assert.strictEqual(result.recommendedPath.primaryAction.templateRefineMode, true)
        } else {
          assert.deepStrictEqual(result.recommendedPath, base.recommendedPath)
        }
      })
    })
  }
}

test('non-team fallback supplies guidance without replacing the action', () => {
  withCatalogs({}, () => {
    const base = buildAiBuilderRecommendation('Create a new agent for permits')
    const result = applyAiBuilderLlmFallback(base, 'Create a new agent for permits', { grouping: 'Permits', rationale: 'One role is sufficient', strategy: 'create_new_template' })
    assert.deepStrictEqual(result.recommendedPath, base.recommendedPath)
    assert.deepStrictEqual(result.groupingSuggestion?.alternatives, [])
    assert.match(result.summary, /Suggested grouping: Permits/)
  })
})

function test(name: string, fn: () => void) {
  // Routing evaluations must not depend on the operator's current workspace.
  const workspace = require('./workspace')
  const workflows = require('./workflows')
  const originalAgents = workspace.listAgents
  const originalWorkflows = workflows.listWorkflows
  workspace.listAgents = () => [{ id: 'ceo', name: 'CEO', status: 'idle' }]
  workflows.listWorkflows = () => []
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  } finally {
    workspace.listAgents = originalAgents
    workflows.listWorkflows = originalWorkflows
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
  aiCreateLabelsInclude?: string[]
  aiCreateLabelsExclude?: string[]
  aiCreatePrefillMatchesPrompt?: boolean
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
    if (scenario.aiCreateLabelsInclude) {
      for (const expectedLabel of scenario.aiCreateLabelsInclude) {
        const createAction = result.suggestedActions.find((candidate) => candidate.label === expectedLabel)
        assert(createAction, `Expected suggested actions to include ${expectedLabel}`)
        assert.equal(createAction.action, 'create-ai', `Expected ${expectedLabel} to use create-ai`)
        if (scenario.aiCreatePrefillMatchesPrompt) {
          assert.equal(createAction.prefillPrompt, scenario.prompt, `Expected ${expectedLabel} to preserve the evaluation prompt`)
        }
      }
    }
    if (scenario.aiCreateLabelsExclude) {
      const labels = result.suggestedActions.map((candidate) => candidate.label)
      for (const unexpectedLabel of scenario.aiCreateLabelsExclude) {
        assert(!labels.includes(unexpectedLabel), `Expected suggested actions to exclude ${unexpectedLabel}, got ${labels.join(', ')}`)
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

test('startup bookkeeping prompt does not recommend an unrelated event template', () => {
  const result = buildAiBuilderRecommendation('create team of agents to help me manage my startup books')
  assert.notEqual(result.matchedAssets.organizationTemplates[0]?.name, 'Conference Ops Hub')
  assert.notEqual(result.matchedAssets.organizationTemplates[0]?.family, 'event_ops')
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

test('github repo maintenance prompt prefers the ClawMax Dev Team template', () => {
  const result = buildAiBuilderRecommendation('create a team of agents to help me maintain Maximilien-ai/clawmax project on github')
  assert.equal(result.intent, 'team_template')
  assert.equal(result.matchedAssets.organizationTemplates[0]?.name, 'ClawMax Dev Team')
  assert.equal(result.recommendedPath.primaryAction.templateName, 'ClawMax Dev Team')
  assert.equal(result.recommendedPath.primaryAction.templateRefineMode, true)
})

test('team prompts do not suggest irrelevant single-agent template confirmations', () => {
  const result = buildAiBuilderRecommendation('create a team of agents to help me maintain Maximilien-ai/clawmax project on github')
  const labels = result.confirmationOptions.map((option) => option.label)
  assert(!labels.includes('Use Student Research'), `Expected confirmation labels to exclude Student Research, got ${labels.join(', ')}`)
})

test('explicit new-agent requests still surface AI Create even when a close template exists', () => {
  const result = buildAiBuilderRecommendation('Create a new agent for executive background research and briefing prep')
  const allActions = [
    result.recommendedPath.primaryAction,
    ...result.alternativePaths.map((path) => path.action),
    ...result.suggestedActions,
  ]
  assert(
    allActions.some((action) => action.page === 'agents' && action.action === 'create-ai'),
    'Expected AI Create Agent to remain visible for explicit new-agent requests'
  )
})

test('explicit new-agent research prompt keeps AI Create in visible suggested actions', () => {
  const result = buildAiBuilderRecommendation('Create a new agent for executive background research')
  assert(
    result.suggestedActions.some((action) => action.page === 'agents' && action.action === 'create-ai' && action.label === 'AI Create Agent'),
    `Expected visible suggested actions to include AI Create Agent, got ${result.suggestedActions.map((action) => action.label).join(', ')}`
  )
})

test('loose company language does not force company template draft target', () => {
  const result = buildAiBuilderRecommendation('Create an AI-driven inbound sales and support management company with lead qualification, communication follow-up, and final reporting')
  assert.equal(result.intent, 'team_template')
  assert.equal(result.recommendedPath.primaryAction.page, 'templates')
  assert.equal(result.recommendedPath.primaryAction.templateDraftTarget, 'team')
  assert.equal(result.recommendedPath.title, 'Create a new team template')
})

test('explicit company template language still targets company draft generation', () => {
  const result = buildAiBuilderRecommendation('Create a new company template for a boutique agency with leadership, outbound, fulfillment, and client success teams')
  assert.equal(result.intent, 'team_template')
  assert.equal(result.recommendedPath.primaryAction.page, 'templates')
  assert.equal(result.recommendedPath.primaryAction.templateDraftTarget, 'company')
})

test('builder respects explicit no-template hints for new agent requests', () => {
  const result = buildAiBuilderRecommendation('Create a new agent for people research, do not use existing templates')
  assert.equal(result.intent, 'ai_generate')
  assert.equal(result.recommendedPath.primaryAction.page, 'agents')
  assert.equal(result.recommendedPath.primaryAction.action, 'create-ai')
})

test('builder respects explicit no-existing-agent hints for new agent requests', () => {
  const result = buildAiBuilderRecommendation('Create a new agent for GitHub issue triage, do not use existing agents')
  assert.equal(result.intent, 'ai_generate')
  assert.equal(result.recommendedPath.primaryAction.page, 'agents')
  assert.equal(result.recommendedPath.primaryAction.action, 'create-ai')
})

test('new-agent chat wording never invents a workspace chat target', () => {
  const result = buildAiBuilderRecommendation('Create an agent named "EventScout" and let me chat with it to find sponsors')
  assert.notEqual(result.intent, 'existing_agent')
  assert.equal(result.recommendedPath.primaryAction.page, 'agents')
  assert.equal(result.recommendedPath.primaryAction.action, 'create-ai')
  assert(!result.suggestedActions.some((action) => action.action === 'chat'), 'Expected no chat action before the agent exists')
  assert(!result.recommendedPath.title.toLowerCase().includes('it to'), 'Expected no invented "it to" agent target')
})

test('skill-first agent prompts still surface AI Create Agent for resend agent creation', () => {
  const result = buildAiBuilderRecommendation('create a resend agent to test sending email with resend skills')
  assert.equal(result.intent, 'skill_or_integration')
  assert(
    result.suggestedActions.some((action) => action.page === 'agents' && action.action === 'create-ai' && action.label === 'AI Create Agent'),
    `Expected visible suggested actions to include AI Create Agent, got ${result.suggestedActions.map((action) => action.label).join(', ')}`
  )
})

for (const scenario of [
  { prompt: 'Create an agent that prepares customer briefs', labels: ['AI Create Agent'] },
  { prompt: 'Build an assistant for municipal permit intake', labels: ['AI Create Agent'] },
  { prompt: 'Generate a specialist for release triage', labels: ['AI Create Agent'] },
  { prompt: 'Create a team of agents for customer onboarding', labels: ['AI Create Team Template'] },
  { prompt: 'Design a company of agents for sales and delivery', labels: ['AI Create Company Template'] },
  { prompt: 'Set up a workflow for weekly customer reviews', labels: ['AI Create Workflow'] },
  { prompt: 'Draft a skill for the customer support API', labels: ['AI Create Skill'] },
  { prompt: 'Create a team of agents with a workflow and a skill for customer onboarding', labels: ['AI Create Team Template', 'AI Create Workflow', 'AI Create Skill'] },
  { prompt: 'Build an agent, a workflow, and a skill for customer onboarding', labels: ['AI Create Agent', 'AI Create Workflow', 'AI Create Skill'] },
]) {
  test(`builder always exposes the required AI Create option: ${scenario.prompt}`, () => {
    const result = buildAiBuilderRecommendation(scenario.prompt)
    const actions = result.suggestedActions
    const labels = actions.map((action) => action.label)
    for (const label of scenario.labels) {
      assert(labels.includes(label), `Expected ${label}, got ${labels.join(', ')}`)
      const action = actions.find((candidate) => candidate.label === label)
      assert.equal(action?.action, 'create-ai', `Expected ${label} to use the create-ai action`)
      assert.equal(action?.prefillPrompt, scenario.prompt, `Expected ${label} to preserve the original prompt`)
    }
  })
}

for (const scenario of [
  { prompt: 'Use my existing research agent for customer briefs', forbiddenLabel: 'AI Create Agent' },
  { prompt: 'Update my current research agent for customer briefs', forbiddenLabel: 'AI Create Agent' },
  { prompt: 'Use my existing workflow for weekly customer reviews', forbiddenLabel: 'AI Create Workflow' },
  { prompt: 'Refine my current workflow for weekly customer reviews', forbiddenLabel: 'AI Create Workflow' },
  { prompt: 'Improve this skill for the customer support API', forbiddenLabel: 'AI Create Skill' },
  { prompt: 'How do I create a workflow?', forbiddenLabel: 'AI Create Workflow' },
  { prompt: 'Can an agent create a workflow?', forbiddenLabel: 'AI Create Workflow' },
]) {
  test(`builder does not force an AI Create option for non-create intent: ${scenario.prompt}`, () => {
    assert.deepEqual(requiredAiBuilderCreateTargets(scenario.prompt), [])
    const result = buildAiBuilderRecommendation(scenario.prompt)
    const labels = result.suggestedActions.map((action) => action.label)
    assert(!labels.includes(scenario.forbiddenLabel), `Did not expect ${scenario.forbiddenLabel}, got ${labels.join(', ')}`)
  })
}
