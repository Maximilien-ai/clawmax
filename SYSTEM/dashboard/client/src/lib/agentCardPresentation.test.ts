/**
 * Agent card presentation helper tests
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/agentCardPresentation.test.ts
 */

import assert from 'node:assert/strict'
import { formatAgentGroupCount, getAgentBudgetPresentation, getVisibleAgentTags } from './agentList'

{
  const preview = getVisibleAgentTags(['built-in', 'assistant', 'email', 'ops'], 3)
  assert.deepEqual(preview.visible, ['built-in', 'assistant', 'email'])
  assert.equal(preview.hiddenCount, 1)
}

{
  const preview = getVisibleAgentTags(['one', 'two'], 3)
  assert.deepEqual(preview.visible, ['one', 'two'])
  assert.equal(preview.hiddenCount, 0)
}

{
  assert.equal(formatAgentGroupCount(0), null)
  assert.equal(formatAgentGroupCount(1), '1 group')
  assert.equal(formatAgentGroupCount(3), '3 groups')
}

{
  const idle = getAgentBudgetPresentation({ costTrackingEnabled: true, costLimit: null, meteringCost: 1 })
  assert.equal(idle.usedPct, null)
  assert.equal(idle.barColor, 'bg-gray-300 dark:bg-gray-700')
}

{
  const ok = getAgentBudgetPresentation({ costTrackingEnabled: true, costLimit: 10, meteringCost: 3 })
  assert.equal(ok.usedPct, 30)
  assert.equal(ok.barColor, 'bg-green-500')
}

{
  const warning = getAgentBudgetPresentation({ costTrackingEnabled: true, costLimit: 10, meteringCost: 8.5 })
  assert.equal(warning.usedPct, 85)
  assert.equal(warning.barColor, 'bg-yellow-500')
}

{
  const critical = getAgentBudgetPresentation({ costTrackingEnabled: true, costLimit: 10, meteringCost: 9.5 })
  assert.equal(critical.usedPct, 95)
  assert.equal(critical.barColor, 'bg-red-500')
}

console.log('agentCardPresentation.test.ts: 7 tests passed')
