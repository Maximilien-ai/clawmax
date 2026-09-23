import assert from 'assert'
import {
  __test, applyCompanyWorkflowExecutionDefaults, applyGeneratedWorkflowHandoffs,
  buildGeneratedExecutionSubteam, enforceVisibleCompanyWorkflowChain,
  ensureGeneratedCompanyRoot, normalizeGeneratedWorkflowReferences, normalizeGeneratedSkillScaffold,
  shouldGenerateCompanyTemplate,
} from './ai-generator'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    passed++
  } catch (err: any) {
    console.error(`${RED}✗${RESET} ${name}`)
    console.error(err?.stack || err)
    failed++
  }
}

console.log(`\n${YELLOW}=== AI Generator Internal Edge Test Suite ===${RESET}\n`)

test('template slug and channel humanization helpers normalize generated names', () => {
  assert.strictEqual(__test.slugifyGeneratedTemplateValue('  Revenue Ops Studio!!  '), 'revenue-ops-studio')
  assert.strictEqual(__test.slugifyGeneratedTemplateValue('???', 'fallback-id'), 'fallback-id')
  assert.strictEqual(__test.humanizeGeneratedChannelName('client_delivery_hub'), 'Client Delivery Hub')
  assert.strictEqual(__test.humanizeGeneratedChannelName('', 'Fallback Team'), 'Fallback Team')
})

test('prompt URL extraction de-duplicates repeated URLs', () => {
  const urls = __test.extractPromptUrls('Use https://example.com/a and https://example.com/a plus https://example.com/b).')
  assert.deepStrictEqual(urls, ['https://example.com/a', 'https://example.com/b'])
})

test('example summarization captures headings and grading style lines', () => {
  const summaries = __test.summarizePromptExamples([
    '## Example Camera',
    'Canon EOS R6 with 24-70 lens in good working order.',
    'Grade: A',
    '$125',
  ].join('\n'))
  assert(summaries.some((entry) => entry.includes('Example Camera: Canon EOS R6')), 'Expected heading summary')
  assert(summaries.includes('Grade: A'), 'Expected grade summary')
  assert(summaries.includes('$125'), 'Expected price summary')
})

test('style guidance infers formatting, concision, evidence, and human review cues', () => {
  const guidance = __test.inferStyleGuidanceFromPrompt(
    'Match the format exactly, keep it under 500 words, corroborate the claims, and provide alternatives for a human if unsure.'
  )
  assert(guidance.some((entry) => /style, structure, and tone/i.test(entry)), 'Expected format guidance')
  assert(guidance.some((entry) => /within any length limits/i.test(entry)), 'Expected length guidance')
  assert(guidance.some((entry) => /stay accurate and grounded/i.test(entry)), 'Expected evidence guidance')
  assert(guidance.some((entry) => /flag them clearly for human review/i.test(entry)), 'Expected human review guidance')
})

test('company naming and scalable parameter helpers infer sober defaults', () => {
  assert.strictEqual(__test.buildSoberCompanyName('We need a B2B SaaS conversion homepage system'), 'Homepage Conversion Studio')
  assert.strictEqual(__test.buildSoberCompanyName('Run outbound lead generation for our team'), 'Outbound Growth Studio')
  assert.strictEqual(__test.buildSoberCompanyName('Launch an ecommerce operations business'), 'Ecommerce Operating Studio')
  assert.strictEqual(__test.buildSoberCompanyName('Need a generic internal planning company'), 'Operating Company')

  const parameters = __test.buildScalableTeamParameters([
    { id: 'post-writer', role: 'Post Writer' },
    { id: 'market-analyst', role: 'Market Analyst' },
    { id: 'ops-lead', role: 'Operations Lead' },
  ], true)
  assert.strictEqual(parameters.length, 2, 'Expected only scalable specialist lanes')
  assert(parameters[0].label.includes('Post Writer'), 'Expected role-based parameter label')
  assert(parameters.every((entry: any) => entry.default === 2), 'Expected scaling defaults')
  assert.deepStrictEqual(__test.buildScalableTeamParameters([{ id: 'solo-writer', role: 'Writer' }], true), [], 'Expected no scaling params for fewer than two agents')
  assert.strictEqual(__test.roleImpliesScalableLane('Post Writer', 'post-writer'), true)
  assert.strictEqual(__test.roleImpliesScalableLane('Operations Lead', 'ops-lead'), false)
})

test('example-aware prompt context and workflow reference blocks reflect prompt cues', () => {
  const description = [
    'Build a revenue company with multiple product photos and examples.',
    'Match the format exactly and keep it under 500 words.',
    'Use https://example.com/reference as the source example.',
    '## Example Listing',
    'Sample product in good working order.',
  ].join('\n')

  const context = __test.buildExampleAwarePromptContext(description)
  assert(/Reference URLs provided by the user/i.test(context), 'Expected URL context')
  assert(/Example snippets and reference cues/i.test(context), 'Expected example context')
  assert(/Style and quality guidance inferred from the prompt/i.test(context), 'Expected style context')
  assert(/company-shaped template/i.test(context), 'Expected company inference context')

  const references = __test.buildWorkflowReferenceBlock(description)
  assert(/## References/.test(references), 'Expected reference block header')
  assert(/https:\/\/example.com\/reference/.test(references), 'Expected URL in reference block')
  assert(/Sample product in good working order/.test(references), 'Expected example cue in reference block')
})

test('prompt implication helpers detect scaling, company, revenue, and multi-community cues', () => {
  assert.strictEqual(__test.promptImpliesScaling('We have multiple products and many images to process.'), true)
  assert.strictEqual(__test.promptImpliesScaling('Handle one executive briefing.'), false)
  assert.strictEqual(__test.promptImpliesCompany('Build a startup sales pipeline company.'), true)
  assert.strictEqual(__test.promptImpliesCompany('Create a single research assistant.'), false)
  assert.strictEqual(__test.promptImpliesRevenue('Increase revenue with better outbound pricing and pipeline review.'), true)
  assert.strictEqual(__test.promptImpliesRevenue('Organize my reading list and project notes.'), false)
  assert.strictEqual(__test.promptExplicitlyRequestsMultipleCommunities('Use two communities with separate umbrellas for delivery and growth.'), true)
  assert.strictEqual(__test.promptExplicitlyRequestsMultipleCommunities('Use one shared company community.'), false)
})

test('workflow team inference maps groups, alias matches, leadership fallback, and default fallback', () => {
  const teams = [
    { id: 'leadership', name: 'Leadership' },
    { id: 'client-delivery', name: 'Client Delivery' },
    { id: 'research-ops', name: 'Research Ops' },
  ]
  const groups = [
    { name: 'Client Delivery' },
    { name: 'Research Ops' },
  ]

  assert.strictEqual(
    __test.inferCompanyWorkflowTeamId({ id: 'wf-1', targeting: { groups: ['Client Delivery'] } }, teams, groups),
    'client-delivery',
  )
  assert.strictEqual(
    __test.inferCompanyWorkflowTeamId({ id: 'research-summary', name: 'Research Summary', description: 'Research ops weekly brief' }, teams, groups),
    'research-ops',
  )
  assert.strictEqual(
    __test.inferCompanyWorkflowTeamId({ id: 'kickoff', name: 'Executive Kickoff Brief' }, teams, []),
    'leadership',
  )
  assert.strictEqual(
    __test.inferCompanyWorkflowTeamId({ id: 'misc-flow', name: 'Misc Flow' }, teams, []),
    'leadership',
  )
  assert.strictEqual(__test.normalizeGenerationName(' Client-Delivery / Weekly Brief '), 'client delivery weekly brief')
})

test('empty generated collections remain empty without inventing workflow resources', () => {
  for (const value of [undefined, null, {}, [], 'invalid']) {
    for (const normalize of [applyCompanyWorkflowExecutionDefaults, applyGeneratedWorkflowHandoffs, enforceVisibleCompanyWorkflowChain, normalizeGeneratedWorkflowReferences]) {
      assert.deepStrictEqual(normalize(value as any), [])
    }
    assert.strictEqual(ensureGeneratedCompanyRoot(value as any, 'Company'), value)
  }
  const singleton = [{ id: 'only' }]
  assert.strictEqual(enforceVisibleCompanyWorkflowChain(singleton), singleton)
  assert.strictEqual(buildGeneratedExecutionSubteam(undefined), null)
  assert.strictEqual(buildGeneratedExecutionSubteam(null), null)
  assert.strictEqual(buildGeneratedExecutionSubteam({ id: 'empty', name: 'Empty', memberAgentIds: ['', ''] }), null)
})

test('company root leader fallbacks preserve input ownership and revenue purpose', () => {
  for (const [teams, leader] of [
    [[{ id: 'leadership', memberAgentIds: ['member'] }], 'member'],
    [[{ id: 'ops', leaderAgentId: 'lead' }], 'lead'],
    [[{ id: 'ops', memberAgentIds: ['member'] }], 'member'],
    [[{ id: 'ops' }], undefined],
  ] as const) {
    const before = JSON.stringify(teams)
    const result = ensureGeneratedCompanyRoot(teams as any, '', true)
    assert.strictEqual(result[0].leaderAgentId, leader)
    assert.strictEqual(result[0].id, 'company')
    assert.strictEqual(result[0].name, 'Company')
    assert.match(result[0].purpose, /revenue/)
    assert.strictEqual(JSON.stringify(teams), before)
  }
  const root = [{ id: 'root', tags: ['company'] }]
  assert.strictEqual(ensureGeneratedCompanyRoot(root, 'Ignored'), root)
  assert.strictEqual(ensureGeneratedCompanyRoot([{ id: 'ops' }], '!!!')[0].id, 'company-root')
})

test('company inference respects explicit team scope and multi-function revenue context', () => {
  assert.strictEqual(shouldGenerateCompanyTemplate('create a team for revenue and research'), false)
  assert.strictEqual(shouldGenerateCompanyTemplate('revenue research marketing'), true)
  assert.strictEqual(shouldGenerateCompanyTemplate('several teams for reading'), true)
  assert.strictEqual(shouldGenerateCompanyTemplate('read a book'), false)
})

test('generated handoffs select output types, de-duplicate inferred keys and skip unknown dependencies', () => {
  const source = [
    { id: 'a', name: 'Delivery Plan' },
    { id: 'b', name: 'Milestone Plan' },
    { id: 'c', name: 'Execution Plan' },
    { id: 'd', name: 'Technical Spec' },
    { id: 'e', name: 'Launch Campaign' },
    { id: 'f', name: 'Review Summary' },
    { id: 'odd', dependsOn: ['missing'] },
    {},
  ]
  const before = JSON.stringify(source)
  const result = applyGeneratedWorkflowHandoffs(source)
  assert.deepStrictEqual(result.map((w) => w.outputDefinitions[0].key), ['plan', 'plan-2', 'plan-3', 'spec', 'launch-pack', 'summary', 'odd-output', 'workflow-output'])
  assert.strictEqual(result[6].inputRefs, undefined)
  assert.strictEqual(result[7].outputDefinitions[0].label, 'Workflow Output')
  assert.strictEqual(result[7].inputRefs[0].workflowId, 'odd')
  assert.strictEqual(JSON.stringify(source), before)
})

test('partial output definitions receive defaults while explicit contracts survive', () => {
  const result = applyGeneratedWorkflowHandoffs([
    { id: 'first', outputDefinitions: [{ key: ' ', label: ' ', help: 'Keep guidance' }, { key: 'secondary', type: 'json' }] },
    { outputDefinitions: [{}], inputRefs: [{ workflowId: 'external', outputKey: 'contract' }] },
  ])
  assert.strictEqual(result[0].outputDefinitions[0].key, 'first-output')
  assert.strictEqual(result[0].outputDefinitions[0].label, 'first Output')
  assert.strictEqual(result[0].outputDefinitions[0].help, 'Keep guidance')
  assert.strictEqual(result[0].outputDefinitions[1].type, 'json')
  assert.strictEqual(result[1].outputDefinitions[0].label, 'Workflow Output')
  assert.deepStrictEqual(result[1].inputRefs, [{ workflowId: 'external', outputKey: 'contract' }])
})

test('company workflow ownership falls back to unique explicit agents and preserves team IDs', () => {
  const result = applyCompanyWorkflowExecutionDefaults([
    { id: 'a', targeting: { agents: [' alpha ', '', 'alpha', 'beta'], teamIds: ['existing'], tags: ['broad'] } },
    { id: 'b', owner: ' owner ', content: 'one\ntwo\nthree\nfour\nfive' },
    { id: 'c' },
  ])
  assert.deepStrictEqual(result[0].targeting.agents, ['alpha', 'beta'])
  assert.deepStrictEqual(result[0].targeting.teamIds, ['existing'])
  assert.deepStrictEqual(result[0].targeting.tags, [])
  assert.strictEqual(result[0].owner, 'alpha')
  assert.strictEqual(result[1].owner, 'owner')
  assert(!result[1].content.includes('five'))
  assert.match(result[1].content, /previous workflow/)
  assert.strictEqual(result[2].owner, undefined)
  assert.deepStrictEqual(result[2].targeting.agents, [])
  assert.match(result[2].content, /final markdown deliverable/)
})

test('workflow aliases remove self/empty edges and retain external references', () => {
  const result = normalizeGeneratedWorkflowReferences([
    { id: 'research', name: 'ICP Research' },
    { id: 'proposal', name: 'Proposal' },
    { id: 'summary', name: 'Revenue Summary', _sourceId: 'legacy', dependsOn: ['market-research', 'outreach', 'revenue-summary', '', null, 'external', 'external'], inputRefs: [{}, { workflowId: 'legacy' }, { workflowId: 'outreach', outputKey: 'proposal' }, { workflowId: 'external' }] },
    {},
  ])
  assert.deepStrictEqual(result[2].dependsOn, ['research', 'proposal', 'external'])
  assert.deepStrictEqual(result[2].inputRefs, [{ workflowId: 'proposal', outputKey: 'proposal' }, { workflowId: 'external' }])
  assert(!('_sourceId' in result[2]))
  assert.deepStrictEqual(result[3].dependsOn, [])
  assert.deepStrictEqual(enforceVisibleCompanyWorkflowChain([{}, { id: 'second', dependsOn: ['', 'external'] }])[1].dependsOn, ['external'])
})

test('workflow team inference handles incomplete catalogs and picks the strongest alias match', () => {
  assert.strictEqual(__test.inferCompanyWorkflowTeamId({}), undefined)
  assert.strictEqual(__test.inferCompanyWorkflowTeamId({ id: 'kickoff' }, [{ id: 'ops' }]), undefined)
  assert.strictEqual(__test.inferCompanyWorkflowTeamId({ id: 'unmatched' }, [{ id: 'ops' }], [{}, { name: 'missing' }]), 'ops')
  assert.strictEqual(__test.inferCompanyWorkflowTeamId({ description: 'Research Team and ops' }, [
    { id: 'ops', name: 'Operations' }, { id: 'research', name: 'Research Team' }, {},
  ]), 'research')
})

test('reference blocks honor first/final placement and omit absent source material', () => {
  assert.strictEqual(__test.buildWorkflowReferenceBlock('https://example.test', { finalOnly: true }), '')
  assert.strictEqual(__test.buildWorkflowReferenceBlock('https://example.test', { firstOnly: true }), '')
  assert.match(__test.buildWorkflowReferenceBlock('https://example.test', { firstOnly: true, isFirst: true }), /References/)
  assert.match(__test.buildWorkflowReferenceBlock('Match the style', { finalOnly: true, isFinal: true }), /style guidance/)
  assert.strictEqual(__test.buildWorkflowReferenceBlock('Read a book'), '')
  assert.strictEqual(__test.buildExampleAwarePromptContext('Read a book'), '')
  assert.deepStrictEqual(__test.summarizePromptExamples('## Example\n## Notes'), ['Example'])
  assert.strictEqual(__test.humanizeGeneratedChannelName('Already Named'), 'Already Named')
})

test('scaling parameters cap lanes, fall back to IDs and disambiguate identical roles', () => {
  assert.deepStrictEqual(__test.buildScalableTeamParameters([], false), [])
  assert.deepStrictEqual(__test.buildScalableTeamParameters(null as any, true), [])
  const result = __test.buildScalableTeamParameters([
    { id: 'writer' }, { id: 'second', role: 'Writer' }, { id: 'third', role: 'Writer' }, { id: 'fourth', role: 'Writer' },
  ], true)
  assert.strictEqual(result.length, 3)
  assert.strictEqual(new Set(result.map((p) => p.label)).size, 3)
  assert(result.every((p) => p.min === 1 && p.max === 10 && p.default === 2))
  assert.strictEqual(__test.buildSoberCompanyName('landing page conversion'), 'Landing Page Growth Studio')
  assert.strictEqual(__test.buildSoberCompanyName('B2B SaaS conversion'), 'B2B SaaS Conversion Studio')
  assert.strictEqual(__test.buildSoberCompanyName('increase profit'), 'Revenue Operations Studio')
})

test('skill scaffolds safely default blank names and bound tags without replacing supplied content', () => {
  const empty = normalizeGeneratedSkillScaffold({}, '')
  assert.strictEqual(empty.name, 'custom-skill')
  assert.strictEqual(empty.description, 'AI-generated custom skill')
  assert.deepStrictEqual(empty.tags, [])
  assert.match(empty.content, /## Instructions/)
  const supplied = normalizeGeneratedSkillScaffold({ name: '!!!', tags: ['', 'a', 'b', 'c', 'd', 'e', 'f', 'g'], content: '  supplied instructions  ', emoji: 'X' }, '')
  assert.strictEqual(supplied.name, 'custom-skill')
  assert.strictEqual(supplied.content, 'supplied instructions')
  assert.strictEqual(supplied.emoji, 'X')
  assert.deepStrictEqual(supplied.tags, ['a', 'b', 'c', 'd', 'e', 'f'])
})

console.log('\n========================================')
console.log(`Tests passed: ${passed}`)
console.log(`Tests failed: ${failed}`)
console.log('========================================\n')

if (failed > 0) {
  process.exit(1)
}

console.log(`${GREEN}All tests passed${RESET}`)
