/**
 * Metering test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/metering.test.ts
 */

import { aggregateWorkspaceMeteringFromTraces, buildDailyCostSeries, summarizeCostWindows } from './metering'
import { estimateModelCostUsd } from './model-pricing'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Metering Test Suite ===${RESET}\n`)

async function run() {
  await test('buildDailyCostSeries aggregates traces by day and preserves empty days', () => {
    const now = new Date()
    const today = new Date(now)
    today.setHours(12, 0, 0, 0)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(9, 30, 0, 0)

    const series = buildDailyCostSeries([
      {
        id: 't1',
        name: 'agent.chat.one',
        start_time: today.toISOString(),
        end_time: today.toISOString(),
        metadata: { estimated_cost_usd: 0.15 },
      },
      {
        id: 't2',
        name: 'workflow.alpha',
        start_time: today.toISOString(),
        end_time: today.toISOString(),
        metadata: { estimated_cost_usd: 0.35 },
      },
      {
        id: 't3',
        name: 'agent.chat.two',
        start_time: yesterday.toISOString(),
        end_time: yesterday.toISOString(),
        metadata: { estimated_cost_usd: 0.2 },
      },
    ] as any, 3)

    assert(series.length === 3, 'Expected three daily buckets')
    const todayKey = today.toISOString().slice(0, 10)
    const yesterdayKey = yesterday.toISOString().slice(0, 10)
    const todayBucket = series.find((entry) => entry.date === todayKey)
    const yesterdayBucket = series.find((entry) => entry.date === yesterdayKey)

    assert(!!todayBucket, 'Expected a bucket for today')
    assert(!!yesterdayBucket, 'Expected a bucket for yesterday')
    assert(todayBucket!.traceCount === 2, 'Expected two traces in today bucket')
    assert(Math.abs(todayBucket!.estimatedCostUsd - 0.5) < 0.0001, 'Expected today cost to aggregate')
    assert(yesterdayBucket!.traceCount === 1, 'Expected one trace in yesterday bucket')
    assert(Math.abs(yesterdayBucket!.estimatedCostUsd - 0.2) < 0.0001, 'Expected yesterday cost to aggregate')
    assert(series.some((entry) => entry.traceCount === 0), 'Expected at least one empty day bucket')
  })

  await test('summarizeCostWindows returns today, last7d, and avg/day values', () => {
    const now = new Date()
    const todayKey = now.toISOString().slice(0, 10)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const summary = summarizeCostWindows([
      { date: todayKey, estimatedCostUsd: 1.25, traceCount: 3 },
      { date: yesterday.toISOString().slice(0, 10), estimatedCostUsd: 0.75, traceCount: 2 },
      { date: '2000-01-01', estimatedCostUsd: 0.5, traceCount: 1 },
    ])

    assert(Math.abs(summary.todayCostUsd - 1.25) < 0.0001, 'Expected today cost to come from today bucket')
    assert(Math.abs(summary.last7dCostUsd - 2.5) < 0.0001, 'Expected last7d cost to sum all buckets')
    assert(Math.abs(summary.avgDailyCostUsd - (2.5 / 3)) < 0.0001, 'Expected avg/day cost to average across buckets')
  })

  await test('aggregateWorkspaceMeteringFromTraces rolls workflow spend up from agent traces', () => {
    const metering = aggregateWorkspaceMeteringFromTraces([
      {
        id: 'a1',
        name: 'agent.chat.test-agent1',
        start_time: '2026-04-03T17:00:00.000Z',
        end_time: '2026-04-03T17:00:02.000Z',
        metadata: {
          agent_id: 'test-agent1',
          workflow_id: 'test-github',
          workflow_name: 'Test GitHub',
          estimated_cost_usd: 0.12,
          tokens_input: 100,
          tokens_output: 50,
          tokens_total: 150,
          duration_ms: 2000,
          model: 'gpt-4o-mini',
        },
      },
      {
        id: 'a2',
        name: 'agent.chat.test-agent2',
        start_time: '2026-04-03T17:01:00.000Z',
        end_time: '2026-04-03T17:01:03.000Z',
        metadata: {
          agent_id: 'test-agent2',
          workflow_id: 'test-github',
          workflow_name: 'Test GitHub',
          estimated_cost_usd: 0.08,
          tokens_input: 80,
          tokens_output: 40,
          tokens_total: 120,
          duration_ms: 3000,
          model: 'gpt-4o-mini',
        },
      },
      {
        id: 'w1',
        name: 'workflow.test-github',
        start_time: '2026-04-03T17:00:00.000Z',
        end_time: '2026-04-03T17:01:03.000Z',
        metadata: {
          workflow_id: 'test-github',
          workflow_name: 'Test GitHub',
          tokens_total: 270,
          duration_ms: 63000,
        },
      },
    ] as any)

    assert(Math.abs(metering.estimatedCostUsd - 0.2) < 0.0001, 'Expected workspace total cost from agent traces')
    assert(metering.byWorkflow.length === 1, 'Expected a workflow rollup entry')
    assert(metering.byWorkflow[0].workflowId === 'test-github', 'Expected workflow id to match')
    assert(Math.abs(metering.byWorkflow[0].estimatedCostUsd - 0.2) < 0.0001, 'Expected workflow cost from agent traces')
    assert(metering.byWorkflow[0].totalRuns === 1, 'Expected workflow runs from workflow traces')
  })

  await test('aggregateWorkspaceMeteringFromTraces derives cost from tokens when traces lack explicit cost', () => {
    const expectedFirst = estimateModelCostUsd('openai/gpt-5.4', 10000, 5000)
    const expectedSecond = estimateModelCostUsd('gpt-4o-mini', 2000, 1000)
    const metering = aggregateWorkspaceMeteringFromTraces([
      {
        id: 'a1',
        name: 'agent.chat.analysis-lead',
        start_time: '2026-04-08T19:00:00.000Z',
        end_time: '2026-04-08T19:00:10.000Z',
        metadata: {
          agent_id: 'analysis-lead',
          workflow_id: 'kickoff',
          workflow_name: 'Kickoff',
          tokens_input: 10000,
          tokens_output: 5000,
          tokens_total: 15000,
          duration_ms: 10000,
          model: 'openai/gpt-5.4',
        },
      },
      {
        id: 'a2',
        name: 'agent.chat.writer',
        start_time: '2026-04-08T19:01:00.000Z',
        end_time: '2026-04-08T19:01:04.000Z',
        metadata: {
          agent_id: 'writer',
          workflow_id: 'kickoff',
          workflow_name: 'Kickoff',
          tokens_input: 2000,
          tokens_output: 1000,
          tokens_total: 3000,
          duration_ms: 4000,
          model: 'gpt-4o-mini',
        },
      },
    ] as any)

    const expectedTotal = expectedFirst + expectedSecond
    assert(expectedTotal > 0, 'Expected fallback model pricing to produce non-zero cost')
    assert(Math.abs(metering.estimatedCostUsd - expectedTotal) < 0.0001, 'Expected workspace total cost from derived model pricing')
    assert(Math.abs(metering.byWorkflow[0].estimatedCostUsd - expectedTotal) < 0.0001, 'Expected workflow total cost from derived model pricing')
    assert(metering.byAgent.some((agent) => agent.agentId === 'analysis-lead' && agent.estimatedCostUsd > 0), 'Expected per-agent derived cost')
  })

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
