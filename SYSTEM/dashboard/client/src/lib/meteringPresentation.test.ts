import assert from 'assert'
import { formatMeteringCost, formatMeteringTokens, summarizeMeteringByAgentType } from './meteringPresentation'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('summarizeMeteringByAgentType separates built-in and user agents', () => {
  const summary = summarizeMeteringByAgentType(
    [
      { agentId: 'builder-agent', agentType: 'built-in', isBuiltIn: true, totalCalls: 2, totalTokens: 1000, estimatedCostUsd: 0.12, avgDurationMs: 1000, lastActivity: '', models: {} },
      { agentId: 'chief-of-staff', agentType: 'built-in', isBuiltIn: true, totalCalls: 1, totalTokens: 500, estimatedCostUsd: 0.08, avgDurationMs: 1000, lastActivity: '', models: {} },
      { agentId: 'sales-lead', agentType: 'user', isBuiltIn: false, totalCalls: 3, totalTokens: 1500, estimatedCostUsd: 0.25, avgDurationMs: 1000, lastActivity: '', models: {} },
    ],
  )

  assert.equal(summary.builtInAgentCount, 2)
  assert.equal(summary.userAgentCount, 1)
  assert.equal(summary.builtInEstimatedCostUsd, 0.2)
  assert.equal(summary.userEstimatedCostUsd, 0.25)
})

test('summarizeMeteringByAgentType preserves tiny built-in costs for display', () => {
  const summary = summarizeMeteringByAgentType(
    [
      { agentId: 'builder-agent', agentType: 'built-in', isBuiltIn: true, totalCalls: 1, totalTokens: 42, estimatedCostUsd: 0.0004, avgDurationMs: 0, lastActivity: '', models: {} },
    ],
  )

  assert.equal(summary.builtInEstimatedCostUsd, 0.0004)
  assert.equal(formatMeteringCost(summary.builtInEstimatedCostUsd), '<$0.01')
})

test('formatMeteringTokens shows small token counts instead of zero-k', () => {
  assert.equal(formatMeteringTokens(42), '42')
  assert.equal(formatMeteringTokens(1250), '1.3k')
})
