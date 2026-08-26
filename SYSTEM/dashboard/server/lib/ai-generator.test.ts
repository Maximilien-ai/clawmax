import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  applyCompanyWorkflowExecutionDefaults,
  buildGeneratedExecutionSubteam,
  applyGeneratedWorkflowHandoffs,
  buildPromptExpansionSystemPrompt,
  isUsablePromptExpansion,
  buildFallbackPromptExpansion,
  TEMPLATE_GENERATION_TIMEOUT_MS,
  buildResolvedModelRequestOptions,
  createAiGenerationClient,
  createChatCompletionWithCompatibilityRetry,
  ensureGeneratedCompanyRoot,
  enforceVisibleCompanyWorkflowChain,
  explainOneTimeCronLimitation,
  extractJsonResponseText,
  isOneTimeScheduleRequest,
  normalizeGeneratedSkillScaffold,
  normalizeGeneratedAgentMeta,
  normalizeGeneratedWorkflowReferences,
  normalizePromptExpansionFormat,
  normalizePromptExpansionTarget,
  normalizeTemplateGenerationTarget,
  parseJsonResponse,
  resolveSystemGenerationModelForProvider,
  resolveOpenAiCompatibleGenerationDefaults,
  setRequestByokKeys,
  shouldUseMaxCompletionTokens,
  shouldGenerateCompanyTemplate,
  validateAiGenerationProviderKeys,
} from './ai-generator'

let passed = 0
let failed = 0
const pendingTests: Array<() => Promise<void>> = []

function test(name: string, fn: () => void | Promise<void>) {
  const run = async () => {
    try {
      await fn()
      console.log(`\x1b[32m✓\x1b[0m ${name}`)
      passed++
    } catch (err: any) {
      console.error(`\x1b[31m✗\x1b[0m ${name}`)
      console.error(err?.stack || err)
      failed++
    }
  }
  pendingTests.push(run)
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

test('normalize template and prompt expansion helpers coerce unsupported values to safe defaults', () => {
  assert.strictEqual(normalizeTemplateGenerationTarget('company'), 'company')
  assert.strictEqual(normalizeTemplateGenerationTarget('weird'), 'team')
  assert.strictEqual(normalizePromptExpansionTarget('agent'), 'agent')
  assert.strictEqual(normalizePromptExpansionTarget('nonsense'), 'template')
  assert.strictEqual(normalizePromptExpansionFormat('text'), 'text')
  assert.strictEqual(normalizePromptExpansionFormat('html'), 'markdown')
})

test('buildPromptExpansionSystemPrompt includes target, format, and optional guidance', () => {
  const prompt = buildPromptExpansionSystemPrompt('workflow', 'text', 'Prefer step-by-step output')
  assert.match(prompt, /workflow generation wizard/i)
  assert.match(prompt, /plain text paragraphs/i)
  assert.match(prompt, /Prefer step-by-step output/i)
})

test('prompt expansion instructions prevent echoing the seed or retry meta-instruction', () => {
  const prompt = buildPromptExpansionSystemPrompt('template', 'markdown', 'Do not return the original wording unchanged.')
  assert.match(prompt, /Do not mention that you are expanding or rewriting/i)
  assert.match(prompt, /directly edit and submit/i)
})

test('prompt expansion rejects echoed retry instructions and accepts substantive output', () => {
  const seed = 'Create a team to manage my books.'
  assert.strictEqual(
    isUsablePromptExpansion(seed, `Expand and rewrite this seed prompt into a more specific version while preserving intent:\n\n${seed}`),
    false,
  )
  assert.strictEqual(isUsablePromptExpansion(seed, seed), false)
  assert.strictEqual(
    isUsablePromptExpansion(seed, 'Create an accounting team with reconciliation, approvals, monthly close, and audit-ready reports.'),
    true,
  )
})

test('prompt expansion provides an editable fallback when the provider echoes the seed', () => {
  const fallback = buildFallbackPromptExpansion('Create a team to manage my books.', 'template', 'Prefer monthly close workflows.')
  assert(fallback.startsWith('Create a team to manage my books.'))
  assert.match(fallback, /Inputs and outputs/i)
  assert.match(fallback, /Prefer monthly close workflows/i)
})

test('template generation uses the longer bounded AI timeout', () => {
  assert.strictEqual(TEMPLATE_GENERATION_TIMEOUT_MS, 180000)
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

test('validateAiGenerationProviderKeys accepts Gemini developer keys and rejects OpenAI keys in the Gemini field', () => {
  assert.doesNotThrow(() => validateAiGenerationProviderKeys({
    gemini: 'AIza123456789012345678901234567890',
  } as any))
  assert.throws(
    () => validateAiGenerationProviderKeys({ gemini: 'sk-openai-key-value-1234567890' } as any),
    /OpenAI key, not a Gemini developer API key/i,
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

test('resolveSystemGenerationModelForProvider applies system preferred model when it matches the provider', () => {
  assert.strictEqual(
    resolveSystemGenerationModelForProvider('openai', 'openai/gpt-5', 'claude-sonnet-4-20250514'),
    'gpt-5',
  )
  assert.strictEqual(
    resolveSystemGenerationModelForProvider('anthropic', 'anthropic/claude-opus-4-6', 'claude-sonnet-4-20250514'),
    'claude-opus-4-6',
  )
  assert.strictEqual(
    resolveSystemGenerationModelForProvider('gemini', 'google/gemma-4-31b-it', 'claude-sonnet-4-20250514'),
    'gemma-4-31b-it',
  )
  assert.strictEqual(
    resolveSystemGenerationModelForProvider('openai-compatible', 'openai/gpt-5', 'claude-sonnet-4-20250514'),
    undefined,
  )
})

test('resolveSystemGenerationModelForProvider ignores unsupported or mismatched models', () => {
  assert.strictEqual(
    resolveSystemGenerationModelForProvider('openai', 'anthropic/claude-sonnet-4-20250514', 'claude-sonnet-4-20250514'),
    undefined,
  )
  assert.strictEqual(
    resolveSystemGenerationModelForProvider('anthropic', 'custom/model', 'claude-sonnet-4-20250514'),
    undefined,
  )
  assert.strictEqual(
    resolveSystemGenerationModelForProvider('gemini', 'google/gemma-4-31b-qat', 'claude-sonnet-4-20250514'),
    undefined,
  )
  assert.strictEqual(
    resolveSystemGenerationModelForProvider('gemini', 'openai/gpt-5.4', 'claude-sonnet-4-20250514'),
    undefined,
  )
})

test('shouldUseMaxCompletionTokens enables GPT-5 token compatibility', () => {
  setRequestByokKeys({ openai: 'sk-test-openai-key' } as any)
  assert.strictEqual(shouldUseMaxCompletionTokens('gpt-5'), true)
  assert.strictEqual(shouldUseMaxCompletionTokens('openai/gpt-5'), true)
  assert.strictEqual(shouldUseMaxCompletionTokens('gpt-4o'), false)
  setRequestByokKeys(undefined)
})

test('buildResolvedModelRequestOptions uses max_completion_tokens for GPT-5 and max_tokens otherwise', () => {
  setRequestByokKeys({ openai: 'sk-test-openai-key' } as any)
  const gpt5 = buildResolvedModelRequestOptions('gpt-5', 321)
  assert.strictEqual(gpt5.model, 'gpt-5')
  assert.strictEqual(gpt5.max_completion_tokens, 321)
  assert.strictEqual(gpt5.max_tokens, undefined)

  const gpt4o = buildResolvedModelRequestOptions('gpt-4o', 222)
  assert.strictEqual(gpt4o.model, 'gpt-4o')
  assert.strictEqual(gpt4o.max_tokens, 222)
  assert.strictEqual(gpt4o.max_completion_tokens, undefined)
  setRequestByokKeys(undefined)
})

test('buildResolvedModelRequestOptions selects Gemini when a Gemini BYOK key is provided', () => {
  setRequestByokKeys({ gemini: 'AIza123456789012345678901234567890' } as any)
  const options = buildResolvedModelRequestOptions('gpt-4o', 222)
  assert.strictEqual(options.model, 'gemini-2.5-flash')
  assert.strictEqual(options.max_tokens, 222)
  assert.strictEqual(options.max_completion_tokens, undefined)
  setRequestByokKeys(undefined)
})

test('createAiGenerationClient targets the official Gemini OpenAI-compatible endpoint', () => {
  setRequestByokKeys({
    openaiCompatibleBaseUrl: 'http://localhost:1234/v1',
    openaiCompatibleDefaultModel: 'lmstudio-default',
  } as any)
  try {
    const { client, model } = createAiGenerationClient({
      gemini: 'AIza123456789012345678901234567890',
    } as any)
    assert.strictEqual(client.baseURL, 'https://generativelanguage.googleapis.com/v1beta/openai/')
    assert.strictEqual(model, 'gemini-2.5-flash')
  } finally {
    setRequestByokKeys(undefined)
  }
})

test('createChatCompletionWithCompatibilityRetry retries unsupported max_tokens errors with max_completion_tokens', async () => {
  let calls = 0
  const client = {
    chat: {
      completions: {
        create: async (request: any) => {
          calls++
          if (calls === 1) {
            assert.strictEqual(request.max_tokens, 123)
            throw new Error("400 Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.")
          }
          assert.strictEqual(request.max_tokens, undefined)
          assert.strictEqual(request.max_completion_tokens, 123)
          return { choices: [{ message: { content: 'ok' } }] }
        }
      }
    }
  } as any

  const response = await createChatCompletionWithCompatibilityRetry(client, {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'hi' }],
    max_tokens: 123,
  })

  assert.strictEqual(calls, 2)
  assert.strictEqual(response.choices[0].message.content, 'ok')
})

test('createChatCompletionWithCompatibilityRetry omits temperature for GPT-5 requests', async () => {
  let capturedRequest: any = null
  const client = {
    chat: {
      completions: {
        create: async (request: any) => {
          capturedRequest = request
          return { choices: [{ message: { content: 'ok' } }] }
        }
      }
    }
  } as any

  setRequestByokKeys({ openai: 'sk-test-openai-key' } as any)
  const response = await createChatCompletionWithCompatibilityRetry(client, {
    model: 'gpt-5',
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0.7,
    max_completion_tokens: 123,
  })
  setRequestByokKeys(undefined)

  assert.strictEqual(capturedRequest.temperature, undefined)
  assert.strictEqual(response.choices[0].message.content, 'ok')
})

test('createChatCompletionWithCompatibilityRetry times out instead of hanging forever', async () => {
  const client = {
    chat: {
      completions: {
        create: async () => {
          await new Promise(() => {})
        }
      }
    }
  } as any

  await assert.rejects(
    () => createChatCompletionWithCompatibilityRetry(client, {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 32,
    }, 25),
    /timed out after 25ms/i,
  )
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
  assert.strictEqual(
    shouldGenerateCompanyTemplate('Create a team of agents to manage my startup books.', 'team'),
    false,
    'An explicit team target must not be upgraded to a company because the prompt mentions startup.',
  )
  assert.strictEqual(
    shouldGenerateCompanyTemplate('create team of agents to help me manage my startup books', 'team'),
    false,
    'Natural-language create team phrasing must remain a team even when startup is mentioned.',
  )
})

test('ensureGeneratedCompanyRoot inserts a root team and parents leadership when missing', () => {
  const teams = ensureGeneratedCompanyRoot([
    {
      id: 'leadership',
      name: 'Leadership',
      leaderAgentId: 'ceo',
      memberAgentIds: ['ceo'],
      tags: ['leadership'],
    },
    {
      id: 'ops',
      name: 'Ops',
      leaderAgentId: 'ops-lead',
      memberAgentIds: ['ops-lead'],
      tags: ['ops'],
    },
  ], 'Revenue Studio', true)

  assert.strictEqual(teams[0].id, 'revenue-studio', 'Expected synthesized root team id')
  assert(teams[0].tags.includes('org-root'), 'Expected org-root tag on synthesized root team')
  assert.strictEqual(teams[1].parentTeamId, 'revenue-studio', 'Expected leadership team to be parented to root')
})

test('ensureGeneratedCompanyRoot preserves an existing root-like team', () => {
  const teams = ensureGeneratedCompanyRoot([
    {
      id: 'company-root',
      name: 'Company',
      leaderAgentId: 'ceo',
      memberAgentIds: [],
      tags: ['company', 'org-root'],
    },
  ], 'Revenue Studio')

  assert.strictEqual(teams.length, 1, 'Expected existing root team to be preserved without duplication')
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

test('normalizeGeneratedAgentMeta replaces generic names with role-based names and inferred resend skills', () => {
  const normalized = normalizeGeneratedAgentMeta(
    'create a resend agent to test sending emails with resend skills',
    {
      name: 'New Agent',
      tags: ['assistant'],
      model: 'openai/gpt-4o-mini',
      skills: [],
    },
    ['clawmax-resend', 'resend', 'react-email', 'resend-cli', 'email-best-practices', 'agent-email-inbox', 'github'],
  )

  assert.strictEqual(normalized.name, 'resend-agent')
  assert(normalized.tags.includes('email'))
  assert(normalized.skills.includes('clawmax-resend'))
  assert(normalized.skills.includes('resend'))
  assert(normalized.skills.includes('react-email'))
})

test('normalizeGeneratedAgentMeta preserves an explicitly requested agent name over a model guess', () => {
  const normalized = normalizeGeneratedAgentMeta(
    'Create an agent named "EventScout" that finds sponsors when I ask it to.',
    {
      name: 'it-to',
      tags: ['events'],
      model: 'openai/gpt-5.4-mini',
      skills: [],
    },
  )

  assert.strictEqual(normalized.name, 'eventscout')
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

test('enforceVisibleCompanyWorkflowChain creates a visible linear dependency chain', () => {
  const workflows = enforceVisibleCompanyWorkflowChain([
    { id: 'kickoff', dependsOn: ['ignored'] },
    { id: 'plan', dependsOn: [] },
    { id: 'review', dependsOn: ['other'] },
  ])

  assert.deepStrictEqual(workflows[0].dependsOn, [])
  assert.deepStrictEqual(workflows[1].dependsOn, ['kickoff'])
  assert.deepStrictEqual(workflows[2].dependsOn, ['plan', 'other'])
})

test('normalizeGeneratedWorkflowReferences resolves aliases and strips self-dependencies', () => {
  const workflows = normalizeGeneratedWorkflowReferences([
    {
      id: 'leadership-kickoff',
      _sourceId: 'kickoff',
      _sourceName: 'Leadership Kickoff',
      dependsOn: [],
      inputRefs: [],
    },
    {
      id: 'execution-brief',
      _sourceId: 'brief',
      _sourceName: 'Execution Brief',
      dependsOn: ['kickoff', 'execution-brief'],
      inputRefs: [{ workflowId: 'Leadership Kickoff', outputKey: 'brief' }],
    },
  ])

  assert.deepStrictEqual(workflows[1].dependsOn, ['leadership-kickoff'], 'Expected alias dependency to normalize to workflow id')
  assert.deepStrictEqual(workflows[1].inputRefs, [{ workflowId: 'leadership-kickoff', outputKey: 'brief' }], 'Expected input refs to normalize aliases')
  assert.strictEqual('_sourceId' in workflows[1], false, 'Expected helper source fields to be stripped')
})

test('applyCompanyWorkflowExecutionDefaults rewrites company workflows to single-owner routed handoffs', () => {
  const workflows = applyCompanyWorkflowExecutionDefaults([
    {
      id: 'leadership-kickoff',
      name: 'Leadership Kickoff',
      description: 'Kickoff workflow',
      owner: '',
      targeting: { agents: [], groups: ['Leadership'], tags: ['leadership'], teamIds: [] },
      content: '# kickoff\n\nDescribe the work',
    },
    {
      id: 'ops-plan',
      name: 'Ops Plan',
      description: 'Plan workflow',
      owner: '',
      targeting: { agents: [], groups: ['Operations'], tags: ['ops'], teamIds: [] },
      content: '# ops\n\nPlan the work',
    },
  ], [
    { id: 'leadership', name: 'Leadership', leaderAgentId: 'ceo', memberAgentIds: ['ceo'] },
    { id: 'operations', name: 'Operations', leaderAgentId: 'ops-lead', memberAgentIds: ['ops-lead'] },
  ], [
    { name: 'Leadership' },
    { name: 'Operations' },
  ])

  assert.deepStrictEqual(workflows[0].targeting.agents, ['ceo'])
  assert.deepStrictEqual(workflows[0].targeting.groups, [])
  assert.deepStrictEqual(workflows[0].targeting.teamIds, ['leadership'])
  assert.match(workflows[0].content, /only required starting context/i)

  assert.deepStrictEqual(workflows[1].targeting.agents, ['ops-lead'])
  assert.match(workflows[1].content, /latest approved markdown handoff/i)
  assert.match(workflows[1].content, /Operations team/i)
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

test('buildGeneratedExecutionSubteam skips empty execution leaves and keeps members when present', () => {
  assert.strictEqual(
    buildGeneratedExecutionSubteam({
      id: 'engineering',
      name: 'Engineering',
      leaderAgentId: 'eng-lead',
      memberAgentIds: [],
    }),
    null,
    'Expected no execution subteam when the parent has no members beyond the leader'
  )

  const execution = buildGeneratedExecutionSubteam({
    id: 'delivery',
    name: 'Delivery',
    leaderAgentId: 'delivery-lead',
    memberAgentIds: ['operator-a', 'operator-b', 'operator-c'],
  }) as any

  assert(execution, 'Expected execution subteam when parent has members')
  assert.strictEqual(execution.id, 'delivery-execution')
  assert.strictEqual(execution.parentTeamId, 'delivery')
  assert.deepStrictEqual(execution.memberAgentIds, ['operator-a', 'operator-b'])
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

async function runTests() {
  for (const run of pendingTests) {
    await run()
  }

  console.log('\n========================================')
  console.log(`Tests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  console.log('========================================\n')

  if (failed > 0) {
    process.exit(1)
  }

  console.log('\x1b[32mAll tests passed\x1b[0m')
}

void runTests()
