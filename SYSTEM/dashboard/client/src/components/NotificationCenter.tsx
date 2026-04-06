import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from './Toast'

interface NotificationAction {
  type: string
  label: string
  value?: string
}

interface Notification {
  id: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  entityId?: string
  entityType?: 'agent' | 'workflow' | 'budget' | 'channel'
  createdAt: string
  actions?: NotificationAction[]
  blockerType?: 'choice' | 'approval' | 'input' | 'delegation' | 'waiting'
  blockerOptions?: string[]
  workflowId?: string
  progress?: number
  artifactPath?: string
  artifactUrl?: string
}

// Helper: resolve a notification action
async function resolveAction(id: string, action: string, value?: string): Promise<boolean> {
  try {
    const resp = await fetch(`/api/notifications/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, value }),
    })
    return resp.ok
  } catch { return false }
}

interface NotificationCenterProps {
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToWorkflow?: (workflowId: string) => void
  onNavigateToPage?: (page: string) => void
  onNavigateToDoc?: (path: string) => void
  onAgentRestarted?: (agentId: string) => void
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function getArtifactDisplayName(target?: string): string {
  if (!target) return 'Open file'
  const parts = target.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || target
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-400',
}

const CATEGORY_LABELS: Record<string, string> = {
  agent: 'Agents',
  workflow: 'Workflows',
  results: 'Results',
  budget: 'Budget',
  communication: 'Communication',
}

const CATEGORY_ORDER = ['results', 'agent', 'workflow', 'communication', 'budget']

export function NotificationCenter({ onNavigateToAgent, onNavigateToWorkflow, onNavigateToPage, onNavigateToDoc, onAgentRestarted }: NotificationCenterProps) {
  const { showSuccess, showError, showWarning } = useToast()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [criticalCount, setCriticalCount] = useState(0)
  const [warningCount, setWarningCount] = useState(0)
  const [open, setOpen] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [availableAgents, setAvailableAgents] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const seenNotificationIds = useRef<Set<string>>(new Set())

  const fetchNotifications = useCallback(async () => {
    try {
      const resp = await fetch('/api/notifications')
      if (!resp.ok) return
      const data = await resp.json()
      const nextNotifications = data.notifications || []
      const nextIds = new Set<string>()
      for (const notification of nextNotifications) {
        nextIds.add(notification.id)
        if (!seenNotificationIds.current.has(notification.id)) {
          if (notification.type === 'cost-warning') {
            showWarning(notification.message, 7000)
          } else if (notification.type === 'cost-critical' || notification.type === 'cost-exceeded') {
            showError(notification.message, 9000)
          }
        }
      }
      seenNotificationIds.current = nextIds
      setNotifications(nextNotifications)
      setActiveCount(data.activeCount || 0)
      setCriticalCount(data.criticalCount || 0)
      setWarningCount(data.warningCount || 0)
    } catch {}
  }, [showError, showWarning])

  // Poll every 30s
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Load agents for delegation blockers
  useEffect(() => {
    if (open && notifications.some(n => n.blockerType === 'delegation') && availableAgents.length === 0) {
      fetch('/api/agents').then(r => r.json()).then(d => {
        setAvailableAgents((d.agents || []).map((a: any) => a.id))
      }).catch(() => {})
    }
  }, [open, notifications])

  // Helper: execute action with loading state
  const executeAction = async (id: string, action: string, value?: string) => {
    setProcessingId(id)
    await resolveAction(id, action, value)
    await fetchNotifications()
    setProcessingId(null)
  }

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleDismiss = async (id: string) => {
    await fetch('/api/notifications/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchNotifications()
  }

  const handleDismissAll = async () => {
    await fetch('/api/notifications/dismiss-all', { method: 'POST' })
    fetchNotifications()
  }

  const handleAction = (n: Notification) => {
    if (n.type === 'artifact-update' && n.artifactPath && onNavigateToDoc) {
      onNavigateToDoc(n.artifactPath)
    } else if (n.type === 'artifact-update' && n.artifactUrl) {
      window.open(n.artifactUrl, '_blank', 'noopener,noreferrer')
    } else if (n.type === 'channel-activity' && onNavigateToPage) {
      onNavigateToPage('communication')
    } else if (n.entityType === 'agent' && n.entityId && onNavigateToAgent) {
      onNavigateToAgent(n.entityId)
    } else if (n.entityType === 'workflow' && n.entityId && onNavigateToWorkflow) {
      onNavigateToWorkflow(n.entityId)
    } else if (n.entityType === 'budget' && onNavigateToPage) {
      onNavigateToPage('activity')
    }
    setOpen(false)
  }

  const notificationHasViewAction = (n: Notification) =>
    (n.type === 'artifact-update' && (Boolean(n.artifactPath) || Boolean(n.artifactUrl))) ||
    Boolean(n.entityId && !n.blockerType && n.entityType !== 'agent') ||
    n.entityType === 'budget'

  // Group notifications by category (derived from type)
  const getCategory = (n: Notification): string => {
    if (n.type === 'artifact-update') return 'results'
    if (n.type.startsWith('agent-') || n.type === 'agent-error' || n.type === 'agent-offline' || n.type === 'agent-needs-feedback') return 'agent'
    if (n.type.startsWith('workflow-')) return 'workflow'
    if (n.type.startsWith('cost-')) return 'budget'
    if (n.type === 'channel-activity') return 'communication'
    return n.entityType || 'agent'
  }
  const filtered = searchQuery.trim()
    ? notifications.filter(n => {
        const q = searchQuery.toLowerCase()
        return n.title.toLowerCase().includes(q) || n.message.toLowerCase().includes(q) || (n.entityId || '').toLowerCase().includes(q) || n.type.toLowerCase().includes(q)
      })
    : notifications
  const grouped = CATEGORY_ORDER.reduce<Record<string, Notification[]>>((acc, cat) => {
    const items = filtered.filter(n => getCategory(n) === cat)
    if (items.length > 0) acc[cat] = items
    return acc
  }, {})

  // Badge color
  const badgeColor = criticalCount > 0
    ? 'bg-red-500'
    : warningCount > 0
      ? 'bg-amber-500'
      : 'bg-blue-500'

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1"
        title={activeCount > 0 ? `${activeCount} notification${activeCount !== 1 ? 's' : ''}` : 'No notifications'}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {activeCount > 0 && (
          <span className={`absolute -top-1 -right-1 ${badgeColor} text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1`}>
            {activeCount > 99 ? '99+' : activeCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[480px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl z-50">
          {/* Header */}
          <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Notifications
              {activeCount > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-500">({activeCount})</span>
              )}
            </span>
            {activeCount > 0 && (
              <button
                onClick={handleDismissAll}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Dismiss all
              </button>
            )}
          </div>

          {/* Search */}
          {activeCount > 3 && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search notifications..."
                className="w-full px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          )}

          {/* Content */}
          {activeCount === 0 ? (
            <div className="px-4 py-8 text-center">
              <div className="text-2xl mb-2">✓</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">All clear — no notifications</div>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/40">
                    {CATEGORY_LABELS[category] || category}
                  </div>
                  {items.map(n => (
                    <div
                      key={n.id}
                      className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[n.severity]}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => notificationHasViewAction(n) && handleAction(n)}
                              className={`text-sm font-medium text-left truncate ${
                                notificationHasViewAction(n)
                                  ? 'text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300'
                                  : 'text-gray-900 dark:text-gray-100'
                              }`}
                              title={notificationHasViewAction(n) ? 'Open result' : undefined}
                            >
                              {n.title}
                            </button>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{timeAgo(n.createdAt)}</span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</div>
                          {n.type === 'artifact-update' && (n.artifactPath || n.artifactUrl) && (
                            <button
                              type="button"
                              onClick={() => handleAction(n)}
                              className="mt-1 text-xs font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 hover:underline break-all text-left"
                              title={n.artifactPath || n.artifactUrl}
                            >
                              {getArtifactDisplayName(n.artifactPath || n.artifactUrl || n.title)}
                            </button>
                          )}
                          {/* Progress bar */}
                          {n.type === 'workflow-progress' && n.progress != null && (
                            <div className="mt-1.5">
                              <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all ${n.progress >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${Math.min(n.progress, 100)}%` }} />
                                </div>
                                <span>{n.progress}%</span>
                              </div>
                            </div>
                          )}

                          {/* Blocker: approval — Approve / Reject buttons */}
                          {n.blockerType === 'approval' && (
                            <div className="flex gap-1.5 mt-2">
                              <button
                                onClick={() => executeAction(n.id, 'approve')}
                                disabled={processingId === n.id}
                                className="text-[11px] px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                              >
                                {processingId === n.id ? '...' : '✓ Approve'}
                              </button>
                              <button
                                onClick={() => executeAction(n.id, 'reject')}
                                disabled={processingId === n.id}
                                className="text-[11px] px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50"
                              >
                                {processingId === n.id ? '...' : '✕ Reject'}
                              </button>
                            </div>
                          )}

                          {/* Blocker: choice — option buttons */}
                          {n.blockerType === 'choice' && n.blockerOptions && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {n.blockerOptions.map((opt: string) => (
                                <button
                                  key={opt}
                                  onClick={() => executeAction(n.id, 'choose', opt)}
                                  disabled={processingId === n.id}
                                  className="text-[11px] px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors disabled:opacity-50"
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Blocker: input — text field + submit */}
                          {n.blockerType === 'input' && (
                            <div className="flex gap-1.5 mt-2">
                              <input
                                type="text"
                                value={inputValues[n.id] || ''}
                                onChange={e => setInputValues(prev => ({ ...prev, [n.id]: e.target.value }))}
                                placeholder="Type your response..."
                                className="flex-1 text-[11px] px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && inputValues[n.id]?.trim()) {
                                    executeAction(n.id, 'input', inputValues[n.id])
                                  }
                                }}
                              />
                              <button
                                onClick={() => executeAction(n.id, 'input', inputValues[n.id])}
                                disabled={processingId === n.id || !inputValues[n.id]?.trim()}
                                className="text-[11px] px-2.5 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded font-medium hover:bg-sky-200 dark:hover:bg-sky-900/50 transition-colors disabled:opacity-50"
                              >
                                Submit
                              </button>
                            </div>
                          )}

                          {/* Blocker: delegation — agent picker */}
                          {n.blockerType === 'delegation' && (
                            <div className="flex gap-1.5 mt-2">
                              <select
                                value={inputValues[n.id] || ''}
                                onChange={e => setInputValues(prev => ({ ...prev, [n.id]: e.target.value }))}
                                className="flex-1 text-[11px] px-2 py-1 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                              >
                                <option value="">Select agent...</option>
                                {availableAgents.map(a => <option key={a} value={a}>{a}</option>)}
                              </select>
                              <button
                                onClick={() => executeAction(n.id, 'delegate', inputValues[n.id])}
                                disabled={processingId === n.id || !inputValues[n.id]}
                                className="text-[11px] px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
                              >
                                Delegate
                              </button>
                            </div>
                          )}

                          {/* Blocker: waiting — status indicator */}
                          {n.blockerType === 'waiting' && (
                            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Waiting for external resolution...
                            </div>
                          )}

                          {/* Custom actions */}
                          {n.actions && n.actions.length > 0 && !n.blockerType && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {n.actions.map((a: NotificationAction, idx: number) => (
                                <button
                                  key={idx}
                                  onClick={() => executeAction(n.id, a.type, a.value)}
                                  disabled={processingId === n.id}
                                  className="text-[11px] px-2.5 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded font-medium hover:bg-sky-200 dark:hover:bg-sky-900/50 transition-colors disabled:opacity-50"
                                >
                                  {a.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Inline agent actions */}
                          {n.entityType === 'agent' && n.entityId && (n.type === 'agent-error' || n.type === 'agent-offline') && (
                            <div className="flex gap-1.5 mt-2">
                              <button
                                onClick={() => { onNavigateToAgent?.(n.entityId!); setOpen(false) }}
                                className="text-[11px] px-2.5 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded font-medium hover:bg-sky-200 dark:hover:bg-sky-900/50 transition-colors"
                              >
                                View Agent
                              </button>
                              <button
                                onClick={async () => {
                                  setProcessingId(n.id)
                                  try {
                                    const res = await fetch(`/api/agents/${n.entityId}/restart`, { method: 'POST' })
                                    const data = await res.json()
                                    if (data.ok) {
                                      showSuccess(`Restarting ${n.entityId}...`)
                                      await fetch('/api/notifications/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) })
                                      onAgentRestarted?.(n.entityId!)
                                    } else {
                                      showError(`Failed to restart ${n.entityId}: ${data.error || 'unknown error'}`)
                                    }
                                  } catch {
                                    showError(`Failed to restart ${n.entityId}`)
                                  }
                                  await fetchNotifications()
                                  setProcessingId(null)
                                }}
                                disabled={processingId === n.id}
                                className="text-[11px] px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-medium hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                              >
                                {processingId === n.id ? 'Restarting...' : 'Restart'}
                              </button>
                              <button
                                onClick={async () => {
                                  setProcessingId(n.id)
                                  try {
                                    await fetch('/api/agents/pause', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentIds: [n.entityId] }) })
                                    showSuccess(`Paused ${n.entityId}`)
                                    await fetch('/api/notifications/dismiss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id }) })
                                    onAgentRestarted?.(n.entityId!)
                                  } catch {
                                    showError(`Failed to pause ${n.entityId}`)
                                  }
                                  await fetchNotifications()
                                  setProcessingId(null)
                                }}
                                disabled={processingId === n.id}
                                className="text-[11px] px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors disabled:opacity-50"
                              >
                                Pause
                              </button>
                            </div>
                          )}

                          {/* Workflow link for blocked notifications */}
                          {n.workflowId && n.type === 'workflow-blocked' && (
                            <button
                              onClick={() => { onNavigateToWorkflow?.(n.workflowId!); setOpen(false) }}
                              className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-medium mt-1.5 block"
                            >
                              Go to workflow →
                            </button>
                          )}

                          {/* Standard footer actions */}
                          <div className="flex items-center gap-2 mt-1.5">
                            {n.type === 'artifact-update' && (n.artifactPath || n.artifactUrl) && (
                              <button
                                onClick={() => handleAction(n)}
                                className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline font-medium"
                              >
                                Open file →
                              </button>
                            )}
                            {n.entityId && !n.blockerType && n.entityType !== 'agent' && n.type !== 'artifact-update' && (
                              <button
                                onClick={() => handleAction(n)}
                                className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline font-medium"
                              >
                                View →
                              </button>
                            )}
                            {n.entityType === 'budget' && (
                              <button
                                onClick={() => handleAction(n)}
                                className="text-[11px] text-sky-600 dark:text-sky-400 hover:underline font-medium"
                              >
                                View budget →
                              </button>
                            )}
                            <button
                              onClick={() => handleDismiss(n.id)}
                              className="text-[11px] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
