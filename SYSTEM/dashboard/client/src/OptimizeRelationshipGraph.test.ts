import { deepStrictEqual } from 'assert'
import type { GenericPluginRecord } from './lib/plugins'
import { getOptimizationDimensions } from './lib/optimizeGraph'

function plan(overrides: Partial<GenericPluginRecord>): GenericPluginRecord {
  return {
    id: 'plan',
    kind: 'optimization-plan',
    name: 'Plan',
    description: '',
    tags: [],
    enabled: true,
    createdAt: '',
    updatedAt: '',
    fields: {
      optimizationGoal: 'balanced',
      monthlyTokenBudget: 1000000,
      monthlyCostBudget: 25,
      maximumRunDurationSeconds: 300,
      minimumQualityScore: 80,
      automaticModelSelection: true,
    },
    ...overrides,
  }
}

deepStrictEqual(
  getOptimizationDimensions(plan({
    name: 'Workflow latency plan',
    description: 'Reduce completion time while preserving output quality.',
    tags: ['workflow', 'speed', 'latency', 'quality'],
    fields: { optimizationGoal: 'speed' },
  })),
  ['Speed', 'Quality'],
  'Populated schema defaults must not make every attribute appear applicable.',
)

deepStrictEqual(
  getOptimizationDimensions(plan({
    name: 'Per-run efficiency plan',
    description: 'Keep each run within token and cost limits.',
    tags: ['workflow', 'tokens', 'cost'],
    fields: { optimizationGoal: 'tokens' },
  })),
  ['Tokens', 'Cost'],
  'Token and cost intent must produce only the relevant attributes.',
)

deepStrictEqual(
  getOptimizationDimensions(plan({
    name: 'Workflow schedule review',
    description: 'Reduce recurring workflow frequency within its budget.',
    tags: ['workflow', 'schedule', 'budget'],
    fields: { optimizationGoal: 'balanced' },
  })),
  ['Balanced', 'Cost', 'Schedule'],
  'Schedule suggestions must retain their goal, budget, and schedule attributes.',
)

deepStrictEqual(
  getOptimizationDimensions(plan({
    name: 'Quality-preserving model plan',
    description: 'Preserve correctness while comparing model cost.',
    tags: ['agent', 'quality', 'model', 'cost'],
    fields: { optimizationGoal: 'quality' },
  })),
  ['Quality', 'Cost', 'Models'],
  'Quality model suggestions must identify quality, cost, and model intent.',
)

console.log('OptimizeRelationshipGraph.test.ts: 4 tests passed')
