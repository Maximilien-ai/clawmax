import React, { useEffect, useState, useCallback, useMemo } from 'react'

interface GroupEntry {
  name: string
  description: string | null
  tags: string[]
  community: string | null
  channels: string[]
}

interface Agent {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
  communities: GroupEntry[]
  groups: GroupEntry[]
}

type ViewMode = 'list' | 'grid'
type ChannelType = 'community' | 'group'

interface Channel {
  name: string
  description: string | null
  tags: string[]
  type: ChannelType
  community: string | null
  channels: string[]
  members: Agent[]
}

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

function secAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

export default function Communication({ onNavigateToAgent }: { onNavigateToAgent?: (agentId: string) => void } = {}) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('communication-view-mode')
    return (saved === 'list' || saved === 'grid') ? saved : 'list'
  })
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())
  const [showSecondaryTags, setShowSecondaryTags] = useState(false)
  const [tagManageTarget, setTagManageTarget] = useState<Channel | null>(null)

  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => { setAgents(d.agents); setLoading(false); setLastRefreshed(Date.now()) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchAgents()
    const t = setInterval(fetchAgents, 30000)
    return () => clearInterval(t)
  }, [fetchAgents])

  useEffect(() => {
    const ticker = setInterval(() => setRefreshedLabel(secAgo(lastRefreshed)), 5000)
    setRefreshedLabel(secAgo(lastRefreshed))
    return () => clearInterval(ticker)
  }, [lastRefreshed])

  useEffect(() => {
    localStorage.setItem('communication-view-mode', viewMode)
  }, [viewMode])

  const handleRefresh = () => {
    if (cooling) return
    setCooling(true)
    fetchAgents()
    setTimeout(() => setCooling(false), 3000)
  }

  // Build channels list from agents
  const allChannels = useMemo(() => {
    const channelMap = new Map<string, Channel>()

    // Add communities
    for (const agent of agents) {
      for (const c of agent.communities) {
        const key = `community:${c.name}`
        if (!channelMap.has(key)) {
          channelMap.set(key, {
            name: c.name,
            description: c.description,
            tags: c.tags,
            type: 'community',
            community: null,
            channels: c.channels,
            members: []
          })
        }
        channelMap.get(key)!.members.push(agent)
      }
    }

    // Add groups
    for (const agent of agents) {
      for (const g of agent.groups) {
        const key = `group:${g.name}`
        if (!channelMap.has(key)) {
          channelMap.set(key, {
            name: g.name,
            description: g.description,
            tags: g.tags,
            channels: g.channels,
            type: 'group',
            community: g.community,
            members: []
          })
        }
        channelMap.get(key)!.members.push(agent)
      }
    }

    return Array.from(channelMap.values())
  }, [agents])

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>()
    const primaryTags = new Set<string>()

    allChannels.forEach(ch => {
      ch.tags.forEach(t => tags.add(t))
      if (ch.tags.length > 0) {
        primaryTags.add(ch.tags[0])
      }
    })

    return Array.from(tags).sort((a, b) => {
      const aIsPrimary = primaryTags.has(a)
      const bIsPrimary = primaryTags.has(b)
      if (aIsPrimary && !bIsPrimary) return -1
      if (!aIsPrimary && bIsPrimary) return 1
      return a.localeCompare(b)
    })
  }, [allChannels])

  const { primaryTags, secondaryTags } = useMemo(() => {
    const primary = new Set<string>()
    allChannels.forEach(ch => {
      if (ch.tags.length > 0) {
        primary.add(ch.tags[0])
      }
    })

    const pTags = allTags.filter(t => primary.has(t))
    const sTags = allTags.filter(t => !primary.has(t))

    return { primaryTags: pTags, secondaryTags: sTags }
  }, [allTags, allChannels])

  // Extract all unique agent IDs
  const allAgentIds = useMemo(() => {
    const ids = new Set<string>()
    allChannels.forEach(ch => ch.members.forEach(m => ids.add(m.id)))
    return Array.from(ids).sort()
  }, [allChannels])

  // Filter channels
  const filteredChannels = useMemo(() => {
    let filtered = allChannels

    // Filter by tags
    if (selectedTags.size > 0) {
      filtered = filtered.filter(ch => ch.tags.some(t => selectedTags.has(t)))
    }

    // Filter by agents
    if (selectedAgents.size > 0) {
      filtered = filtered.filter(ch => ch.members.some(m => selectedAgents.has(m.id)))
    }

    return filtered
  }, [allChannels, selectedTags, selectedAgents])

  const communities = useMemo(() => filteredChannels.filter(ch => ch.type === 'community'), [filteredChannels])
  const groups = useMemo(() => filteredChannels.filter(ch => ch.type === 'group'), [filteredChannels])

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev => {
      const next = new Set(prev)
      if (next.has(agentId)) next.delete(agentId)
      else next.add(agentId)
      return next
    })
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Communication</h1>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
            {filteredChannels.length} channel{filteredChannels.length !== 1 ? 's' : ''}
            {(selectedTags.size > 0 || selectedAgents.size > 0) && <span className="text-gray-300">({allChannels.length} total)</span>}
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
        </div>
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="mb-4">
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

      {/* Agent filters */}
      {allAgentIds.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Filter by members:</span>
            <button
              onClick={() => setSelectedAgents(new Set())}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                selectedAgents.size === 0
                  ? 'bg-emerald-600 text-white border border-emerald-600'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-emerald-300 hover:text-emerald-600'
              }`}
            >
              All agents
            </button>
            {allAgentIds.slice(0, 10).map(agentId => {
              const agent = agents.find(a => a.id === agentId)
              if (!agent) return null
              return (
                <button
                  key={agentId}
                  onClick={() => toggleAgent(agentId)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                    selectedAgents.has(agentId)
                      ? 'bg-emerald-600 text-white border border-emerald-600'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-emerald-300 hover:text-emerald-600'
                  }`}
                >
                  {agent.name}
                </button>
              )
            })}
            {allAgentIds.length > 10 && (
              <span className="text-xs text-gray-400">+{allAgentIds.length - 10} more</span>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          Loading...
        </div>
      )}

      {!loading && allChannels.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <span className="text-4xl mb-4">💬</span>
          <p className="text-sm">No groups configured</p>
          <p className="text-xs mt-1 text-gray-300">Add a GROUPS.md file to each agent's workspace directory</p>
        </div>
      )}

      {!loading && allChannels.length > 0 && filteredChannels.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <span className="text-4xl mb-4">🔍</span>
          <p className="text-sm">No channels match the selected filters</p>
          <button
            onClick={() => { setSelectedTags(new Set()); setSelectedAgents(new Set()); }}
            className="text-xs mt-2 text-sky-600 hover:text-sky-800 font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* List view */}
      {!loading && filteredChannels.length > 0 && viewMode === 'list' && (
        <div className="space-y-8">
          {communities.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Communities ({communities.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {communities.map(channel => (
                  <ChannelCard key={`community-${channel.name}`} channel={channel} selectedTags={selectedTags} selectedAgents={selectedAgents} onManageTags={() => setTagManageTarget(channel)} onNavigateToAgent={onNavigateToAgent} />
                ))}
              </div>
            </div>
          )}
          {groups.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Groups ({groups.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {groups.map(channel => (
                  <ChannelCard key={`group-${channel.name}`} channel={channel} selectedTags={selectedTags} selectedAgents={selectedAgents} onManageTags={() => setTagManageTarget(channel)} onNavigateToAgent={onNavigateToAgent} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grid view */}
      {!loading && filteredChannels.length > 0 && viewMode === 'grid' && (
        <div className="space-y-6">
          {communities.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 px-1">
                Communities
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {communities.length} channel{communities.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {communities.map(channel => (
                  <ChannelGridCard key={`community-${channel.name}`} channel={channel} selectedTags={selectedTags} selectedAgents={selectedAgents} onManageTags={() => setTagManageTarget(channel)} onNavigateToAgent={onNavigateToAgent} />
                ))}
              </div>
            </div>
          )}
          {groups.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 px-1">
                Groups
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {groups.length} channel{groups.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {groups.map(channel => (
                  <ChannelGridCard key={`group-${channel.name}`} channel={channel} selectedTags={selectedTags} selectedAgents={selectedAgents} onManageTags={() => setTagManageTarget(channel)} onNavigateToAgent={onNavigateToAgent} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tagManageTarget && (
        <TagManageModal
          channel={tagManageTarget}
          onClose={() => setTagManageTarget(null)}
          onSave={async (tags) => {
            try {
              const endpoint = tagManageTarget.type === 'community'
                ? `/api/communities/${encodeURIComponent(tagManageTarget.name)}/tags`
                : `/api/groups/${encodeURIComponent(tagManageTarget.name)}/tags`
              const res = await fetch(endpoint, {
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

function TagManageModal({ channel, onClose, onSave }: { channel: Channel; onClose: () => void; onSave: (tags: string[]) => void }) {
  const [tags, setTags] = React.useState<string[]>(channel.tags)
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
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Manage Tags</h3>
        <p className="text-sm text-gray-600 mb-1">{channel.type === 'community' ? '🏘' : '👥'} {channel.name}</p>
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

function ChannelCard({ channel, selectedTags, selectedAgents, onManageTags, onNavigateToAgent }: { channel: Channel; selectedTags: Set<string>; selectedAgents: Set<string>; onManageTags: () => void; onNavigateToAgent?: (agentId: string) => void }) {
  const typeStyle = channel.type === 'community'
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : 'bg-indigo-50 text-indigo-700 border-indigo-200'

  const channelEmojis: Record<string, string> = {
    whatsapp: '📱',
    slack: '💬',
    discord: '💠',
    email: '📧',
    teams: '💼'
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-gray-900 text-sm truncate">{channel.name}</h3>
            {channel.channels.length > 0 && (
              <div className="flex gap-1">
                {channel.channels.map(ch => (
                  <span key={ch} title={ch} className="text-sm">{channelEmojis[ch] || '💬'}</span>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {channel.members.length} agent{channel.members.length !== 1 ? 's' : ''}
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ml-2 ${typeStyle}`}>
          {channel.type}
        </span>
      </div>

      {channel.description && (
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">{channel.description}</p>
      )}

      {channel.community && (
        <div className="text-xs text-purple-600 mb-2">
          <span className="font-medium">→ {channel.community}</span>
        </div>
      )}

      <div className="mb-3">
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
        {channel.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {channel.tags.map(tag => {
              const isSelected = selectedTags.has(tag)
              return (
                <span
                  key={tag}
                  className={`text-xs px-1.5 py-0.5 rounded border ${
                    isSelected
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-400 font-semibold ring-2 ring-emerald-200'
                      : 'bg-sky-50 text-sky-600 border-sky-200'
                  }`}
                >
                  {tag}
                </span>
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-gray-300">No tags</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[...channel.members].sort((a, b) => a.name.localeCompare(b.name)).map(agent => {
          const isSelected = selectedAgents.has(agent.id)
          return (
            <button
              key={agent.id}
              onClick={(e) => {
                e.stopPropagation()
                onNavigateToAgent?.(agent.id)
              }}
              title={`${agent.name} (${agent.id}) - ${agent.status}\nClick to view agent details`}
              className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border font-medium transition-all ${
                isSelected
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-400 font-semibold ring-2 ring-emerald-200'
                  : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
              {agent.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ChannelGridCard({ channel, selectedTags, selectedAgents, onManageTags, onNavigateToAgent }: { channel: Channel; selectedTags: Set<string>; selectedAgents: Set<string>; onManageTags: () => void; onNavigateToAgent?: (agentId: string) => void }) {
  const typeColor = channel.type === 'community' ? 'border-purple-300 bg-purple-50' : 'border-indigo-300 bg-indigo-50'
  const onlineCount = channel.members.filter(m => m.status === 'online').length

  const channelEmojis: Record<string, string> = {
    whatsapp: '📱',
    slack: '💬',
    discord: '💠',
    email: '📧',
    teams: '💼'
  }

  return (
    <div className={`rounded-lg border-2 p-3 shadow-sm hover:shadow-md transition-all cursor-pointer ${typeColor}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-lg">{channel.type === 'community' ? '🏘' : '👥'}</span>
        <span className="font-semibold text-gray-900 text-sm truncate flex-1">{channel.name}</span>
        {channel.channels.length > 0 && (
          <div className="flex gap-0.5">
            {channel.channels.map(ch => (
              <span key={ch} title={ch} className="text-xs">{channelEmojis[ch] || '💬'}</span>
            ))}
          </div>
        )}
      </div>
      <div className="text-xs text-gray-500 mb-2">
        {channel.members.length} member{channel.members.length !== 1 ? 's' : ''}
        {onlineCount > 0 && (
          <span className="ml-1 text-green-600">· {onlineCount} online</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-0.5" onClick={(e) => { e.stopPropagation(); onManageTags(); }}>
        {channel.tags.length > 0 ? (
          <>
            {channel.tags.slice(0, 2).map(tag => {
              const isSelected = selectedTags.has(tag)
              return (
                <span
                  key={tag}
                  className={`text-xs px-1.5 py-0.5 rounded border cursor-pointer hover:bg-sky-100 transition-colors ${
                    isSelected
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-400 font-semibold'
                      : 'bg-white text-sky-600 border-sky-200'
                  }`}
                >
                  {tag}
                </span>
              )
            })}
            {channel.tags.length > 2 && (
              <span className="text-xs px-1.5 py-0.5 text-gray-400 cursor-pointer">+{channel.tags.length - 2}</span>
            )}
          </>
        ) : (
          <span className="text-xs px-1.5 py-0.5 text-gray-300 cursor-pointer hover:text-sky-500 transition-colors">+ add tags</span>
        )}
      </div>
    </div>
  )
}
