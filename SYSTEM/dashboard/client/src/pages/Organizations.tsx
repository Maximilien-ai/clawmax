import React, { useEffect, useState, useCallback, useMemo } from 'react'
import SaveAsOrgTemplateModal from '../components/SaveAsOrgTemplateModal'

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

export default function Organizations() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedCommunities, setExpandedCommunities] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
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

  const fetchAgents = useCallback(() => {
    fetch('/api/agents')
      .then(r => r.json())
      .then(d => { setAgents(d.agents); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  // Build communities and groups from agents
  const { communities, groups } = useMemo(() => {
    const communityMap = new Map<string, Community>()
    const groupMap = new Map<string, Group>()

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
  }, [agents])

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
        // Reload page to show new community
        window.location.reload()
      } else {
        alert('Failed to create community')
      }
    } catch (err) {
      console.error('Error creating community:', err)
      alert('Failed to create community')
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return

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
        // Reload page to show new group
        window.location.reload()
      } else {
        alert('Failed to create group')
      }
    } catch (err) {
      console.error('Error creating group:', err)
      alert('Failed to create group')
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

      {loading && (
        <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
          Loading...
        </div>
      )}

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
                🤖 All Agents ({agents.length})
              </h2>
            </div>
            <div className="p-4">
              <div className="flex flex-wrap gap-2">
                {agents.sort((a, b) => a.name.localeCompare(b.name)).map(agent => (
                  <div
                    key={agent.id}
                    className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-gray-200 bg-gray-50 font-medium"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                    {agent.name}
                    <span className="text-gray-400">({agent.id})</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Communities */}
          {communities.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200 bg-purple-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-purple-800">
                  🏘 Communities ({communities.length})
                </h2>
                <button
                  onClick={() => setShowCreateCommunity(true)}
                  className="text-xs px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                >
                  + Create Community
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {communities.map(community => (
                  <div key={community.name} className="p-4">
                    <div
                      onClick={() => toggleCommunity(community.name)}
                      className="flex items-start justify-between cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded transition-colors"
                    >
                      <div className="flex-1">
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

                    {/* Community Members */}
                    {expandedCommunities.has(community.name) && (
                      <div className="ml-10 mt-3 pl-4 border-l-2 border-purple-200">
                        <div className="flex flex-wrap gap-2">
                          {community.members.sort((a, b) => a.name.localeCompare(b.name)).map(agent => (
                            <div
                              key={agent.id}
                              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-purple-200 bg-purple-50 font-medium"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                              {agent.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Groups */}
          {groups.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 py-3 border-b border-gray-200 bg-indigo-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-indigo-800">
                  👥 Groups ({groups.length})
                </h2>
                <button
                  onClick={() => setShowCreateGroup(true)}
                  className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                >
                  + Create Group
                </button>
              </div>
              <div className="divide-y divide-gray-100">
                {groups.map(group => (
                  <div key={group.name} className="p-4">
                    <div
                      onClick={() => toggleGroup(group.name)}
                      className="flex items-start justify-between cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded transition-colors"
                    >
                      <div className="flex-1">
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

                    {/* Group Members */}
                    {expandedGroups.has(group.name) && (
                      <div className="ml-10 mt-3 pl-4 border-l-2 border-indigo-200">
                        <div className="flex flex-wrap gap-2">
                          {group.members.sort((a, b) => a.name.localeCompare(b.name)).map(agent => (
                            <div
                              key={agent.id}
                              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-indigo-200 bg-indigo-50 font-medium"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[agent.status]}`} />
                              {agent.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
                <input
                  type="text"
                  value={newGroupCommunity}
                  onChange={(e) => setNewGroupCommunity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Engineering Team"
                />
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
    </div>
  )
}
