import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  applyCompanyWorkflowExecutionDefaults,
  applyGeneratedWorkflowHandoffs,
  buildPromptExpansionSystemPrompt,
  ensureGeneratedCompanyRoot,
  enforceVisibleCompanyWorkflowChain,
  explainOneTimeCronLimitation,
  extractJsonResponseText,
  isOneTimeScheduleRequest,
  normalizeGeneratedSkillScaffold,
  normalizeGeneratedWorkflowReferences,
  normalizePromptExpansionFormat,
  normalizePromptExpansionTarget,
  parseJsonResponse,
  resolveOpenAiCompatibleGenerationDefaults,
  shouldGenerateCompanyTemplate,
  validateAiGenerationProviderKeys,
} from './ai-generator'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`\x1b[32m✓\x1b[0m ${name}`)
    passed++
  } catch (err: any) {
    console.error(`\x1b[31m✗\x1b[0m ${name}`)
    console.error(err?.stack || err)
    failed++
  }
}

console.log('\n\x1b[33m=== AI Generator Test Suite ===\x1b[0m\n')

test('extractJsonResponseText strips fenced json blocks', () => {
  const raw = '```json\n{ "name": "agent" }\n```'
  assert.strictEqual(extractJsonResponseText(raw), '{ "name": "agent" }')
})

test('parseJsonResponse parses fenced json payloads', () => {
  const raw = '```json\n{ "role": "assistant", "emoji": "🤖" }\n```'
  const parsed = parseJsonResponse(raw, {} as { role?: string; emoji?: string })
  assert.strictEqual(parsed.role, 'assistant')
  assert.strictEqual(parsed.emoji, '🤖')
})

test('parseJsonResponse returns fallback on invalid json', () => {
  const fallback = { cron: '', explanation: '' }
  const parsed = parseJsonResponse('not json at all', fallback)
  assert.deepStrictEqual(parsed, fallback)
})

test('isOneTimeScheduleRequest detects one-time cron requests', () => {
  assert.strictEqual(isOneTimeScheduleRequest('Run it just once today at 4 pm'), true)
  assert.strictEqual(isOneTimeScheduleRequest('one-time run tomorrow morning'), true)
  assert.strictEqual(isOneTimeScheduleRequest('every weekday at 9am'), false)
})

test('explainOneTimeCronLimitation returns actionable guidance', () => {
  assert.match(explainOneTimeCronLimitation(), /Cron expressions always repeat/i)
  assert.match(explainOneTimeCronLimitation(), /manually/i)
})

test('validateAiGenerationProviderKeys rejects OpenAI subscription or session-style credentials', () => {
  assert.throws(
    () => validateAiGenerationProviderKeys({ openai: 'sess_demo_subscription_key' } as any),
    /OpenAI developer API key|Subscription or app credentials/i
  )
})

test('validateAiGenerationProviderKeys rejects Anthropic non-developer credentials', () => {
  assert.throws(
    () => validateAiGenerationProviderKeys({ anthropic: 'ya29.subscription-token-demo' } as any),
    /Anthropic subscription or app credentials cannot be used here/i
  )
})

test('validateAiGenerationProviderKeys rejects provider mismatches with a clear message', () => {
  assert.throws(
    () => validateAiGenerationProviderKeys({ openai: 'sk-ant-demo-key-value' } as any),
    /looks like a Anthropic key, not a OpenAI developer API key/i
  )
})

test('resolveOpenAiCompatibleGenerationDefaults falls back to workspace integrations', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-ai-generator-'))
  const originalHome = process.env.HOME
  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  const workspace = path.join(tmpHome, '.openclaw', 'workspace')
  try {
    process.env.HOME = tmpHome
    process.env.OPENCLAW_WORKSPACE = workspace
    fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(workspace, 'SYSTEM', 'integrations.json'), JSON.stringify({
      openaiCompatibleBaseUrl: 'http://host.containers.internal:1234/v1',
      openaiCompatibleDefaultModel: 'lmstudio-default',
    }, null, 2), 'utf-8')
    const resolved = resolveOpenAiCompatibleGenerationDefaults()
    assert.strictEqual(resolved.baseUrl, 'http://host.containers.internal:1234/v1')
    assert.strictEqual(resolved.defaultModel, 'lmstudio-default')
  } finally {
    if (originalHome === undefined) delete process.env.HOME
    else process.env.HOME = originalHome
    if (originalWorkspace === undefined) delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  }
})

test('shouldGenerateCompanyTemplate infers company from prompt unless agent is explicit', () => {
  assert.strictEqual(
    shouldGenerateCompanyTemplate('A B2B SaaS conversion company with leadership, offer strategy, outbound, and delivery teams.', 'team'),
    true
  )
  assert.strictEqual(
    shouldGenerateCompanyTemplate('A B2B SaaS conversion operation with leadership, research, outbound sales, client delivery, and operations workflows.', 'team'),
    true
  )
  assert.strictEqual(
    shouldGenerateCompanyTemplate('A B2B SaaS conversion company with leadership, offer strategy, outbound, and delivery teams.', 'agent'),
    false
  )
  assert.strictEqual(
    shouldGenerateCompanyTemplate('A leadership specialist that writes project briefs.', 'team'),
    false
  )
})

test('normalizeGeneratedSkillScaffold sanitizes skill ids and fills defaults', () => {
  const normalized = normalizeGeneratedSkillScaffold({
    name: 'My Fancy Skill!!!',
    content: '',
  }, 'help summarize pii docs')

  assert.strictEqual(normalized.name, 'my-fancy-skill')
  assert.strictEqual(typeof normalized.description, 'string')
  assert.strictEqual(normalized.emoji, '🛠️')
  assert(normalized.content.includes('## Purpose'))
})

test('normalizeGeneratedSkillScaffold derives a better name when the model returns custom-skill', () => {
  const normalized = normalizeGeneratedSkillScaffold({
    name: 'custom-skill',
    description: 'Research startup competitors and summarize market positioning',
  }, 'Create a skill that researches startup competitors and summarizes positioning')

  assert.notStrictEqual(normalized.name, 'custom-skill')
  assert.strictEqual(normalized.name, 'research-startup-competitors-summarize-market')
})

test('applyGeneratedWorkflowHandoffs infers markdown outputs and dependency inputs', () => {
  const workflows = applyGeneratedWorkflowHandoffs([
    {
      id: 'leadership-kickoff',
      name: 'Leadership Kickoff',
      description: 'Set direction and issue the initial company brief.',
      dependsOn: [],
    },
    {
      id: 'execution-brief',
      name: 'Execution Brief',
      description: 'Turn leadership direction into an execution plan.',
      dependsOn: ['leadership-kickoff'],
    },
    {
      id: 'qa-review',
      name: 'QA Review',
      description: 'Review readiness and produce a release summary.',
      dependsOn: ['execution-brief'],
    },
  ])

  assert.strictEqual(workflows[0].outputDefinitions?.[0]?.type, 'markdown')
  assert.strictEqual(workflows[0].outputDefinitions?.[0]?.key, 'brief')
  assert.strictEqual(workflows[1].outputDefinitions?.[0]?.key, 'plan')
  assert.strictEqual(workflows[2].outputDefinitions?.[0]?.key, 'summary')
  assert.deepStrictEqual(workflows[1].inputRefs, [
    {
      workflowId: 'leadership-kickoff',
      outputKey: 'brief',
      label: 'Leadership Kickoff Output',
      required: true,
    },
  ])
  assert.deepStrictEqual(workflows[2].inputRefs, [
    {
      workflowId: 'execution-brief',
      outputKey: 'plan',
      label: 'Execution Brief Output',
      required: true,
    },
  ])
})

test('applyGeneratedWorkflowHandoffs preserves explicit workflow contracts', () => {
  const workflows = applyGeneratedWorkflowHandoffs([
    {
      id: 'leadership-kickoff',
      name: 'Leadership Kickoff',
      outputDefinitions: [{ key: 'leadership-brief', label: 'Leadership Brief', type: 'markdown' }],
    },
    {
      id: 'execution-brief',
      name: 'Execution Brief',
      dependsOn: ['leadership-kickoff'],
      inputRefs: [{ workflowId: 'leadership-kickoff', outputKey: 'leadership-brief', label: 'Leadership Brief', required: true }],
      outputDefinitions: [{ key: 'execution-plan', label: 'Execution Plan', type: 'markdown' }],
    },
  ])

  assert.strictEqual(workflows[0].outputDefinitions?.[0]?.key, 'leadership-brief')
  assert.strictEqual(workflows[1].outputDefinitions?.[0]?.key, 'execution-plan')
  assert.deepStrictEqual(workflows[1].inputRefs, [
    {
      workflowId: 'leadership-kickoff',
      outputKey: 'leadership-brief',
      label: 'Leadership Brief',
      required: true,
    },
  ])
})

test('enforceVisibleCompanyWorkflowChain makes company workflows progress step to step', () => {
  const workflows = enforceVisibleCompanyWorkflowChain([
    {
      id: 'kickoff',
      name: 'Kickoff Meeting',
      dependsOn: [],
    },
    {
      id: 'strategy',
      name: 'Strategy Brief Development',
    },
    {
      id: 'delivery',
      name: 'Delivery Plan and Execution',
      dependsOn: ['kickoff'],
    },
    {
      id: 'revenue',
      name: 'Weekly Revenue Summary',
    },
  ])

  assert.deepStrictEqual(workflows[0].dependsOn, [])
  assert.deepStrictEqual(workflows[1].dependsOn, ['kickoff'])
  assert.deepStrictEqual(workflows[2].dependsOn, ['strategy', 'kickoff'])
  assert.deepStrictEqual(workflows[3].dependsOn, ['delivery'])
})

test('normalizeGeneratedWorkflowReferences remaps stale dependency aliases to normalized workflow ids', () => {
  const workflows = normalizeGeneratedWorkflowReferences([
    {
      _sourceId: 'project-kickoff',
      _sourceName: 'Project Kickoff',
      id: 'project-kickoff',
      name: 'Project Kickoff',
      dependsOn: [],
    },
    {
      _sourceId: 'strategy-brief-creation',
      _sourceName: 'Create Strategy Brief',
      id: 'create-strategy-brief',
      name: 'Create Strategy Brief',
      dependsOn: ['project-kickoff'],
    },
    {
      _sourceId: 'icp-lead-list-outreach',
      _sourceName: 'Develop ICP, Lead List, and Outreach',
      id: 'develop-icp-lead-list-and-outreach',
      name: 'Develop ICP, Lead List, and Outreach',
      dependsOn: ['strategy-brief-creation'],
    },
    {
      _sourceId: 'proposal-draft-delivery-plan',
      _sourceName: 'Draft Proposal and Delivery Plan',
      id: 'draft-proposal-and-delivery-plan',
      name: 'Draft Proposal and Delivery Plan',
      dependsOn: ['icp-lead-list-outreach'],
    },
  ])

  assert.deepStrictEqual(workflows[1].dependsOn, ['project-kickoff'])
  assert.deepStrictEqual(workflows[2].dependsOn, ['create-strategy-brief'])
  assert.deepStrictEqual(workflows[3].dependsOn, ['develop-icp-lead-list-and-outreach'])
})

test('normalizeGeneratedWorkflowReferences remaps shorthand kickoff and strategy aliases', () => {
  const workflows = normalizeGeneratedWorkflowReferences([
    {
      id: 'project-kickoff',
      name: 'Project Kickoff',
      dependsOn: [],
    },
    {
      id: 'develop-strategy-brief',
      name: 'Develop Strategy Brief',
      dependsOn: ['kickoff'],
      inputRefs: [{ workflowId: 'kickoff', outputKey: 'brief' }],
    },
    {
      id: 'conduct-market-research-and-develop-icp',
      name: 'Conduct Market Research and Develop ICP',
      dependsOn: ['strategy-brief'],
      inputRefs: [{ workflowId: 'strategy-brief', outputKey: 'plan' }],
    },
  ])

  assert.deepStrictEqual(workflows[1].dependsOn, ['project-kickoff'])
  assert.strictEqual(workflows[1].inputRefs?.[0]?.workflowId, 'project-kickoff')
  assert.deepStrictEqual(workflows[2].dependsOn, ['develop-strategy-brief'])
  assert.strictEqual(workflows[2].inputRefs?.[0]?.workflowId, 'develop-strategy-brief')
})

test('applyCompanyWorkflowExecutionDefaults routes company workflows to one team and leader', () => {
  const workflows = applyCompanyWorkflowExecutionDefaults([
    {
      id: 'b2b-leadership-kickoff',
      name: 'b2b-Leadership / Kickoff Meeting',
      description: 'Initiate the project with a kickoff meeting to align on goals and deliverables.',
      targeting: { agents: [], groups: ['b2b-Leadership'], tags: ['b2b'], communities: ['Conversion Catalyst'] },
      content: 'Long kickoff instructions\nwith many lines\nand repeated context\nthat should be trimmed.',
    },
    {
      id: 'client-delivery-plan',
      name: 'Client Delivery / Proposal and Delivery Plan Drafting',
      description: 'Draft a proposal and a detailed delivery plan for the client project.',
      targeting: { agents: [], groups: ['Client Delivery'], tags: ['b2b'], communities: ['Conversion Catalyst'] },
      content: 'Long delivery instructions\nwith many lines\nand repeated context\nthat should be trimmed.',
    },
  ], [
    { id: 'leadership', name: 'Leadership', leaderAgentId: 'b2b-ceo' },
    { id: 'client-delivery', name: 'Client Delivery', leaderAgentId: 'b2b-client-delivery-manager' },
  ], [
    { name: 'b2b-Leadership' },
    { name: 'Client Delivery' },
  ])

  assert.deepStrictEqual(workflows[0].targeting.teamIds, ['leadership'])
  assert.deepStrictEqual(workflows[1].targeting.teamIds, ['client-delivery'])
  assert.strictEqual(workflows[0].owner, 'b2b-ceo')
  assert.strictEqual(workflows[1].owner, 'b2b-client-delivery-manager')
  assert.deepStrictEqual(workflows[0].targeting.communities, [])
  assert.deepStrictEqual(workflows[0].targeting.groups, [])
  assert.deepStrictEqual(workflows[0].targeting.agents, ['b2b-ceo'])
  assert.deepStrictEqual(workflows[0].targeting.tags, [])
  assert(workflows[0].content.includes('company brief'), 'Expected compact kickoff content to include brief guidance')
  assert(workflows[1].content.includes('latest approved markdown handoff'), 'Expected downstream workflow to consume prior handoff')
})

test('applyCompanyWorkflowExecutionDefaults prefers owner over broad explicit agent lists when no teams exist', () => {
  const workflows = applyCompanyWorkflowExecutionDefaults([
    {
      id: 'legacy-b2b-kickoff',
      name: 'b2b-Leadership / Kickoff Meeting',
      owner: 'b2b-ceo',
      targeting: {
        agents: ['b2b-ceo', 'b2b-client-delivery-manager', 'b2b-offer-strategist'],
        groups: ['b2b-Leadership'],
        tags: ['b2b'],
        communities: ['Conversion Optimizers'],
      },
      content: 'Legacy broad kickoff instructions',
    },
  ], [], [])

  assert.strictEqual(workflows[0].owner, 'b2b-ceo')
  assert.deepStrictEqual(workflows[0].targeting.agents, ['b2b-ceo'])
  assert.deepStrictEqual(workflows[0].targeting.groups, [])
  assert.deepStrictEqual(workflows[0].targeting.communities, [])
  assert.deepStrictEqual(workflows[0].targeting.tags, [])
})

test('ensureGeneratedCompanyRoot adds one explicit root above leadership', () => {
  const teams = ensureGeneratedCompanyRoot([
    {
      id: 'leadership',
      name: 'Leadership',
      leaderAgentId: 'ceo',
      memberAgentIds: ['ops'],
      tags: ['leadership'],
    },
    {
      id: 'research',
      name: 'Research',
      leaderAgentId: 'analyst',
      memberAgentIds: [],
      parentTeamId: 'leadership',
      tags: ['research'],
    },
  ], 'Conversion Catalyst Co.', true)

  const root = teams.find((team: any) => (team.tags || []).includes('org-root'))
  const leadership = teams.find((team: any) => team.id === 'leadership')

  assert(root, 'Expected generated company root')
  assert.strictEqual(root?.name, 'Conversion Catalyst Co.')
  assert.strictEqual(leadership?.parentTeamId, root?.id)
})

test('normalizePromptExpansionTarget falls back to template', () => {
  assert.strictEqual(normalizePromptExpansionTarget('agent'), 'agent')
  assert.strictEqual(normalizePromptExpansionTarget('workflow'), 'workflow')
  assert.strictEqual(normalizePromptExpansionTarget('skill'), 'skill')
  assert.strictEqual(normalizePromptExpansionTarget('weird'), 'template')
})

test('normalizePromptExpansionFormat defaults to markdown', () => {
  assert.strictEqual(normalizePromptExpansionFormat('markdown'), 'markdown')
  assert.strictEqual(normalizePromptExpansionFormat('text'), 'text')
  assert.strictEqual(normalizePromptExpansionFormat('unknown'), 'markdown')
})

test('buildPromptExpansionSystemPrompt reflects requested format', () => {
  const markdownPrompt = buildPromptExpansionSystemPrompt('skill', 'markdown')
  const textPrompt = buildPromptExpansionSystemPrompt('agent', 'text')
  const guidedPrompt = buildPromptExpansionSystemPrompt('template', 'markdown', 'Make it shorter and emphasize testing.')

  assert.match(markdownPrompt, /editable markdown/i)
  assert.match(textPrompt, /plain text paragraphs/i)
  assert.match(markdownPrompt, /skill generation wizard/i)
  assert.match(textPrompt, /AI agent generation wizard/i)
  assert.match(guidedPrompt, /Additional user direction/i)
  assert.match(guidedPrompt, /Make it shorter and emphasize testing\./i)
})

console.log('\n========================================')
console.log(`Tests passed: ${passed}`)
console.log(`Tests failed: ${failed}`)
console.log('========================================\n')

if (failed > 0) {
  process.exit(1)
}

console.log('\x1b[32mAll tests passed\x1b[0m')
