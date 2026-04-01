/**
 * Metering test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/metering.test.ts
 */

import { buildDailyCostSeries, summarizeCostWindows } from './metering'

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
