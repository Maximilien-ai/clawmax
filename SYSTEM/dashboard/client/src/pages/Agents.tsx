import React, { useEffect, useState, useCallback, useMemo } from 'react'
import AgentDetailPanel from '../components/AgentDetailPanel'
import AddAgentWizard from '../components/AddAgentWizard'
import DeleteAgentPanel from '../components/DeleteAgentPanel'
import LinkWhatsAppPanel from '../components/LinkWhatsAppPanel'
import SyncGroupsPanel from '../components/SyncGroupsPanel'
import ChatPanel from '../components/ChatPanel'

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
  tags: string[]
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

export default function Agents({ onNavigateToDoc, initialAgentId }: { onNavigateToDoc?: (file: string) => void; initialAgentId?: string } = {}) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('agents-view-mode')
    return (saved === 'list' || saved === 'grid') ? saved : 'list'
  })
  // collapsed set: agent IDs that are collapsed (default: all expanded)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set())
  const [showAddWizard, setShowAddWizard] = useState(false)
  const [cloneFromAgent, setCloneFromAgent] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [linkWaTarget, setLinkWaTarget] = useState<Agent | null>(null)
  const [syncGroupsTarget, setSyncGroupsTarget] = useState<Agent | null>(null)
  const [chatTarget, setChatTarget] = useState<Agent | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [tagToRemove, setTagToRemove] = useState<{ agentId: string; tag: string; isPrimary: boolean } | null>(null)
  const [tagManageTarget, setTagManageTarget] = useState<Agent | null>(null)
  const [showSecondaryTags, setShowSecondaryTags] = useState(false)
  const [expandedSecondaryAgents, setExpandedSecondaryAgents] = useState<Set<string>>(new Set())
  const [showRestartMenu, setShowRestartMenu] = useState(false)
  const [systemStatus, setSystemStatus] = useState<{ total: number; online: number; offline: number; unknown: number; runningGateways: number; gatewayAvailable: boolean } | null>(null)

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
    // Auto-refresh every 5 minutes to avoid hammering status checks
    const interval = setInterval(fetchAgents, 300000)
    return () => clearInterval(interval)
  }, [fetchAgents])

  useEffect(() => {
    const ticker = setInterval(() => setRefreshedLabel(secAgo(lastRefreshed)), 5000)
    setRefreshedLabel(secAgo(lastRefreshed))
    return () => clearInterval(ticker)
  }, [lastRefreshed])

  // Save view mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('agents-view-mode', viewMode)
  }, [viewMode])

  // Select initial agent if provided and scroll to it
  useEffect(() => {
    if (initialAgentId && agents.length > 0) {
      const agent = agents.find(a => a.id === initialAgentId)
      if (agent) {
        setSelectedAgent(agent)
        // Scroll to agent card after a brief delay to ensure DOM is updated
        setTimeout(() => {
          const element = document.getElementById(`agent-card-${initialAgentId}`)
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }, 100)
      }
    }
  }, [initialAgentId, agents])

  const handleRefresh = () => {
    if (cooling) return
    setCooling(true)
    fetchAgents()
    setTimeout(() => setCooling(false), 3000)
  }

  const fetchSystemStatus = useCallback(() => {
    fetch('/api/agents/status')
      .then(r => r.json())
      .then(d => setSystemStatus(d))
      .catch(() => {})
  }, [])

  // Fetch system status when menu opens
  useEffect(() => {
    if (showRestartMenu) {
      fetchSystemStatus()
    }
  }, [showRestartMenu, fetchSystemStatus])

  const handleRestart = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/restart`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        // Refresh agents list after restart
        setTimeout(() => fetchAgents(), 1000)
      } else {
        alert(`Failed to restart agent: ${data.error}`)
      }
    } catch (err) {
      alert('Failed to restart agent')
    }
  }

  const handleRestartAll = async () => {
    setShowRestartMenu(false)
    const promises = agents.map(agent =>
      fetch(`/api/agents/${agent.id}/restart`, { method: 'POST' })
    )
    await Promise.all(promises)
    setTimeout(() => fetchAgents(), 1000)
  }

  const handleRestartOffline = async () => {
    setShowRestartMenu(false)
    const offlineAgents = agents.filter(a => a.status === 'offline')
    const promises = offlineAgents.map(agent =>
      fetch(`/api/agents/${agent.id}/restart`, { method: 'POST' })
    )
    await Promise.all(promises)
    setTimeout(() => fetchAgents(), 1000)
  }

  const toggleCollapse = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allTags = useMemo(() => {
    const tags = new Set<string>()
    const primaryTags = new Set<string>() // Tags that are first for at least one agent

    agents.forEach(a => {
      a.tags.forEach(t => tags.add(t))
      if (a.tags.length > 0) {
        primaryTags.add(a.tags[0]) // First tag is primary
      }
    })

    // Sort: primary tags first (alphabetically), then secondary tags (alphabetically)
    return Array.from(tags).sort((a, b) => {
      const aIsPrimary = primaryTags.has(a)
      const bIsPrimary = primaryTags.has(b)

      if (aIsPrimary && !bIsPrimary) return -1
      if (!aIsPrimary && bIsPrimary) return 1
      return a.localeCompare(b)
    })
  }, [agents])

  const { primaryTags, secondaryTags } = useMemo(() => {
    const primary = new Set<string>()
    agents.forEach(a => {
      if (a.tags.length > 0) {
        primary.add(a.tags[0])
      }
    })

    const pTags = allTags.filter(t => primary.has(t))
    const sTags = allTags.filter(t => !primary.has(t))

    return { primaryTags: pTags, secondaryTags: sTags }
  }, [allTags, agents])

  const filteredAgents = useMemo(() => {
    if (selectedTags.size === 0) return agents
    return agents.filter(a => a.tags.some(t => selectedTags.has(t)))
  }, [agents, selectedTags])

  const groupedAgents = useMemo(() => {
    const groups = new Map<string, Agent[]>()

    // Only group by PRIMARY tags (tags that appear as first tag for at least one agent)
    primaryTags.forEach(tag => {
      const agentsWithTag = filteredAgents.filter(a => a.tags.includes(tag))
      if (agentsWithTag.length > 0) {
        groups.set(tag, agentsWithTag)
      }
    })

    // Add untagged agents
    const untagged = filteredAgents.filter(a => a.tags.length === 0)
    if (untagged.length > 0) {
      groups.set('__untagged__', untagged)
    }

    return groups
  }, [filteredAgents, primaryTags])

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const removeTag = async (agentId: string, tagToRemove: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return

    const newTags = agent.tags.filter(t => t !== tagToRemove)

    try {
      const res = await fetch(`/api/agents/${agentId}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: newTags }),
      })

      if (res.ok) {
        // Refresh agents to get updated tags
        fetchAgents()
      }
    } catch (err) {
      console.error('Failed to remove tag:', err)
    }
  }

  const handleRemoveTag = (agentId: string, tag: string) => {
    const agent = agents.find(a => a.id === agentId)
    if (!agent) return

    const isPrimary = agent.tags[0] === tag

    if (isPrimary) {
      setTagToRemove({ agentId, tag, isPrimary })
    } else {
      removeTag(agentId, tag)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Agent Roster</h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
            {selectedTags.size > 0 && <span className="text-gray-300">({agents.length} total)</span>}
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
          <div className="relative">
            <button
              onClick={() => setShowRestartMenu(!showRestartMenu)}
              className="text-sm font-medium px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              title="Restart agents"
            >
              ↻ Restart {showRestartMenu ? '▲' : '▼'}
            </button>
            {showRestartMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowRestartMenu(false)} />
                <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                  {/* System Status */}
                  {systemStatus && (
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <div className="text-xs font-semibold text-gray-700 mb-2">System Status</div>
                      <div className="space-y-1 text-xs text-gray-600">
                        <div className="flex justify-between">
                          <span>Total Agents:</span>
                          <span className="font-medium">{systemStatus.total}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Online:</span>
                          <span className="font-medium text-green-600">{systemStatus.online}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Offline:</span>
                          <span className="font-medium text-yellow-600">{systemStatus.offline}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Unknown:</span>
                          <span className="font-medium text-gray-400">{systemStatus.unknown}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-gray-200">
                          <span>Running Gateways:</span>
                          <span className="font-medium text-sky-600">{systemStatus.runningGateways}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Restart Actions */}
                  {systemStatus && !systemStatus.gatewayAvailable && (
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-200">
                      <div className="text-xs text-amber-800">
                        <span className="font-semibold">⚠️ Restart Unavailable</span>
                        <p className="mt-1">openclaw-gateway not found in PATH</p>
                      </div>
                    </div>
                  )}
                  <div className="py-1">
                    <button
                      onClick={handleRestartAll}
                      disabled={!systemStatus?.gatewayAvailable}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                        systemStatus?.gatewayAvailable
                          ? 'text-gray-700 hover:bg-gray-50'
                          : 'text-gray-400 cursor-not-allowed bg-gray-50'
                      }`}
                    >
                      <span className="text-amber-500">↻</span> Restart All Agents
                    </button>
                    <button
                      onClick={handleRestartOffline}
                      disabled={!systemStatus?.gatewayAvailable || !agents.some(a => a.status === 'offline')}
                      className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 transition-colors ${
                        systemStatus?.gatewayAvailable && agents.some(a => a.status === 'offline')
                          ? 'text-gray-700 hover:bg-gray-50'
                          : 'text-gray-400 cursor-not-allowed bg-gray-50'
                      }`}
                    >
                      <span className="text-yellow-500">↻</span> Restart Offline Agents
                      {systemStatus && systemStatus.offline > 0 && (
                        <span className="ml-auto text-xs text-gray-400">({systemStatus.offline})</span>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setShowAddWizard(true)}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 transition-colors flex items-center gap-1.5"
            title="Add new agent"
          >
            <span className="text-base leading-none">+</span> Add Agent
          </button>
        </div>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Filter by tags:</span>
            <button
              onClick={() => setSelectedTags(new Set())}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedTags.size === 0
                  ? 'bg-sky-600 text-white border border-sky-600'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
              }`}
            >
              All
            </button>
            {primaryTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  selectedTags.has(tag)
                    ? 'bg-sky-600 text-white border border-sky-600'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
                }`}
              >
                {tag}
              </button>
            ))}
            {secondaryTags.length > 0 && (
              <button
                onClick={() => setShowSecondaryTags(!showSecondaryTags)}
                className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors bg-white text-gray-400 border border-gray-200 hover:border-gray-300 hover:text-gray-600"
              >
                {showSecondaryTags ? '▼' : '▶'} Secondary tags ({secondaryTags.length})
              </button>
            )}
          </div>
          {showSecondaryTags && secondaryTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-2 pl-28">
              {secondaryTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                    selectedTags.has(tag)
                      ? 'bg-sky-600 text-white border border-sky-600'
                      : 'bg-white text-gray-400 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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

      {!loading && !error && agents.length > 0 && filteredAgents.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <span className="text-4xl mb-4">🔍</span>
          <p className="text-sm">No agents match the selected tags</p>
          <button
            onClick={() => setSelectedTags(new Set())}
            className="text-xs mt-2 text-sky-600 hover:text-sky-800 font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {!loading && !error && filteredAgents.length > 0 && viewMode === 'list' && (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {filteredAgents.map(agent => (
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
              onChat={() => setChatTarget(agent)}
              onViewDocs={onNavigateToDoc ? () => onNavigateToDoc(`AGENTS/${agent.id}/IDENTITY.md`) : undefined}
              onRemoveTag={(tag) => handleRemoveTag(agent.id, tag)}
              onManageTags={() => setTagManageTarget(agent)}
              onRestart={() => handleRestart(agent.id)}
              onUnlinkWa={() => {
                fetch(`/api/agents/${agent.id}/whatsapp`, { method: 'DELETE' })
                  .then(() => fetchAgents())
                  .catch(() => {})
              }}
            />
          ))}
        </div>
      )}

      {!loading && !error && filteredAgents.length > 0 && viewMode === 'grid' && selectedTags.size === 0 && (
        <div className="space-y-6">
          {(() => {
            const shownAgentIds = new Set<string>()
            return Array.from(groupedAgents.entries()).map(([tag, tagAgents]) => {
              // Split agents by primary (first tag matches) vs secondary
              const primaryAgents = tagAgents.filter(a => a.tags[0] === tag && !shownAgentIds.has(a.id))
              const secondaryAgentsNotShown = tagAgents.filter(a => a.tags[0] !== tag && !shownAgentIds.has(a.id))
              const alreadyShownPrimary = tagAgents.filter(a => a.tags[0] === tag && shownAgentIds.has(a.id))
              const alreadyShownSecondary = tagAgents.filter(a => a.tags[0] !== tag && shownAgentIds.has(a.id))

              // Mark primary agents as shown
              primaryAgents.forEach(a => shownAgentIds.add(a.id))

              const isExpanded = expandedSecondaryAgents.has(tag)

              // If expanded, mark secondary agents as shown too
              if (isExpanded) {
                secondaryAgentsNotShown.forEach(a => shownAgentIds.add(a.id))
              }

              return (
                <div key={tag}>
                  <h2 className="text-sm font-semibold text-gray-700 mb-3 px-1">
                    {tag === '__untagged__' ? 'Untagged' : tag}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {primaryAgents.length} agent{primaryAgents.length !== 1 ? 's' : ''}
                    </span>
                  </h2>
                  <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {primaryAgents.map(agent => (
                      <AgentGridCard
                        key={`${tag}-${agent.id}`}
                        agent={agent}
                        selected={selectedAgent?.id === agent.id}
                        onClick={() => setSelectedAgent(agent)}
                        onChat={() => setChatTarget(agent)}
                        onDelete={() => setDeleteTarget(agent.id)}
                        onClone={() => { setCloneFromAgent(agent.id); setShowAddWizard(true); }}
                        onViewDocs={onNavigateToDoc ? () => onNavigateToDoc(`AGENTS/${agent.id}/IDENTITY.md`) : undefined}
                        onManageTags={() => setTagManageTarget(agent)}
                        onRestart={() => handleRestart(agent.id)}
                      />
                    ))}
                  </div>

                  {/* Secondary agents (collapsible) */}
                  {secondaryAgentsNotShown.length > 0 && (
                    <div className="mt-3 px-1">
                      <button
                        onClick={() => {
                          setExpandedSecondaryAgents(prev => {
                            const next = new Set(prev)
                            if (next.has(tag)) next.delete(tag)
                            else next.add(tag)
                            return next
                          })
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {isExpanded ? '▼' : '▶'} Additional agents ({secondaryAgentsNotShown.length})
                      </button>
                      {isExpanded && (
                        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 mt-2">
                          {secondaryAgentsNotShown.map(agent => (
                            <AgentGridCard
                              key={`${tag}-secondary-${agent.id}`}
                              agent={agent}
                              selected={selectedAgent?.id === agent.id}
                              onClick={() => setSelectedAgent(agent)}
                              onChat={() => setChatTarget(agent)}
                              onDelete={() => setDeleteTarget(agent.id)}
                              onClone={() => { setCloneFromAgent(agent.id); setShowAddWizard(true); }}
                              onViewDocs={onNavigateToDoc ? () => onNavigateToDoc(`AGENTS/${agent.id}/IDENTITY.md`) : undefined}
                              onManageTags={() => setTagManageTarget(agent)}
                              onRestart={() => handleRestart(agent.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Already shown agents */}
                  {(alreadyShownPrimary.length > 0 || alreadyShownSecondary.length > 0) && (
                    <div className="mt-3 px-1 text-xs text-gray-400">
                      Also in this group:{' '}
                      {[...alreadyShownPrimary, ...alreadyShownSecondary].map((agent, idx) => (
                        <span key={agent.id}>
                          {idx > 0 && ', '}
                          <button
                            onClick={() => setSelectedAgent(agent)}
                            className="text-sky-500 hover:text-sky-700 hover:underline"
                          >
                            {agent.name}
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          })()}
        </div>
      )}

      {!loading && !error && filteredAgents.length > 0 && viewMode === 'grid' && selectedTags.size > 0 && (
        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filteredAgents.map(agent => (
            <AgentGridCard
              key={agent.id}
              agent={agent}
              selected={selectedAgent?.id === agent.id}
              onClick={() => setSelectedAgent(agent)}
              onChat={() => setChatTarget(agent)}
              onDelete={() => setDeleteTarget(agent.id)}
              onClone={() => { setCloneFromAgent(agent.id); setShowAddWizard(true); }}
              onViewDocs={onNavigateToDoc ? () => onNavigateToDoc(`AGENTS/${agent.id}/IDENTITY.md`) : undefined}
              onManageTags={() => setTagManageTarget(agent)}
            />
          ))}
        </div>
      )}

      {selectedAgent && (
        <AgentDetailPanel
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
          onChat={() => setChatTarget(selectedAgent)}
        />
      )}

      {showAddWizard && (
        <AddAgentWizard
          onClose={() => { setShowAddWizard(false); setCloneFromAgent(null); }}
          onDone={() => fetchAgents()}
          defaultCloneFrom={cloneFromAgent || undefined}
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

      {chatTarget && (
        <ChatPanel
          agentId={chatTarget.id}
          agentName={chatTarget.name}
          onClose={() => setChatTarget(null)}
        />
      )}

      {tagToRemove && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={() => setTagToRemove(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Remove Primary Tag</h3>
            <p className="text-sm text-gray-600 mb-4">
              You're removing the primary tag <span className="font-semibold text-sky-600">"{tagToRemove.tag}"</span>.
              {(() => {
                const agent = agents.find(a => a.id === tagToRemove.agentId)
                const remainingTags = agent?.tags.filter(t => t !== tagToRemove.tag) || []
                if (remainingTags.length > 0) {
                  return ` The new primary tag will be "${remainingTags[0]}".`
                } else {
                  return ' This agent will become untagged.'
                }
              })()}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setTagToRemove(null)}
                className="px-4 py-2 text-sm rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  removeTag(tagToRemove.agentId, tagToRemove.tag)
                  setTagToRemove(null)
                }}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Remove Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {tagManageTarget && (
        <TagManageModal
          agent={tagManageTarget}
          onClose={() => setTagManageTarget(null)}
          onSave={async (tags) => {
            try {
              const res = await fetch(`/api/agents/${tagManageTarget.id}/tags`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tags }),
              })
              if (res.ok) {
                fetchAgents()
                setTagManageTarget(null)
              }
            } catch (err) {
              console.error('Failed to update tags:', err)
            }
          }}
        />
      )}
    </div>
  )
}

function TagManageModal({ agent, onClose, onSave }: { agent: Agent; onClose: () => void; onSave: (tags: string[]) => void }) {
  const [tags, setTags] = React.useState<string[]>(agent.tags)
  const [newTag, setNewTag] = React.useState('')
  const [draggedIndex, setDraggedIndex] = React.useState<number | null>(null)

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const newTags = [...tags]
    const [removed] = newTags.splice(draggedIndex, 1)
    newTags.splice(index, 0, removed)
    setTags(newTags)
    setDraggedIndex(index)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
  }

  const addTag = () => {
    if (!newTag.trim()) return
    if (tags.includes(newTag.trim())) return
    setTags([...tags, newTag.trim()])
    setNewTag('')
  }

  const removeTagAtIndex = (index: number) => {
    setTags(tags.filter((_, i) => i !== index))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Manage Tags</h3>
        <p className="text-xs text-gray-500 mb-4">Drag to reorder • First tag is primary</p>

        <div className="space-y-2 mb-4">
          {tags.length > 0 ? (
            tags.map((tag, index) => (
              <div
                key={`${tag}-${index}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 p-2 rounded border ${
                  index === 0 ? 'border-sky-400 bg-sky-50' : 'border-gray-200 bg-white'
                } cursor-move hover:shadow-sm transition-shadow`}
              >
                <span className="text-gray-400 text-xs">☰</span>
                <span className={`flex-1 text-sm ${index === 0 ? 'font-semibold text-sky-700' : 'text-gray-700'}`}>
                  {tag}
                  {index === 0 && <span className="ml-1.5 text-xs text-sky-500">(primary)</span>}
                </span>
                <button
                  onClick={() => removeTagAtIndex(index)}
                  className="text-gray-400 hover:text-red-500 transition-colors text-sm"
                >
                  ×
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No tags yet</p>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newTag}
            onChange={e => setNewTag(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTag()}
            placeholder="Add new tag..."
            className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:border-sky-400"
          />
          <button
            onClick={addTag}
            className="px-4 py-2 text-sm rounded bg-sky-600 text-white hover:bg-sky-700 transition-colors"
          >
            Add
          </button>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(tags)}
            className="px-4 py-2 text-sm rounded bg-sky-600 text-white hover:bg-sky-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function AgentCard({
  agent, selected, collapsed, onToggle, onClick, onDelete, onLinkWa, onSyncGroups, onUnlinkWa, onChat, onViewDocs, onRemoveTag, onManageTags, onRestart,
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
  onChat: () => void
  onViewDocs?: () => void
  onRemoveTag: (tag: string) => void
  onManageTags: () => void
  onRestart: () => void
}) {
  const [confirmUnlink, setConfirmUnlink] = React.useState(false)
  return (
    <div
      id={`agent-card-${agent.id}`}
      className={`bg-white rounded-xl border shadow-sm transition-all ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200 hover:shadow-md'
      }`}
    >
      {/* Card header — always visible */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[agent.status]}`} />
          <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${STATUS_TEXT[agent.status]}`}>
            {agent.status}
          </span>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {onViewDocs && (
            <button
              onClick={e => { e.stopPropagation(); onViewDocs() }}
              className="text-gray-300 hover:text-purple-500 transition-colors text-xs p-1 rounded hover:bg-purple-50"
              title="View agent documents"
            >
              📄
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); onChat() }}
            className="text-gray-300 hover:text-sky-500 transition-colors text-xs p-1 rounded hover:bg-sky-50"
            title="Chat with agent"
          >
            💬
          </button>
          <button
            onClick={e => { e.stopPropagation(); onRestart() }}
            className="text-gray-300 hover:text-amber-500 transition-colors text-xs p-1 rounded hover:bg-amber-50"
            title="Restart agent"
          >
            ↻
          </button>
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
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">Tags</span>
              <button
                onClick={e => { e.stopPropagation(); onManageTags(); }}
                className="text-sky-500 hover:text-sky-700 transition-colors text-sm leading-none"
                title="Manage tags"
              >
                +
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {agent.tags.length > 0 ? (
                agent.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-200 font-medium inline-flex items-center gap-1">
                    {tag}
                    <button
                      onClick={e => { e.stopPropagation(); onRemoveTag(tag); }}
                      className="text-sky-400 hover:text-sky-700 transition-colors leading-none"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-300">untagged</span>
              )}
            </div>
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

function AgentGridCard({ agent, selected, onClick, onChat, onDelete, onClone, onViewDocs, onManageTags, onRestart }: { agent: Agent; selected: boolean; onClick: () => void; onChat: () => void; onDelete: () => void; onClone: () => void; onViewDocs?: () => void; onManageTags: () => void; onRestart: () => void }) {
  const totalGroups = agent.communities.length + agent.groups.length
  return (
    <div
      id={`agent-card-${agent.id}`}
      onClick={onClick}
      className={`bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer relative ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[agent.status]}`} />
        <span className="font-semibold text-gray-900 text-sm truncate">{agent.name}</span>
        <div className="ml-auto flex items-center gap-0.5">
          {onViewDocs && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewDocs(); }}
              className="text-gray-300 hover:text-purple-500 transition-colors text-xs leading-none p-0.5 rounded hover:bg-purple-50"
              aria-label="View documents"
              title="View agent documents"
            >
              📄
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onChat(); }}
            className="text-sky-500 hover:text-sky-700 transition-colors text-sm leading-none"
            aria-label="Chat with agent"
            title="Chat with agent"
          >
            💬
          </button>
        </div>
      </div>
      <div className="text-xs font-mono text-gray-400 truncate mb-1">{agent.id}</div>
      <div className="flex items-center gap-2">
        <div className="text-xs text-gray-400">{timeAgo(agent.lastHeartbeat)}</div>
        {agent.whatsapp && (
          <div className="flex items-center gap-0.5" title={`WhatsApp: +${agent.whatsapp}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
            <span className="text-xs text-green-600">WA</span>
          </div>
        )}
      </div>
      {totalGroups > 0 && (
        <div className="mt-2 text-xs text-gray-300">{totalGroups} group{totalGroups !== 1 ? 's' : ''}</div>
      )}
      <div className="mt-1.5 flex items-start justify-between gap-1">
        <div className="flex flex-wrap gap-0.5 flex-1 min-w-0" onClick={(e) => { e.stopPropagation(); onManageTags(); }}>
          {agent.tags.length > 0 ? (
            <>
              {agent.tags.slice(0, 2).map(tag => (
                <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-200 cursor-pointer hover:bg-sky-100 transition-colors">
                  {tag}
                </span>
              ))}
              {agent.tags.length > 2 && (
                <span className="text-xs px-1.5 py-0.5 text-gray-300 cursor-pointer">+{agent.tags.length - 2}</span>
              )}
            </>
          ) : (
            <span className="text-xs px-1.5 py-0.5 text-gray-300 cursor-pointer hover:text-sky-500 transition-colors">+ add tags</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onClone(); }}
            className="text-gray-200 hover:text-purple-400 transition-colors text-xs leading-none p-0.5 rounded hover:bg-purple-50"
            aria-label="Clone agent"
            title="Clone agent"
          >
            📋
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRestart(); }}
            className="text-gray-200 hover:text-amber-400 transition-colors text-xs leading-none p-0.5 rounded hover:bg-amber-50"
            aria-label="Restart agent"
            title="Restart agent"
          >
            ↻
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="text-gray-200 hover:text-red-400 transition-colors text-xs p-0.5 rounded hover:bg-red-50"
            aria-label="Delete agent"
            title="Delete agent"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  )
}
