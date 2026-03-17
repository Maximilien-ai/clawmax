import React, { useEffect, useState, useCallback, useMemo } from 'react'
import GroupChatPanel from '../components/GroupChatPanel'
import { useToast } from '../components/Toast'

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

interface Workflow {
  id: string
  name: string
  description: string
  schedule: string
  enabled: boolean
  executionMode: 'automated' | 'managed'
  owner?: string
  created: string
  modified: string
  author: string
  participantCount: number
  targeting: {
    communities: string[]
    groups: string[]
    tags: string[]
    agents: string[]
  }
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

export default function Communication({ onNavigateToAgent, onNavigateToWorkflow, initialGroupName, onClearInitialGroupName, isActive }: { onNavigateToAgent?: (agentId: string) => void; onNavigateToWorkflow?: (workflowId: string) => void; initialGroupName?: string; onClearInitialGroupName?: () => void; isActive?: boolean } = {}) {
  const { showSuccess } = useToast()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<number>(Date.now())
  const [refreshedLabel, setRefreshedLabel] = useState<string>('just now')
  const [cooling, setCooling] = useState(false)
  const [communityWorkflows, setCommunityWorkflows] = useState<Map<string, Workflow[]>>(new Map())
  const [groupWorkflows, setGroupWorkflows] = useState<Map<string, Workflow[]>>(new Map())
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('communication-view-mode')
    return (saved === 'list' || saved === 'grid') ? saved : 'list'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set())
  const [showSecondaryTags, setShowSecondaryTags] = useState(false)
  const [tagManageTarget, setTagManageTarget] = useState<Channel | null>(null)
  const [memberManageTarget, setMemberManageTarget] = useState<Channel | null>(null)
  const [chatPanelChannel, setChatPanelChannel] = useState<Channel | null>(null)
  const [highlightedChannel, setHighlightedChannel] = useState<string | null>(null)

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

  // BUG: Scroll to group when initialGroupName is provided
  // Currently not working - React doesn't render channel cards until page is visible
  // and the hidden class prevents rendering. Need to investigate conditional rendering.
  useEffect(() => {
    if (initialGroupName && agents.length > 0 && !loading && isActive) {
      setTimeout(() => {
        const element = document.getElementById(`channel-card-${initialGroupName}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
          setHighlightedChannel(initialGroupName)
          setTimeout(() => setHighlightedChannel(null), 3000)
        }

        // Clear the initial group name so it can be reused
        if (onClearInitialGroupName) {
          setTimeout(() => onClearInitialGroupName(), 1000)
        }
      }, 300)
    }
  }, [initialGroupName, agents, loading, isActive, onClearInitialGroupName])

  const handleRefresh = () => {
    if (cooling) return
    setCooling(true)
    fetchAgents()
    setTimeout(() => setCooling(false), 3000)
  }

  const handleDeleteChannel = async (channel: Channel) => {
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}`
        : `/api/groups/${encodeURIComponent(channel.name)}`

      const response = await fetch(endpoint, { method: 'DELETE' })

      if (!response.ok) {
        throw new Error(`Failed to delete ${channel.type}`)
      }

      showSuccess(`${channel.type === 'community' ? 'Community' : 'Group'} "${channel.name}" deleted`)
      fetchAgents() // Refresh to show updated list
    } catch (err) {
      console.error(`Failed to delete ${channel.type}:`, err)
    }
  }

  // Build channels list from agents (exclude archived agents from channels)
  const allChannels = useMemo(() => {
    const channelMap = new Map<string, Channel>()
    const activeAgents = agents.filter(a => !a.archived)

    // Add communities
    for (const agent of activeAgents) {
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
    for (const agent of activeAgents) {
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

    // Filter by search query (supports wildcards with *)
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      // Convert wildcard pattern to regex
      // If query has *, use anchors for exact matching (e.g., "team*" -> /^team.*$/i)
      // Otherwise, use partial matching (e.g., "max" -> /max/i)
      const hasWildcard = query.includes('*')
      const regexPattern = query.replace(/\*/g, '.*')
      const regex = hasWildcard
        ? new RegExp(`^${regexPattern}$`, 'i')
        : new RegExp(regexPattern, 'i')

      filtered = filtered.filter(channel => {
        // Match against channel name, description, tags, or member names
        return (
          regex.test(channel.name.toLowerCase()) ||
          (channel.description && regex.test(channel.description.toLowerCase())) ||
          channel.tags.some(tag => regex.test(tag.toLowerCase())) ||
          channel.members.some(m =>
            regex.test(m.name.toLowerCase()) ||
            regex.test(m.id.toLowerCase())
          )
        )
      })
    }

    // Filter by tags
    if (selectedTags.size > 0) {
      filtered = filtered.filter(ch => ch.tags.some(t => selectedTags.has(t)))
    }

    // Filter by agents
    if (selectedAgents.size > 0) {
      filtered = filtered.filter(ch => ch.members.some(m => selectedAgents.has(m.id)))
    }

    return filtered
  }, [allChannels, selectedTags, selectedAgents, searchQuery])

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
    <>
    <div className="flex-1 flex h-full">
      <div
        className={`${chatPanelChannel && viewMode === 'list' ? 'flex-1' : 'flex-1'} overflow-y-auto p-6`}
        onClick={() => chatPanelChannel && viewMode === 'list' && setChatPanelChannel(null)}
      >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Communication</h1>
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
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'list' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              ☰
            </button>
            <button
              onClick={() => setViewMode('grid')}
              title="Grid view"
              className={`px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700 ${viewMode === 'grid' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
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

      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search communities/groups by name, tags, or members (supports * wildcard)"
            className="w-full px-4 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="mt-2 text-xs text-gray-500">
            Found {filteredChannels.length} channel{filteredChannels.length !== 1 ? 's' : ''} ({communities.length} communit{communities.length !== 1 ? 'ies' : 'y'}, {groups.length} group{groups.length !== 1 ? 's' : ''})
          </div>
        )}
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
                  : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
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
                    : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
                }`}
              >
                {tag}
              </button>
            ))}
            {secondaryTags.length > 0 && (
              <button
                onClick={() => setShowSecondaryTags(!showSecondaryTags)}
                className="text-xs px-2.5 py-1 rounded-md font-medium transition-colors bg-white dark:bg-gray-800 text-gray-400 border border-gray-200 hover:border-gray-300 hover:text-gray-600 dark:border-gray-700 dark:border-gray-600"
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
                      : 'bg-white dark:bg-gray-800 text-gray-400 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
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
                  : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-emerald-300 hover:text-emerald-600'
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
                      : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-emerald-300 hover:text-emerald-600'
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
        <div className={`space-y-8 ${chatPanelChannel ? 'flex-1 overflow-y-auto pr-6' : ''}`}>
          {communities.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Communities ({communities.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                {communities.map(channel => (
                  <ChannelCard
                    key={`community-${channel.name}`}
                    channel={channel}
                    selectedTags={selectedTags}
                    selectedAgents={selectedAgents}
                    onManageTags={() => setTagManageTarget(channel)}
                    onManageMembers={() => setMemberManageTarget(channel)}
                    onNavigateToAgent={onNavigateToAgent}
                    onNavigateToWorkflow={onNavigateToWorkflow}
                    onOpenChat={() => setChatPanelChannel(channel)}
                    isHighlighted={highlightedChannel === channel.name}
                    communityWorkflows={communityWorkflows}
                    groupWorkflows={groupWorkflows}
                    setCommunityWorkflows={setCommunityWorkflows}
                    setGroupWorkflows={setGroupWorkflows}
                    onDelete={() => handleDeleteChannel(channel)}
                  />
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
                  <ChannelCard
                    key={`group-${channel.name}`}
                    channel={channel}
                    selectedTags={selectedTags}
                    selectedAgents={selectedAgents}
                    onManageTags={() => setTagManageTarget(channel)}
                    onManageMembers={() => setMemberManageTarget(channel)}
                    onNavigateToAgent={onNavigateToAgent}
                    onNavigateToWorkflow={onNavigateToWorkflow}
                    onOpenChat={() => setChatPanelChannel(channel)}
                    isHighlighted={highlightedChannel === channel.name}
                    communityWorkflows={communityWorkflows}
                    groupWorkflows={groupWorkflows}
                    setCommunityWorkflows={setCommunityWorkflows}
                    setGroupWorkflows={setGroupWorkflows}
                    onDelete={() => handleDeleteChannel(channel)}
                  />
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
              <h2 className="text-sm font-semibold text-gray-700 mb-3 px-1 dark:text-gray-300">
                Communities
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {communities.length} channel{communities.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {communities.map(channel => (
                  <ChannelGridCard key={`community-${channel.name}`} channel={channel} selectedTags={selectedTags} selectedAgents={selectedAgents} onManageTags={() => setTagManageTarget(channel)} onNavigateToAgent={onNavigateToAgent} onOpenChat={() => setChatPanelChannel(channel)} />
                ))}
              </div>
            </div>
          )}
          {groups.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3 px-1 dark:text-gray-300">
                Groups
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {groups.length} channel{groups.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {groups.map(channel => (
                  <ChannelGridCard key={`group-${channel.name}`} channel={channel} selectedTags={selectedTags} selectedAgents={selectedAgents} onManageTags={() => setTagManageTarget(channel)} onNavigateToAgent={onNavigateToAgent} onOpenChat={() => setChatPanelChannel(channel)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Group Chat Panel - Right Pane (List View Only) */}
      {chatPanelChannel && viewMode === 'list' && (
        <div className="w-[480px] h-full flex-shrink-0 border-l border-gray-200 dark:border-gray-700">
          <GroupChatPanel
            channel={chatPanelChannel}
            onClose={() => setChatPanelChannel(null)}
            mode="pane"
            onMessageSent={(mentionedIds, hasAll) => {
              // Check which mentioned agents were offline
              const offlineAgents = agents.filter(a => mentionedIds.includes(a.id) && a.status === 'offline')
              // Wait for agents to process message, then refresh and show toast
              setTimeout(() => {
                fetch('/api/agents')
                  .then(r => r.json())
                  .then(data => {
                    setAgents(data.agents || [])
                    // Notify other components (like Agents page) to refresh
                    window.dispatchEvent(new CustomEvent('agents-updated'))
                  })
                  .catch(() => {})
                // Show toast for offline agents that were mentioned
                offlineAgents.forEach(a => showSuccess(`${a.name} is now active`))
              }, 2000)
            }}
          />
        </div>
      )}
    </div>

    {/* Group Chat Panel - Overlay (Grid View Only) */}
    {chatPanelChannel && viewMode === 'grid' && (
      <GroupChatPanel
        channel={chatPanelChannel}
        onClose={() => setChatPanelChannel(null)}
        mode="overlay"
        onMessageSent={(mentionedIds, hasAll) => {
          // Check which mentioned agents were offline
          const offlineAgents = agents.filter(a => mentionedIds.includes(a.id) && a.status === 'offline')
          // Wait for agents to process message, then refresh and show toast
          setTimeout(() => {
            fetch('/api/agents')
              .then(r => r.json())
              .then(data => {
                setAgents(data.agents || [])
                // Notify other components (like Agents page) to refresh
                window.dispatchEvent(new CustomEvent('agents-updated'))
              })
              .catch(() => {})
            // Show toast for offline agents that were mentioned
            offlineAgents.forEach(a => showSuccess(`${a.name} is now active`))
          }, 2000)
        }}
      />
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

    {memberManageTarget && (
      <ManageMembersModal
        channel={memberManageTarget}
        allAgents={agents}
        onClose={() => setMemberManageTarget(null)}
        onSave={async (members) => {
          try {
            console.log('Communication: Saving members to', memberManageTarget.name, members)
            const endpoint = memberManageTarget.type === 'community'
              ? `/api/communities/${encodeURIComponent(memberManageTarget.name)}/members`
              : `/api/groups/${encodeURIComponent(memberManageTarget.name)}/members`
            console.log('Communication: API endpoint', endpoint)
            const res = await fetch(endpoint, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ members }),
            })
            console.log('Communication: API response status', res.status)
            if (res.ok) {
              console.log('Communication: Successfully saved, refreshing agents')
              fetchAgents()
              setMemberManageTarget(null)
            } else {
              const error = await res.text()
              console.error('Communication: Failed to save members', res.status, error)
            }
          } catch (err) {
            console.error('Failed to update members:', err)
          }
        }}
      />
    )}
  </>
  )
}

function ManageMembersModal({ channel, allAgents, onClose, onSave }: { channel: Channel; allAgents: Agent[]; onClose: () => void; onSave: (members: string[]) => void }) {
  const currentMemberIds = new Set(channel.members.map(m => m.id))
  const [selectedMembers, setSelectedMembers] = React.useState<Set<string>>(currentMemberIds)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filter, setFilter] = React.useState<'all' | 'in_group' | 'not_in_group'>('all')

  // Filter agents based on search and filter toggle
  const filteredAgents = React.useMemo(() => {
    let filtered = allAgents

    // Apply membership filter
    if (filter === 'in_group') {
      filtered = filtered.filter(a => currentMemberIds.has(a.id))
    } else if (filter === 'not_in_group') {
      filtered = filtered.filter(a => !currentMemberIds.has(a.id))
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(a =>
        a.name.toLowerCase().includes(query) ||
        a.id.toLowerCase().includes(query)
      )
    }

    // Remove duplicates - keep only first occurrence of each agent ID
    const seen = new Set<string>()
    filtered = filtered.filter(a => {
      if (seen.has(a.id)) return false
      seen.add(a.id)
      return true
    })

    return filtered.sort((a, b) => a.name.localeCompare(b.name))
  }, [allAgents, currentMemberIds, filter, searchQuery])

  const toggleMember = (agentId: string) => {
    setSelectedMembers(prev => {
      const next = new Set(prev)
      if (next.has(agentId)) {
        console.log('ManageMembersModal: Removing agent', agentId)
        next.delete(agentId)
      } else {
        console.log('ManageMembersModal: Adding agent', agentId)
        next.add(agentId)
      }
      console.log('ManageMembersModal: Updated members', Array.from(next))
      return next
    })
  }

  const handleSave = () => {
    console.log('ManageMembersModal: Saving members', Array.from(selectedMembers))
    onSave(Array.from(selectedMembers))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-1 dark:text-gray-100">Manage Members</h3>
        <p className="text-sm text-gray-600 mb-1">{channel.type === 'community' ? '🏘' : '👥'} {channel.name}</p>
        <p className="text-xs text-gray-500 mb-4">
          {selectedMembers.size} member{selectedMembers.size !== 1 ? 's' : ''} selected
        </p>

        {/* Search bar */}
        <div className="mb-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents by name or ID..."
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-sky-400 text-sm"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-gray-400 font-medium">Filter:</span>
          <button
            onClick={() => setFilter('all')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              filter === 'all'
                ? 'bg-sky-600 text-white border border-sky-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('in_group')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              filter === 'in_group'
                ? 'bg-emerald-600 text-white border border-emerald-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-emerald-300 hover:text-emerald-600'
            }`}
          >
            In Group ({currentMemberIds.size})
          </button>
          <button
            onClick={() => setFilter('not_in_group')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
              filter === 'not_in_group'
                ? 'bg-orange-600 text-white border border-orange-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-orange-300 hover:text-orange-600'
            }`}
          >
            Not in Group ({allAgents.length - currentMemberIds.size})
          </button>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto border border-gray-200 rounded p-3 mb-4 dark:border-gray-700">
          {filteredAgents.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">No agents found</p>
          )}
          <div className="space-y-1">
            {filteredAgents.map(agent => {
              const isSelected = selectedMembers.has(agent.id)
              const wasOriginallyIn = currentMemberIds.has(agent.id)
              return (
                <div
                  key={agent.id}
                  onClick={() => toggleMember(agent.id)}
                  className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-sky-50 border border-sky-200 hover:bg-sky-100'
                      : 'bg-white dark:bg-gray-800 border border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{agent.name}</span>
                      <span className="text-xs text-gray-400">({agent.id})</span>
                    </div>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${STATUS_DOT[agent.status]}`} />
                </div>
              )
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded bg-sky-600 text-white hover:bg-sky-700 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-1 dark:text-gray-100">Manage Tags</h3>
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
                  index === 0 ? 'border-sky-400 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/30' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                } cursor-move hover:shadow-sm transition-shadow`}
              >
                <span className="text-gray-400 text-xs">☰</span>
                <span className={`flex-1 text-sm ${index === 0 ? 'font-semibold text-sky-700 dark:text-sky-400' : 'text-gray-700 dark:text-gray-300'}`}>
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
            className="flex-1 text-sm px-3 py-2 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-sky-400 dark:focus:border-sky-600"
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
            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
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

interface Message {
  id: string
  from: string
  content: string
  timestamp: number
  mentions: string[]
}

function ChannelCard({ channel, selectedTags, selectedAgents, onManageTags, onManageMembers, onNavigateToAgent, onNavigateToWorkflow, onOpenChat, isHighlighted, communityWorkflows, groupWorkflows, setCommunityWorkflows, setGroupWorkflows, onDelete }: { channel: Channel; selectedTags: Set<string>; selectedAgents: Set<string>; onManageTags: () => void; onManageMembers: () => void; onNavigateToAgent?: (agentId: string) => void; onNavigateToWorkflow?: (workflowId: string) => void; onOpenChat?: () => void; isHighlighted?: boolean; communityWorkflows: Map<string, Workflow[]>; groupWorkflows: Map<string, Workflow[]>; setCommunityWorkflows: React.Dispatch<React.SetStateAction<Map<string, Workflow[]>>>; setGroupWorkflows: React.Dispatch<React.SetStateAction<Map<string, Workflow[]>>>; onDelete?: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [loadingWorkflows, setLoadingWorkflows] = useState(false)
  const [messageText, setMessageText] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [sending, setSending] = useState(false)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionPosition, setMentionPosition] = useState(0)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [typingAgents, setTypingAgents] = useState<Set<string>>(new Set())
  const textareaRef = useState<HTMLTextAreaElement | null>(null)[0]
  const [showMenu, setShowMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const typeStyle = channel.type === 'community'
    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-700'
    : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-700'

  const channelEmojis: Record<string, string> = {
    whatsapp: '📱',
    slack: '💬',
    discord: '💠',
    email: '📧',
    teams: '💼'
  }

  const fetchWorkflows = useCallback(async () => {
    const workflowMap = channel.type === 'community' ? communityWorkflows : groupWorkflows
    const setWorkflowMap = channel.type === 'community' ? setCommunityWorkflows : setGroupWorkflows

    // Check if already fetched
    if (workflowMap.has(channel.name)) {
      return
    }

    setLoadingWorkflows(true)
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/workflows`
        : `/api/groups/${encodeURIComponent(channel.name)}/workflows`
      const res = await fetch(endpoint)
      if (res.ok) {
        const data = await res.json()
        setWorkflowMap(prev => new Map(prev).set(channel.name, data.workflows || []))
      }
    } catch (err) {
      console.error('Failed to fetch workflows:', err)
    } finally {
      setLoadingWorkflows(false)
    }
  }, [channel.type, channel.name, communityWorkflows, groupWorkflows, setCommunityWorkflows, setGroupWorkflows])

  const fetchMessages = useCallback(async () => {
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/messages`
        : `/api/groups/${encodeURIComponent(channel.name)}/messages`
      const res = await fetch(endpoint)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    }
  }, [channel.type, channel.name])

  // Fetch workflows on mount (always)
  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  // Fetch messages when expanded
  useEffect(() => {
    if (expanded) {
      fetchMessages()
    }
  }, [expanded, fetchMessages])

  const handleSendMessage = async () => {
    if (!messageText.trim() || sending) return

    // Extract @mentions
    const mentionRegex = /@(\w+)/g
    const matches = Array.from(messageText.matchAll(mentionRegex))
    const mentionedNames = matches.map(m => m[1])

    // Check for @all
    const hasAll = mentionedNames.some(name => name.toLowerCase() === 'all')

    // Find agents that match the mentions (or all if @all is used)
    const mentionedAgents = hasAll
      ? channel.members
      : channel.members.filter(agent =>
          mentionedNames.some(name =>
            agent.name.toLowerCase().includes(name.toLowerCase()) ||
            agent.id.toLowerCase() === name.toLowerCase()
          )
        )

    setSending(true)
    try {
      const endpoint = channel.type === 'community'
        ? `/api/communities/${encodeURIComponent(channel.name)}/messages`
        : `/api/groups/${encodeURIComponent(channel.name)}/messages`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: messageText,
          mentions: mentionedAgents.map(a => a.id)
        })
      })

      if (res.ok) {
        setMessageText('')
        setShowMentions(false)
        fetchMessages()
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }

  // Handle @mention autocomplete
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setMessageText(text)

    // Check for @ mentions
    const cursorPos = e.target.selectionStart
    const textBeforeCursor = text.substring(0, cursorPos)
    const lastAtIndex = textBeforeCursor.lastIndexOf('@')

    if (lastAtIndex !== -1 && lastAtIndex === cursorPos - 1) {
      // Just typed @
      setShowMentions(true)
      setMentionQuery('')
      setMentionPosition(lastAtIndex)
      setSelectedMentionIndex(0)
    } else if (lastAtIndex !== -1) {
      // Check if we're in a mention
      const afterAt = textBeforeCursor.substring(lastAtIndex + 1)
      if (/^\w*$/.test(afterAt)) {
        setShowMentions(true)
        setMentionQuery(afterAt)
        setMentionPosition(lastAtIndex)
        setSelectedMentionIndex(0)
      } else {
        setShowMentions(false)
      }
    } else {
      setShowMentions(false)
    }
  }

  const insertMention = (agentName: string) => {
    const before = messageText.substring(0, mentionPosition)
    const after = messageText.substring(mentionPosition + mentionQuery.length + 1)
    setMessageText(`${before}@${agentName} ${after}`)
    setShowMentions(false)
  }

  // Build mention list: @all first, then matching agents
  const filteredMentionAgents = showMentions
    ? (() => {
        const agents = channel.members.filter(agent =>
          agent.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
          agent.id.toLowerCase().includes(mentionQuery.toLowerCase())
        )

        // Add @all option if it matches the query
        const mentions: Array<{ id: string; name: string; status: string; isAll?: boolean }> = []
        if ('all'.includes(mentionQuery.toLowerCase())) {
          mentions.push({ id: 'all', name: 'all', status: 'online', isAll: true })
        }

        return [...mentions, ...agents]
      })()
    : []

  return (
    <div
      id={`channel-card-${channel.name}`}
      className={`bg-white dark:bg-gray-800 rounded-xl border p-4 shadow-sm hover:shadow-md transition-all ${
        isHighlighted
          ? 'border-blue-500 border-2 ring-4 ring-blue-200 shadow-lg'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-gray-900 text-sm truncate dark:text-gray-100">{channel.name}</h3>
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
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${typeStyle}`}>
            {channel.type}
          </span>
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              title="Actions"
            >
              ⋮
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-lg z-10 min-w-[120px] dark:border-gray-700">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowMenu(false)
                    setShowDeleteConfirm(true)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors rounded-lg"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
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
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-400 dark:border-emerald-700 font-semibold ring-2 ring-emerald-200'
                      : 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-700'
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

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Members</span>
          <button
            onClick={e => { e.stopPropagation(); onManageMembers(); }}
            className="text-sky-500 hover:text-sky-700 transition-colors text-sm leading-none"
            title="Manage members"
          >
            ⚙
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[...channel.members]
            .filter((agent, index, self) =>
              // Remove duplicates - keep only first occurrence of each agent ID
              index === self.findIndex(a => a.id === agent.id)
            )
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(agent => {
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
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-400 dark:border-emerald-700 font-semibold ring-2 ring-emerald-200 dark:ring-emerald-900/50'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-sky-400 dark:hover:border-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/30 hover:text-sky-700 dark:hover:text-sky-400'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                {agent.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Workflows Section - Always show */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">Workflows</span>
        </div>
        {loadingWorkflows ? (
          <div className="text-xs text-gray-400">Loading workflows...</div>
        ) : (
          (() => {
            const workflowMap = channel.type === 'community' ? communityWorkflows : groupWorkflows
            const workflows = workflowMap.get(channel.name) || []
            const themeColors = channel.type === 'community'
              ? 'border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-300 text-purple-700'
              : 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 text-indigo-700'

            if (workflows.length === 0) {
              return <span className="text-xs text-gray-300">No workflows</span>
            }

            return (
              <div className="flex flex-wrap gap-1.5">
                {workflows.sort((a, b) => a.name.localeCompare(b.name)).map(workflow => (
                  <button
                    key={workflow.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onNavigateToWorkflow?.(workflow.id)
                    }}
                    title={`Go to ${workflow.name} in Workflows page`}
                    className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border font-medium transition-all cursor-pointer ${themeColors}`}
                  >
                    {workflow.name}
                  </button>
                ))}
              </div>
            )
          })()
        )}
      </div>

      {/* Messaging Section */}
      <div className="border-t border-gray-100 pt-3 -mx-4 px-4 -mb-4 pb-4">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenChat?.()
            }}
            className="flex-1 flex items-center justify-center text-xs font-medium text-gray-600 hover:text-sky-600 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              💬 Chat
              <span>→</span>
            </span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="text-xs font-medium text-gray-600 hover:text-sky-600 transition-colors px-2"
            title={expanded ? "Collapse details" : "Show workflows"}
          >
            {expanded ? '▼' : '▶'}
          </button>
        </div>

        {false && (
          <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
            {/* Message History */}
            {messages.length > 0 || typingAgents.size > 0 ? (
              <div className="bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto space-y-2 dark:bg-gray-900">
                {messages.map((msg) => (
                  <div key={msg.id} className="bg-white dark:bg-gray-800 rounded p-2 shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{msg.from}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap dark:text-gray-200">{msg.content}</p>
                  </div>
                ))}
                {/* Typing indicators */}
                {Array.from(typingAgents).map((agentId) => {
                  const agent = channel.members.find(a => a.id === agentId)
                  return agent ? (
                    <div key={`typing-${agentId}`} className="bg-white dark:bg-gray-800 rounded p-2 shadow-sm border-l-2 border-sky-400">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{agent.name}</span>
                        <span className="flex gap-0.5">
                          <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </div>
                    </div>
                  ) : null
                })}
              </div>
            ) : (
              <div className="bg-gray-50 rounded-lg p-4 text-center dark:bg-gray-900">
                <p className="text-xs text-gray-400">No messages yet</p>
              </div>
            )}

            {/* Message Input */}
            <div className="relative">
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = 'auto'
                    el.style.height = el.scrollHeight + 'px'
                  }
                }}
                value={messageText}
                onChange={handleTextChange}
                onKeyDown={(e) => {
                  if (showMentions && filteredMentionAgents.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSelectedMentionIndex((prev) =>
                        prev < filteredMentionAgents.length - 1 ? prev + 1 : prev
                      )
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault()
                      setSelectedMentionIndex((prev) => prev > 0 ? prev - 1 : 0)
                    } else if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      insertMention(filteredMentionAgents[selectedMentionIndex].name)
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setShowMentions(false)
                    }
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder="Type a message... use @name or @all to mention agents"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent dark:border-gray-700"
                rows={2}
                disabled={sending}
              />

              {/* @Mention Dropdown */}
              {showMentions && filteredMentionAgents.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-full bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto z-10 dark:border-gray-700">
                  {filteredMentionAgents
                    .filter((agent, index, self) =>
                      // Remove duplicates
                      index === self.findIndex(a => a.id === agent.id)
                    )
                    .map((agent, index) => (
                    <button
                      key={agent.id}
                      onClick={() => insertMention(agent.name)}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                        index === selectedMentionIndex
                          ? 'bg-sky-100 text-sky-900'
                          : 'hover:bg-sky-50'
                      } ${
                        'isAll' in agent && agent.isAll
                          ? 'font-semibold border-b border-gray-100'
                          : ''
                      }`}
                    >
                      {!('isAll' in agent && agent.isAll) && (
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                      )}
                      <span className="font-medium">
                        {'isAll' in agent && agent.isAll ? '👥 @all' : agent.name}
                      </span>
                      {!('isAll' in agent && agent.isAll) && (
                        <span className="text-xs text-gray-400">({agent.id})</span>
                      )}
                      {('isAll' in agent && agent.isAll) && (
                        <span className="text-xs text-gray-500 ml-auto">
                          {channel.members.length} agents
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">
                  {messageText.length > 0 && `${messageText.length} chars`}
                </span>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageText.trim() || sending}
                  className="px-3 py-1.5 text-sm rounded bg-sky-600 text-white hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ChannelGridCard({ channel, selectedTags, selectedAgents, onManageTags, onNavigateToAgent, onOpenChat }: { channel: Channel; selectedTags: Set<string>; selectedAgents: Set<string>; onManageTags: () => void; onNavigateToAgent?: (agentId: string) => void; onOpenChat?: () => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const typeColor = channel.type === 'community'
    ? 'border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/30'
    : 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30'
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
        <span className="font-semibold text-gray-900 text-sm truncate flex-1 dark:text-gray-100">{channel.name}</span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpenChat?.()
          }}
          className="shrink-0 text-sky-600 hover:text-sky-700 hover:bg-white dark:bg-gray-800/50 rounded p-1 transition-colors"
          title="Open chat"
        >
          💬
        </button>
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
                  className={`text-xs px-1.5 py-0.5 rounded border cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors ${
                    isSelected
                      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-400 dark:border-emerald-700 font-semibold'
                      : 'bg-white dark:bg-gray-800 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-700'
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

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 dark:text-gray-100">Delete {channel.type === 'community' ? 'Community' : 'Group'}?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <span className="font-semibold">{channel.name}</span>?
              {channel.members.length > 0 && (
                <span className="block mt-2 text-red-600">
                  ⚠️ This {channel.type} has {channel.members.length} member{channel.members.length !== 1 ? 's' : ''}. They will be removed from this {channel.type}.
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 mb-4">
              This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteConfirm(false)
                }}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteConfirm(false)
                  onDelete?.()
                }}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
