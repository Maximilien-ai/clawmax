import assert from 'assert'
import { __test } from './ai-generator'

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

console.log('\n========================================')
console.log(`Tests passed: ${passed}`)
console.log(`Tests failed: ${failed}`)
console.log('========================================\n')

if (failed > 0) {
  process.exit(1)
}

console.log(`${GREEN}All tests passed${RESET}`)
