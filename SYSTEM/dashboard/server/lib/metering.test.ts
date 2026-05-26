/**
 * Metering test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/metering.test.ts
 */

import {
  aggregateWorkspaceMeteringFromTraces,
  buildDailyCostSeries,
  enrichWorkspaceMeteringWithAgentMetadata,
  mergeWorkspaceMetering,
  recordMeteringFetchFailure,
  resetMeteringFetchFailureStateForTests,
  summarizeCostWindows,
  traceMatchesViewer,
} from './metering'
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

  await test('enrichWorkspaceMeteringWithAgentMetadata marks built-in agents from workspace metadata', () => {
    const base = {
      ...aggregateWorkspaceMeteringFromTraces([
        {
          id: 'a1',
          name: 'agent.chat.builder-agent',
          start_time: '2026-04-08T19:00:00.000Z',
          end_time: '2026-04-08T19:00:10.000Z',
          metadata: {
            agent_id: 'builder-agent',
            tokens_input: 100,
            tokens_output: 50,
            tokens_total: 150,
            estimated_cost_usd: 0.1,
          },
        },
        {
          id: 'a2',
          name: 'agent.chat.sales-lead',
          start_time: '2026-04-08T19:01:00.000Z',
          end_time: '2026-04-08T19:01:04.000Z',
          metadata: {
            agent_id: 'sales-lead',
            tokens_input: 200,
            tokens_output: 100,
            tokens_total: 300,
            estimated_cost_usd: 0.2,
          },
        },
      ] as any),
      period: 'all',
    }

    const enriched = enrichWorkspaceMeteringWithAgentMetadata(base, new Map([
      ['builder-agent', { agentName: 'AI Builder', agentTags: ['built-in', 'system'], agentType: 'built-in', isBuiltIn: true }],
      ['sales-lead', { agentName: 'Sales Lead', agentTags: ['sales'], agentType: 'user', isBuiltIn: false }],
    ]))

    const builtIn = enriched.byAgent.find((agent) => agent.agentId === 'builder-agent')
    const user = enriched.byAgent.find((agent) => agent.agentId === 'sales-lead')

    assert(!!builtIn && builtIn.isBuiltIn === true, 'Expected built-in agent flag')
    assert(!!builtIn && builtIn.agentType === 'built-in', 'Expected built-in agent type')
    assert(!!builtIn && builtIn.agentName === 'AI Builder', 'Expected enriched agent name')
    assert(!!user && user.agentType === 'user', 'Expected user agent type')
    assert(!!user && user.isBuiltIn === false, 'Expected non built-in user agent')
  })

  await test('aggregateWorkspaceMeteringFromTraces can be safely pre-filtered by viewer identity', () => {
    const traces = [
      {
        id: 'a1',
        name: 'agent.chat.one',
        start_time: '2026-04-08T19:00:00.000Z',
        end_time: '2026-04-08T19:00:10.000Z',
        metadata: {
          agent_id: 'one',
          user_id: 'user-a',
          user_login: 'alpha',
          tokens_input: 100,
          tokens_output: 50,
          tokens_total: 150,
          estimated_cost_usd: 0.1,
        },
      },
      {
        id: 'a2',
        name: 'agent.chat.two',
        start_time: '2026-04-08T19:01:00.000Z',
        end_time: '2026-04-08T19:01:04.000Z',
        metadata: {
          agent_id: 'two',
          user_id: 'user-b',
          user_login: 'beta',
          tokens_input: 200,
          tokens_output: 100,
          tokens_total: 300,
          estimated_cost_usd: 0.2,
        },
      },
    ] as any

    const onlyAlpha = traces.filter((trace: any) => trace.metadata?.user_id === 'user-a')
    const metering = aggregateWorkspaceMeteringFromTraces(onlyAlpha)

    assert(metering.totalTraces === 1, 'Expected only one viewer trace after filtering')
    assert(metering.byAgent.length === 1 && metering.byAgent[0].agentId === 'one', 'Expected only the viewer agent usage')
    assert(Math.abs(metering.estimatedCostUsd - 0.1) < 0.0001, 'Expected only the viewer cost to remain')
  })

  await test('traceMatchesViewer does not reject traces that omit dashboard_instance_id', () => {
    const trace = {
      id: 'a3',
      name: 'agent.chat.one',
      start_time: '2026-04-08T19:00:00.000Z',
      end_time: '2026-04-08T19:00:10.000Z',
      metadata: {
        agent_id: 'one',
        user_id: 'user-a',
        user_login: 'alpha',
        tokens_input: 100,
        tokens_output: 50,
        tokens_total: 150,
      },
    } as any

    const allowed = traceMatchesViewer(trace, {
      userId: 'user-a',
      login: 'alpha',
      dashboardInstanceId: 'https://cld-test5.example.com',
    })

    assert(allowed === true, 'Expected missing dashboard_instance_id to remain eligible for viewer-scoped metering')
  })

  await test('traceMatchesViewer allows local dashboard instance id mismatches for dev', () => {
    const trace = {
      id: 'a4',
      name: 'agent.chat.one',
      start_time: '2026-04-08T19:00:00.000Z',
      end_time: '2026-04-08T19:00:10.000Z',
      metadata: {
        agent_id: 'one',
        dashboard_instance_id: 'http://localhost:3001',
        tokens_input: 100,
        tokens_output: 50,
        tokens_total: 150,
      },
    } as any

    const allowed = traceMatchesViewer(trace, {
      dashboardInstanceId: 'http://localhost:3002',
    })

    assert(allowed === true, 'Expected local dashboard instance ids to be treated as equivalent for dev metering')
  })

  await test('traceMatchesViewer still rejects hosted dashboard instance id mismatches', () => {
    const trace = {
      id: 'a5',
      name: 'agent.chat.one',
      start_time: '2026-04-08T19:00:00.000Z',
      end_time: '2026-04-08T19:00:10.000Z',
      metadata: {
        agent_id: 'one',
        dashboard_instance_id: 'https://prod-a.example.com',
        tokens_input: 100,
        tokens_output: 50,
        tokens_total: 150,
      },
    } as any

    const allowed = traceMatchesViewer(trace, {
      dashboardInstanceId: 'https://prod-b.example.com',
    })

    assert(allowed === false, 'Expected hosted dashboard instance id mismatches to remain isolated')
  })

  await test('traceMatchesViewer prefers instance_key isolation for on-prem traces', () => {
    const trace = {
      id: 'a6',
      name: 'agent.chat.one',
      start_time: '2026-04-08T19:00:00.000Z',
      end_time: '2026-04-08T19:00:10.000Z',
      metadata: {
        agent_id: 'one',
        dashboard_instance_id: 'http://clawmax:3001',
        instance_key: 'mbp14-a',
        machine_id: 'machine-a',
        tokens_input: 100,
        tokens_output: 50,
        tokens_total: 150,
      },
    } as any

    const allowed = traceMatchesViewer(trace, {
      dashboardInstanceId: 'http://clawmax:3001',
      instanceKey: 'macmini-b',
      machineId: 'machine-b',
    })

    assert(allowed === false, 'Expected on-prem traces with different instance identities to remain isolated even when hostnames match')
  })

  await test('traceMatchesViewer allows matching machine identity when dashboard hostname is shared', () => {
    const trace = {
      id: 'a7',
      name: 'agent.chat.one',
      start_time: '2026-04-08T19:00:00.000Z',
      end_time: '2026-04-08T19:00:10.000Z',
      metadata: {
        agent_id: 'one',
        dashboard_instance_id: 'http://clawmax:3001',
        machine_id: 'machine-a',
        machine_name: 'MBP14',
        tokens_input: 100,
        tokens_output: 50,
        tokens_total: 150,
      },
    } as any

    const allowed = traceMatchesViewer(trace, {
      dashboardInstanceId: 'http://clawmax:3001',
      machineId: 'machine-a',
      machineName: 'MBP14',
    })

    assert(allowed === true, 'Expected matching machine identity to preserve on-prem metering visibility')
  })

  await test('traceMatchesViewer keeps system traces without user identity when instance scope already matches', () => {
    const trace = {
      id: 'a8',
      name: 'agent.chat.builder-agent',
      start_time: '2026-04-08T19:00:00.000Z',
      end_time: '2026-04-08T19:00:10.000Z',
      metadata: {
        agent_id: 'builder-agent',
        dashboard_instance_id: 'http://localhost:3001',
        machine_id: 'machine-a',
        machine_name: 'MBP14',
        tokens_input: 100,
        tokens_output: 50,
        tokens_total: 150,
      },
    } as any

    const allowed = traceMatchesViewer(trace, {
      userId: 'user-a',
      login: 'alpha',
      dashboardInstanceId: 'http://localhost:3001',
      machineId: 'machine-a',
      machineName: 'MBP14',
    })

    assert(allowed === true, 'Expected system traces without user identity to remain visible after instance scoping matches')
  })

  await test('mergeWorkspaceMetering preserves highest known values across refreshes', () => {
    const previous = {
      totalTraces: 10,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalTokens: 1500,
      estimatedCostUsd: 1.25,
      dailyCost: [
        { date: '2026-05-06', estimatedCostUsd: 1.25, traceCount: 10 },
      ],
      costSummary: { todayCostUsd: 1.25, last7dCostUsd: 1.25, avgDailyCostUsd: 1.25 },
      byAgent: [
        {
          agentId: 'alpha',
          agentName: 'Alpha',
          agentTags: ['built-in'],
          agentType: 'built-in',
          isBuiltIn: true,
          totalCalls: 10,
          totalInputTokens: 1000,
          totalOutputTokens: 500,
          totalTokens: 1500,
          estimatedCostUsd: 1.25,
          avgDurationMs: 1000,
          lastActivity: '2026-05-06T12:00:00.000Z',
          models: { 'gpt-4o-mini': 10 },
        },
      ],
      byWorkflow: [
        {
          workflowId: 'kickoff',
          workflowName: 'Kickoff',
          totalRuns: 3,
          totalTokens: 1500,
          estimatedCostUsd: 1.25,
          avgDurationMs: 2500,
          lastRun: '2026-05-06T12:00:00.000Z',
        },
      ],
      period: 'all',
    }

    const next = {
      totalTraces: 8,
      totalInputTokens: 800,
      totalOutputTokens: 400,
      totalTokens: 1200,
      estimatedCostUsd: 0.9,
      dailyCost: [
        { date: '2026-05-06', estimatedCostUsd: 0.9, traceCount: 8 },
        { date: '2026-05-07', estimatedCostUsd: 0.2, traceCount: 2 },
      ],
      costSummary: { todayCostUsd: 0.2, last7dCostUsd: 1.1, avgDailyCostUsd: 0.55 },
      byAgent: [
        {
          agentId: 'alpha',
          agentName: 'Alpha Agent',
          agentTags: [],
          agentType: 'unknown',
          isBuiltIn: false,
          totalCalls: 8,
          totalInputTokens: 800,
          totalOutputTokens: 400,
          totalTokens: 1200,
          estimatedCostUsd: 0.9,
          avgDurationMs: 900,
          lastActivity: '2026-05-07T12:00:00.000Z',
          models: { 'gpt-4o-mini': 8 },
        },
      ],
      byWorkflow: [
        {
          workflowId: 'kickoff',
          workflowName: 'Kickoff',
          totalRuns: 2,
          totalTokens: 1200,
          estimatedCostUsd: 0.9,
          avgDurationMs: 2400,
          lastRun: '2026-05-07T12:00:00.000Z',
        },
      ],
      period: 'all',
    }

    const merged = mergeWorkspaceMetering(previous as any, next as any)
    assert(merged.totalTraces === 10, 'Expected cached total trace count to remain monotonic')
    assert(Math.abs(merged.estimatedCostUsd - 1.25) < 0.0001, 'Expected cached total cost to remain monotonic')
    assert(merged.dailyCost.length === 2, 'Expected merged daily cost buckets to union previous and next values')
    const today = merged.dailyCost.find((entry) => entry.date === '2026-05-06')
    const newDay = merged.dailyCost.find((entry) => entry.date === '2026-05-07')
    assert(!!today && Math.abs(today!.estimatedCostUsd - 1.25) < 0.0001, 'Expected existing daily bucket to keep max value')
    assert(!!newDay && Math.abs(newDay!.estimatedCostUsd - 0.2) < 0.0001, 'Expected new daily bucket to be added')
    assert(merged.byAgent[0].totalCalls === 10, 'Expected per-agent totals to remain monotonic')
    assert(merged.byAgent[0].agentType === 'built-in', 'Expected richer built-in metadata to survive refreshes')
    assert(merged.byAgent[0].isBuiltIn === true, 'Expected built-in flag to remain true')
    assert(merged.byWorkflow[0].totalRuns === 3, 'Expected per-workflow totals to remain monotonic')
  })

  await test('recordMeteringFetchFailure throttles repeated identical errors and reports suppression counts', () => {
    resetMeteringFetchFailureStateForTests()

    const first = recordMeteringFetchFailure('getaddrinfo ENOTFOUND www.comet.com', 1_000)
    const second = recordMeteringFetchFailure('getaddrinfo ENOTFOUND www.comet.com', 2_000)
    const third = recordMeteringFetchFailure('getaddrinfo ENOTFOUND www.comet.com', 63_000)

    assert(first === 'getaddrinfo ENOTFOUND www.comet.com', 'Expected first failure to be reported immediately')
    assert(second === null, 'Expected repeated failure inside cooldown window to be suppressed')
    assert(third === 'getaddrinfo ENOTFOUND www.comet.com (suppressed 1 similar failures)', 'Expected later report to mention suppressed failures')
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
