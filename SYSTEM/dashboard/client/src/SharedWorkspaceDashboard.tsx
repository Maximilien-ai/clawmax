import React, { useEffect, useMemo, useState } from 'react'

interface SharedDashboardPayload {
  dashboard: {
    title: string
    description: string | null
    sections: {
      overview: boolean
      costs: boolean
      agents: boolean
      notifications: boolean
      workflows: boolean
      kickoff: boolean
      results: boolean
    }
  }
  workspace: {
    id: string
    name: string
    color: string
    lastUpdatedAt: string
  }
  overview: {
    totalAgents: number
    onlineAgents: number
    pausedAgents: number
    failingAgents: number
    activeNotifications: number
    runningWorkflows: number
  }
  costs: {
    budget: {
      config: { limitUsd: number; warningPct: number; enforced: boolean; paused: boolean }
      currentSpendUsd: number
      remainingUsd: number
      usedPct: number
      level: 'ok' | 'warning' | 'exceeded'
    }
    metering: {
      totalCostUsd: number
      totalTraces: number
      byAgent: Array<{ agentId: string; estimatedCostUsd: number }>
      byWorkflow: Array<{ workflowId: string; workflowName: string; estimatedCostUsd: number }>
    }
  }
  agents: Array<{
    id: string
    name: string
    status: 'online' | 'offline' | 'unknown'
    paused: boolean
    archived: boolean
    lastHeartbeat: string | null
    costUsd: number
  }>
  notifications: Array<{
    id: string
    title: string
    message: string
    severity: 'critical' | 'warning' | 'info'
    createdAt: string
  }>
  workflows: Array<{
    id: string
    name: string
    description: string
    enabled: boolean
    schedule: string
    nextRunAt: string | null
    status: string
    kickoffSummary: string | null
    resultSummary: string[]
    latestExecution: {
      status: string
      startedAt: string
      completedAt?: string
      triggerType: string
      logsPreview: string[]
    } | null
    executionHistory: Array<{
      id: string
      startedAt: string
      completedAt?: string
      status: string
      triggerType: string
    }>
  }>
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function SharedWorkspaceDashboard({ token }: { token: string }) {
  const [payload, setPayload] = useState<SharedDashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/workspace-dashboards/${token}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load workspace dashboard')
        if (!cancelled) {
          setPayload(data)
          setError(null)
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load workspace dashboard')
      }
    }
    load()
    const interval = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [token])

  const overviewCards = useMemo(() => {
    if (!payload) return []
    return [
      ['Agents', payload.overview.totalAgents],
      ['Online', payload.overview.onlineAgents],
      ['Paused', payload.overview.pausedAgents],
      ['Running', payload.overview.runningWorkflows],
      ['Alerts', payload.overview.activeNotifications],
      ['Spend', `$${payload.costs.metering.totalCostUsd.toFixed(2)}`],
    ]
  }, [payload])

  if (error) {
    return <div className="min-h-screen bg-slate-950 text-white p-8">{error}</div>
  }

  if (!payload) {
    return <div className="min-h-screen bg-slate-950 text-white p-8">Loading workspace dashboard…</div>
  }

  const budget = payload.costs.budget
  const budgetBarColor = budget.level === 'exceeded' ? 'bg-red-500' : budget.level === 'warning' ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: payload.workspace.color }} />
                Workspace Summary
              </div>
              <h1 className="text-3xl font-bold tracking-tight">{payload.dashboard.title}</h1>
              <p className="mt-2 text-sm text-slate-400">{payload.dashboard.description || payload.workspace.name}</p>
            </div>
            <div className="text-sm text-slate-400">
              <div>{payload.workspace.name}</div>
              <div>Updated {timeAgo(payload.workspace.lastUpdatedAt)}</div>
            </div>
          </div>
        </header>

        {payload.dashboard.sections.overview && (
          <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {overviewCards.map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-2 text-2xl font-semibold">{value}</div>
              </div>
            ))}
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          {payload.dashboard.sections.costs && (
            <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="mb-4 text-lg font-semibold">Costs & Budget</h2>
              <div className="mb-3 flex items-center justify-between text-sm text-slate-400">
                <span>${budget.currentSpendUsd.toFixed(4)} spent</span>
                <span>${budget.remainingUsd.toFixed(4)} remaining</span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-800">
                <div className={`h-3 rounded-full ${budgetBarColor}`} style={{ width: `${Math.min(budget.usedPct, 100)}%` }} />
              </div>
              <div className="mt-3 text-sm text-slate-400">{budget.usedPct.toFixed(1)}% of ${budget.config.limitUsd.toFixed(2)} workspace budget used</div>

              <div className="mt-6">
                <div className="mb-2 text-sm font-medium text-slate-300">Top Agent Spend</div>
                <div className="space-y-2">
                  {payload.costs.metering.byAgent.slice(0, 5).map(agent => (
                    <div key={agent.agentId} className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2 text-sm">
                      <span>{agent.agentId}</span>
                      <span className="text-emerald-400">${agent.estimatedCostUsd.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {payload.dashboard.sections.notifications && (
            <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="mb-4 text-lg font-semibold">Active Notifications</h2>
              <div className="space-y-3">
                {payload.notifications.length === 0 && (
                  <div className="text-sm text-slate-500">No active notifications.</div>
                )}
                {payload.notifications.slice(0, 8).map(notification => (
                  <div key={notification.id} className="rounded-xl border border-white/10 bg-slate-800/80 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{notification.title}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                        notification.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                        notification.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-sky-500/20 text-sky-300'
                      }`}>
                        {notification.severity}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-400">{notification.message}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_1fr]">
          {payload.dashboard.sections.agents && (
            <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="mb-4 text-lg font-semibold">Agent Status</h2>
              <div className="space-y-2">
                {payload.agents.map(agent => (
                  <div key={agent.id} className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2 text-sm">
                    <div>
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-slate-500">{agent.id} · last activity {timeAgo(agent.lastHeartbeat)}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                        agent.paused ? 'bg-slate-600 text-slate-100' :
                        agent.status === 'online' ? 'bg-green-500/20 text-green-300' :
                        agent.status === 'offline' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-slate-500/20 text-slate-300'
                      }`}>
                        {agent.paused ? 'paused' : agent.status}
                      </span>
                      <span className="text-emerald-400">${agent.costUsd.toFixed(4)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {payload.dashboard.sections.workflows && (
            <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
              <h2 className="mb-4 text-lg font-semibold">Workflows</h2>
              <div className="space-y-3">
                {payload.workflows.map(workflow => (
                  <div key={workflow.id} className="rounded-xl border border-white/10 bg-slate-800/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{workflow.name}</div>
                        <div className="text-sm text-slate-500">{workflow.description || workflow.id}</div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                        workflow.status === 'running' ? 'bg-sky-500/20 text-sky-300' :
                        workflow.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                        workflow.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                        'bg-slate-500/20 text-slate-300'
                      }`}>
                        {workflow.status}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-slate-400">
                      <div>Next run: {workflow.nextRunAt ? new Date(workflow.nextRunAt).toLocaleString() : 'Manual / none scheduled'}</div>
                      {payload.dashboard.sections.kickoff && workflow.kickoffSummary && (
                        <div className="rounded-md bg-slate-900/60 p-2 text-slate-300">Kickoff: {workflow.kickoffSummary}</div>
                      )}
                      {payload.dashboard.sections.results && workflow.resultSummary.length > 0 && (
                        <div className="rounded-md bg-slate-900/60 p-2 text-slate-300">
                          Result: {workflow.resultSummary.join(' ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
