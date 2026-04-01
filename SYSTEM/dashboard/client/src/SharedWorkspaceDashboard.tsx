import React, { useEffect, useMemo, useState } from 'react'

interface SharedDashboardPayload {
  refreshedAt: string
  dashboard: {
    title: string
    description: string | null
    displayMode: 'standard' | 'compact' | 'detail'
    sectionOrder: Array<'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats'>
    compactColumns: Record<'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats', 'left' | 'right'>
    sections: {
      overview: boolean
      costs: boolean
      agents: boolean
      notifications: boolean
      workflows: boolean
      kickoff: boolean
      results: boolean
      groupChats: boolean
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
      dailyCost: Array<{ date: string; estimatedCostUsd: number; traceCount: number }>
      costSummary: {
        todayCostUsd: number
        last7dCostUsd: number
        avgDailyCostUsd: number
      }
      byAgent: Array<{ agentId: string; estimatedCostUsd: number }>
      byWorkflow: Array<{ workflowId: string; workflowName: string; estimatedCostUsd: number; totalRuns: number }>
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
    resultLinks: string[]
    resultArtifacts?: Array<{
      kind: 'link' | 'file'
      label: string
      url?: string
      relativePath?: string
    }>
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
  groupChats: Array<{
    type: 'group' | 'community'
    name: string
    community: string | null
    channels: string[]
    members: string[]
    messageCount: number
    recentMessages: Array<{
      from: string
      content: string
      timestamp: number
    }>
    latestMessage: {
      from: string
      content: string
      timestamp: number
    } | null
  }>
}

function normalizePayload(input: any): SharedDashboardPayload {
  return {
    refreshedAt: typeof input?.refreshedAt === 'string' ? input.refreshedAt : new Date().toISOString(),
    dashboard: {
      title: typeof input?.dashboard?.title === 'string' ? input.dashboard.title : 'Workspace Summary',
      description: typeof input?.dashboard?.description === 'string' ? input.dashboard.description : null,
      displayMode: input?.dashboard?.displayMode === 'compact' || input?.dashboard?.displayMode === 'detail' ? input.dashboard.displayMode : 'standard',
      sectionOrder: Array.isArray(input?.dashboard?.sectionOrder) && input.dashboard.sectionOrder.length > 0 ? input.dashboard.sectionOrder : ['overview', 'costs', 'agents', 'notifications', 'workflows', 'kickoff', 'results', 'groupChats'],
      compactColumns: {
        overview: input?.dashboard?.compactColumns?.overview === 'right' ? 'right' : 'left',
        costs: input?.dashboard?.compactColumns?.costs === 'right' ? 'right' : 'left',
        agents: input?.dashboard?.compactColumns?.agents === 'left' ? 'left' : 'right',
        notifications: input?.dashboard?.compactColumns?.notifications === 'left' ? 'left' : 'right',
        workflows: input?.dashboard?.compactColumns?.workflows === 'right' ? 'right' : 'left',
        kickoff: input?.dashboard?.compactColumns?.kickoff === 'right' ? 'right' : 'left',
        results: input?.dashboard?.compactColumns?.results === 'right' ? 'right' : 'left',
        groupChats: input?.dashboard?.compactColumns?.groupChats === 'left' ? 'left' : 'right',
      },
      sections: {
        overview: input?.dashboard?.sections?.overview !== false,
        costs: input?.dashboard?.sections?.costs !== false,
        agents: input?.dashboard?.sections?.agents !== false,
        notifications: input?.dashboard?.sections?.notifications !== false,
        workflows: input?.dashboard?.sections?.workflows !== false,
        kickoff: input?.dashboard?.sections?.kickoff !== false,
        results: input?.dashboard?.sections?.results !== false,
        groupChats: input?.dashboard?.sections?.groupChats !== false,
      },
    },
    workspace: {
      id: typeof input?.workspace?.id === 'string' ? input.workspace.id : 'workspace',
      name: typeof input?.workspace?.name === 'string' ? input.workspace.name : 'Workspace',
      color: typeof input?.workspace?.color === 'string' ? input.workspace.color : '#3B82F6',
      lastUpdatedAt: typeof input?.workspace?.lastUpdatedAt === 'string' ? input.workspace.lastUpdatedAt : new Date().toISOString(),
    },
    overview: {
      totalAgents: Number(input?.overview?.totalAgents || 0),
      onlineAgents: Number(input?.overview?.onlineAgents || 0),
      pausedAgents: Number(input?.overview?.pausedAgents || 0),
      failingAgents: Number(input?.overview?.failingAgents || 0),
      activeNotifications: Number(input?.overview?.activeNotifications || 0),
      runningWorkflows: Number(input?.overview?.runningWorkflows || 0),
    },
    costs: {
      budget: {
        config: {
          limitUsd: Number(input?.costs?.budget?.config?.limitUsd || 0),
          warningPct: Number(input?.costs?.budget?.config?.warningPct || 0),
          enforced: !!input?.costs?.budget?.config?.enforced,
          paused: !!input?.costs?.budget?.config?.paused,
        },
        currentSpendUsd: Number(input?.costs?.budget?.currentSpendUsd || 0),
        remainingUsd: Number(input?.costs?.budget?.remainingUsd || 0),
        usedPct: Number(input?.costs?.budget?.usedPct || 0),
        level: input?.costs?.budget?.level === 'warning' || input?.costs?.budget?.level === 'exceeded' ? input.costs.budget.level : 'ok',
      },
      metering: {
        totalCostUsd: Number(input?.costs?.metering?.totalCostUsd || 0),
        totalTraces: Number(input?.costs?.metering?.totalTraces || 0),
        dailyCost: Array.isArray(input?.costs?.metering?.dailyCost) ? input.costs.metering.dailyCost : [],
        costSummary: {
          todayCostUsd: Number(input?.costs?.metering?.costSummary?.todayCostUsd || 0),
          last7dCostUsd: Number(input?.costs?.metering?.costSummary?.last7dCostUsd || 0),
          avgDailyCostUsd: Number(input?.costs?.metering?.costSummary?.avgDailyCostUsd || 0),
        },
        byAgent: Array.isArray(input?.costs?.metering?.byAgent) ? input.costs.metering.byAgent : [],
        byWorkflow: Array.isArray(input?.costs?.metering?.byWorkflow) ? input.costs.metering.byWorkflow : [],
      },
    },
    agents: Array.isArray(input?.agents) ? input.agents : [],
    notifications: Array.isArray(input?.notifications) ? input.notifications : [],
    workflows: Array.isArray(input?.workflows)
      ? input.workflows.map((workflow: any) => ({
          ...workflow,
          resultSummary: Array.isArray(workflow?.resultSummary) ? workflow.resultSummary : [],
          resultLinks: Array.isArray(workflow?.resultLinks) ? workflow.resultLinks : [],
          resultArtifacts: Array.isArray(workflow?.resultArtifacts) ? workflow.resultArtifacts : [],
          executionHistory: Array.isArray(workflow?.executionHistory) ? workflow.executionHistory : [],
        }))
      : [],
    groupChats: Array.isArray(input?.groupChats)
      ? input.groupChats.map((chat: any) => ({
          ...chat,
          channels: Array.isArray(chat?.channels) ? chat.channels : [],
          members: Array.isArray(chat?.members) ? chat.members : [],
          messageCount: Number(chat?.messageCount || 0),
          recentMessages: Array.isArray(chat?.recentMessages) ? chat.recentMessages : [],
          latestMessage: chat?.latestMessage || null,
        }))
      : [],
  }
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
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('dark-mode')
    if (saved !== null) return saved === 'true'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('dark-mode', String(darkMode))
  }, [darkMode])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/workspace-dashboards/${token}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load workspace dashboard')
        if (!cancelled) {
          setPayload(normalizePayload(data))
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
  const compact = payload.dashboard.displayMode === 'compact'
  const detail = payload.dashboard.displayMode === 'detail'
  const notificationsToShow = compact ? 2 : detail ? 12 : 8
  const agentsToShow = compact ? 4 : detail ? payload.agents.length : payload.agents.length
  const workflowsToShow = compact ? 3 : detail ? payload.workflows.length : payload.workflows.length
  const chatsToShow = compact ? 3 : detail ? payload.groupChats.length : payload.groupChats.length
  const containerWidth = compact ? 'max-w-6xl' : detail ? 'max-w-[96rem]' : 'max-w-7xl'
  const twoColLayout = compact ? 'xl:grid-cols-[1.1fr_0.9fr]' : 'xl:grid-cols-[1.4fr_1fr]'
  const lowerGrid = compact ? 'xl:grid-cols-[1fr_1fr]' : 'xl:grid-cols-[1.1fr_1fr]'
  const cardPadding = compact ? 'p-3' : detail ? 'p-6' : 'p-5'
  const totalAgents = Math.max(payload.agents.length, 1)
  const onlineAgents = payload.agents.filter(agent => agent.status === 'online' && !agent.paused).length
  const pausedAgents = payload.agents.filter(agent => agent.paused).length
  const offlineAgents = Math.max(payload.agents.length - onlineAgents - pausedAgents, 0)
  const totalWorkflows = Math.max(payload.workflows.length, 1)
  const runningWorkflows = payload.workflows.filter(workflow => workflow.status === 'running').length
  const failedWorkflows = payload.workflows.filter(workflow => workflow.status === 'failed').length
  const idleWorkflows = Math.max(payload.workflows.length - runningWorkflows - failedWorkflows, 0)
  const dailyCostMax = Math.max(...payload.costs.metering.dailyCost.map((entry) => entry.estimatedCostUsd), 0)
  const topWorkflowCost = payload.costs.metering.byWorkflow[0]?.estimatedCostUsd || 0
  const workflowSharePct = payload.costs.metering.totalCostUsd > 0
    ? (topWorkflowCost / payload.costs.metering.totalCostUsd) * 100
    : 0
  const criticalNotifications = payload.notifications.filter(notification => notification.severity === 'critical').length
  const warningNotifications = payload.notifications.filter(notification => notification.severity === 'warning').length
  const infoNotifications = Math.max(payload.notifications.length - criticalNotifications - warningNotifications, 0)
  const orderedTopLevelSections = payload.dashboard.sectionOrder
    .filter((key): key is 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'groupChats' =>
      ['overview', 'costs', 'agents', 'notifications', 'workflows', 'groupChats'].includes(key)
    )
    .filter((key, index, arr) => arr.indexOf(key) === index)
  for (const key of ['overview', 'costs', 'agents', 'notifications', 'workflows', 'groupChats'] as const) {
    if (!orderedTopLevelSections.includes(key)) orderedTopLevelSections.push(key)
  }
  const hasCustomSectionOrder = orderedTopLevelSections.join('|') !== ['overview', 'costs', 'agents', 'notifications', 'workflows', 'groupChats'].join('|')
  const compactOrderedSections = orderedTopLevelSections.filter((key) => key !== 'overview')
  const compactLeftSections = compactOrderedSections.filter((key) => payload.dashboard.compactColumns[key] === 'left')
  const compactRightSections = compactOrderedSections.filter((key) => payload.dashboard.compactColumns[key] === 'right')
  const shellClass = 'min-h-screen bg-gray-50 text-gray-900 dark:bg-slate-950 dark:text-slate-100'
  const headerClass = 'rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-100 shadow-xl dark:border-white/10 dark:from-slate-900 dark:to-slate-800 dark:shadow-2xl'
  const cardClass = `rounded-2xl border border-gray-200 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/80 ${cardPadding}`
  const nestedClass = 'rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-slate-800/70'
  const renderCostTrend = (dark: boolean) => {
    if (!payload.costs.metering.dailyCost.length) return null
    return (
      <div className={`mt-4 rounded-xl border ${dark ? 'border-white/10 bg-slate-800/70' : 'border-gray-200 bg-gray-50'} ${compact ? 'p-3' : 'p-4'}`}>
        <div className={`mb-3 flex items-center justify-between ${compact ? 'text-[11px]' : 'text-xs'} uppercase tracking-wide ${dark ? 'text-slate-500' : 'text-gray-500'}`}>
          <span>Spend trend</span>
          <span>Last {payload.costs.metering.dailyCost.length}d</span>
        </div>
        <div className="flex items-end gap-2">
          {payload.costs.metering.dailyCost.map((entry) => {
            const heightPct = dailyCostMax > 0 ? Math.max((entry.estimatedCostUsd / dailyCostMax) * 100, entry.estimatedCostUsd > 0 ? 12 : 6) : 8
            return (
              <div key={entry.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className={`text-[10px] ${dark ? 'text-slate-500' : 'text-gray-500'}`}>${entry.estimatedCostUsd.toFixed(2)}</div>
                <div className={`flex h-20 w-full items-end rounded-md ${dark ? 'bg-slate-900/70' : 'bg-white'}`}>
                  <div
                    className={`w-full rounded-md ${dark ? 'bg-emerald-400/90' : 'bg-emerald-500'}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${entry.date}: $${entry.estimatedCostUsd.toFixed(4)} across ${entry.traceCount} traces`}
                  />
                </div>
                <div className={`text-[10px] ${dark ? 'text-slate-500' : 'text-gray-500'}`}>{entry.date.slice(5)}</div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const ThemeToggle = () => (
    <button
      onClick={() => setDarkMode((value) => !value)}
      className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white p-2 text-gray-500 shadow-sm transition-colors hover:text-gray-700 dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300 dark:hover:text-white"
      title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {darkMode ? (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  )

  const renderOrderedSection = (key: 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'groupChats') => {
    switch (key) {
      case 'overview':
        if (!payload.dashboard.sections.overview) return null
        return (
          <section className={`grid ${compact ? 'gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'gap-3 sm:grid-cols-2 xl:grid-cols-6'}`}>
            {overviewCards.map(([label, value]) => (
              <div key={label} className={`rounded-2xl border border-gray-200 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/80 ${compact ? 'p-3' : 'p-4'}`}>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">{label}</div>
                <div className={`mt-2 font-semibold ${compact ? 'text-xl' : 'text-2xl'}`}>{value}</div>
              </div>
            ))}
          </section>
        )
      case 'costs':
        if (!payload.dashboard.sections.costs) return null
        return (
          <section className={cardClass}>
            <h2 className={`mb-4 ${compact ? 'text-base' : 'text-lg'} font-semibold`}>Costs & Budget</h2>
            <div className={`mb-3 flex items-center justify-between ${compact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-slate-400`}>
              <span>${budget.currentSpendUsd.toFixed(4)} spent</span>
              <span>${budget.remainingUsd.toFixed(4)} remaining</span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-slate-800">
              <div className={`h-3 rounded-full ${budgetBarColor}`} style={{ width: `${Math.min(budget.usedPct, 100)}%` }} />
            </div>
            <div className={`mt-3 ${compact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-slate-400`}>{budget.usedPct.toFixed(1)}% of ${budget.config.limitUsd.toFixed(2)} workspace budget used</div>
            <div className={`mt-4 grid grid-cols-3 gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-slate-800/70">
                <div className="text-gray-500 dark:text-slate-500">Today</div>
                <div className="mt-1 font-semibold text-gray-900 dark:text-slate-100">${payload.costs.metering.costSummary.todayCostUsd.toFixed(2)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-slate-800/70">
                <div className="text-gray-500 dark:text-slate-500">Last 7d</div>
                <div className="mt-1 font-semibold text-gray-900 dark:text-slate-100">${payload.costs.metering.costSummary.last7dCostUsd.toFixed(2)}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-slate-800/70">
                <div className="text-gray-500 dark:text-slate-500">Avg / day</div>
                <div className="mt-1 font-semibold text-gray-900 dark:text-slate-100">${payload.costs.metering.costSummary.avgDailyCostUsd.toFixed(2)}</div>
              </div>
            </div>
            {renderCostTrend(false)}
            <div className="mt-4">
              <div className={`mb-2 flex items-center justify-between ${compact ? 'text-[11px]' : 'text-xs'} uppercase tracking-wide text-gray-500 dark:text-slate-500`}>
                <span>Top Workflow Spend</span>
                {payload.costs.metering.byWorkflow.length > 0 && <span>{workflowSharePct.toFixed(0)}% of total</span>}
              </div>
              <div className={`${compact ? 'space-y-1.5' : 'space-y-2'}`}>
                {payload.costs.metering.byWorkflow.slice(0, compact ? 3 : 5).map((workflow) => (
                  <div key={workflow.workflowId} className={`flex items-center justify-between rounded-lg bg-gray-50 px-3 dark:bg-slate-800/70 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'}`}>
                    <div className="min-w-0 pr-3">
                      <div className="truncate font-medium text-gray-900 dark:text-slate-100">{workflow.workflowName || workflow.workflowId}</div>
                      {!compact && <div className="text-gray-500 dark:text-slate-500">{workflow.totalRuns || 0} runs</div>}
                    </div>
                    <span className="whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">${workflow.estimatedCostUsd.toFixed(4)}</span>
                  </div>
                ))}
                {payload.costs.metering.byWorkflow.length === 0 && (
                  <div className="text-sm text-gray-500 dark:text-slate-500">No workflow spend recorded yet.</div>
                )}
              </div>
            </div>
          </section>
        )
      case 'agents':
        if (!payload.dashboard.sections.agents) return null
        return (
          <section className={cardClass}>
            <h2 className={`mb-4 ${compact ? 'text-base' : 'text-lg'} font-semibold`}>Agent Status</h2>
            <div className="mb-3">
              <div className="flex h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-800">
                <div className="bg-emerald-400" style={{ width: `${(onlineAgents / totalAgents) * 100}%` }} />
                <div className="bg-slate-500" style={{ width: `${(pausedAgents / totalAgents) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${(offlineAgents / totalAgents) * 100}%` }} />
              </div>
              <div className={`mt-2 flex flex-wrap gap-3 ${compact ? 'text-[11px]' : 'text-xs'} text-gray-500 dark:text-slate-400`}>
                <span>Online {onlineAgents}</span>
                <span>Paused {pausedAgents}</span>
                <span>Offline {offlineAgents}</span>
              </div>
            </div>
            <div className={`${compact ? 'space-y-1.5' : 'space-y-2'}`}>
              {payload.agents.slice(0, agentsToShow).map(agent => (
                <div key={agent.id} className={`flex items-center justify-between rounded-lg bg-gray-50 px-3 dark:bg-slate-800/70 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'}`}>
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    {!compact && <div className="text-gray-500 dark:text-slate-500">{agent.id} · last activity {timeAgo(agent.lastHeartbeat)}</div>}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                    agent.paused ? 'bg-slate-600 text-slate-100' :
                    agent.status === 'online' ? 'bg-green-500/20 text-green-300' :
                    agent.status === 'offline' ? 'bg-yellow-500/20 text-yellow-300' :
                    'bg-slate-500/20 text-slate-300'
                  }`}>
                    {agent.paused ? 'paused' : agent.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )
      case 'notifications':
        if (!payload.dashboard.sections.notifications) return null
        return (
          <section className={cardClass}>
            <h2 className={`mb-4 ${compact ? 'text-base' : 'text-lg'} font-semibold`}>Active Notifications</h2>
            <div className="mb-3">
              <div className="flex h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-800">
                <div className="bg-red-400" style={{ width: `${payload.notifications.length ? (criticalNotifications / payload.notifications.length) * 100 : 0}%` }} />
                <div className="bg-yellow-400" style={{ width: `${payload.notifications.length ? (warningNotifications / payload.notifications.length) * 100 : 0}%` }} />
                <div className="bg-sky-400" style={{ width: `${payload.notifications.length ? (infoNotifications / payload.notifications.length) * 100 : 0}%` }} />
              </div>
              <div className={`mt-2 flex flex-wrap gap-3 ${compact ? 'text-[11px]' : 'text-xs'} text-gray-500 dark:text-slate-400`}>
                <span>Critical {criticalNotifications}</span>
                <span>Warning {warningNotifications}</span>
                <span>Info {infoNotifications}</span>
              </div>
            </div>
            <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
              {payload.notifications.slice(0, notificationsToShow).map(notification => (
                <div key={notification.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-slate-800/80">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{notification.title}</div>
                    <span className="text-[11px] text-gray-500 dark:text-slate-400">{notification.severity}</span>
                  </div>
                  {!compact && <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">{notification.message}</div>}
                </div>
              ))}
              {payload.notifications.length === 0 && <div className="text-sm text-gray-500 dark:text-slate-500">No active notifications.</div>}
            </div>
          </section>
        )
      case 'workflows':
        if (!payload.dashboard.sections.workflows) return null
        return (
          <section className={cardClass}>
            <h2 className={`mb-4 ${compact ? 'text-base' : 'text-lg'} font-semibold`}>Workflows</h2>
            <div className="mb-3">
              <div className="flex h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-800">
                <div className="bg-sky-400" style={{ width: `${(runningWorkflows / totalWorkflows) * 100}%` }} />
                <div className="bg-red-400" style={{ width: `${(failedWorkflows / totalWorkflows) * 100}%` }} />
                <div className="bg-slate-500" style={{ width: `${(idleWorkflows / totalWorkflows) * 100}%` }} />
              </div>
              <div className={`mt-2 flex flex-wrap gap-3 ${compact ? 'text-[11px]' : 'text-xs'} text-gray-500 dark:text-slate-400`}>
                <span>Running {runningWorkflows}</span>
                <span>Failed {failedWorkflows}</span>
                <span>Other {idleWorkflows}</span>
              </div>
            </div>
            <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
              {payload.workflows.slice(0, workflowsToShow).map(workflow => (
                <div key={workflow.id} className={`${nestedClass} ${compact ? 'p-3' : 'p-4'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium">{workflow.name}</div>
                      {!compact && <div className="text-sm text-gray-500 dark:text-slate-500">{workflow.description || workflow.id}</div>}
                    </div>
                    <span className="text-[11px] text-gray-500 dark:text-slate-400">{workflow.status}</span>
                  </div>
                  {!compact && (
                    <div className="mt-3 grid gap-2 text-sm text-gray-500 dark:text-slate-400">
                      <div>Next run: {workflow.nextRunAt ? new Date(workflow.nextRunAt).toLocaleString() : 'Manual / none scheduled'}</div>
                      {workflow.kickoffSummary && (
                        <div className="rounded-md bg-gray-100 p-2 text-gray-700 dark:bg-slate-900/60 dark:text-slate-300">Kickoff: {workflow.kickoffSummary}</div>
                      )}
                      {workflow.resultSummary.length > 0 && (
                        <div className="rounded-md bg-gray-100 p-2 text-gray-700 dark:bg-slate-900/60 dark:text-slate-300">Result: {workflow.resultSummary.join(' ')}</div>
                      )}
                      {(workflow.resultArtifacts?.length || workflow.resultLinks.length) > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(workflow.resultArtifacts?.length ? workflow.resultArtifacts : workflow.resultLinks.map((link: string) => ({ kind: 'link', label: 'Open result', url: link }))).map((artifact: any) => (
                            artifact.kind === 'link' && artifact.url ? (
                              <a key={`${artifact.label}-${artifact.url}`} href={artifact.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-300 hover:bg-sky-500/20">
                                {artifact.label}
                              </a>
                            ) : (
                              <span key={`${artifact.label}-${artifact.relativePath || 'file'}`} className="rounded-full border border-gray-300 bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300">
                                {artifact.label}
                              </span>
                            )
                          ))}
                        </div>
                      )}
                      {detail && workflow.latestExecution?.logsPreview?.length > 0 && (
                        <div className="rounded-md border border-gray-200 bg-gray-100 p-3 dark:border-white/10 dark:bg-slate-900/60">
                          <div className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Trace Preview</div>
                          <div className="space-y-1 text-xs text-gray-700 dark:text-slate-300">
                            {workflow.latestExecution.logsPreview.map((line, index) => (
                              <div key={`${workflow.id}-ordered-trace-${index}`} className="rounded bg-white px-2 py-1 dark:bg-slate-950/60">
                                {line}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {detail && workflow.executionHistory.length > 0 && (
                        <div className="rounded-md border border-gray-200 bg-gray-100 p-3 dark:border-white/10 dark:bg-slate-900/60">
                          <div className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Recent Runs</div>
                          <div className="space-y-1 text-xs text-gray-700 dark:text-slate-300">
                            {workflow.executionHistory.slice(0, 5).map((run) => (
                              <div key={run.id} className="flex items-center justify-between rounded bg-white px-2 py-1 dark:bg-slate-950/60">
                                <span>{run.status}</span>
                                <span className="text-gray-500 dark:text-slate-500">{timeAgo(run.completedAt || run.startedAt)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      case 'groupChats':
        if (!payload.dashboard.sections.groupChats) return null
        return (
          <section className={cardClass}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={`${compact ? 'text-base' : 'text-lg'} font-semibold`}>Group Chats</h2>
              <span className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-slate-400`}>{payload.groupChats.length} channels</span>
            </div>
            <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
              {payload.groupChats.slice(0, chatsToShow).map((chat) => (
                <div key={`${chat.type}:${chat.name}`} className={`${nestedClass} ${compact ? 'p-3' : 'p-4'}`}>
                  <div className="font-medium text-gray-900 dark:text-slate-100">{chat.name}</div>
                  {!compact && (
                    <>
                      <div className="mt-2 text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">
                        {chat.type}{chat.community ? ` · ${chat.community}` : ''}
                      </div>
                      <div className="mt-3 text-sm text-gray-700 dark:text-slate-300">
                        {chat.latestMessage ? chat.latestMessage.content : 'No messages yet. This channel is available for workspace coordination.'}
                      </div>
                      {detail && chat.recentMessages.length > 0 && (
                        <div className="mt-3 rounded-md border border-gray-200 bg-gray-100 p-3 dark:border-white/10 dark:bg-slate-900/60">
                          <div className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Recent Chat</div>
                          <div className="space-y-2 text-xs text-gray-700 dark:text-slate-300">
                            {chat.recentMessages.map((message, index) => (
                              <div key={`${chat.name}-ordered-msg-${index}`} className="rounded bg-white px-2 py-1.5 dark:bg-slate-950/60">
                                <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-slate-500">
                                  <span>{message.from}</span>
                                  <span>{timeAgo(new Date(message.timestamp).toISOString())}</span>
                                </div>
                                <div>{message.content}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
    }
  }

  if (hasCustomSectionOrder && !compact) {
    return (
      <div className={shellClass}>
        <div className={`mx-auto ${containerWidth} ${compact ? 'px-4 py-5' : 'px-6 py-8'}`}>
          <header className={`mb-8 ${headerClass} ${compact ? 'p-4' : 'p-6'}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs uppercase tracking-[0.2em] text-gray-500 dark:bg-white/5 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: payload.workspace.color }} />
                  Workspace Summary
                </div>
                <h1 className={`${compact ? 'text-2xl' : 'text-3xl'} font-bold tracking-tight`}>{payload.dashboard.title}</h1>
              </div>
              <div className="flex items-start gap-3">
                <div className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-slate-400`}>
                  <div className="mb-1 uppercase tracking-wide text-gray-500 dark:text-slate-500">{payload.dashboard.displayMode} view</div>
                  <div>{payload.workspace.name}</div>
                  <div>Last refreshed {timeAgo(payload.refreshedAt)}</div>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </header>
          <div className={compact ? 'space-y-4' : 'space-y-6'}>
            {orderedTopLevelSections.map((key) => (
              <React.Fragment key={key}>{renderOrderedSection(key)}</React.Fragment>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (compact) {
    return (
      <div className={shellClass}>
        <div className={`mx-auto ${containerWidth} px-4 py-5`}>
          <header className={`mb-6 ${headerClass} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs uppercase tracking-[0.2em] text-gray-500 dark:bg-white/5 dark:text-slate-400">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: payload.workspace.color }} />
                  Workspace Summary
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{payload.dashboard.title}</h1>
              </div>
              <div className="flex items-start gap-3">
                <div className="text-xs text-gray-500 dark:text-slate-400">
                  <div className="mb-1 uppercase tracking-wide text-gray-500 dark:text-slate-500">compact view</div>
                  <div>{payload.workspace.name}</div>
                  <div>Last refreshed {timeAgo(payload.refreshedAt)}</div>
                  <div>Updated {timeAgo(payload.workspace.lastUpdatedAt)}</div>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </header>

          {payload.dashboard.sections.overview && (
            <section className="mb-4 grid gap-2 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {overviewCards.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/80">
                  <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">{label}</div>
                  <div className="mt-2 text-xl font-semibold">{value}</div>
                </div>
              ))}
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              {compactLeftSections.map((key) => (
                <React.Fragment key={key}>{renderOrderedSection(key)}</React.Fragment>
              ))}
            </div>
            <div className="space-y-4">
              {compactRightSections.map((key) => (
                <React.Fragment key={key}>{renderOrderedSection(key)}</React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={shellClass}>
      <div className={`mx-auto ${containerWidth} ${compact ? 'px-4 py-5' : 'px-6 py-8'}`}>
        <header className={`mb-8 ${headerClass} ${compact ? 'p-4' : 'p-6'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs uppercase tracking-[0.2em] text-gray-500 dark:bg-white/5 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: payload.workspace.color }} />
                Workspace Summary
              </div>
              <h1 className={`${compact ? 'text-2xl' : 'text-3xl'} font-bold tracking-tight`}>{payload.dashboard.title}</h1>
              {!compact && <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">{payload.dashboard.description || payload.workspace.name}</p>}
            </div>
            <div className="flex items-start gap-3">
              <div className={`${compact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-slate-400`}>
                <div className="mb-1 uppercase tracking-wide text-gray-500 dark:text-slate-500">{payload.dashboard.displayMode} view</div>
                <div>{payload.workspace.name}</div>
                <div>Last refreshed {timeAgo(payload.refreshedAt)}</div>
                <div>Updated {timeAgo(payload.workspace.lastUpdatedAt)}</div>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {payload.dashboard.sections.overview && (
          <section className={`mb-8 grid ${compact ? 'gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'gap-3 sm:grid-cols-2 xl:grid-cols-6'}`}>
            {overviewCards.map(([label, value]) => (
              <div key={label} className={`rounded-2xl border border-white/10 bg-slate-900/80 ${compact ? 'p-3' : 'p-4'}`}>
                <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                <div className={`mt-2 font-semibold ${compact ? 'text-xl' : 'text-2xl'}`}>{value}</div>
              </div>
            ))}
          </section>
        )}

        <div className={`grid ${compact ? 'gap-4' : 'gap-6'} ${twoColLayout}`}>
          {payload.dashboard.sections.costs && (
            <section className={`rounded-2xl border border-white/10 bg-slate-900/80 ${cardPadding}`}>
              <h2 className={`mb-4 ${compact ? 'text-base' : 'text-lg'} font-semibold`}>Costs & Budget</h2>
              <div className={`mb-3 flex items-center justify-between ${compact ? 'text-xs' : 'text-sm'} text-slate-400`}>
                <span>${budget.currentSpendUsd.toFixed(4)} spent</span>
                <span>${budget.remainingUsd.toFixed(4)} remaining</span>
              </div>
              <div className="h-3 w-full rounded-full bg-slate-800">
                <div className={`h-3 rounded-full ${budgetBarColor}`} style={{ width: `${Math.min(budget.usedPct, 100)}%` }} />
              </div>
              <div className={`mt-3 ${compact ? 'text-xs' : 'text-sm'} text-slate-400`}>{budget.usedPct.toFixed(1)}% of ${budget.config.limitUsd.toFixed(2)} workspace budget used</div>
              <div className={`mt-4 grid grid-cols-3 gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
                <div className="rounded-xl border border-white/10 bg-slate-800/70 px-3 py-2">
                  <div className="text-slate-500">Today</div>
                  <div className="mt-1 font-semibold text-slate-100">${payload.costs.metering.costSummary.todayCostUsd.toFixed(2)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-800/70 px-3 py-2">
                  <div className="text-slate-500">Last 7d</div>
                  <div className="mt-1 font-semibold text-slate-100">${payload.costs.metering.costSummary.last7dCostUsd.toFixed(2)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-800/70 px-3 py-2">
                  <div className="text-slate-500">Avg / day</div>
                  <div className="mt-1 font-semibold text-slate-100">${payload.costs.metering.costSummary.avgDailyCostUsd.toFixed(2)}</div>
                </div>
              </div>
              {renderCostTrend(true)}
              {compact && (
                <div className="mt-3 rounded-xl border border-white/10 bg-slate-800/70 p-3">
                  <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Budget Snapshot</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-slate-500">Used</div>
                      <div className="font-medium text-slate-100">${budget.currentSpendUsd.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Remaining</div>
                      <div className="font-medium text-slate-100">${budget.remainingUsd.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Limit</div>
                      <div className="font-medium text-slate-100">${budget.config.limitUsd.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-300">
                  <span>Top Workflow Spend</span>
                  {payload.costs.metering.byWorkflow.length > 0 && (
                    <span className="text-xs uppercase tracking-wide text-slate-500">{workflowSharePct.toFixed(0)}% top-share</span>
                  )}
                </div>
                <div className="space-y-2">
                  {payload.costs.metering.byWorkflow.slice(0, compact ? 3 : 5).map(workflow => (
                    <div key={workflow.workflowId} className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2 text-sm">
                      <div className="min-w-0 pr-3">
                        <div className="truncate">{workflow.workflowName || workflow.workflowId}</div>
                        {!compact && <div className="text-xs text-slate-500">{workflow.totalRuns || 0} runs</div>}
                      </div>
                      <span className="text-emerald-400">${workflow.estimatedCostUsd.toFixed(4)}</span>
                    </div>
                  ))}
                  {payload.costs.metering.byWorkflow.length === 0 && (
                    <div className="text-sm text-slate-500">No workflow spend recorded yet.</div>
                  )}
                </div>
              </div>

              {!compact && (
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
              )}
            </section>
          )}

          {payload.dashboard.sections.notifications && (
            <section className={`rounded-2xl border border-white/10 bg-slate-900/80 ${cardPadding}`}>
              <h2 className={`mb-4 ${compact ? 'text-base' : 'text-lg'} font-semibold`}>Active Notifications</h2>
              <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
                {payload.notifications.length === 0 && (
                  <div className="text-sm text-slate-500">No active notifications.</div>
                )}
                {payload.notifications.slice(0, notificationsToShow).map(notification => (
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
                    {!compact && <div className="mt-1 text-sm text-slate-400">{notification.message}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className={`mt-6 grid ${compact ? 'gap-4' : 'gap-6'} ${lowerGrid}`}>
          {payload.dashboard.sections.agents && (
            <section className={`rounded-2xl border border-white/10 bg-slate-900/80 ${cardPadding}`}>
              <h2 className={`mb-4 ${compact ? 'text-base' : 'text-lg'} font-semibold`}>Agent Status</h2>
              {compact && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
                    <span>Status mix</span>
                    <span>{payload.agents.length} total</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="bg-green-400" style={{ width: `${(onlineAgents / totalAgents) * 100}%` }} />
                    <div className="bg-yellow-400" style={{ width: `${(pausedAgents / totalAgents) * 100}%` }} />
                    <div className="bg-slate-500" style={{ width: `${(offlineAgents / totalAgents) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
                    <span>Online {onlineAgents}</span>
                    <span>Paused {pausedAgents}</span>
                    <span>Other {offlineAgents}</span>
                  </div>
                </div>
              )}
              <div className={`${compact ? 'space-y-1.5' : 'space-y-2'}`}>
                {payload.agents.slice(0, agentsToShow).map(agent => (
                  <div key={agent.id} className={`flex items-center justify-between rounded-lg bg-slate-800/70 px-3 ${compact ? 'py-1.5 text-xs' : 'py-2 text-sm'}`}>
                    <div>
                      <div className="font-medium">{agent.name}</div>
                      {!compact && <div className="text-slate-500">{agent.id} · last activity {timeAgo(agent.lastHeartbeat)}</div>}
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
                      {!compact && <span className="text-emerald-400">${agent.costUsd.toFixed(4)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {payload.dashboard.sections.workflows && (
            <section className={`rounded-2xl border border-white/10 bg-slate-900/80 ${cardPadding}`}>
              <h2 className={`mb-4 ${compact ? 'text-base' : 'text-lg'} font-semibold`}>Workflows</h2>
              {compact && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-500">
                    <span>Execution mix</span>
                    <span>{payload.workflows.length} total</span>
                  </div>
                  <div className="flex h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="bg-sky-400" style={{ width: `${(runningWorkflows / totalWorkflows) * 100}%` }} />
                    <div className="bg-red-400" style={{ width: `${(failedWorkflows / totalWorkflows) * 100}%` }} />
                    <div className="bg-slate-500" style={{ width: `${(idleWorkflows / totalWorkflows) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
                    <span>Running {runningWorkflows}</span>
                    <span>Failed {failedWorkflows}</span>
                    <span>Other {idleWorkflows}</span>
                  </div>
                </div>
              )}
              <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
                {payload.workflows.slice(0, workflowsToShow).map(workflow => (
                  <div key={workflow.id} className={`rounded-xl border border-white/10 bg-slate-800/70 ${compact ? 'p-3' : 'p-4'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{workflow.name}</div>
                        {!compact && <div className="text-sm text-slate-500">{workflow.description || workflow.id}</div>}
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
                    <div className={`mt-3 grid gap-2 ${compact ? 'text-xs' : 'text-sm'} text-slate-400`}>
                      <div>{compact ? 'Next:' : 'Next run:'} {workflow.nextRunAt ? new Date(workflow.nextRunAt).toLocaleString() : 'Manual / none scheduled'}</div>
                      {!compact && payload.dashboard.sections.kickoff && workflow.kickoffSummary && (
                        <div className="rounded-md bg-slate-900/60 p-2 text-slate-300">Kickoff: {workflow.kickoffSummary}</div>
                      )}
                      {!compact && payload.dashboard.sections.results && workflow.resultSummary.length > 0 && (
                        <div className="rounded-md bg-slate-900/60 p-2 text-slate-300">
                          Result: {workflow.resultSummary.join(' ')}
                        </div>
                      )}
                      {payload.dashboard.sections.results && ((workflow.resultArtifacts?.length || workflow.resultLinks.length) > 0) && (
                        <div className="flex flex-wrap gap-2">
                          {(workflow.resultArtifacts?.length ? workflow.resultArtifacts : workflow.resultLinks.map((link: string) => ({ kind: 'link', label: 'Open result', url: link }))).map((artifact: any) => (
                            artifact.kind === 'link' && artifact.url ? (
                              <a
                                key={`${artifact.label}-${artifact.url}`}
                                href={artifact.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`rounded-full border border-sky-500/30 bg-sky-500/10 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} text-sky-300 hover:bg-sky-500/20`}
                              >
                                {artifact.label}
                              </a>
                            ) : (
                              <span
                                key={`${artifact.label}-${artifact.relativePath || 'file'}`}
                                className={`rounded-full border border-gray-300 bg-gray-100 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} text-gray-700 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300`}
                              >
                                {artifact.label}
                              </span>
                            )
                          ))}
                        </div>
                      )}
                      {detail && workflow.latestExecution?.logsPreview?.length > 0 && (
                        <div className="rounded-md border border-white/10 bg-slate-900/60 p-3">
                          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Trace Preview</div>
                          <div className="space-y-1 text-xs text-slate-300">
                            {workflow.latestExecution.logsPreview.map((line, index) => (
                              <div key={`${workflow.id}-trace-${index}`} className="rounded bg-slate-950/60 px-2 py-1">
                                {line}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {detail && workflow.executionHistory.length > 0 && (
                        <div className="rounded-md border border-white/10 bg-slate-900/60 p-3">
                          <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Recent Runs</div>
                          <div className="space-y-1 text-xs text-slate-300">
                            {workflow.executionHistory.slice(0, 5).map((execution) => (
                              <div key={execution.id} className="flex items-center justify-between rounded bg-slate-950/60 px-2 py-1">
                                <span>{execution.status}</span>
                                <span>{timeAgo(execution.startedAt)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {payload.dashboard.sections.groupChats && (
          <section className={`mt-6 rounded-2xl border border-white/10 bg-slate-900/80 ${cardPadding}`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={`${compact ? 'text-base' : 'text-lg'} font-semibold`}>Group Chats</h2>
              <span className={`${compact ? 'text-xs' : 'text-sm'} text-slate-400`}>{payload.groupChats.length} channels</span>
            </div>
            <div className={`grid ${compact ? 'gap-2' : 'gap-4'} lg:grid-cols-2`}>
              {payload.groupChats.length === 0 && (
                <div className="text-sm text-slate-500">No group or community chat activity yet.</div>
              )}
              {payload.groupChats.slice(0, chatsToShow).map((chat) => (
                <div key={`${chat.type}:${chat.name}`} className={`rounded-xl border border-white/10 bg-slate-800/70 ${compact ? 'p-3' : 'p-4'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-100">{chat.name}</div>
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        {chat.type}{chat.community ? ` · ${chat.community}` : ''}
                      </div>
                    </div>
                    {chat.messageCount > 0 && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-red-400" />}
                  </div>
                  <div className={`mt-3 ${compact ? 'text-xs' : 'text-sm'} text-slate-300`}>
                    {chat.latestMessage ? chat.latestMessage.content : 'No messages yet. This channel is available for workspace coordination.'}
                  </div>
                  <div className={`mt-3 flex flex-wrap ${compact ? 'gap-1.5' : 'gap-2'}`}>
                    {chat.channels.map((channel) => (
                      <span key={channel} className="rounded-full border border-white/10 bg-slate-900/60 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                        {channel}
                      </span>
                    ))}
                    {chat.channels.length === 0 && (
                      <span className="rounded-full border border-white/10 bg-slate-900/60 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-500">
                        no channels listed
                      </span>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-slate-500">
                    {chat.members.length} members · {chat.messageCount} messages · {chat.latestMessage ? timeAgo(new Date(chat.latestMessage.timestamp).toISOString()) : 'waiting for activity'}
                  </div>
                  {detail && chat.recentMessages.length > 0 && (
                    <div className="mt-3 rounded-md border border-white/10 bg-slate-900/60 p-3">
                      <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">Recent Chat</div>
                      <div className="space-y-2 text-xs text-slate-300">
                        {chat.recentMessages.map((message, index) => (
                          <div key={`${chat.name}-msg-${index}`} className="rounded bg-slate-950/60 px-2 py-1.5">
                            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                              <span>{message.from}</span>
                              <span>{timeAgo(new Date(message.timestamp).toISOString())}</span>
                            </div>
                            <div>{message.content}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
