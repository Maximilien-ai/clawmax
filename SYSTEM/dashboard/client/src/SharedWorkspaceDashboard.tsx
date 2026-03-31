import React, { useEffect, useMemo, useState } from 'react'

interface SharedDashboardPayload {
  refreshedAt: string
  dashboard: {
    title: string
    description: string | null
    displayMode: 'standard' | 'compact' | 'detail'
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
    resultLinks: string[]
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
          executionHistory: Array.isArray(workflow?.executionHistory) ? workflow.executionHistory : [],
        }))
      : [],
    groupChats: Array.isArray(input?.groupChats)
      ? input.groupChats.map((chat: any) => ({
          ...chat,
          channels: Array.isArray(chat?.channels) ? chat.channels : [],
          members: Array.isArray(chat?.members) ? chat.members : [],
          messageCount: Number(chat?.messageCount || 0),
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
  const containerWidth = compact ? 'max-w-4xl' : detail ? 'max-w-[96rem]' : 'max-w-7xl'
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className={`mx-auto ${containerWidth} ${compact ? 'px-4 py-5' : 'px-6 py-8'}`}>
        <header className={`mb-8 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl ${compact ? 'p-4' : 'p-6'}`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: payload.workspace.color }} />
                Workspace Summary
              </div>
              <h1 className={`${compact ? 'text-2xl' : 'text-3xl'} font-bold tracking-tight`}>{payload.dashboard.title}</h1>
              {!compact && <p className="mt-2 text-sm text-slate-400">{payload.dashboard.description || payload.workspace.name}</p>}
            </div>
            <div className={`${compact ? 'text-xs' : 'text-sm'} text-slate-400`}>
              <div className="mb-1 uppercase tracking-wide text-slate-500">{payload.dashboard.displayMode} view</div>
              <div>{payload.workspace.name}</div>
              <div>Last refreshed {timeAgo(payload.refreshedAt)}</div>
              <div>Updated {timeAgo(payload.workspace.lastUpdatedAt)}</div>
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
                      {payload.dashboard.sections.results && workflow.resultLinks.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {workflow.resultLinks.map((link) => (
                            <a
                              key={link}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`rounded-full border border-sky-500/30 bg-sky-500/10 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'} text-sky-300 hover:bg-sky-500/20`}
                            >
                              Open result
                            </a>
                          ))}
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
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
