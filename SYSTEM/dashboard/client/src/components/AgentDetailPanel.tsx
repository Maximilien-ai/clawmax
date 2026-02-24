import React, { useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

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
}

interface AgentActivity {
  recentFiles: { name: string; mtime: string; ageMins: number }[]
  todos: string | null
  completed: string | null
  identity: string | null
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
}: {
  agent: Agent
  onClose: () => void
  onChat: () => void
}) {
  const [activity, setActivity] = useState<AgentActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)

  // Close on Escape
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

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
  }, [fetchActivity])

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

  // Derive the relative agent dir path (e.g. AGENTS/max0)
  const relDir = agent.workspacePath.split('/').slice(-2).join('/')

  return (
    <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose}>
      {/* Panel */}
      <aside className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-bold text-gray-900 text-base">{agent.name}</h2>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_TEXT[agent.status]}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[agent.status]}`} />
                {agent.status}
              </span>
            </div>
            <span className="text-xs text-gray-400 font-mono">{agent.id}</span>
            {agent.whatsapp && (
              <span className="block text-xs text-gray-400 mt-0.5">
                +{agent.whatsapp}
                <span className="ml-1.5 text-gray-300 font-mono">· IDENTITY.md</span>
              </span>
            )}
            <span className="block text-xs text-gray-300 mt-1">refreshed {refreshedLabel}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              onClick={onChat}
              className="text-sm font-medium text-sky-500 hover:text-sky-700 transition-colors"
              aria-label="Chat with agent"
              title="Chat with agent"
            >
              💬
            </button>
            <button
              onClick={handleRefresh}
              disabled={cooling}
              className={`text-sm font-medium transition-colors ${
                cooling ? 'text-gray-300 cursor-not-allowed' : 'text-sky-500 hover:text-sky-700'
              }`}
              aria-label="Refresh"
            >
              ↻
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {loading && (
            <p className="text-sm text-gray-400">Loading activity...</p>
          )}

          {!loading && activity && (
            <>
              {/* Recent file activity */}
              <Section title="Recent activity" source={relDir + '/'}>
                <ul className="space-y-1">
                  {activity.recentFiles.map(f => (
                    <li key={f.name} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-gray-700 text-xs">{f.name}</span>
                      <span className="text-gray-400 text-xs shrink-0 ml-3">{timeAgo(f.ageMins)}</span>
                    </li>
                  ))}
                </ul>
              </Section>

              {/* TODOs */}
              {activity.todos && (
                <Section title="Active TODOs" source="TODOs.md">
                  <div className="prose prose-sm max-w-none text-gray-700 [&_ul]:pl-4 [&_li]:my-0.5">
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
                    <div className="flex items-start justify-between">
                      <span className="text-gray-400">Model</span>
                      <span className="text-gray-700 font-mono text-right">{activity.liveConfig.model}</span>
                    </div>
                    <div className="flex items-start justify-between">
                      <span className="text-gray-400">Workspace</span>
                      <span className="text-gray-700 font-mono text-right text-[10px] leading-tight break-all">
                        {activity.liveConfig.workspace.replace(/^\/Users\/[^/]+/, '~')}
                      </span>
                    </div>
                    <div className="flex items-start justify-between">
                      <span className="text-gray-400">Agent Dir</span>
                      <span className="text-gray-700 font-mono text-right text-[10px] leading-tight break-all">
                        {activity.liveConfig.agentDir.replace(/^\/Users\/[^/]+/, '~')}
                      </span>
                    </div>
                  </div>
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
        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <span className="text-xs text-gray-300 font-mono truncate block">
            {agent.workspacePath.replace(/^\/Users\/[^/]+/, '~')}
          </span>
        </div>
      </aside>
    </div>
  )
}
