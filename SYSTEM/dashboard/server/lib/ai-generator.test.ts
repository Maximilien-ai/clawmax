import assert from 'assert'
import { applyGeneratedWorkflowHandoffs, enforceVisibleCompanyWorkflowChain, extractJsonResponseText, normalizeGeneratedSkillScaffold, normalizeGeneratedWorkflowReferences, parseJsonResponse } from './ai-generator'

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

console.log('\n========================================')
console.log(`Tests passed: ${passed}`)
console.log(`Tests failed: ${failed}`)
console.log('========================================\n')

if (failed > 0) {
  process.exit(1)
}

console.log('\x1b[32mAll tests passed\x1b[0m')
