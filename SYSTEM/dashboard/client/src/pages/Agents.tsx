import React, { useEffect, useState, useCallback } from 'react'
import AgentDetailPanel from '../components/AgentDetailPanel'
import AddAgentWizard from '../components/AddAgentWizard'
import DeleteAgentPanel from '../components/DeleteAgentPanel'
import LinkWhatsAppPanel from '../components/LinkWhatsAppPanel'
import SyncGroupsPanel from '../components/SyncGroupsPanel'

function secAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

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
  isProfile: boolean
  workspacePath: string
  communities: GroupEntry[]
  groups: GroupEntry[]
}

const STATUS_COLORS = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

const STATUS_TEXT = {
  online: 'text-green-700 bg-green-50',
  offline: 'text-yellow-700 bg-yellow-50',
  unknown: 'text-gray-600 bg-gray-100',
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

type ViewMode = 'list' | 'grid'

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  // collapsed set: agent IDs that are collapsed (default: all expanded)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [showAddWizard, setShowAddWizard] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [linkWaTarget, setLinkWaTarget] = useState<Agent | null>(null)
  const [syncGroupsTarget, setSyncGroupsTarget] = useState<Agent | null>(null)

  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => {
        setAgents(d.agents)
        setLoading(false)
        setLastRefreshed(Date.now())
      })
      .catch(() => {
        setError('Failed to load agents')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchAgents()
    const interval = setInterval(fetchAgents, 30000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  useEffect(() => {
    const ticker = setInterval(() => setRefreshedLabel(secAgo(lastRefreshed)), 5000)
    setRefreshedLabel(secAgo(lastRefreshed))
    return () => clearInterval(ticker)
  }, [lastRefreshed])

  const handleRefresh = () => {
    if (cooling) return
    setCooling(true)
    fetchAgents()
    setTimeout(() => setCooling(false), 3000)
  }

  const toggleCollapse = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Agent Roster</h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            {agents.length} agent{agents.length !== 1 ? 's' : ''}
            <span className="text-gray-300">·</span>
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse inline-block" title="Auto-refreshes every 30s" />
            refreshed {refreshedLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'list' ? 'bg-sky-50 text-sky-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
            >
              ☰
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view"
              className={`px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 ${viewMode === 'grid' ? 'bg-sky-50 text-sky-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
            >
              ⊞
            </button>
          </div>
          <button
            onClick={handleRefresh}
            disabled={cooling}
            className={`text-sm font-medium transition-colors ${
              cooling ? 'text-gray-300 cursor-not-allowed' : 'text-sky-600 hover:text-sky-800'
            }`}
          >
            {cooling ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <button
            onClick={() => setShowAddWizard(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors flex items-center gap-1.5"
            title="Add new agent"
          >
            <span className="text-base leading-none">+</span> Add Agent
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          Loading agents...
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {!loading && !error && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <span className="text-4xl mb-4">🤖</span>
          <p className="text-sm">No agents found in workspace</p>
          <p className="text-xs mt-1 text-gray-300">Run setup.sh to add the first agent</p>
        </div>
      )}

      {!loading && !error && agents.length > 0 && viewMode === 'list' && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {agents.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              selected={selectedAgent?.id === agent.id}
              collapsed={collapsedIds.has(agent.id)}
              onToggle={() => toggleCollapse(agent.id)}
              onClick={() => setSelectedAgent(agent)}
              onDelete={() => setDeleteTarget(agent.id)}
              onLinkWa={() => setLinkWaTarget(agent)}
              onSyncGroups={() => setSyncGroupsTarget(agent)}
              onUnlinkWa={() => {
                fetch(`/api/agents/${agent.id}/whatsapp`, { method: 'DELETE' })
                  .then(() => fetchAgents())
                  .catch(() => {})
              }}
            />
          ))}
        </div>
      )}

      {!loading && !error && agents.length > 0 && viewMode === 'grid' && (
        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {agents.map(agent => (
            <AgentGridCard
              key={agent.id}
              agent={agent}
              selected={selectedAgent?.id === agent.id}
              onClick={() => setSelectedAgent(agent)}
            />
          ))}
        </div>
      )}

      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {showAddWizard && (
        <AddAgentWizard
          onClose={() => setShowAddWizard(false)}
          onDone={() => fetchAgents()}
        />
      )}

      {deleteTarget && (
        <DeleteAgentPanel
          agentId={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { fetchAgents(); setSelectedAgent(null) }}
        />
      )}

      {linkWaTarget && (
        <LinkWhatsAppPanel
          agentId={linkWaTarget.id}
          agentName={linkWaTarget.name}
          isProfile={linkWaTarget.isProfile}
          onClose={() => setLinkWaTarget(null)}
          onLinked={() => fetchAgents()}
        />
      )}

      {syncGroupsTarget && (
        <SyncGroupsPanel
          agentId={syncGroupsTarget.id}
          agentName={syncGroupsTarget.name}
          localGroups={syncGroupsTarget.groups}
          localCommunities={syncGroupsTarget.communities}
          onClose={() => setSyncGroupsTarget(null)}
          onSynced={() => fetchAgents()}
        />
      )}
    </div>
  )
}

function AgentCard({
  agent, selected, collapsed, onToggle, onClick, onDelete, onLinkWa, onSyncGroups, onUnlinkWa,
}: {
  agent: Agent
  selected: boolean
  collapsed: boolean
  onToggle: () => void
  onClick: () => void
  onDelete: () => void
  onLinkWa: () => void
  onSyncGroups: () => void
  onUnlinkWa: () => void
}) {
  const [confirmUnlink, setConfirmUnlink] = React.useState(false)
  return (
    <div
      className={`bg-white rounded-xl border shadow-sm transition-all ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200 hover:shadow-md'
      }`}
    >
      {/* Card header — always visible */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 cursor-pointer" onClick={onClick}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[agent.status]}`} />
          <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_TEXT[agent.status]}`}>
            {agent.status}
          </span>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onDelete() }}
            className="text-gray-200 hover:text-red-400 transition-colors text-xs p-1 rounded hover:bg-red-50"
            title="Delete agent"
          >
            🗑
          </button>
          <button
            onClick={e => { e.stopPropagation(); onToggle() }}
            className="text-gray-300 hover:text-gray-500 transition-colors text-xs p-1"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        </div>
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <div className="px-5 pb-4">
          <div className="text-xs text-gray-400 font-mono mb-3">{agent.id}</div>

          <div className="space-y-1.5 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 w-20 shrink-0">Heartbeat</span>
              <span className="font-mono text-xs">{timeAgo(agent.lastHeartbeat)}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-400 w-20 shrink-0 mt-0.5">WhatsApp</span>
              {agent.whatsapp ? (
                confirmUnlink ? (
                  <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                    <p className="text-xs text-amber-700 font-medium">This will permanently delete WA credentials from disk. The agent will immediately stop receiving and sending WhatsApp messages and must be re-linked to resume.</p>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { onUnlinkWa(); setConfirmUnlink(false) }}
                        className="text-xs px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 font-medium transition-colors"
                      >
                        Yes, unlink
                      </button>
                      <button
                        onClick={() => setConfirmUnlink(false)}
                        className="text-xs px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs">+{agent.whatsapp}</span>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmUnlink(true) }}
                      className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                      title="Unlink WhatsApp"
                    >
                      ×
                    </button>
                  </div>
                )
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); onLinkWa() }}
                  className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition-colors font-medium"
                >
                  Link WA
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">Groups</span>
              {agent.whatsapp && (
                <button
                  onClick={e => { e.stopPropagation(); onSyncGroups() }}
                  className="text-xs px-1.5 py-0.5 rounded text-sky-500 hover:text-sky-700 hover:bg-sky-50 transition-colors font-medium"
                  title="Sync groups from WhatsApp"
                >
                  ↻ Sync
                </button>
              )}
            </div>
            {(agent.communities.length > 0 || agent.groups.length > 0) ? (
              <div className="flex flex-wrap gap-1">
                {agent.communities.map(c => (
                  <span key={c.name} title={c.description ?? undefined} className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 font-medium cursor-default">{c.name}</span>
                ))}
                {agent.groups.map(g => (
                  <span key={g.name} title={g.description ?? undefined} className="text-xs px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium cursor-default">{g.name}</span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-300">No groups configured</p>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-300 font-mono truncate block">
              {agent.workspacePath.replace(/^\/Users\/[^/]+/, '~')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function AgentGridCard({ agent, selected, onClick }: { agent: Agent; selected: boolean; onClick: () => void }) {
  const totalGroups = agent.communities.length + agent.groups.length
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[agent.status]}`} />
        <span className="font-semibold text-gray-900 text-sm truncate">{agent.name}</span>
      </div>
      <div className="text-xs font-mono text-gray-400 truncate mb-1">{agent.id}</div>
      <div className="text-xs text-gray-400">{timeAgo(agent.lastHeartbeat)}</div>
      {totalGroups > 0 && (
        <div className="mt-2 text-xs text-gray-300">{totalGroups} group{totalGroups !== 1 ? 's' : ''}</div>
      )}
    </div>
  )
}
