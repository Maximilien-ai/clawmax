import React, { useState, useEffect } from 'react'

interface Community {
  name: string
  description: string | null
}

interface Group {
  name: string
  description: string | null
}

interface CommunitiesManagerProps {
  agentId: string
  agentName: string
  currentCommunities: Community[]
  currentGroups: Group[]
  onClose: () => void
  onSave: () => void
}

const CommunitiesManager = React.memo(function CommunitiesManager({
  agentId,
  agentName,
  currentCommunities,
  currentGroups,
  onClose,
  onSave,
}: CommunitiesManagerProps) {
  const [communities, setCommunities] = useState<string[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [allCommunities, setAllCommunities] = useState<Community[]>([])
  const [allGroups, setAllGroups] = useState<Group[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [communityFilter, setCommunityFilter] = useState<'all' | 'member' | 'not_member'>('all')
  const [groupFilter, setGroupFilter] = useState<'all' | 'member' | 'not_member'>('all')

  useEffect(() => {
    // Initialize with current memberships
    setCommunities(currentCommunities.map(c => c.name))
    setGroups(currentGroups.map(g => g.name))

    // Fetch all available communities and groups
    Promise.all([
      fetch('/api/communities').then(r => r.json()),
      fetch('/api/groups').then(r => r.json()),
    ])
      .then(([commData, groupData]) => {
        setAllCommunities(commData.communities || [])
        setAllGroups(groupData.groups || [])
      })
      .catch(err => {
        setError('Failed to load communities and groups')
      })
  }, [currentCommunities, currentGroups])

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/agents/${agentId}/communities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communities, groups }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update memberships')
      }

      onSave()
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleCommunity = (name: string) => {
    setCommunities(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    )
  }

  const toggleGroup = (name: string) => {
    setGroups(prev =>
      prev.includes(name) ? prev.filter(g => g !== name) : [...prev, name]
    )
  }

  // Filter communities based on search and filter
  const filteredCommunities = React.useMemo(() => {
    let filtered = allCommunities

    // Apply membership filter
    if (communityFilter === 'member') {
      filtered = filtered.filter(c => communities.includes(c.name))
    } else if (communityFilter === 'not_member') {
      filtered = filtered.filter(c => !communities.includes(c.name))
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(query) ||
        (c.description && c.description.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [allCommunities, communities, communityFilter, searchQuery])

  // Filter groups based on search and filter
  const filteredGroups = React.useMemo(() => {
    let filtered = allGroups

    // Apply membership filter
    if (groupFilter === 'member') {
      filtered = filtered.filter(g => groups.includes(g.name))
    } else if (groupFilter === 'not_member') {
      filtered = filtered.filter(g => !groups.includes(g.name))
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(g =>
        g.name.toLowerCase().includes(query) ||
        (g.description && g.description.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [allGroups, groups, groupFilter, searchQuery])

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Manage Communities & Groups</h3>
          <p className="text-sm text-gray-500 mt-1">
            Select which communities and groups <span className="font-medium text-gray-700 dark:text-gray-300">{agentName}</span> belongs to
          </p>
        </div>

        {/* Search bar */}
        <div className="px-6 pt-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search communities and groups..."
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-sky-400 text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Communities Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2 dark:text-gray-300">
              <span>🏘</span>
              <span>Communities</span>
              <span className="text-xs text-gray-400">({communities.length} selected)</span>
            </h4>

            {/* Filter buttons for communities */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-400 font-medium">Filter:</span>
              <button
                onClick={() => setCommunityFilter('all')}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  communityFilter === 'all'
                    ? 'bg-sky-600 text-white border border-sky-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setCommunityFilter('member')}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  communityFilter === 'member'
                    ? 'bg-emerald-600 text-white border border-emerald-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-emerald-300 hover:text-emerald-600'
                }`}
              >
                Member ({communities.length})
              </button>
              <button
                onClick={() => setCommunityFilter('not_member')}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  communityFilter === 'not_member'
                    ? 'bg-orange-600 text-white border border-orange-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-orange-300 hover:text-orange-600'
                }`}
              >
                Not Member ({allCommunities.length - communities.length})
              </button>
            </div>

            <div className="space-y-1.5">
              {filteredCommunities.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  {allCommunities.length === 0 ? 'No communities available' : 'No communities match your filters'}
                </p>
              ) : (
                filteredCommunities.map(community => (
                  <label
                    key={community.name}
                    className="flex items-start gap-3 p-2.5 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={communities.includes(community.name)}
                      onChange={() => toggleCommunity(community.name)}
                      className="mt-0.5 h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 dark:border-gray-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{community.name}</div>
                      {community.description && (
                        <div className="text-xs text-gray-500 mt-0.5">{community.description}</div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Groups Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2 dark:text-gray-300">
              <span>👥</span>
              <span>Groups</span>
              <span className="text-xs text-gray-400">({groups.length} selected)</span>
            </h4>

            {/* Filter buttons for groups */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-400 font-medium">Filter:</span>
              <button
                onClick={() => setGroupFilter('all')}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  groupFilter === 'all'
                    ? 'bg-sky-600 text-white border border-sky-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-sky-300 hover:text-sky-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setGroupFilter('member')}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  groupFilter === 'member'
                    ? 'bg-emerald-600 text-white border border-emerald-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-emerald-300 hover:text-emerald-600'
                }`}
              >
                Member ({groups.length})
              </button>
              <button
                onClick={() => setGroupFilter('not_member')}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  groupFilter === 'not_member'
                    ? 'bg-orange-600 text-white border border-orange-600'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-orange-300 hover:text-orange-600'
                }`}
              >
                Not Member ({allGroups.length - groups.length})
              </button>
            </div>

            <div className="space-y-1.5">
              {filteredGroups.length === 0 ? (
                <p className="text-xs text-gray-400 italic">
                  {allGroups.length === 0 ? 'No groups available' : 'No groups match your filters'}
                </p>
              ) : (
                filteredGroups.map(group => (
                  <label
                    key={group.name}
                    className="flex items-start gap-3 p-2.5 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={groups.includes(group.name)}
                      onChange={() => toggleGroup(group.name)}
                      className="mt-0.5 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500 dark:border-gray-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-gray-100">{group.name}</div>
                      {group.description && (
                        <div className="text-xs text-gray-500 mt-0.5">{group.description}</div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 transition-colors dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
})

export default CommunitiesManager
