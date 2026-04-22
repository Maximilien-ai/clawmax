import React, { useEffect, useState, useCallback, useRef } from 'react'
import { PageLoading, LoadingSpinner } from '../components/LoadingSpinner'

interface MeteringData {
  enabled?: boolean
  reason?: string
  totalTraces: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  byAgent: Array<{
    agentId: string
    totalCalls: number
    totalTokens: number
    estimatedCostUsd: number
    avgDurationMs: number
    lastActivity: string
    models: Record<string, number>
  }>
  byWorkflow: Array<{
    workflowId: string
    workflowName: string
    totalRuns: number
    totalTokens: number
    estimatedCostUsd: number
  }>
}

const EMPTY_METERING: MeteringData = {
  enabled: true,
  totalTraces: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  byAgent: [],
  byWorkflow: [],
}

interface ActivityEntry {
  agentId: string
  file: string
  mtime: string
  ageMins: number
}

type SortCol = 'age' | 'agent' | 'type' | 'file'
type SortDir = 'asc' | 'desc'

const FILE_TYPES: Record<string, { label: string; cls: string }> = {
  'TODOs.md':     { label: 'tasks',     cls: 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
  'COMPLETED.md': { label: 'done',      cls: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  'HEARTBEAT.md': { label: 'heartbeat', cls: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  'IDENTITY.md':  { label: 'identity',  cls: 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
}

function fileType(name: string) {
  if (FILE_TYPES[name]) return FILE_TYPES[name]
  if (/\.md$/i.test(name)) {
    return { label: 'markdown', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' }
  }
  return { label: 'file', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400' }
}

function timeAgo(mins: number): string {
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.floor(mins)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function secAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

function sortEntries(entries: ActivityEntry[], col: SortCol, dir: SortDir): ActivityEntry[] {
  const sorted = [...entries].sort((a, b) => {
    let cmp = 0
    if (col === 'age') cmp = a.ageMins - b.ageMins
    else if (col === 'agent') cmp = a.agentId.localeCompare(b.agentId)
    else if (col === 'type') cmp = fileType(a.file).label.localeCompare(fileType(b.file).label)
    else if (col === 'file') cmp = a.file.localeCompare(b.file)
    return dir === 'asc' ? cmp : -cmp
  })
  return sorted
}

function SortIndicator({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol | null; sortDir: SortDir }) {
  if (sortCol !== col) return <span className="ml-1 opacity-20">↕</span>
  return <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

interface ActivityProps {
  onNavigateToDoc?: (file: string) => void
  isActive?: boolean
}

export default function Activity({ onNavigateToDoc, isActive = false }: ActivityProps = {}) {
  const [feed, setFeed] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)
  const [sortCol, setSortCol] = useState<SortCol>('age')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [debugAgent, setDebugAgent] = useState<string | null>(null)
  const [showSystemLogs, setShowSystemLogs] = useState(false)
  const [showDoctor, setShowDoctor] = useState(false)
  const [metering, setMetering] = useState<MeteringData | null>(null)
  const [meteringLoading, setMeteringLoading] = useState(true)
  const [showMetering, setShowMetering] = useState(true)
  const [costBudgetEnabled, setCostBudgetEnabled] = useState(true)
  const [costBudgetReason, setCostBudgetReason] = useState('')
  const [budget, setBudget] = useState<{ config: { limitUsd: number; warningPct: number; enforced: boolean; paused: boolean }; currentSpendUsd: number; remainingUsd: number; usedPct: number; level: 'ok' | 'warning' | 'exceeded' } | null>(null)
  const [agentCostLimits, setAgentCostLimits] = useState<Record<string, number>>({})
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  const lastActivationRefreshRef = useRef(0)

  const isBudgetResponse = (value: any): value is {
    config: { limitUsd: number; warningPct: number; enforced: boolean; paused: boolean }
    currentSpendUsd: number
    remainingUsd: number
    usedPct: number
    level: 'ok' | 'warning' | 'exceeded'
  } => {
    return !!value && typeof value === 'object' && !!value.config && typeof value.config.limitUsd === 'number'
  }

  const isMeteringResponse = (value: any): value is MeteringData => {
    return !!value &&
      typeof value === 'object' &&
      Array.isArray(value.byAgent) &&
      Array.isArray(value.byWorkflow)
  }

  const fetchFeed = useCallback(() => {
    fetch('/api/activity')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load activity')))
      .then(d => {
        setFeed(Array.isArray(d.feed) ? d.feed : [])
        setError(null)
        setLoading(false)
        setLastRefreshed(Date.now())
      })
      .catch((err) => {
        console.warn('Failed to load activity:', err)
        setLoading(false)
      })
  }, [])

  const fetchMetering = useCallback(() => {
    setMeteringLoading(true)
    fetch('/api/metering')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.enabled === false) {
          setCostBudgetEnabled(false)
          setCostBudgetReason(typeof d.reason === 'string' ? d.reason : 'Opik is not configured for this instance.')
          setMetering(null)
          return
        }
        setCostBudgetEnabled(true)
        setCostBudgetReason('')
        setMetering(isMeteringResponse(d) ? d : EMPTY_METERING)
      })
      .catch(() => setMetering(EMPTY_METERING))
      .finally(() => setMeteringLoading(false))
  }, [])

  const fetchAgentCostLimits = useCallback(() => {
    fetch('/api/agents/cost-limits')
      .then(r => r.ok ? r.json() : null)
      .then(d => setAgentCostLimits(d?.limits && typeof d.limits === 'object' ? d.limits : {}))
      .catch(() => setAgentCostLimits({}))
  }, [])

  const fetchBudget = useCallback(() => {
    fetch('/api/budget')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && d.enabled === false) {
          setBudget(null)
        } else if (isBudgetResponse(d)) {
          setBudget(d)
          setBudgetInput(String(d.config.limitUsd))
        } else {
          setBudget(null)
        }
      })
      .catch(() => {})
  }, [])

  const refreshActivityPage = useCallback(() => {
    fetchFeed()
    fetchMetering()
    fetchAgentCostLimits()
    fetchBudget()
  }, [fetchFeed, fetchMetering, fetchAgentCostLimits, fetchBudget])

  useEffect(() => {
    refreshActivityPage()
    const interval = setInterval(fetchFeed, 30000)
    return () => clearInterval(interval)
  }, [fetchFeed, refreshActivityPage])

  useEffect(() => {
    if (!isActive) return
    const now = Date.now()
    if (now - lastActivationRefreshRef.current < 5000) return
    lastActivationRefreshRef.current = now
    refreshActivityPage()
  }, [isActive, refreshActivityPage])

  useEffect(() => {
    const ticker = setInterval(() => {
      setRefreshedLabel(secAgo(lastRefreshed))
    }, 5000)
    setRefreshedLabel(secAgo(lastRefreshed))
    return () => clearInterval(ticker)
  }, [lastRefreshed])

  const handleRefresh = () => {
    if (cooling) return
    setCooling(true)
    refreshActivityPage()
    setTimeout(() => setCooling(false), 3000)
  }

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const saveBudget = async (updates: Record<string, any>) => {
    try {
      const res = await fetch('/api/budget', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (res.ok) {
        const refreshed = await fetch('/api/budget')
        const data = refreshed.ok ? await refreshed.json() : null
        if (isBudgetResponse(data)) {
          setBudget(data)
          setBudgetInput(String(data.config.limitUsd))
          setEditingBudget(false)
        }
      }
    } catch {}
  }

  const rows = sortEntries(feed, sortCol, sortDir)

  const thCls = 'px-4 py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 transition-colors text-left'

  const handleExportCSV = () => {
    const headers = ['Age (mins)', 'Agent ID', 'Type', 'File', 'Last Modified']
    const csvRows = [
      headers.join(','),
      ...rows.map(entry => {
        const ft = fileType(entry.file)
        return [
          (entry.ageMins || 0).toFixed(2),
          `"${entry.agentId}"`,
          `"${ft.label}"`,
          `"${entry.file}"`,
          `"${entry.mtime}"`
        ].join(',')
      })
    ]
    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportJSON = () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      totalEntries: rows.length,
      sortedBy: sortCol,
      sortDirection: sortDir,
      entries: rows.map(entry => ({
        agentId: entry.agentId,
        file: entry.file,
        type: fileType(entry.file).label,
        lastModified: entry.mtime,
        ageMinutes: entry.ageMins
      }))
    }
    const jsonContent = JSON.stringify(exportData, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Workspace Activity</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="flex items-center gap-1.5">
            File writes and metering for the active workspace
            <span className="text-gray-300">·</span>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse inline-block" title="Auto-refreshes every 30s" />
            refreshed {refreshedLabel}
          </span>
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative group">
            <button
              disabled={rows.length === 0}
              className={`text-sm font-medium transition-colors ${
                rows.length === 0
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-purple-600 hover:text-purple-800'
              }`}
            >
              📥 Export
            </button>
            {rows.length > 0 && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[120px] dark:border-gray-700">
                <button
                  onClick={handleExportCSV}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors rounded-t-lg dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  📄 CSV
                </button>
                <button
                  onClick={handleExportJSON}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors rounded-b-lg dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  📦 JSON
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowSystemLogs(true)}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors dark:text-gray-200"
          >
            📋 System Logs
          </button>
          <button
            onClick={handleRefresh}
            disabled={cooling}
            className={`text-sm font-medium transition-colors ${
              cooling
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-sky-600 hover:text-sky-800'
            }`}
          >
            {cooling ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {!costBudgetEnabled && (
        <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-4 text-sm text-amber-900 dark:text-amber-200">
          <div className="font-semibold">Cost &amp; Budgeting is disabled for this instance</div>
          <div className="mt-2">
            This dashboard is not set up for cost and budgeting.
          </div>
          <div className="mt-2">
            Recreate (export your workspace first) the instance with the Cost &amp; Budgeting feature via Comet Opik and these features will be enabled.
          </div>
        </div>
      )}

      {/* Budget Bar */}
      {costBudgetEnabled && budget && (
        <div className={`mb-4 rounded-lg border p-4 ${
          budget.level === 'exceeded' ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700' :
          budget.level === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700' :
          'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Workspace Budget</span>
              {budget.level === 'exceeded' && (
                <span className="text-xs font-bold text-red-600 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded-full">EXCEEDED — agents paused</span>
              )}
              {budget.level === 'warning' && (
                <span className="text-xs font-bold text-yellow-600 bg-yellow-100 dark:bg-yellow-900/40 px-2 py-0.5 rounded-full">WARNING</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {editingBudget ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-500">$</span>
                  <input
                    type="number"
                    value={budgetInput}
                    onChange={e => setBudgetInput(e.target.value)}
                    className="w-20 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 dark:bg-gray-700 dark:text-gray-200"
                    min="0"
                    step="1"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveBudget({ limitUsd: parseFloat(budgetInput) || 10 })
                      if (e.key === 'Escape') setEditingBudget(false)
                    }}
                  />
                  <button onClick={() => saveBudget({ limitUsd: parseFloat(budgetInput) || 10 })} className="text-xs text-green-600 hover:text-green-700 font-medium">Save</button>
                  <button onClick={() => setEditingBudget(false)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setEditingBudget(true)} className="text-xs text-sky-600 hover:text-sky-700">
                  Limit: ${(budget.config?.limitUsd || 0).toFixed(2)} — Edit
                </button>
              )}
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input
                  type="checkbox"
                  checked={budget.config.enforced}
                  onChange={e => saveBudget({ enforced: e.target.checked })}
                  className="rounded"
                />
                Enforce
              </label>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-1">
            <div
              className={`h-3 rounded-full transition-all ${
                budget.level === 'exceeded' ? 'bg-red-500' :
                budget.level === 'warning' ? 'bg-yellow-500' :
                'bg-green-500'
              }`}
              style={{ width: `${Math.min(budget.usedPct || 0, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>${(budget.currentSpendUsd || 0).toFixed(2)} spent</span>
            <span>{(budget.usedPct || 0).toFixed(1)}% used</span>
            <span>${(budget.remainingUsd || 0).toFixed(2)} remaining</span>
          </div>
        </div>
      )}

      {/* Metering Stats */}
      {costBudgetEnabled && metering && showMetering && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Token Metering</h2>
            <button onClick={() => setShowMetering(false)} className="text-xs text-gray-400 hover:text-gray-600">Hide</button>
          </div>
          {meteringLoading ? (
            <div className="mb-4 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-4 py-3 text-sm text-sky-800 dark:text-sky-200">
              Collecting Opik metering data for this workspace…
            </div>
          ) : metering.totalTraces === 0 ? (
            <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
              No metering data yet. Run an agent or workflow and this workspace will start showing token and cost activity once traces arrive.
            </div>
          ) : null}
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{metering.totalTraces}</div>
              <div className="text-xs text-gray-500">Total Calls</div>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{((metering.totalTokens || 0) / 1000).toFixed(1)}k</div>
              <div className="text-xs text-gray-500">Total Tokens</div>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-600">${(metering.estimatedCostUsd || 0).toFixed(2)}</div>
              <div className="text-xs text-gray-500">Est. Cost</div>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{metering.byAgent.length}</div>
              <div className="text-xs text-gray-500">Active Agents</div>
            </div>
          </div>

          {/* Per-agent breakdown */}
          {metering.byAgent.length > 0 && (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900">
                    <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Agent</th>
                    <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">Calls</th>
                    <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">Tokens</th>
                    <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">Cost</th>
                    <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">Limit</th>
                    <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">Remaining</th>
                    <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400">Budget</th>
                    <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 hidden sm:table-cell">Avg Duration</th>
                    <th className="px-3 py-2 text-right text-gray-600 dark:text-gray-400 hidden sm:table-cell">Model</th>
                  </tr>
                </thead>
                <tbody>
                  {metering.byAgent.map(agent => {
                    const limit = agentCostLimits[agent.agentId] ?? null
                    const usedPct = limit && limit > 0 ? (agent.estimatedCostUsd / limit) * 100 : null
                    const remaining = limit && limit > 0 ? Math.max(0, limit - agent.estimatedCostUsd) : null
                    const budgetTone = usedPct === null
                      ? 'text-gray-400 bg-gray-100 dark:bg-gray-800 dark:text-gray-500'
                      : usedPct >= 100
                        ? 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400'
                        : usedPct >= 95
                          ? 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400'
                          : usedPct >= 80
                            ? 'text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-400'
                            : 'text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400'

                    return (
                      <tr key={agent.agentId} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 font-medium text-sky-700 dark:text-sky-400">{agent.agentId}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{agent.totalCalls}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{((agent.totalTokens || 0) / 1000).toFixed(1)}k</td>
                        <td className="px-3 py-2 text-right text-green-600">${(agent.estimatedCostUsd || 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{limit ? `$${limit.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{remaining !== null ? `$${remaining.toFixed(2)}` : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${budgetTone}`}>
                            {usedPct === null ? 'No limit' : `${Math.min(usedPct, 999).toFixed(0)}%`}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500 hidden sm:table-cell">{((agent.avgDurationMs || 0) / 1000).toFixed(1)}s</td>
                        <td className="px-3 py-2 text-right text-gray-500 hidden sm:table-cell font-mono">{Object.keys(agent.models)[0] || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {costBudgetEnabled && !showMetering && metering && (
        <button onClick={() => setShowMetering(true)} className="text-xs text-sky-600 hover:text-sky-700 mb-4">Show Token Metering</button>
      )}

      {loading && <PageLoading text="Loading activity..." />}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <p className="text-sm">No activity found</p>
          <p className="text-xs mt-1 text-gray-300">Agent file writes will appear here</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 shadow-sm overflow-hidden dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className={`${thCls} w-24`} onClick={() => handleSort('age')}>
                  Age<SortIndicator col="age" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th className={`${thCls} w-24`} onClick={() => handleSort('agent')}>
                  Agent<SortIndicator col="agent" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th className={`${thCls} w-28`} onClick={() => handleSort('type')}>
                  Type<SortIndicator col="type" sortCol={sortCol} sortDir={sortDir} />
                </th>
                <th className={thCls} onClick={() => handleSort('file')}>
                  File<SortIndicator col="file" sortCol={sortCol} sortDir={sortDir} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((entry, i) => {
                const ft = fileType(entry.file)
                return (
                  <tr key={`${entry.agentId}-${entry.file}-${i}`} className="hover:bg-gray-50 transition-colors dark:bg-gray-900 dark:hover:bg-gray-700">
                    <td className="px-4 py-2 text-xs text-gray-400 font-mono shrink-0">
                      {timeAgo(entry.ageMins)}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setDebugAgent(entry.agentId)}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors cursor-pointer"
                        title="View agent logs and status"
                      >
                        {entry.agentId}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ft.cls}`}>
                        {ft.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono">
                      {onNavigateToDoc ? (
                        <button
                          onClick={() => onNavigateToDoc(`AGENTS/${entry.agentId}/${entry.file}`)}
                          className="text-sky-600 hover:text-sky-800 hover:underline transition-colors text-left"
                          title="Open in Documents tab"
                        >
                          {entry.file}
                        </button>
                      ) : (
                        <span className="text-gray-400">{entry.file}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Agent Debug Modal */}
      {debugAgent && (
        <AgentDebugModal agentId={debugAgent} onClose={() => setDebugAgent(null)} />
      )}

      {/* System Logs Modal */}
      {showSystemLogs && (
        <SystemLogsModal onClose={() => setShowSystemLogs(false)} />
      )}
      {showDoctor && (
        <DoctorModal onClose={() => setShowDoctor(false)} />
      )}
    </div>
  )
}

// Agent Debug Modal Component
function AgentDebugModal({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [tab, setTab] = useState<'health' | 'status'>('health')
  const [health, setHealth] = useState<any>(null)
  const [status, setStatus] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)

  // Fetch health
  React.useEffect(() => {
    if (tab !== 'health') return
    setLoading(true)
    fetch(`/api/agents/${agentId}/health`)
      .then(r => r.json())
      .then(d => {
        setHealth(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [agentId, tab])

  // Fetch gateway status
  React.useEffect(() => {
    if (tab !== 'status') return
    setLoading(true)
    fetch(`/api/agents/${agentId}/gateway-status`)
      .then(r => r.json())
      .then(d => {
        setStatus(d.status || '')
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [agentId, tab])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[90vw] max-w-5xl h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Agent Debug: <span className="font-mono text-sky-600">{agentId}</span>
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 shrink-0 items-center justify-between dark:border-gray-700">
          <div className="flex">
            {(['health', 'status'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                  tab === t
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {tab === 'health' && health && (
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="text-xs px-3 py-1 mr-4 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors dark:bg-gray-800"
            >
              {showRawJson ? 'Show Friendly' : 'Show JSON'}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {tab === 'health' && (
            <div>
              {loading && <div className="text-gray-400">Loading health...</div>}
              {!loading && health && (
                showRawJson ? (
                  <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-auto dark:bg-gray-900">
                    {JSON.stringify(health, null, 2)}
                  </pre>
                ) : (
                  <HealthDisplay health={health} />
                )
              )}
            </div>
          )}

          {tab === 'status' && (
            <div>
              {loading && <div className="text-gray-400">Loading status...</div>}
              {!loading && status && (
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-auto font-mono whitespace-pre-wrap">
                  {status}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end shrink-0 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Health Display Component - human-friendly format
function HealthDisplay({ health }: { health: any }) {
  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 rounded-lg p-4 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${health.ok ? 'bg-green-400' : 'bg-red-400'}`} />
          <div>
            <div className="font-semibold text-gray-800 dark:text-gray-200">
              {health.ok ? 'Healthy' : 'Unhealthy'}
            </div>
            <div className="text-xs text-gray-500">
              Response time: {health.durationMs}ms
            </div>
          </div>
        </div>
      </div>

      {/* Channels */}
      {health.channels && Object.keys(health.channels).length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 rounded-lg p-4 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 mb-3 dark:text-gray-200">Channels</h3>
          <div className="space-y-3">
            {Object.entries(health.channels).map(([name, info]: [string, any]) => (
              <div key={name} className="border-l-2 border-sky-400 pl-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${info.connected ? 'bg-green-100 text-green-700' : info.linked ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                    {info.connected ? 'Connected' : info.linked ? 'Linked' : 'Not linked'}
                  </span>
                </div>
                {info.self?.e164 && (
                  <div className="text-xs text-gray-500 font-mono">{info.self.e164}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gateway */}
      {health.gateway && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 rounded-lg p-4 dark:border-gray-700">
          <h3 className="font-semibold text-gray-800 mb-3 dark:text-gray-200">Gateway</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Port:</span>
              <span className="ml-2 font-mono">{health.gateway.port || 'N/A'}</span>
            </div>
            <div>
              <span className="text-gray-500">Mode:</span>
              <span className="ml-2">{health.gateway.mode || 'N/A'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// System Logs Modal Component
function SystemLogsModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<string[]>([])
  const logsEndRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  React.useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  // Fetch logs via SSE - system-wide, no agent ID
  React.useEffect(() => {
    const eventSource = new EventSource('/api/system/logs')

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.line) {
        setLogs(prev => [...prev, data.line])
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
    }

    return () => {
      eventSource.close()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[90vw] max-w-5xl h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">System Logs</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl"
          >
            ×
          </button>
        </div>

        {/* Logs Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400 h-full overflow-auto">
            {logs.length === 0 && <div className="text-gray-500">Waiting for logs...</div>}
            {logs.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end shrink-0 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Doctor Modal Component
function DoctorModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<any>(null)
  const [fixing, setFixing] = useState(false)
  const normalizeDoctorResults = (data: any) => ({
    healthy: Boolean(data?.healthy),
    summary: {
      pass: Number(data?.summary?.pass || 0),
      fail: Number(data?.summary?.fail || 0),
      warn: Number(data?.summary?.warn || 0),
      fixed: Number(data?.summary?.fixed || 0),
    },
    results: Array.isArray(data?.results) ? data.results : [],
    platform: data?.platform || {},
    message: typeof data?.message === 'string' ? data.message : undefined,
  })
  const runDoctor = useCallback((fix = false) => {
    setLoading(true); if (fix) setFixing(true)
    fetch('/api/agents/doctor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fix }) })
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) {
          return normalizeDoctorResults({
            ...data,
            healthy: false,
            message: data?.error || data?.message || `Doctor failed (${r.status})`,
          })
        }
        return normalizeDoctorResults(data)
      })
      .then(data => { setResults(data); setLoading(false); setFixing(false) })
      .catch(() => { setResults(normalizeDoctorResults(null)); setLoading(false); setFixing(false) })
  }, [])
  useEffect(() => { runDoctor() }, [runDoctor])
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div><h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">ClawMax Doctor</h2><p className="text-xs text-gray-500 dark:text-gray-400">Platform and agent health check</p></div>
          <div className="flex items-center gap-2">
            <button onClick={() => runDoctor(true)} disabled={fixing} className="text-sm px-3 py-1.5 rounded-md bg-cyan-600 text-white hover:bg-cyan-700 disabled:bg-gray-300 transition-colors">{fixing ? 'Fixing...' : 'Auto-Fix'}</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none">&times;</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? <div className="text-center text-gray-500 dark:text-gray-400 py-8">Running health checks...</div> : results ? (
            <div className="space-y-4">
              <div className="flex gap-3 text-sm flex-wrap">
                <span className={`px-3 py-1.5 rounded-lg ${results.platform?.cli ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>{results.platform?.cli ? '✓' : '✗'} CLI</span>
                <span className={`px-3 py-1.5 rounded-lg ${results.platform?.gateway ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'}`}>{results.platform?.gateway ? '✓' : '⚠'} Gateway{results.platform?.gatewayPort ? `:${results.platform.gatewayPort}` : ''}</span>
                <span className={`px-3 py-1.5 rounded-lg ${results.healthy && results.summary.warn === 0 ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'}`}>{results.summary.pass} pass, {results.summary.fail} fail, {results.summary.warn} warn, {results.summary.fixed} fixed</span>
              </div>
              {results.results?.map((agent: any) => (
                <div key={agent.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                  <div className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-2 font-mono">{agent.id}</div>
                  <div className="space-y-1">{(agent.checks || []).map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={c.status === 'pass' ? 'text-green-500' : c.status === 'fixed' ? 'text-cyan-500' : c.status === 'fail' ? 'text-red-500' : 'text-amber-500'}>{c.status === 'pass' ? '✓' : c.status === 'fixed' ? '⟳' : c.status === 'fail' ? '✗' : '⚠'}</span>
                      <span className="text-gray-600 dark:text-gray-400">{c.check}:</span>
                      <span className="text-gray-500 dark:text-gray-400">{c.message}</span>
                    </div>
                  ))}</div>
                </div>
              ))}
              {results.results?.length === 0 && <div className="text-center text-gray-400 py-4">No agents in workspace</div>}
              {results.healthy && results.summary.warn > 0 && <div className="text-center text-amber-700 dark:text-amber-300 py-2 text-sm">Agents are healthy, but runtime warnings still need attention.</div>}
              {results.message && results.results?.length === 0 && <div className="text-center text-gray-500 dark:text-gray-400 py-2 text-sm">{results.message}</div>}
            </div>
          ) : <div className="text-center text-red-500 py-8">Failed to run doctor</div>}
        </div>
      </div>
    </div>
  )
}
