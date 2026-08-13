import React, { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { transformWorkspaceMarkdownUrl } from './lib/markdownLinks'
import { buildWorkflowHandoffDisplay } from './lib/workflowDisplay'
import { extractWorkspaceFileMentions, linkifyWorkspaceFiles, normalizeWorkspaceFileTarget, parseWorkspaceDocEntriesResponse, resolveWorkspaceDocPath } from './lib/workspaceFiles'
import { resolveNavigableWorkspaceDocPath } from './lib/workspaceDocNavigation'
import { canSendDashboardInteraction, pruneDashboardInteractionAttempts, validateDashboardInteractionMessage, type DashboardInteractionAttempt } from './lib/workspaceDashboardInteractionGuard'

interface SharedDashboardPayload {
  refreshedAt: string
  dashboard: {
    title: string
    description: string | null
    slug: string
    refreshEnabled: boolean
    refreshIntervalSeconds: number
    companyFocusKind: 'workspace' | 'team' | 'prefix'
    companyFocusValue: string | null
    companyFocusLabel: string | null
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
      interactions: boolean
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
  company: null | {
    kind: 'team' | 'prefix'
    label: string
    teamCount: number
    workflowCount: number
    agentCount: number
    teams: Array<{
      id: string
      name: string
      purpose: string
      leaderAgentId: string | null
      leaderName: string | null
      memberCount: number
      parentTeamId: string | null
      workflowCount: number
    }>
    orgCards: Array<{
      id: string
      name: string
      purpose: string
      leaderAgentId: string | null
      memberCount: number
      workflowCount: number
    }>
    handoffs: Array<{
      workflowId: string
      workflowName: string
      upstreamWorkflowId: string
      label: string
      outputKey: string
      summary?: string
      artifactPath?: string
      missing?: boolean
    }>
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
    kickoffItems?: string[]
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

const NOISE_FILE_NAMES = new Set(['IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'GROUPS.md', 'COMMUNITIES.md', 'HEARTBEAT.md', 'USER.md', 'AGENTS.md'])

function isNoiseWorkspaceFile(target: string): boolean {
  const normalized = normalizeWorkspaceFileTarget(target)
  const base = normalized.split('/').pop() || normalized
  if (NOISE_FILE_NAMES.has(base)) return true
  if (/^WORKFLOWS\/executions\/.+\.json$/i.test(normalized)) return true
  if (/^SYSTEM\/messages\/.+\.json$/i.test(normalized)) return true
  if (/^SYSTEM\/(?:agent-state|budget|notifications|workspace-dashboards)\.json$/i.test(normalized)) return true
  return false
}

function extractMostRecentWorkspaceFiles(messages: Array<{ content: string }>, limit = 1): string[] {
  const seen = new Set<string>()
  const results: string[] = []

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const files = extractWorkspaceFileMentions(messages[index]?.content || '').filter((file) => !isNoiseWorkspaceFile(file))
    for (const file of files) {
      if (seen.has(file)) continue
      seen.add(file)
      results.push(file)
      if (results.length >= limit) return results
    }
  }

  return results
}

function normalizePayload(input: any): SharedDashboardPayload {
  return {
    refreshedAt: typeof input?.refreshedAt === 'string' ? input.refreshedAt : new Date().toISOString(),
    dashboard: {
      title: typeof input?.dashboard?.title === 'string' ? input.dashboard.title : 'Workspace Summary',
      description: typeof input?.dashboard?.description === 'string' ? input.dashboard.description : null,
      slug: typeof input?.dashboard?.slug === 'string' ? input.dashboard.slug : '',
      refreshEnabled: input?.dashboard?.refreshEnabled === true,
      refreshIntervalSeconds: Number.isFinite(input?.dashboard?.refreshIntervalSeconds) ? Math.max(10, input.dashboard.refreshIntervalSeconds) : 30,
      companyFocusKind: input?.dashboard?.companyFocusKind === 'team' || input?.dashboard?.companyFocusKind === 'prefix' ? input.dashboard.companyFocusKind : 'workspace',
      companyFocusValue: typeof input?.dashboard?.companyFocusValue === 'string' ? input.dashboard.companyFocusValue : null,
      companyFocusLabel: typeof input?.dashboard?.companyFocusLabel === 'string' ? input.dashboard.companyFocusLabel : null,
      displayMode: input?.dashboard?.displayMode === 'compact' || input?.dashboard?.displayMode === 'detail' ? input.dashboard.displayMode : 'standard',
      sectionOrder: Array.isArray(input?.dashboard?.sectionOrder) && input.dashboard.sectionOrder.length > 0 ? input.dashboard.sectionOrder : ['overview', 'costs', 'agents', 'notifications', 'workflows', 'kickoff', 'results', 'groupChats'],
      compactColumns: {
        overview: input?.dashboard?.compactColumns?.overview === 'right' ? 'right' : 'left',
        costs: input?.dashboard?.compactColumns?.costs === 'left' ? 'left' : 'right',
        agents: input?.dashboard?.compactColumns?.agents === 'left' ? 'left' : 'right',
        notifications: input?.dashboard?.compactColumns?.notifications === 'left' ? 'left' : 'right',
        workflows: input?.dashboard?.compactColumns?.workflows === 'right' ? 'right' : 'left',
        kickoff: input?.dashboard?.compactColumns?.kickoff === 'right' ? 'right' : 'left',
        results: input?.dashboard?.compactColumns?.results === 'left' ? 'left' : 'right',
        groupChats: input?.dashboard?.compactColumns?.groupChats === 'right' ? 'right' : 'left',
        interactions: input?.dashboard?.compactColumns?.interactions === 'left' ? 'left' : 'right',
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
        interactions: input?.dashboard?.sections?.interactions === true,
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
    company: input?.company ? {
      kind: input.company.kind === 'prefix' ? 'prefix' : 'team',
      label: typeof input.company.label === 'string' ? input.company.label : 'Company',
      teamCount: Number(input.company.teamCount || 0),
      workflowCount: Number(input.company.workflowCount || 0),
      agentCount: Number(input.company.agentCount || 0),
      teams: Array.isArray(input.company.teams) ? input.company.teams : [],
      orgCards: Array.isArray(input.company.orgCards) ? input.company.orgCards : [],
      handoffs: Array.isArray(input.company.handoffs) ? input.company.handoffs : [],
    } : null,
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

function getWorkflowTeamLabel(name: string | null | undefined): string | null {
  const trimmed = String(name || '').trim()
  const withoutPrefix = trimmed.replace(/^(.*?)\s+·\s+/, '')
  const segment = withoutPrefix.split('/')[0]?.trim()
  return segment || null
}

function workflowFallbackLeaderNameFromWorkflows(workflows: SharedDashboardPayload['workflows']): string | null {
  const firstOwner = workflows
    .map((workflow) => workflow.name.replace(/^(.*?)\s+·\s+/, '').split('/')[0]?.trim())
    .find(Boolean)
  return firstOwner || null
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

function MarkdownBlock({ content, className = '', onOpenDoc }: { content: string; className?: string; onOpenDoc?: (path: string) => void }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={transformWorkspaceMarkdownUrl}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-inherit">{children}</strong>,
          em: ({ children }) => <em className="italic text-inherit">{children}</em>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
          li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
          code: ({ children }) => <code className="rounded bg-gray-200 px-1 py-0.5 text-[0.95em] text-inherit dark:bg-slate-950/60">{children}</code>,
          pre: ({ children }) => <pre className="mb-2 overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-800 dark:bg-slate-950/80 dark:text-gray-100 last:mb-0">{children}</pre>,
          a: ({ children, href }) => {
            if (href?.startsWith('workspace-file:') && onOpenDoc) {
              const file = href.replace('workspace-file:', '')
              return (
                <button
                  type="button"
                  onClick={() => onOpenDoc(file)}
                  className="text-sky-600 underline underline-offset-2 dark:text-sky-300"
                >
                  {children}
                </button>
              )
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline underline-offset-2 dark:text-sky-300">{children}</a>
          },
        }}
      >
        {linkifyWorkspaceFiles(content)}
      </ReactMarkdown>
    </div>
  )
}

export default function SharedWorkspaceDashboard({ token }: { token: string }) {
  const [payload, setPayload] = useState<SharedDashboardPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [docEntries, setDocEntries] = useState<Array<{ path: string }>>([])
  const [docPath, setDocPath] = useState<string | null>(null)
  const [docContent, setDocContent] = useState('')
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)
  const [interactionKind, setInteractionKind] = useState<'agent' | 'workflow' | 'group'>('agent')
  const [interactionTarget, setInteractionTarget] = useState('')
  const [interactionMessage, setInteractionMessage] = useState('')
  const [interactionStatus, setInteractionStatus] = useState<string | null>(null)
  const [interactionAttempts, setInteractionAttempts] = useState<DashboardInteractionAttempt[]>([])
  const [interactionHeight, setInteractionHeight] = useState(260)
  const [interactionHistory, setInteractionHistory] = useState<Array<{ kind: string; target: string; message: string; response: string; at: string }>>(() => {
    try {
      const saved = localStorage.getItem(`clawmax-dashboard-interactions:${token}`)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
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
          const normalized = normalizePayload(data)
          setPayload((previous) => {
            if (!previous) setAutoRefresh(normalized.dashboard.refreshEnabled)
            return normalized
          })
          setError(null)
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load workspace dashboard')
      }
    }
    load()
    if (!autoRefresh) {
      return () => { cancelled = true }
    }
    const interval = setInterval(load, (payload?.dashboard.refreshIntervalSeconds || 30) * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [token, autoRefresh, payload?.dashboard.refreshIntervalSeconds])

  useEffect(() => {
    try {
      localStorage.setItem(`clawmax-dashboard-interactions:${token}`, JSON.stringify(interactionHistory.slice(-100)))
    } catch {
      // Browser storage is a convenience; interaction delivery should not depend on it.
    }
  }, [interactionHistory, token])

  useEffect(() => {
    let cancelled = false
    const loadDocEntries = async () => {
      try {
        const res = await fetch('/api/docs')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load docs index')
        if (!cancelled) {
          setDocEntries(parseWorkspaceDocEntriesResponse(data))
        }
      } catch {
        if (!cancelled) {
          setDocEntries([])
        }
      }
    }
    loadDocEntries()
    return () => { cancelled = true }
  }, [])

  const overviewCards = useMemo(() => {
    if (!payload) return []
    return [
      ['Agents', payload.overview.totalAgents],
      ['Online', payload.overview.onlineAgents],
      ['Paused', payload.overview.pausedAgents],
      ['Running', payload.overview.runningWorkflows],
      ['Alerts', payload.overview.activeNotifications],
      ['Spend', `$${payload.costs.budget.currentSpendUsd.toFixed(2)}`],
    ]
  }, [payload])

  const companyFocus = payload?.company || null
  const interactionTargets = useMemo(() => {
    if (!payload) return []
    if (interactionKind === 'agent') return payload.agents.map((agent) => ({ id: agent.id, label: agent.name }))
    if (interactionKind === 'workflow') return payload.workflows.map((workflow) => ({ id: workflow.id, label: workflow.name }))
    return payload.groupChats.filter((chat) => chat.type === 'group').map((chat) => ({ id: chat.name, label: chat.name }))
  }, [interactionKind, payload])

  useEffect(() => {
    if (!interactionTargets.some((target) => target.id === interactionTarget)) setInteractionTarget(interactionTargets[0]?.id || '')
  }, [interactionTargets, interactionTarget])

  async function submitInteraction() {
    const messageError = validateDashboardInteractionMessage(interactionMessage)
    if (messageError) {
      setInteractionStatus(messageError)
      return
    }
    const now = Date.now()
    const recentAttempts = pruneDashboardInteractionAttempts(interactionAttempts, now)
    if (!canSendDashboardInteraction(recentAttempts, now)) {
      setInteractionAttempts(recentAttempts)
      setInteractionStatus('Interaction limit reached. Try again in a minute.')
      return
    }
    if (!interactionTarget) return
    setInteractionAttempts([...recentAttempts, { at: now }])
    setInteractionStatus('Sending…')
    try {
      let response: Response
      if (interactionKind === 'workflow') {
        response = await fetch(`/api/workflows/${encodeURIComponent(interactionTarget)}/trigger`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: { prompt: interactionMessage.trim() } }),
        })
      } else if (interactionKind === 'group') {
        response = await fetch(`/api/groups/${encodeURIComponent(interactionTarget)}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: interactionMessage.trim(), from: 'Dashboard visitor' }),
        })
      } else {
        response = await fetch(`/api/agents/${encodeURIComponent(interactionTarget)}/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: interactionMessage.trim() }),
        })
      }
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Interaction failed')
      }
      let resultText = ''
      if (interactionKind === 'agent') {
        const text = await response.text()
        const replies = Array.from(text.matchAll(/"text"\s*:\s*"((?:\\.|[^"\\])*)"/g)).map((match) => match[1])
        resultText = replies.length > 0 ? replies[replies.length - 1].replace(/\\n/g, '\n') : 'Agent accepted the message.'
      } else {
        resultText = interactionKind === 'workflow' ? 'Workflow started.' : 'Message sent.'
      }
      setInteractionStatus(resultText)
      setInteractionHistory((previous) => [...previous, { kind: interactionKind, target: interactionTarget, message: interactionMessage.trim(), response: resultText, at: new Date().toISOString() }].slice(-100))
      setInteractionMessage('')
    } catch (err: any) {
      setInteractionStatus(err.message || 'Interaction failed')
    }
  }
  const companyInputWorkflow = useMemo(() => {
    if (!payload || payload.workflows.length === 0) return null
    return payload.workflows.find((workflow) => Array.isArray(workflow.kickoffItems) && workflow.kickoffItems.length > 0)
      || payload.workflows.find((workflow) => !!workflow.kickoffSummary)
      || payload.workflows[0]
  }, [payload])
  const latestCompanyOutput = useMemo(() => {
    if (!payload) return null
    const workflowsWithArtifacts = payload.workflows
      .filter((workflow) => (workflow.resultArtifacts?.length || workflow.resultSummary.length))
      .sort((a, b) => new Date(b.latestExecution?.completedAt || b.latestExecution?.startedAt || 0).getTime() - new Date(a.latestExecution?.completedAt || a.latestExecution?.startedAt || 0).getTime())
    return workflowsWithArtifacts[0] || null
  }, [payload])
  const companyHandoffFlow = useMemo(() => {
    if (!payload || !companyFocus) return []
    return buildWorkflowHandoffDisplay(
      companyFocus.handoffs,
      payload.workflows.map((workflow) => ({ id: workflow.id, name: workflow.name })),
      companyFocus.label,
    )
  }, [companyFocus, payload])

  async function openDoc(path: string) {
    const resolvedPath = resolveNavigableWorkspaceDocPath(path, docEntries)
    if (!resolvedPath) return
    setDocPath(resolvedPath)
    setDocLoading(true)
    setDocError(null)
    try {
      const res = await fetch(`/api/docs/content?path=${encodeURIComponent(resolvedPath)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load file')
      setDocContent(typeof data.content === 'string' ? data.content : '')
    } catch (err: any) {
      setDocError(err.message || 'Failed to load file')
      setDocContent('')
    } finally {
      setDocLoading(false)
    }
  }

  function renderFileChips(files: string[], options: { compact?: boolean; latestOnly?: boolean } = {}) {
    const uniqueFiles = Array.from(new Set(files)).filter((file) => resolveWorkspaceDocPath(file, docEntries))
    const visibleFiles = options.latestOnly ? uniqueFiles.slice(0, 1) : uniqueFiles.slice(0, options.compact ? 2 : 5)
    if (visibleFiles.length === 0) return null
    return (
      <div className={`mt-2 flex flex-wrap items-center gap-2 ${options.compact ? 'text-[11px]' : ''}`}>
        <span className="text-[11px] font-medium text-gray-500 dark:text-slate-500">
          {options.latestOnly ? 'Latest file:' : 'Files:'}
        </span>
        {visibleFiles.map((file) => (
          <button
            key={file}
            type="button"
            onClick={() => openDoc(file)}
            className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
          >
            {file}
          </button>
        ))}
      </div>
    )
  }

  const docPreviewOverlay = docPath ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-6" onClick={() => setDocPath(null)}>
      <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl dark:bg-slate-900" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-white/10">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Workspace File</div>
            <div className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{docPath}</div>
          </div>
          <button
            type="button"
            onClick={() => setDocPath(null)}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 dark:bg-slate-950/80">
          {docLoading ? (
            <div className="text-sm text-gray-500 dark:text-slate-400">Loading file…</div>
          ) : docError ? (
            <div className="text-sm text-red-600 dark:text-red-400">{docError}</div>
          ) : /\.(json|txt|csv|yml|yaml)$/i.test(docPath) ? (
            <pre className="overflow-x-auto rounded-xl bg-white p-4 text-xs text-gray-800 dark:bg-slate-900 dark:text-slate-100">{docContent}</pre>
          ) : (
            <MarkdownBlock content={docContent} className="rounded-xl bg-white p-4 text-sm text-gray-800 dark:bg-slate-900 dark:text-slate-100" onOpenDoc={openDoc} />
          )}
        </div>
      </div>
    </div>
  ) : null

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
  const agentsToShow = compact ? 3 : detail ? payload.agents.length : payload.agents.length
  const workflowsToShow = compact ? 2 : detail ? payload.workflows.length : payload.workflows.length
  const chatsToShow = compact ? 1 : detail ? payload.groupChats.length : payload.groupChats.length
  const containerWidth = compact ? 'max-w-7xl' : detail ? 'max-w-[96rem]' : 'max-w-7xl'
  const twoColLayout = compact ? 'xl:grid-cols-[0.95fr_1.05fr]' : 'xl:grid-cols-[1.4fr_1fr]'
  const lowerGrid = compact ? 'xl:grid-cols-[1fr_1fr]' : 'xl:grid-cols-[1.1fr_1fr]'
  const cardPadding = compact ? 'p-3' : detail ? 'p-6' : 'p-5'
  const sectionScrollClass = compact
    ? 'max-h-[20rem] overflow-y-auto pr-1'
    : detail
      ? 'max-h-[42rem] overflow-y-auto pr-1'
      : 'max-h-[34rem] overflow-y-auto pr-1'
  const nestedScrollClass = compact
    ? 'max-h-36 overflow-y-auto pr-1'
    : detail
      ? 'max-h-52 overflow-y-auto pr-1'
      : 'max-h-44 overflow-y-auto pr-1'
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
    .filter((key): key is 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'groupChats' | 'interactions' =>
      ['overview', 'costs', 'agents', 'notifications', 'workflows', 'groupChats', 'interactions'].includes(key)
    )
    .filter((key, index, arr) => arr.indexOf(key) === index)
  for (const key of ['overview', 'costs', 'agents', 'notifications', 'workflows', 'groupChats', 'interactions'] as const) {
    if (!orderedTopLevelSections.includes(key)) orderedTopLevelSections.push(key)
  }
  const hasCustomSectionOrder = orderedTopLevelSections.join('|') !== ['overview', 'costs', 'agents', 'notifications', 'workflows', 'groupChats', 'interactions'].join('|')
  const compactOrderedSections = orderedTopLevelSections.filter((key) => key !== 'overview')
  const compactLeftSections = compactOrderedSections.filter((key) => payload.dashboard.compactColumns[key] === 'left')
  const compactRightSections = compactOrderedSections.filter((key) => payload.dashboard.compactColumns[key] === 'right')
  const standardUpperSections = orderedTopLevelSections.filter((key) => key === 'costs' || key === 'notifications')
  const standardMiddleSections = orderedTopLevelSections.filter((key) => key === 'agents')
  const standardLowerSections = orderedTopLevelSections.filter((key) => key === 'workflows' || key === 'groupChats' || key === 'interactions')
  const shellClass = 'min-h-screen bg-gray-50 text-gray-900 dark:bg-slate-950 dark:text-slate-100'
  const headerClass = 'rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-100 shadow-xl dark:border-white/10 dark:from-slate-900 dark:to-slate-800 dark:shadow-2xl'
  const cardClass = `rounded-2xl border border-gray-200 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/80 ${cardPadding}`
  const nestedClass = 'rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-slate-800/70'
  type CompanyTeam = NonNullable<SharedDashboardPayload['company']>['teams'][number]
  const companyChartTeams: CompanyTeam[] = (() => {
    if (!companyFocus) return []
    if (companyFocus.teams.length > 0) return companyFocus.teams
    const orgCardFallbackTeams: CompanyTeam[] = companyFocus.orgCards.map((team) => ({
      id: team.id,
      name: team.name,
      purpose: team.purpose,
      leaderAgentId: team.leaderAgentId,
      leaderName: team.leaderAgentId,
      memberCount: team.memberCount,
      parentTeamId: null,
      workflowCount: team.workflowCount,
    }))
    const inferredRootLeaderName = orgCardFallbackTeams.find((team) => team.leaderName)?.leaderName
      || workflowFallbackLeaderNameFromWorkflows(payload.workflows)
      || null
    if (orgCardFallbackTeams.length > 0) {
      if (orgCardFallbackTeams.length <= 1) return orgCardFallbackTeams
      return [
        {
          id: `${companyFocus.kind}-root`,
          name: companyFocus.label,
          purpose: 'Derived company root for shared dashboard view.',
          leaderAgentId: null,
          leaderName: inferredRootLeaderName,
          memberCount: companyFocus.agentCount,
          parentTeamId: null,
          workflowCount: companyFocus.workflowCount,
        },
        ...orgCardFallbackTeams.map((team) => ({ ...team, parentTeamId: `${companyFocus.kind}-root` })),
      ]
    }
    const workflowFallbackTeams: CompanyTeam[] = Array.from(
      payload.workflows.reduce((map, workflow) => {
        const label = getWorkflowTeamLabel(workflow.name)
        if (!label) return map
        const key = label.toLowerCase()
        const existing = map.get(key)
        if (existing) {
          existing.workflowCount += 1
          if (!existing.purpose && workflow.description) existing.purpose = workflow.description
          return map
        }
        map.set(key, {
          id: key,
          name: label,
          purpose: workflow.description || '',
          leaderAgentId: null,
          leaderName: null,
          memberCount: 0,
          parentTeamId: null,
          workflowCount: 1,
        })
        return map
      }, new Map<string, CompanyTeam>())
    ).map(([, value]) => value)
    if (workflowFallbackTeams.length <= 1) return workflowFallbackTeams
    return [
      {
        id: `${companyFocus.kind}-root`,
        name: companyFocus.label,
        purpose: 'Derived company root for shared dashboard view.',
        leaderAgentId: null,
        leaderName: workflowFallbackLeaderNameFromWorkflows(payload.workflows),
        memberCount: companyFocus.agentCount,
        parentTeamId: null,
        workflowCount: companyFocus.workflowCount,
      },
      ...workflowFallbackTeams.map((team) => ({ ...team, parentTeamId: `${companyFocus.kind}-root` })),
    ]
  })()
  const companyTeamChildren = (() => {
    const children = new Map<string, CompanyTeam[]>()
    if (companyChartTeams.length === 0) return children
    for (const team of companyChartTeams) {
      const parentKey = team.parentTeamId || '__root__'
      const siblings = children.get(parentKey) || []
      siblings.push(team)
      children.set(parentKey, siblings)
    }
    return children
  })()
  const companyRootTeams = (() => {
    if (companyChartTeams.length === 0) return []
    return companyChartTeams.filter((team) => !team.parentTeamId || !companyChartTeams.some((candidate) => candidate.id === team.parentTeamId))
  })()
  const isSyntheticCompanyRoot = (team: CompanyTeam) => companyFocus ? team.id === `${companyFocus.kind}-root` : false
  const derivedCompanyTeamCount = companyFocus
    ? companyChartTeams.filter((team) => team.id !== `${companyFocus.kind}-root`).length
    : 0
  const displayCompanyTeamCount = companyFocus
    ? Math.max(companyFocus.teamCount, derivedCompanyTeamCount)
    : 0
  const renderCompanyOrgNode = (team: CompanyTeam, visited = new Set<string>()): React.ReactNode => {
    if (visited.has(team.id)) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          Recursive team reference skipped: {team.name}
        </div>
      )
    }

    const nextVisited = new Set(visited)
    nextVisited.add(team.id)
    const children = companyTeamChildren.get(team.id) || []

    return (
      <div key={team.id} className="flex flex-col items-center">
        <div className="w-full max-w-[260px] rounded-xl border border-gray-200 bg-gray-50 p-3 shadow-sm dark:border-white/10 dark:bg-slate-800/70">
          {!isSyntheticCompanyRoot(team) && (
            <div className="text-[11px] font-mono uppercase tracking-wide text-gray-500 dark:text-slate-400">{team.id}</div>
          )}
          <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">{team.name}</div>
          {team.leaderName && (
            <div className="mt-1 inline-flex rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-slate-900/70 dark:text-slate-200">
              Lead: {team.leaderName}
            </div>
          )}
          {team.purpose && !isSyntheticCompanyRoot(team) && <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-slate-300">{team.purpose}</p>}
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-500 dark:text-slate-400">
            <span className="rounded-full bg-white px-2 py-1 dark:bg-slate-900/70">{team.memberCount} members</span>
            <span className="rounded-full bg-white px-2 py-1 dark:bg-slate-900/70">{team.workflowCount} workflows</span>
          </div>
        </div>
        {children.length > 0 && (
          <>
            <div className="h-4 w-0.5 bg-gray-300 dark:bg-slate-600" />
            <div className="inline-flex flex-col items-center">
              <div className="border-t-2 border-gray-300 dark:border-slate-600" style={{ width: `calc(${children.length} * 220px)` }} />
              <div className="grid gap-4 pt-4" style={{ gridTemplateColumns: `repeat(${children.length}, minmax(180px, 220px))` }}>
                {children.map((child) => (
                  <div key={child.id} className="flex flex-col items-center">
                    <div className="h-4 w-0.5 bg-gray-300 dark:bg-slate-600" />
                    {renderCompanyOrgNode(child, nextVisited)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    )
  }
  const companyContextSection = companyFocus ? (
    <section className="mb-6 space-y-6">
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className={cardClass}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Company Input</div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Operating Brief</h2>
            </div>
            {companyInputWorkflow && (
              <div className="text-xs text-gray-500 dark:text-slate-400">{companyInputWorkflow.name}</div>
            )}
          </div>
          {companyInputWorkflow ? (
            <div className="space-y-3">
              {companyInputWorkflow.kickoffSummary && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-200">
                  <MarkdownBlock content={companyInputWorkflow.kickoffSummary} />
                </div>
              )}
              {Array.isArray(companyInputWorkflow.kickoffItems) && companyInputWorkflow.kickoffItems.length > 0 && (
                <div className="grid gap-2">
                  {companyInputWorkflow.kickoffItems.slice(0, compact ? 4 : 6).map((item, index) => (
                    <div key={`${companyInputWorkflow.id}-input-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-200">
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-slate-400">No company input brief captured yet.</div>
          )}
        </div>
        <div className={cardClass}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Company Output</div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Latest Deliverables</h2>
            </div>
            {latestCompanyOutput && (
              <div className="text-xs text-gray-500 dark:text-slate-400">{latestCompanyOutput.name}</div>
            )}
          </div>
          {latestCompanyOutput ? (
            <div className="space-y-3">
              {latestCompanyOutput.resultSummary.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-200">
                  <MarkdownBlock content={latestCompanyOutput.resultSummary.slice(0, compact ? 1 : 2).join('\n\n')} />
                </div>
              )}
              {(latestCompanyOutput.resultArtifacts?.length || latestCompanyOutput.resultLinks.length) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(latestCompanyOutput.resultArtifacts?.length ? latestCompanyOutput.resultArtifacts : latestCompanyOutput.resultLinks.map((link: string) => ({ kind: 'link', label: 'Open result', url: link }))).slice(0, compact ? 2 : 4).map((artifact: any, index: number) => (
                    artifact.kind === 'file' && artifact.relativePath ? (
                      <button
                        key={`company-output-file-${index}`}
                        type="button"
                        onClick={() => openDoc(artifact.relativePath)}
                        className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                      >
                        {artifact.label || 'Open file'}
                      </button>
                    ) : artifact.url ? (
                      <a
                        key={`company-output-link-${index}`}
                        href={artifact.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                      >
                        {artifact.label || 'Open link'}
                      </a>
                    ) : null
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-500 dark:text-slate-400">No company output artifacts captured yet.</div>
          )}
        </div>
      </div>
      <div className={cardClass}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Company Org</div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{companyFocus.label}</h2>
          </div>
          <div className="text-right text-xs text-gray-500 dark:text-slate-400">
            <div>{displayCompanyTeamCount} teams</div>
            <div>{companyFocus.agentCount} agents</div>
          </div>
        </div>
        {compact ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-slate-800/70">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Top Teams</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-slate-100">{companyRootTeams.length || derivedCompanyTeamCount || 0}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-slate-800/70">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Named Teams</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-slate-100">{derivedCompanyTeamCount}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-slate-800/70">
                <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Workflow Stages</div>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-slate-100">{companyFocus.workflowCount}</div>
              </div>
            </div>
            {companyChartTeams.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {companyChartTeams
                  .filter((team) => team.id !== `${companyFocus.kind}-root`)
                  .slice(0, 8)
                  .map((team) => (
                    <div key={team.id} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-200">
                      <span className="font-medium">{team.name}</span>
                      <span className="ml-2 text-gray-500 dark:text-slate-400">{team.workflowCount} wf</span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-slate-400">No company org summary available yet.</div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="inline-flex min-w-full justify-center">
              {companyRootTeams.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-6">
                  {companyRootTeams.map((team) => renderCompanyOrgNode(team))}
                </div>
              ) : (
                <div className="text-sm text-gray-500 dark:text-slate-400">No company org chart available yet.</div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className={cardClass}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Workflow Handoffs</div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Company Output Flow</h2>
            <div className="mt-1 text-sm text-gray-500 dark:text-slate-400">Each handoff shows the upstream workflow, published output, and downstream stage that consumes it.</div>
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400">{companyFocus.workflowCount} workflows</div>
        </div>
        <div className="space-y-3">
          {companyHandoffFlow.slice(0, 8).map((handoff) => (
            <div key={handoff.key} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-slate-800/70">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-900/80">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-500">Upstream</div>
                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{handoff.upstreamDisplayName}</div>
                  <div className="truncate text-xs text-gray-500 dark:text-slate-400">{handoff.upstreamWorkflowId}</div>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <div className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-700 dark:text-sky-300">
                    {handoff.label}
                  </div>
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-500">{handoff.outputKey}</div>
                </div>
                <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-slate-900/80">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-500">Downstream</div>
                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{handoff.downstreamDisplayName}</div>
                  <div className="truncate text-xs text-gray-500 dark:text-slate-400">{handoff.downstreamWorkflowId}</div>
                </div>
              </div>
              {handoff.summary && (
                <div className="mt-3 text-sm text-gray-600 dark:text-slate-300">{handoff.summary}</div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {handoff.missing && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                    Missing latest artifact
                  </span>
                )}
                {handoff.artifactPath && (
                  <button
                    type="button"
                    onClick={() => openDoc(handoff.artifactPath)}
                    className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                  >
                    Open handoff document
                  </button>
                )}
              </div>
            </div>
          ))}
          {companyHandoffFlow.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-slate-400">No explicit workflow handoffs captured for this company yet.</div>
          )}
        </div>
      </div>
    </section>
  ) : null
  const renderCostTrend = (dark: boolean) => {
    if (!payload.costs.metering.dailyCost.length) return null
    return (
        <div className={`mt-4 rounded-xl border ${dark ? 'border-white/10 bg-slate-800/70' : 'border-gray-200 bg-gray-50'} ${compact ? 'p-2' : 'p-4'}`}>
          <div className={`mb-3 flex items-center justify-between ${compact ? 'text-[11px]' : 'text-xs'} uppercase tracking-wide ${dark ? 'text-slate-500' : 'text-gray-500'}`}>
            <span>Spend trend</span>
            <span>Last {payload.costs.metering.dailyCost.length}d</span>
          </div>
        <div className={`flex items-end ${compact ? 'gap-1.5' : 'gap-2'}`}>
          {payload.costs.metering.dailyCost.map((entry) => {
            const heightPct = dailyCostMax > 0 ? Math.max((entry.estimatedCostUsd / dailyCostMax) * 100, entry.estimatedCostUsd > 0 ? 12 : 6) : 8
            return (
              <div key={entry.date} className={`flex min-w-0 flex-1 flex-col items-center ${compact ? 'gap-1' : 'gap-2'}`}>
                {!compact && <div className={`text-[10px] ${dark ? 'text-slate-500' : 'text-gray-500'}`}>${entry.estimatedCostUsd.toFixed(2)}</div>}
                <div className={`flex ${compact ? 'h-10' : 'h-20'} w-full items-end rounded-md ${dark ? 'bg-slate-900/70' : 'bg-white'}`}>
                  <div
                    className={`w-full rounded-md ${dark ? 'bg-emerald-400/90' : 'bg-emerald-500'}`}
                    style={{ height: `${heightPct}%` }}
                    title={`${entry.date}: $${entry.estimatedCostUsd.toFixed(2)} across ${entry.traceCount} traces`}
                  />
                </div>
                <div className={`${compact ? 'text-[9px]' : 'text-[10px]'} ${dark ? 'text-slate-500' : 'text-gray-500'}`}>{entry.date.slice(5)}</div>
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

  const HeaderControls = ({ compactLabel = false }: { compactLabel?: boolean }) => (
    <div className="flex items-start gap-3">
      <div className={`${compactLabel ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-slate-400`}>
        <div className="mb-1 uppercase tracking-wide text-gray-500 dark:text-slate-500">{payload.dashboard.displayMode} view</div>
        <div>{payload.workspace.name}</div>
        <div>Last refreshed {timeAgo(payload.refreshedAt)}</div>
        <div>Updated {timeAgo(payload.workspace.lastUpdatedAt)}</div>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-gray-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded border-gray-300 text-sky-600 focus:ring-sky-500 dark:border-gray-600 dark:bg-slate-900"
          />
          Auto-refresh
        </label>
      </div>
      <ThemeToggle />
    </div>
  )

  const renderOrderedSection = (key: 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'groupChats' | 'interactions') => {
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
              <span>${budget.currentSpendUsd.toFixed(2)} spent</span>
              <span>${budget.remainingUsd.toFixed(2)} remaining</span>
            </div>
            <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-slate-800">
              <div className={`h-3 rounded-full ${budgetBarColor}`} style={{ width: `${Math.min(budget.usedPct, 100)}%` }} />
            </div>
            <div className={`mt-3 ${compact ? 'text-xs' : 'text-sm'} text-gray-500 dark:text-slate-400`}>{budget.usedPct.toFixed(1)}% of ${budget.config.limitUsd.toFixed(2)} workspace budget used</div>
            <div className={`mt-4 grid ${compact ? 'grid-cols-3 gap-1.5 text-[10px]' : 'grid-cols-3 gap-2 text-xs'}`}>
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
              <div className={`${compact ? 'space-y-1' : 'space-y-2'}`}>
                {payload.costs.metering.byWorkflow.slice(0, compact ? 1 : 5).map((workflow) => (
                  <div key={workflow.workflowId} className={`flex items-center justify-between rounded-lg bg-gray-50 px-3 dark:bg-slate-800/70 ${compact ? 'py-1 text-[11px]' : 'py-2 text-sm'}`}>
                    <div className="min-w-0 pr-3">
                      <div className="truncate font-medium text-gray-900 dark:text-slate-100">{workflow.workflowName || workflow.workflowId}</div>
                      {!compact && <div className="text-gray-500 dark:text-slate-500">{workflow.totalRuns || 0} runs</div>}
                    </div>
                    <span className="whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">${workflow.estimatedCostUsd.toFixed(2)}</span>
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
            <div className={`${compact ? 'space-y-2' : 'space-y-3'} ${sectionScrollClass}`}>
              {payload.notifications.slice(0, notificationsToShow).map(notification => (
                <div key={notification.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-slate-800/80">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{notification.title}</div>
                    <span className="text-[11px] text-gray-500 dark:text-slate-400">{notification.severity}</span>
                  </div>
                  {!compact && (
                    <>
                      <MarkdownBlock
                        content={notification.message}
                        className="mt-1 text-sm text-gray-500 dark:text-slate-400"
                        onOpenDoc={openDoc}
                      />
                      {renderFileChips(extractWorkspaceFileMentions(notification.message).filter((file) => !isNoiseWorkspaceFile(file)), { compact: true, latestOnly: true })}
                    </>
                  )}
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
            <div className={`${compact ? 'space-y-1.5' : 'space-y-3'} ${sectionScrollClass}`}>
              {payload.workflows.slice(0, workflowsToShow).map(workflow => (
                <div key={workflow.id} className={`${nestedClass} ${compact ? 'p-2.5' : 'p-4'}`}>
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
                        <div className="rounded-md bg-gray-100 p-2 text-gray-700 dark:bg-slate-900/60 dark:text-slate-300">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-500">Kickoff</div>
                          <MarkdownBlock content={workflow.kickoffSummary} />
                        </div>
                      )}
                      {workflow.resultSummary.length > 0 && (
                        <div className="rounded-md bg-gray-100 p-2 text-gray-700 dark:bg-slate-900/60 dark:text-slate-300">
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-500">Result</div>
                          <MarkdownBlock content={workflow.resultSummary.join('\n\n')} />
                        </div>
                      )}
                      {(workflow.resultArtifacts?.length || workflow.resultLinks.length) > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(workflow.resultArtifacts?.length ? workflow.resultArtifacts : workflow.resultLinks.map((link: string) => ({ kind: 'link', label: 'Open result', url: link }))).map((artifact: any) => (
                            artifact.kind === 'link' && artifact.url ? (
                              <a key={`${artifact.label}-${artifact.url}`} href={artifact.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-300 hover:bg-sky-500/20">
                                {artifact.label}
                              </a>
                            ) : (
                              <button
                                key={`${artifact.label}-${artifact.relativePath || 'file'}`}
                                type="button"
                                onClick={() => artifact.relativePath && openDoc(artifact.relativePath)}
                                className="rounded-full border border-gray-300 bg-gray-100 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-200 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                {artifact.label}
                              </button>
                            )
                          ))}
                        </div>
                      )}
                      {detail && workflow.latestExecution?.logsPreview?.length > 0 && (
                        <div className="rounded-md border border-gray-200 bg-gray-100 p-3 dark:border-white/10 dark:bg-slate-900/60">
                          <div className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Trace Preview</div>
                          <div className={`space-y-1 text-xs text-gray-700 dark:text-slate-300 ${nestedScrollClass}`}>
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
                          <div className={`space-y-1 text-xs text-gray-700 dark:text-slate-300 ${nestedScrollClass}`}>
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
            <div className={`${compact ? 'space-y-1.5' : 'space-y-3'} ${sectionScrollClass}`}>
              {payload.groupChats.slice(0, chatsToShow).map((chat) => (
                <div key={`${chat.type}:${chat.name}`} className={`${nestedClass} ${compact ? 'p-2.5' : 'p-4'}`}>
                  <div className="font-medium text-gray-900 dark:text-slate-100">{chat.name}</div>
                  {!compact && (
                    <>
                      <div className="mt-2 text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">
                        {chat.type}{chat.community ? ` · ${chat.community}` : ''}
                      </div>
                      <div className="mt-3 text-sm text-gray-700 dark:text-slate-300">
                        {chat.latestMessage ? (
                          <MarkdownBlock content={chat.latestMessage.content} onOpenDoc={openDoc} />
                        ) : (
                          'No messages yet. This channel is available for workspace coordination.'
                        )}
                        {renderFileChips(extractMostRecentWorkspaceFiles(chat.recentMessages, detail ? 5 : 3))}
                      </div>
                      {detail && chat.recentMessages.length > 0 && (
                        <div className="mt-3 rounded-md border border-gray-200 bg-gray-100 p-3 dark:border-white/10 dark:bg-slate-900/60">
                          <div className="mb-2 text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">Recent Chat</div>
                          <div className={`space-y-2 text-xs text-gray-700 dark:text-slate-300 ${nestedScrollClass}`}>
                            {chat.recentMessages.map((message, index) => (
                              <div key={`${chat.name}-ordered-msg-${index}`} className="rounded bg-white px-2 py-1.5 dark:bg-slate-950/60">
                                <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-slate-500">
                                  <span>{message.from}</span>
                                  <span>{timeAgo(new Date(message.timestamp).toISOString())}</span>
                                </div>
                                <MarkdownBlock content={message.content} onOpenDoc={openDoc} />
                                {renderFileChips(extractWorkspaceFileMentions(message.content).filter((file) => !isNoiseWorkspaceFile(file)))}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  {compact && (
                    <>
                      <div className="mt-2 text-xs text-gray-500 dark:text-slate-400">
                        {chat.latestMessage ? `${chat.members.length} members · ${chat.messageCount} messages` : 'No messages yet'}
                      </div>
                      {renderFileChips(extractMostRecentWorkspaceFiles(chat.recentMessages, 1), { compact: true, latestOnly: true })}
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      case 'interactions':
        if (!payload.dashboard.sections.interactions) return null
        return (
          <section className={cardClass}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className={`${compact ? 'text-base' : 'text-lg'} font-semibold`}>Interact</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">Send a prompt to an agent, start a workflow, or post to a group.</p>
              </div>
              <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs text-sky-600 dark:text-sky-300">Enabled by owner</span>
            </div>
            <div className="grid gap-3 md:grid-cols-[9rem_1fr]">
              <select value={interactionKind} onChange={(event) => setInteractionKind(event.target.value as typeof interactionKind)} className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-white/10">
                <option value="agent">Agent</option><option value="workflow">Workflow</option><option value="group">Group</option>
              </select>
              <select value={interactionTarget} onChange={(event) => setInteractionTarget(event.target.value)} className="rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-white/10">
                {interactionTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
              </select>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-slate-400"><span>Chat size</span><input type="range" min={180} max={620} step={20} value={interactionHeight} onChange={(event) => setInteractionHeight(Number(event.target.value))} className="w-40" /></div>
            <div className="mt-2 overflow-y-auto rounded-lg border border-gray-200 p-3 dark:border-white/10" style={{ minHeight: interactionHeight, maxHeight: interactionHeight }}>
              {interactionHistory.length === 0 ? <div className="text-sm text-gray-500 dark:text-slate-500">No interaction history yet.</div> : interactionHistory.map((entry, index) => <div key={`${entry.at}-${index}`} className="mb-3 last:mb-0"><div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-500">{new Date(entry.at).toLocaleDateString()} · {new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {entry.kind} · {entry.target}</div><div className="mt-1 text-sm text-gray-700 dark:text-slate-300"><strong>You:</strong> {entry.message}</div><div className="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-slate-400"><strong>Response:</strong> {entry.response}</div></div>)}
            </div>
            <textarea value={interactionMessage} onChange={(event) => setInteractionMessage(event.target.value)} placeholder={interactionKind === 'workflow' ? 'Describe what this run should do…' : 'Write a message…'} rows={3} className="mt-3 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-white/10" />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" onClick={submitInteraction} disabled={!interactionTarget || !interactionMessage.trim()} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">Send</button>
              {interactionStatus && <div className="max-w-full whitespace-pre-wrap text-sm text-gray-600 dark:text-slate-300">{interactionStatus}</div>}
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
                  {payload.company ? `Company Dashboard · ${payload.company.label}` : 'Workspace Summary'}
                </div>
                <h1 className={`${compact ? 'text-2xl' : 'text-3xl'} font-bold tracking-tight`}>{payload.dashboard.title}</h1>
                {payload.company && <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Focused on {payload.company.label}</p>}
              </div>
              <HeaderControls />
            </div>
          </header>
          <div className={compact ? 'space-y-4' : 'space-y-6'}>
            {companyContextSection}
            {orderedTopLevelSections.map((key) => (
              <React.Fragment key={key}>{renderOrderedSection(key)}</React.Fragment>
            ))}
          </div>
        </div>
        {docPreviewOverlay}
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
                  {payload.company ? `Company Dashboard · ${payload.company.label}` : 'Workspace Summary'}
                </div>
                <h1 className="text-2xl font-bold tracking-tight">{payload.dashboard.title}</h1>
                {payload.company && <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Focused on {payload.company.label}</p>}
              </div>
              <HeaderControls compactLabel />
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

          {companyContextSection}

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
        {docPreviewOverlay}
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
                {payload.company ? `Company Dashboard · ${payload.company.label}` : 'Workspace Summary'}
              </div>
              <h1 className={`${compact ? 'text-2xl' : 'text-3xl'} font-bold tracking-tight`}>{payload.dashboard.title}</h1>
              {!compact && <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">{payload.dashboard.description || (payload.company ? `${payload.company.label} · ${payload.workspace.name}` : payload.workspace.name)}</p>}
            </div>
            <HeaderControls />
          </div>
        </header>

        {payload.dashboard.sections.overview && (
          <section className={`mb-8 grid ${compact ? 'gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'gap-3 sm:grid-cols-2 xl:grid-cols-6'}`}>
            {overviewCards.map(([label, value]) => (
              <div key={label} className={`rounded-2xl border border-gray-200 bg-white/95 shadow-sm dark:border-white/10 dark:bg-slate-900/80 ${compact ? 'p-3' : 'p-4'}`}>
                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-500">{label}</div>
                <div className={`mt-2 font-semibold ${compact ? 'text-xl' : 'text-2xl'}`}>{value}</div>
              </div>
            ))}
          </section>
        )}

        {companyContextSection}

        {standardUpperSections.length > 0 && (
          <div className={`grid gap-6 ${twoColLayout}`}>
            {standardUpperSections.map((key) => (
              <React.Fragment key={key}>{renderOrderedSection(key)}</React.Fragment>
            ))}
          </div>
        )}

        {standardMiddleSections.length > 0 && (
          <div className="mt-6 grid gap-6">
            {standardMiddleSections.map((key) => (
              <React.Fragment key={key}>{renderOrderedSection(key)}</React.Fragment>
            ))}
          </div>
        )}

        {standardLowerSections.length > 0 && (
          <div className="mt-6 grid gap-6">
            {standardLowerSections.map((key) => (
              <React.Fragment key={key}>{renderOrderedSection(key)}</React.Fragment>
            ))}
          </div>
        )}
      </div>
      {docPreviewOverlay}
    </div>
  )
}
