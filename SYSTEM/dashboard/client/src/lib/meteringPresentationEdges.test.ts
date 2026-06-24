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

test('summarizeMeteringByAgentType falls back to builtInAgentIds when agent metadata is missing', () => {
  const summary = summarizeMeteringByAgentType(
    [
      { agentId: 'builder-agent', totalCalls: 1, totalTokens: 120, estimatedCostUsd: 0.03, avgDurationMs: 250, lastActivity: '', models: {} },
      { agentId: 'sales-lead', totalCalls: 1, totalTokens: 140, estimatedCostUsd: 0.04, avgDurationMs: 250, lastActivity: '', models: {} },
    ],
    new Set(['builder-agent']),
  )

  assert.equal(summary.builtInAgentCount, 1)
  assert.equal(summary.userAgentCount, 1)
  assert.equal(summary.builtInEstimatedCostUsd, 0.03)
  assert.equal(summary.userEstimatedCostUsd, 0.04)
})

test('formatMeteringCost clamps negative and missing costs to zero', () => {
  assert.equal(formatMeteringCost(-1), '$0.00')
  assert.equal(formatMeteringCost(Number.NaN), '$0.00')
})

test('formatMeteringCost rounds standard costs to two decimals', () => {
  assert.equal(formatMeteringCost(1.234), '$1.23')
  assert.equal(formatMeteringCost(1.235), '$1.24')
})

test('formatMeteringTokens rounds to whole tokens before compact formatting', () => {
  assert.equal(formatMeteringTokens(999.6), '1.0k')
  assert.equal(formatMeteringTokens(1001.2), '1.0k')
})

test('formatMeteringTokens clamps missing and negative token counts to zero', () => {
  assert.equal(formatMeteringTokens(-100), '0')
  assert.equal(formatMeteringTokens(Number.NaN), '0')
})

console.log('meteringPresentationEdges.test.ts: 5 tests passed')
