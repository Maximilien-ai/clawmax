import React, { useEffect, useState, useCallback, useMemo } from 'react'
import SaveAsOrgTemplateModal from '../components/SaveAsOrgTemplateModal'
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog'
import { PageLoading } from '../components/LoadingSpinner'

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

interface Community {
  name: string
  description: string | null
  tags: string[]
  channels: string[]
  members: Agent[]
}

interface Group {
  name: string
  description: string | null
  tags: string[]
  channels: string[]
  community: string | null
  members: Agent[]
}

const STATUS_DOT: Record<string, string> = {
  online: 'bg-green-400',
  offline: 'bg-yellow-400',
  unknown: 'bg-gray-300',
}

export default function Organizations({ onNavigateToAgent }: { onNavigateToAgent?: (agentId: string) => void }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [workspaceCommunities, setWorkspaceCommunities] = useState<any[]>([])
  const [workspaceGroups, setWorkspaceGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCommunities, setExpandedCommunities] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [communitiesSectionCollapsed, setCommunitiesSectionCollapsed] = useState(false)
  const [groupsSectionCollapsed, setGroupsSectionCollapsed] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [orgName, setOrgName] = useState('Maximilien.ai')
  const [orgDescription, setOrgDescription] = useState('First ClawMax organization')
  const [editingOrg, setEditingOrg] = useState(false)
  const [showCreateCommunity, setShowCreateCommunity] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [newCommunityName, setNewCommunityName] = useState('')
  const [newCommunityDesc, setNewCommunityDesc] = useState('')
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newGroupCommunity, setNewGroupCommunity] = useState('')
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{
    type: 'community' | 'group'
    name: string
    consequences: string[]
  } | null>(null)
  const [renameCommunityTarget, setRenameCommunityTarget] = useState<Community | null>(null)
  const [renameGroupTarget, setRenameGroupTarget] = useState<Group | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, communitiesRes, groupsRes] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/communities'),
        fetch('/api/groups')
      ])

      const agentsData = await agentsRes.json()
      const communitiesData = await communitiesRes.json()
      const groupsData = await groupsRes.json()

      setAgents(agentsData.agents)
      setWorkspaceCommunities(communitiesData.communities || [])
      setWorkspaceGroups(groupsData.groups || [])
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch data:', err)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Build communities and groups from workspace + agents
  const { communities, groups } = useMemo(() => {
    const communityMap = new Map<string, Community>()
    const groupMap = new Map<string, Group>()

    // First, add workspace-level communities (from ORG/COMMUNITIES.md)
    for (const c of workspaceCommunities) {
      if (!communityMap.has(c.name)) {
        communityMap.set(c.name, {
          name: c.name,
          description: c.description,
          tags: c.tags || [],
          channels: c.channels || [],
          members: []
        })
      }
    }

    // First, add workspace-level groups (from ORG/GROUPS.md)
    for (const g of workspaceGroups) {
      if (!groupMap.has(g.name)) {
        groupMap.set(g.name, {
          name: g.name,
          description: g.description,
          tags: g.tags || [],
          channels: g.channels || [],
          community: g.community,
          members: []
        })
      }
    }

    // Extract communities
    for (const agent of agents) {
      for (const c of agent.communities) {
        if (!communityMap.has(c.name)) {
          communityMap.set(c.name, {
            name: c.name,
            description: c.description,
            tags: c.tags,
            channels: c.channels,
            members: []
          })
        }
        communityMap.get(c.name)!.members.push(agent)
      }
    }

    // Extract groups
    for (const agent of agents) {
      for (const g of agent.groups) {
        if (!groupMap.has(g.name)) {
          groupMap.set(g.name, {
            name: g.name,
            description: g.description,
            tags: g.tags,
            channels: g.channels,
            community: g.community,
            members: []
          })
        }
        groupMap.get(g.name)!.members.push(agent)
      }
    }

    return {
      communities: Array.from(communityMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      groups: Array.from(groupMap.values()).sort((a, b) => a.name.localeCompare(b.name))
    }
  }, [agents, workspaceCommunities, workspaceGroups])

  // Filter communities, groups, and check if agents match search query
  const filteredCommunities = useMemo(() => {
    if (!searchQuery.trim()) return communities
    const query = searchQuery.toLowerCase()
    return communities.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.description?.toLowerCase().includes(query) ||
      c.tags.some(t => t.toLowerCase().includes(query)) ||
      c.members.some(m => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
    )
  }, [communities, searchQuery])

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups
    const query = searchQuery.toLowerCase()
    return groups.filter(g =>
      g.name.toLowerCase().includes(query) ||
      g.description?.toLowerCase().includes(query) ||
      g.tags.some(t => t.toLowerCase().includes(query)) ||
      g.community?.toLowerCase().includes(query) ||
      g.members.some(m => m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query))
    )
  }, [groups, searchQuery])

  // Filter agents based on search query
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents
    const query = searchQuery.toLowerCase()
    return agents.filter(a =>
      a.name.toLowerCase().includes(query) ||
      a.id.toLowerCase().includes(query)
    )
  }, [agents, searchQuery])

  // Count total matching agents across all filtered communities and groups
  const matchingAgentsCount = useMemo(() => {
    if (!searchQuery.trim()) return 0
    const query = searchQuery.toLowerCase()
    const agentSet = new Set<string>()

    filteredCommunities.forEach(c => {
      c.members.forEach(m => {
        if (m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) {
          agentSet.add(m.id)
        }
      })
    })

    filteredGroups.forEach(g => {
      g.members.forEach(m => {
        if (m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)) {
          agentSet.add(m.id)
        }
      })
    })

    return agentSet.size
  }, [filteredCommunities, filteredGroups, searchQuery])

  const toggleCommunity = (name: string) => {
    setExpandedCommunities(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const expandAll = () => {
    setExpandedCommunities(new Set(communities.map(c => c.name)))
    setExpandedGroups(new Set(groups.map(g => g.name)))
  }

  const collapseAll = () => {
    setExpandedCommunities(new Set())
    setExpandedGroups(new Set())
  }

  const handleCreateCommunity = async () => {
    if (!newCommunityName.trim()) return

    // Check for duplicate names
    if (communities.some(c => c.name.toLowerCase() === newCommunityName.trim().toLowerCase())) {
      showToast(`Community "${newCommunityName}" already exists`, 'error')
      return
    }

    try {
      const response = await fetch('/api/communities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCommunityName.trim(),
          description: newCommunityDesc.trim() || undefined,
          channels: ['whatsapp']
        })
      })

      if (response.ok) {
        setShowCreateCommunity(false)
        setNewCommunityName('')
        setNewCommunityDesc('')
        showToast(`Community "${newCommunityName}" created successfully`, 'success')
        // Refresh data without page reload
        fetchData()
      } else {
        showToast('Failed to create community', 'error')
      }
    } catch (err) {
      console.error('Error creating community:', err)
      showToast('Failed to create community', 'error')
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return

    // Check for duplicate names
    if (groups.some(g => g.name.toLowerCase() === newGroupName.trim().toLowerCase())) {
      showToast(`Group "${newGroupName}" already exists`, 'error')
      return
    }

    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim() || undefined,
          community: newGroupCommunity.trim() || undefined,
          channels: ['whatsapp']
        })
      })

      if (response.ok) {
        setShowCreateGroup(false)
        setNewGroupName('')
        setNewGroupDesc('')
        setNewGroupCommunity('')
        showToast(`Group "${newGroupName}" created successfully`, 'success')
        // Refresh data without page reload
        fetchData()
      } else {
        showToast('Failed to create group', 'error')
      }
    } catch (err) {
      console.error('Error creating group:', err)
      showToast('Failed to create group', 'error')
    }
  }

  const handleDeleteCommunity = (communityName: string) => {
    const community = communities.find(c => c.name === communityName)
    if (!community) return

    const consequences: string[] = []

    // Find groups in this community
    const communityGroups = groups.filter(g => g.community === communityName)
    if (communityGroups.length > 0) {
      consequences.push(`${communityGroups.length} group${communityGroups.length !== 1 ? 's' : ''} will lose their community reference`)
      communityGroups.forEach(g => {
        consequences.push(`  • ${g.name}`)
      })
    }

    // Find agents
    if (community.members.length > 0) {
      consequences.push(`${community.members.length} agent${community.members.length !== 1 ? 's' : ''} are members`)
      community.members.forEach(a => {
        consequences.push(`  • ${a.name}`)
      })
    }

    setDeleteDialog({ type: 'community', name: communityName, consequences })
  }

  const handleDeleteGroup = (groupName: string) => {
    const group = groups.find(g => g.name === groupName)
    if (!group) return

    const consequences: string[] = []

    // Show community if exists
    if (group.community) {
      consequences.push(`Part of community: ${group.community}`)
    }

    // Find agents
    if (group.members.length > 0) {
      consequences.push(`${group.members.length} agent${group.members.length !== 1 ? 's' : ''} are members`)
      group.members.forEach(a => {
        consequences.push(`  • ${a.name}`)
      })
    }

    setDeleteDialog({ type: 'group', name: groupName, consequences })
  }

  const confirmDelete = async () => {
    if (!deleteDialog) return

    const { type, name } = deleteDialog
    const endpoint = type === 'community' ? `/api/communities/${encodeURIComponent(name)}` : `/api/groups/${encodeURIComponent(name)}`

    try {
      const response = await fetch(endpoint, {
        method: 'DELETE'
      })

      if (response.ok) {
        showToast(`${type === 'community' ? 'Community' : 'Group'} "${name}" deleted`, 'success')
        setDeleteDialog(null)
        fetchData()
      } else {
        showToast(`Failed to delete ${type}`, 'error')
      }
    } catch (err) {
      console.error(`Error deleting ${type}:`, err)
      showToast(`Failed to delete ${type}`, 'error')
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Organization Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {agents.length} agent{agents.length !== 1 ? 's' : ''}
            <span className="text-gray-300 mx-1.5">•</span>
            {communities.length} communit{communities.length !== 1 ? 'ies' : 'y'}
            <span className="text-gray-300 mx-1.5">•</span>
            {groups.length} group{groups.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={expandAll}
            className="text-sm font-medium text-sky-600 hover:text-sky-800 transition-colors"
          >
            ▼ Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            ▶ Collapse All
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={agents.length === 0}
            className={`px-4 py-2 text-sm rounded transition-colors ${
              agents.length === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-sky-600 text-white hover:bg-sky-700'
            }`}
            title={agents.length === 0 ? 'No agents to export' : 'Export organization as template'}
          >
            📦 Export as Template
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            placeholder="Search communities, groups, tags, agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
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
            Showing {filteredCommunities.length} {filteredCommunities.length !== 1 ? 'communities' : 'community'}
            {' • '}
            {filteredGroups.length} {filteredGroups.length !== 1 ? 'groups' : 'group'}
            {matchingAgentsCount > 0 && (
              <>
                {' • '}
                {matchingAgentsCount} {matchingAgentsCount !== 1 ? 'agents' : 'agent'}
              </>
            )}
          </div>
        )}
      </div>

      {loading && <PageLoading text="Loading organization data..." />}

      {!loading && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400">
          <span className="text-4xl mb-4">🏢</span>
          <p className="text-sm">No agents found</p>
          <p className="text-xs mt-1 text-gray-300">Add agents to see organization structure</p>
        </div>
      )}

      {!loading && agents.length > 0 && (
        <div className="space-y-6">
          {/* Organization Info */}
          <div className="bg-gradient-to-r from-sky-50 to-purple-50 rounded-lg border border-sky-200 shadow-sm p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🏢</span>
                  <h2 className="text-lg font-bold text-gray-900">{orgName}</h2>
                  <button
                    onClick={() => setEditingOrg(!editingOrg)}
                    className="text-sm text-sky-600 hover:text-sky-800 ml-2"
                  >
                    {editingOrg ? '✓ Done' : '✏️ Edit'}
                  </button>
                </div>
                {editingOrg ? (
                  <textarea
                    value={orgDescription}
                    onChange={(e) => setOrgDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-sky-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                    rows={2}
                    placeholder="Describe your organization..."
                  />
                ) : (
                  <p className="text-sm text-gray-600">{orgDescription}</p>
                )}
              </div>
            </div>
          </div>

          {/* All Agents */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-700">
                🤖 All Agents ({filteredAgents.length})
              </h2>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-2">
                {filteredAgents.sort((a, b) => a.name.localeCompare(b.name)).map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => onNavigateToAgent?.(agent.id)}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-gray-200 bg-gray-50 font-medium hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer"
                    title={`Go to ${agent.name} in Agents page`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                    {agent.name}
                    <span className="text-gray-400">({agent.id})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Communities */}
          {communities.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200 bg-purple-50 flex items-center justify-between">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCommunitiesSectionCollapsed(!communitiesSectionCollapsed)}>
                  <span className="text-sm">{communitiesSectionCollapsed ? '▶' : '▼'}</span>
                  <h2 className="text-sm font-semibold text-purple-800">
                    🏘 Communities ({communities.length})
                  </h2>
                </div>
                <button
                  onClick={() => setShowCreateCommunity(true)}
                  className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                >
                  + Create Community
                </button>
              </div>
              {!communitiesSectionCollapsed && (
                <div className="divide-y divide-gray-100">
                {filteredCommunities.map(community => (
                  <div key={community.name} className="p-4 group relative">
                    <div className="flex items-start justify-between -m-4 p-4 rounded transition-colors">
                      <div
                        onClick={() => toggleCommunity(community.name)}
                        className="flex-1 cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">
                            {expandedCommunities.has(community.name) ? '▼' : '▶'}
                          </span>
                          <h3 className="font-semibold text-gray-900 text-sm">{community.name}</h3>
                          <span className="text-xs text-gray-400">
                            ({community.members.length} member{community.members.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                        {community.description && (
                          <p className="text-xs text-gray-500 ml-6">{community.description}</p>
                        )}
                        {community.tags.length > 0 && (
                          <div className="flex gap-1 ml-6 mt-1">
                            {community.tags.map(tag => (
                              <span
                                key={tag}
                                className="text-xs px-1.5 py-0.5 rounded border bg-purple-50 text-purple-600 border-purple-200"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rename button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenameCommunityTarget(community)
                      }}
                      className="absolute right-10 top-6 opacity-0 group-hover:opacity-100 p-1 text-purple-600 hover:bg-purple-50 rounded transition-all"
                      title="Rename community"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteCommunity(community.name)
                      }}
                      className="absolute right-2 top-6 opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:bg-red-50 rounded transition-all"
                      title="Delete community"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    {/* Community Members */}
                    {expandedCommunities.has(community.name) && (
                      <div className="ml-10 mt-3 pl-4 border-l-2 border-purple-200">
                        <div className="flex flex-wrap gap-2">
                          {community.members.sort((a, b) => a.name.localeCompare(b.name)).map(agent => (
                            <button
                              key={agent.id}
                              onClick={() => onNavigateToAgent?.(agent.id)}
                              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-purple-200 bg-purple-50 font-medium hover:bg-purple-100 hover:border-purple-300 transition-colors cursor-pointer"
                              title={`Go to ${agent.name} in Agents page`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                              {agent.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              )}
            </div>
          )}

          {/* Groups */}
          {groups.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200 bg-indigo-50 flex items-center justify-between">
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => setGroupsSectionCollapsed(!groupsSectionCollapsed)}>
                  <span className="text-sm">{groupsSectionCollapsed ? '▶' : '▼'}</span>
                  <h2 className="text-sm font-semibold text-indigo-800">
                    👥 Groups ({groups.length})
                  </h2>
                </div>
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                >
                  + Create Group
                </button>
              </div>
              {!groupsSectionCollapsed && (
                <div className="divide-y divide-gray-100">
                {filteredGroups.map(group => (
                  <div key={group.name} className="p-4 group relative">
                    <div className="flex items-start justify-between -m-4 p-4 rounded transition-colors">
                      <div
                        onClick={() => toggleGroup(group.name)}
                        className="flex-1 cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm">
                            {expandedGroups.has(group.name) ? '▼' : '▶'}
                          </span>
                          <h3 className="font-semibold text-gray-900 text-sm">{group.name}</h3>
                          <span className="text-xs text-gray-400">
                            ({group.members.length} member{group.members.length !== 1 ? 's' : ''})
                          </span>
                          {group.community && (
                            <span className="text-xs text-purple-600">
                              → {group.community}
                            </span>
                          )}
                        </div>
                        {group.description && (
                          <p className="text-xs text-gray-500 ml-6">{group.description}</p>
                        )}
                        {group.tags.length > 0 && (
                          <div className="flex gap-1 ml-6 mt-1">
                            {group.tags.map(tag => (
                              <span
                                key={tag}
                                className="text-xs px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-600 border-indigo-200"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rename button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setRenameGroupTarget(group)
                      }}
                      className="absolute right-10 top-6 opacity-0 group-hover:opacity-100 p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-all"
                      title="Rename group"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>

                    {/* Delete button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteGroup(group.name)
                      }}
                      className="absolute right-2 top-6 opacity-0 group-hover:opacity-100 p-1 text-red-600 hover:bg-red-50 rounded transition-all"
                      title="Delete group"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>

                    {/* Group Members */}
                    {expandedGroups.has(group.name) && (
                      <div className="ml-10 mt-3 pl-4 border-l-2 border-indigo-200">
                        <div className="flex flex-wrap gap-2">
                          {group.members.sort((a, b) => a.name.localeCompare(b.name)).map(agent => (
                            <button
                              key={agent.id}
                              onClick={() => onNavigateToAgent?.(agent.id)}
                              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-indigo-200 bg-indigo-50 font-medium hover:bg-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer"
                              title={`Go to ${agent.name} in Agents page`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                              {agent.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state for communities/groups */}
          {communities.length === 0 && groups.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
              <div className="flex flex-col items-center justify-center text-gray-400">
                <span className="text-4xl mb-4">💬</span>
                <p className="text-sm">No communities or groups configured</p>
                <p className="text-xs mt-1 text-gray-300 mb-4">Create your first community or group to get started</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreateCommunity(true)}
                    className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                  >
                    + Create Community
                  </button>
                  <button
                    onClick={() => setShowCreateGroup(true)}
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                  >
                    + Create Group
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveModal && (
        <SaveAsOrgTemplateModal
          agentCount={agents.length}
          communityCount={communities.length}
          groupCount={groups.length}
          defaultName={orgName}
          defaultDescription={orgDescription}
          onClose={() => setShowSaveModal(false)}
          onSuccess={() => {
            setShowSaveModal(false)
            // Could show a success message or navigate to templates
          }}
        />
      )}

      {/* Create Community Modal */}
      {showCreateCommunity && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Create Community</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Community Name *
                </label>
                <input
                  type="text"
                  value={newCommunityName}
                  onChange={(e) => setNewCommunityName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="Engineering Team"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newCommunityDesc}
                  onChange={(e) => setNewCommunityDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                  rows={3}
                  placeholder="Describe this community..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateCommunity(false)
                  setNewCommunityName('')
                  setNewCommunityDesc('')
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCommunity}
                disabled={!newCommunityName.trim()}
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  newCommunityName.trim()
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Create Group</h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group Name *
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Backend Team"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="Describe this group..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Community (optional)
                </label>
                {workspaceCommunities.length > 0 ? (
                  <select
                    value={newGroupCommunity}
                    onChange={(e) => setNewGroupCommunity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">No community</option>
                    {workspaceCommunities.map(c => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={newGroupCommunity}
                    onChange={(e) => setNewGroupCommunity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter community name"
                  />
                )}
                {workspaceCommunities.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No communities exist yet. Create one first or leave blank.
                  </p>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCreateGroup(false)
                  setNewGroupName('')
                  setNewGroupDesc('')
                  setNewGroupCommunity('')
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={!newGroupName.trim()}
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  newGroupName.trim()
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDeleteDialog
        isOpen={deleteDialog !== null}
        itemName={deleteDialog?.name || ''}
        itemType={deleteDialog?.type || 'item'}
        consequences={deleteDialog?.consequences}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog(null)}
      />

      {/* Rename Community Modal */}
      {renameCommunityTarget && (
        <RenameCommunityModal
          community={renameCommunityTarget}
          existingCommunities={communities}
          onClose={() => setRenameCommunityTarget(null)}
          onSave={async (newName) => {
            try {
              const res = await fetch(`/api/communities/${encodeURIComponent(renameCommunityTarget.name)}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName }),
              })
              const data = await res.json()
              if (res.ok) {
                showToast(`Renamed "${renameCommunityTarget.name}" to "${newName}"`, 'success')
                fetchData()
                setRenameCommunityTarget(null)
              } else {
                showToast(data.error || 'Failed to rename community', 'error')
              }
            } catch (err) {
              showToast('Failed to rename community', 'error')
              console.error(err)
            }
          }}
        />
      )}

      {/* Rename Group Modal */}
      {renameGroupTarget && (
        <RenameGroupModal
          group={renameGroupTarget}
          existingGroups={groups}
          onClose={() => setRenameGroupTarget(null)}
          onSave={async (newName) => {
            try {
              const res = await fetch(`/api/groups/${encodeURIComponent(renameGroupTarget.name)}/rename`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newName }),
              })
              const data = await res.json()
              if (res.ok) {
                showToast(`Renamed "${renameGroupTarget.name}" to "${newName}"`, 'success')
                fetchData()
                setRenameGroupTarget(null)
              } else {
                showToast(data.error || 'Failed to rename group', 'error')
              }
            } catch (err) {
              showToast('Failed to rename group', 'error')
              console.error(err)
            }
          }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg transition-opacity ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

function RenameCommunityModal({
  community,
  existingCommunities,
  onClose,
  onSave
}: {
  community: Community
  existingCommunities: Community[]
  onClose: () => void
  onSave: (newName: string) => void
}) {
  const [newName, setNewName] = React.useState(community.name)
  const [error, setError] = React.useState<string | null>(null)

  const validate = (name: string): string | null => {
    if (!name.trim()) return 'Community name is required'
    if (name === community.name) return 'New name must be different from current name'
    if (existingCommunities.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
      return `A community named "${name.trim()}" already exists`
    }
    return null
  }

  const handleSave = () => {
    const validationError = validate(newName)
    if (validationError) {
      setError(validationError)
      return
    }
    onSave(newName.trim())
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Rename Community</h3>
        <p className="text-xs text-gray-500 mb-4">
          Renaming will update all references in groups and agents
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current name: <span className="font-medium text-purple-600">{community.name}</span>
          </label>
          <input
            type="text"
            value={newName}
            onChange={e => {
              setNewName(e.target.value)
              setError(null)
            }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Enter new community name..."
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}

function RenameGroupModal({
  group,
  existingGroups,
  onClose,
  onSave
}: {
  group: Group
  existingGroups: Group[]
  onClose: () => void
  onSave: (newName: string) => void
}) {
  const [newName, setNewName] = React.useState(group.name)
  const [error, setError] = React.useState<string | null>(null)

  const validate = (name: string): string | null => {
    if (!name.trim()) return 'Group name is required'
    if (name === group.name) return 'New name must be different from current name'
    if (existingGroups.some(g => g.name.toLowerCase() === name.trim().toLowerCase())) {
      return `A group named "${name.trim()}" already exists`
    }
    return null
  }

  const handleSave = () => {
    const validationError = validate(newName)
    if (validationError) {
      setError(validationError)
      return
    }
    onSave(newName.trim())
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Rename Group</h3>
        <p className="text-xs text-gray-500 mb-4">
          Renaming will update all references in agents
        </p>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current name: <span className="font-medium text-indigo-600">{group.name}</span>
          </label>
          <input
            type="text"
            value={newName}
            onChange={e => {
              setNewName(e.target.value)
              setError(null)
            }}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder="Enter new group name..."
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}
