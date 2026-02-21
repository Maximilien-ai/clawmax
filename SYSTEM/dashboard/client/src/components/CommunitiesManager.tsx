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

export default function CommunitiesManager({
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Manage Communities & Groups</h3>
          <p className="text-sm text-gray-500 mt-1">
            Select which communities and groups <span className="font-medium text-gray-700">{agentName}</span> belongs to
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Communities Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span>🏘</span>
              <span>Communities</span>
              <span className="text-xs text-gray-400">({communities.length} selected)</span>
            </h4>
            <div className="space-y-1.5">
              {allCommunities.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No communities available</p>
              ) : (
                allCommunities.map(community => (
                  <label
                    key={community.name}
                    className="flex items-start gap-3 p-2.5 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={communities.includes(community.name)}
                      onChange={() => toggleCommunity(community.name)}
                      className="mt-0.5 h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">{community.name}</div>
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
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <span>👥</span>
              <span>Groups</span>
              <span className="text-xs text-gray-400">({groups.length} selected)</span>
            </h4>
            <div className="space-y-1.5">
              {allGroups.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No groups available</p>
              ) : (
                allGroups.map(group => (
                  <label
                    key={group.name}
                    className="flex items-start gap-3 p-2.5 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={groups.includes(group.name)}
                      onChange={() => toggleGroup(group.name)}
                      className="mt-0.5 h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900">{group.name}</div>
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

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
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
}
