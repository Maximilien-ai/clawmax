import assert from 'assert'
import { assessPluginUsageRecord } from './plugin-usage-monitor'
import type { GenericPluginRecord, PluginUsageMonitoringContract } from './plugin-system'
import type { WorkspaceMetering } from './metering'

const contract: PluginUsageMonitoringContract = {
  kind: 'metering-budget',
  intervalMinutes: 15,
  fields: {
    scope: 'scope', targetIds: 'targetIds', tokenBudget: 'tokenBudget', costBudget: 'costBudget',
    currentTokens: 'currentTokens', currentCost: 'currentCost', state: 'monitoringState',
    summary: 'monitoringSummary', lastAssessedAt: 'lastAssessedAt', nextAssessmentAt: 'nextAssessmentAt',
  },
}

const metering: WorkspaceMetering = {
  totalTraces: 7,
  totalInputTokens: 600,
  totalOutputTokens: 400,
  totalTokens: 1000,
  estimatedCostUsd: 4,
  dailyCost: [],
  costSummary: { todayCostUsd: 1, last7dCostUsd: 4, avgDailyCostUsd: 1 },
  byAgent: [{
    agentId: 'agent-a', agentName: 'A', agentTags: [], agentType: 'user', isBuiltIn: false,
    totalCalls: 3, totalInputTokens: 300, totalOutputTokens: 200, totalTokens: 500,
    estimatedCostUsd: 2, avgDurationMs: 100, lastActivity: '2026-08-19T00:00:00.000Z', models: {},
  }],
  byWorkflow: [{
    workflowId: 'workflow-a', workflowName: 'A', totalRuns: 2, totalTokens: 900,
    estimatedCostUsd: 3.5, avgDurationMs: 100, lastRun: '2026-08-19T00:00:00.000Z',
  }],
  period: 'month',
}

function record(fields: GenericPluginRecord['fields']): GenericPluginRecord {
  return {
    id: 'plan-a', kind: 'plan', name: 'Plan', description: '', tags: [], enabled: true,
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', fields,
  }
}

const now = new Date('2026-08-19T12:00:00.000Z')

const workspace = assessPluginUsageRecord(contract, record({
  scope: 'workspace', targetIds: [], tokenBudget: 2000, costBudget: 10,
}), metering, now)
assert.strictEqual(workspace.currentTokens, 1000)
assert.strictEqual(workspace.currentCost, 4)
assert.strictEqual(workspace.monitoringState, 'on-track')
assert.strictEqual(workspace.lastAssessedAt, now.toISOString())
assert.strictEqual(workspace.nextAssessmentAt, '2026-08-19T12:15:00.000Z')

const agent = assessPluginUsageRecord(contract, record({
  scope: 'agent', targetIds: ['agent-a'], tokenBudget: 600, costBudget: 2,
}), metering, now)
assert.strictEqual(agent.currentTokens, 500)
assert.strictEqual(agent.monitoringState, 'over-budget')

const workflow = assessPluginUsageRecord(contract, record({
  scope: 'workflow', targetIds: ['workflow-a'], tokenBudget: 1000, costBudget: 10,
}), metering, now)
assert.strictEqual(workflow.currentTokens, 900)
assert.strictEqual(workflow.monitoringState, 'approaching-budget')

const untargeted = assessPluginUsageRecord(contract, record({
  scope: 'agent', targetIds: [], tokenBudget: 1000, costBudget: 10,
}), metering, now)
assert.strictEqual(untargeted.monitoringState, 'needs-target')
assert(String(untargeted.monitoringSummary).includes('Choose at least one target'))

const missing = assessPluginUsageRecord(contract, record({
  scope: 'workflow', targetIds: ['missing'], tokenBudget: 1000, costBudget: 10,
}), metering, now)
assert.strictEqual(missing.monitoringState, 'no-data')

console.log('plugin-usage-monitor.test.ts: 18 assertions passed')
