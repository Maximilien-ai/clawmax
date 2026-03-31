import React, { useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useToast } from './Toast'

interface GroupEntry {
  name: string
  description: string | null
}

interface Agent {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
  lastHeartbeat: string | null
  whatsapp: string | null
  workspacePath: string
  communities: GroupEntry[]
  groups: GroupEntry[]
  tags: string[]
}

interface AgentActivity {
  recentFiles: { name: string; mtime: string; ageMins: number }[]
  todos: string | null
  completed: string | null
  identity: string | null
  skills?: string[]
  liveConfig?: {
    model: string
    workspace: string
    agentDir: string
  }
}

const STATUS_TEXT = {
  online: 'text-green-700 bg-green-50',
  offline: 'text-yellow-700 bg-yellow-50',
  unknown: 'text-gray-600 bg-gray-100',
}
const STATUS_DOT = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

function timeAgo(mins: number): string {
  if (mins < 1) return 'just now'
  if (mins < 60) return `${Math.floor(mins)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Dimmed file source tag shown next to section headers */
function SourceTag({ file }: { file: string }) {
  return (
    <span className="ml-2 text-gray-300 font-mono text-xs font-normal normal-case tracking-normal">
      · {file}
    </span>
  )
}

function Section({ title, source, children }: { title: string; source?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
        {title}
        {source && <SourceTag file={source} />}
      </h3>
      {children}
    </div>
  )
}

function secAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

export default function AgentDetailPanel({
  agent,
  onClose,
  onChat,
  onClone,
  onNavigateToSkills,
  initialEditCostLimit = false,
}: {
  agent: Agent
  onClose: () => void
  onChat: () => void
  onClone?: () => void
  onNavigateToSkills?: (agentId: string) => void
  initialEditCostLimit?: boolean
}) {
  const { showError, showSuccess } = useToast()
  const [activity, setActivity] = useState<AgentActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [costLimit, setCostLimit] = useState<number | null>(null)
  const [costLimitInput, setCostLimitInput] = useState('')
  const [editingCostLimit, setEditingCostLimit] = useState(false)

  // Close on Escape
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (showRenameDialog) {
        setShowRenameDialog(false)
      } else {
        onClose()
      }
    }
  }, [onClose, showRenameDialog])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  const fetchActivity = useCallback(() => {
    fetch(`/api/agents/${agent.id}/activity`)
      .then(r => r.json())
      .then(d => { setActivity(d); setLoading(false); setLastRefreshed(Date.now()) })
      .catch(() => setLoading(false))
  }, [agent.id])

  useEffect(() => {
    setLoading(true)
    setActivity(null)
    fetchActivity()
    // Fetch cost limit
    fetch(`/api/agents/${agent.id}/cost-limit`)
      .then(r => r.json())
      .then(d => {
        setCostLimit(d.limitUsd ?? null)
        setCostLimitInput(d.limitUsd ? String(d.limitUsd) : '')
      })
      .catch(() => {})
  }, [fetchActivity, agent.id])

  useEffect(() => {
    if (!initialEditCostLimit) return
    setCostLimitInput(costLimit ? String(costLimit) : '')
    setEditingCostLimit(true)
  }, [initialEditCostLimit, costLimit])

  // Live "refreshed Xs ago" ticker
  useEffect(() => {
    const ticker = setInterval(() => setRefreshedLabel(secAgo(lastRefreshed)), 5000)
    setRefreshedLabel(secAgo(lastRefreshed))
    return () => clearInterval(ticker)
  }, [lastRefreshed])

  const handleRefresh = () => {
    if (cooling) return
    setCooling(true)
    fetchActivity()
    setTimeout(() => setCooling(false), 3000)
  }

  const handleSaveCostLimit = async () => {
    const val = costLimitInput.trim() ? parseFloat(costLimitInput) : null
    const res = await fetch(`/api/agents/${agent.id}/cost-limit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limitUsd: val && val > 0 ? val : null }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      showError(data?.error || 'Failed to save cost limit')
      return
    }
    setCostLimit(val && val > 0 ? val : null)
    setEditingCostLimit(false)
    showSuccess(val && val > 0 ? `Set ${agent.name} budget to $${val.toFixed(2)}` : `Removed ${agent.name} budget limit`)
  }

  const handleRename = async () => {
    if (!newName.trim() || newName === agent.name) {
      setShowRenameDialog(false)
      return
    }

    try {
      const res = await fetch(`/api/agents/${agent.id}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: newName.trim() })
      })

      if (res.ok) {
        setShowRenameDialog(false)
        window.location.reload() // Reload to reflect the new name
      }
    } catch (err) {
      console.error('Failed to rename agent:', err)
    }
  }

  // Derive the relative agent dir path (e.g. AGENTS/max0)
  const relDir = agent.workspacePath.split('/').slice(-2).join('/')

  return (
    <div className="fixed inset-0 bg-black/30 z-40 md:bg-black/20" onClick={onClose}>
      {/* Panel */}
      <aside className="fixed top-0 right-0 h-full w-full sm:w-[30rem] lg:w-[36rem] max-w-full bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 py-4 border-b border-gray-100 shrink-0 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2
                className="min-w-0 font-bold text-gray-900 text-base flex items-center gap-1.5 dark:text-gray-100 cursor-pointer hover:text-sky-600 dark:hover:text-sky-400 transition-colors group"
                onClick={() => {
                  setNewName(agent.name)
                  setShowRenameDialog(true)
                }}
                title="Click to rename"
              >
                {agent.tags.includes('built-in') && <span>🤖</span>}
                <span className="truncate">{agent.name}</span>
                <span className="text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✏️</span>
              </h2>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TEXT[agent.status]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[agent.status]}`} />
                {agent.status}
              </span>
            </div>
            <span className="block text-xs text-gray-400 font-mono break-all">{agent.id}</span>
            {activity?.liveConfig?.model && (
              <span className="block text-xs text-gray-400 mt-0.5 break-all">
                model
                <span className="ml-1.5 text-gray-300 font-mono">{activity.liveConfig.model}</span>
              </span>
            )}
            {agent.whatsapp && (
              <span className="block text-xs text-gray-400 mt-0.5 break-all">
                +{agent.whatsapp}
                <span className="ml-1.5 text-gray-300 font-mono">· IDENTITY.md</span>
              </span>
            )}
            <span className="block text-xs text-gray-300 mt-1">refreshed {refreshedLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 shrink-0">
            <button
              onClick={onChat}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full text-sm font-medium text-sky-500 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/30 transition-colors"
              aria-label="Chat with agent"
              title="Chat with agent"
            >
              💬
            </button>
            {onClone && (
              <button
                onClick={onClone}
                className="h-9 w-9 inline-flex items-center justify-center rounded-full text-sm font-medium text-purple-500 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
                aria-label="Clone agent"
                title="Clone agent"
              >
                📋
              </button>
            )}
            <button
              onClick={handleRefresh}
              disabled={cooling}
              className={`h-9 w-9 inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors ${
                cooling ? 'text-gray-300 cursor-not-allowed' : 'text-sky-500 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/30'
              }`}
              aria-label="Refresh"
            >
              ↻
            </button>
            <button
              onClick={onClose}
              className="h-9 w-9 inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6 sm:px-5">
          {loading && (
            <p className="text-sm text-gray-400">Loading activity...</p>
          )}

          {/* Cost Limit */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400">Cost limit:</span>
            {editingCostLimit ? (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={costLimitInput}
                  onChange={(e) => setCostLimitInput(e.target.value)}
                  placeholder="e.g. 1.00"
                  className="w-20 px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCostLimit(); if (e.key === 'Escape') setEditingCostLimit(false) }}
                />
                <button onClick={handleSaveCostLimit} className="text-sky-600 dark:text-sky-400 hover:underline">Save</button>
                <button onClick={() => setEditingCostLimit(false)} className="text-gray-400 hover:text-gray-600">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => { setCostLimitInput(costLimit ? String(costLimit) : ''); setEditingCostLimit(true) }}
                className="text-gray-600 dark:text-gray-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors"
                title="Set per-agent cost limit"
              >
                {costLimit ? `$${costLimit.toFixed(2)}` : 'No limit set'}
                <span className="ml-1 text-gray-300 dark:text-gray-600">✏️</span>
              </button>
            )}
          </div>

          {!loading && activity && (
            <>
              {/* Recent file activity */}
              <Section title="Recent activity" source={relDir + '/'}>
                <ul className="space-y-1">
                  {activity.recentFiles.map(f => (
                    <li key={f.name} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-gray-700 text-xs dark:text-gray-300">{f.name}</span>
                      <span className="text-gray-400 text-xs shrink-0 ml-3">{timeAgo(f.ageMins)}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              {/* TODOs */}
              {activity.todos && (
                <Section title="Active TODOs" source="TODOs.md">
                  <div className="prose prose-sm max-w-none text-gray-700 [&_ul]:pl-4 [&_li]:my-0.5 dark:text-gray-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activity.todos}
                    </ReactMarkdown>
                  </div>
                </Section>
              )}

              {/* Recently completed */}
              {activity.completed && (
                <Section title="Recently completed" source="COMPLETED.md">
                  <div className="prose prose-sm max-w-none text-gray-600 [&_ul]:pl-4 [&_li]:my-0.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activity.completed}
                    </ReactMarkdown>
                  </div>
                </Section>
              )}

              {/* Live Configuration */}
              {activity.liveConfig && (
                <Section title="Live Configuration" source="openclaw.json">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-400">Model</span>
                      <span className="text-gray-700 font-mono text-right break-all dark:text-gray-300">{activity.liveConfig.model}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-400">Workspace</span>
                      <span className="text-gray-700 font-mono text-right text-[10px] leading-tight break-all dark:text-gray-300">
                        {activity.liveConfig.workspace.replace(/^\/Users\/[^/]+/, '~')}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-gray-400">Agent Dir</span>
                      <span className="text-gray-700 font-mono text-right text-[10px] leading-tight break-all dark:text-gray-300">
                        {activity.liveConfig.agentDir.replace(/^\/Users\/[^/]+/, '~')}
                      </span>
                    </div>
                  </div>
                </Section>
              )}

              {/* Skills & Tools */}
              {activity.skills && activity.skills.length > 0 && (
                <Section title="Skills & Tools" source="openclaw.json">
                  <div className="flex flex-wrap gap-1.5">
                    {activity.skills.map(skill => (
                      <button
                        key={skill}
                        onClick={() => {
                          if (onNavigateToSkills) {
                            onNavigateToSkills(agent.id)
                            onClose()
                          }
                        }}
                        className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium hover:bg-blue-100 transition-colors"
                      >
                        {skill}
                      </button>
                    ))}
                  </div>
                  {onNavigateToSkills && (
                    <button
                      onClick={() => {
                        onNavigateToSkills(agent.id)
                        onClose()
                      }}
                      className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Manage skills →
                    </button>
                  )}
                </Section>
              )}

              {/* Identity snippet */}
              {activity.identity && (
                <Section title="Identity" source="IDENTITY.md">
                  <div className="prose prose-sm max-w-none text-gray-500 [&_p]:my-1">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activity.identity}
                    </ReactMarkdown>
                  </div>
                </Section>
              )}

              {/* Groups */}
              {(agent.communities.length > 0 || agent.groups.length > 0) && (
                <Section title="WhatsApp presence" source="GROUPS.md">
                  <div className="space-y-3">
                    {agent.communities.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1.5">Communities</p>
                        <div className="space-y-1.5">
                          {[...agent.communities].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                            <div key={c.name}>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">{c.name}</span>
                              {c.description && (
                                <p className="text-xs text-gray-400 mt-0.5 ml-1">{c.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {agent.groups.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-400 mb-1.5">Groups</p>
                        <div className="space-y-1.5">
                          {[...agent.groups].sort((a, b) => a.name.localeCompare(b.name)).map(g => (
                            <div key={g.name}>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">{g.name}</span>
                              {g.description && (
                                <p className="text-xs text-gray-400 mt-0.5 ml-1">{g.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </Section>
              )}
            </>
          )}
        </div>

        {/* Footer path */}
        <div className="px-4 py-3 border-t border-gray-100 shrink-0 sm:px-5">
          <span className="text-xs text-gray-300 font-mono break-all block">
            {agent.workspacePath.replace(/^\/Users\/[^/]+/, '~')}
          </span>
        </div>
      </aside>

      {/* Rename Dialog */}
      {showRenameDialog && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={() => setShowRenameDialog(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Rename Agent</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRename()
                } else if (e.key === 'Escape') {
                  setShowRenameDialog(false)
                }
              }}
              placeholder="Enter new name"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-md outline-none focus:border-sky-400 dark:focus:border-sky-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 mb-4"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowRenameDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!newName.trim() || newName === agent.name}
                className="px-4 py-2 text-sm bg-sky-600 text-white rounded hover:bg-sky-700 transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
