import React, { useCallback, useEffect, useRef, useState } from 'react'

interface Notification {
  id: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  entityId?: string
  entityType?: 'agent' | 'workflow' | 'budget' | 'channel'
  createdAt: string
}

interface NotificationCenterProps {
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToWorkflow?: (workflowId: string) => void
  onNavigateToPage?: (page: string) => void
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

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-400',
}

const CATEGORY_LABELS: Record<string, string> = {
  agent: 'Agents',
  workflow: 'Workflows',
  budget: 'Budget',
  communication: 'Communication',
}

const CATEGORY_ORDER = ['agent', 'workflow', 'communication', 'budget']

export function NotificationCenter({ onNavigateToAgent, onNavigateToWorkflow, onNavigateToPage }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [criticalCount, setCriticalCount] = useState(0)
  const [warningCount, setWarningCount] = useState(0)
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const resp = await fetch('/api/notifications')
      if (!resp.ok) return
      const data = await resp.json()
      setNotifications(data.notifications || [])
      setActiveCount(data.activeCount || 0)
      setCriticalCount(data.criticalCount || 0)
      setWarningCount(data.warningCount || 0)
    } catch {}
  }, [])

  // Poll every 30s
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

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
    if (n.type === 'channel-activity' && onNavigateToPage) {
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

  // Group notifications by category (derived from type)
  const getCategory = (n: Notification): string => {
    if (n.type.startsWith('agent-') || n.type === 'agent-error' || n.type === 'agent-offline' || n.type === 'agent-needs-feedback') return 'agent'
    if (n.type.startsWith('workflow-')) return 'workflow'
    if (n.type.startsWith('cost-')) return 'budget'
    if (n.type === 'channel-activity') return 'communication'
    return n.entityType || 'agent'
  }
  const grouped = CATEGORY_ORDER.reduce<Record<string, Notification[]>>((acc, cat) => {
    const items = notifications.filter(n => getCategory(n) === cat)
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
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{n.title}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{timeAgo(n.createdAt)}</span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</div>
                          <div className="flex items-center gap-2 mt-1.5">
                            {n.entityId && (
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
