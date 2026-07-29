import assert from 'assert'
import { applyOptimizeAssistantText } from './optimizeAssistant'

const context = {
  agents: [{ id: 'research-agent', name: 'Research Agent' }],
  workflows: [{ id: 'daily-report', name: 'Daily Report' }],
  groups: [],
  communities: [],
}

const draft: any = {
  id: 'plan-1',
  kind: 'optimization-plan',
  name: 'Plan',
  description: 'Optimize representative work.',
  tags: [],
  enabled: true,
  createdAt: '',
  updatedAt: '',
  fields: {
    scope: 'workflow',
    targetIds: [],
    optimizationGoal: 'balanced',
    monthlyTokenBudget: 1_000_000,
    monthlyCostBudget: 25,
    perRunTokenBudget: 25_000,
    perRunCostBudget: 1,
    maximumRunDurationSeconds: 300,
    minimumQualityScore: 80,
    automaticModelSelection: false,
    modelPriority: 'balanced',
    recommendedModel: '',
    recommendedSchedule: '',
    rationale: '',
  },
}

const result = applyOptimizeAssistantText(
  draft,
  `Workflow: Daily Report
Priority: cost
Monthly token budget: 500k
Monthly cost budget: $20
Per-run token budget: 10k
Per-run cost budget: $0.75
Maximum run duration: 2 minutes
Minimum quality score: 88
Automatic model selection
Model priority: cost
Recommended model: openai/gpt-4o-mini
Recommended schedule: Run once daily
Rationale: Preserve quality while lowering recurring cost.`,
  context,
)

assert.strictEqual((result.draft as any).fields.scope, 'workflow')
assert.deepStrictEqual((result.draft as any).fields.targetIds, ['daily-report'])
assert.strictEqual((result.draft as any).fields.optimizationGoal, 'cost')
assert.strictEqual((result.draft as any).fields.monthlyTokenBudget, 500_000)
assert.strictEqual((result.draft as any).fields.monthlyCostBudget, 20)
assert.strictEqual((result.draft as any).fields.perRunTokenBudget, 10_000)
assert.strictEqual((result.draft as any).fields.perRunCostBudget, 0.75)
assert.strictEqual((result.draft as any).fields.maximumRunDurationSeconds, 120)
assert.strictEqual((result.draft as any).fields.minimumQualityScore, 88)
assert.strictEqual((result.draft as any).fields.automaticModelSelection, true)
assert.strictEqual((result.draft as any).fields.modelPriority, 'cost')
assert.strictEqual((result.draft as any).fields.recommendedModel, 'openai/gpt-4o-mini')
assert.strictEqual((result.draft as any).fields.recommendedSchedule, 'Run once daily')
assert(result.changes.length >= 10)

const workspaceResult = applyOptimizeAssistantText(
  draft,
  'Use a workspace plan with a balanced priority and disable automatic model selection.',
  context,
)
assert.strictEqual((workspaceResult.draft as any).fields.scope, 'workspace')
assert.deepStrictEqual((workspaceResult.draft as any).fields.targetIds, [])
assert.strictEqual((workspaceResult.draft as any).fields.automaticModelSelection, false)

console.log('optimizeAssistant.test.ts: 17 tests passed')
