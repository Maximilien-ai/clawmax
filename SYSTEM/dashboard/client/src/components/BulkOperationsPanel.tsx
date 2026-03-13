import React, { useState } from 'react'

interface Agent {
  id: string
  name: string
  archived?: boolean
}

interface BulkOperationsPanelProps {
  selectedAgents: Agent[]
  allCommunities: Array<{ name: string; description: string | null }>
  allGroups: Array<{ name: string; description: string | null }>
  onClose: () => void
  onAddToCommunities: (agentIds: string[], communities: string[]) => Promise<void>
  onAddToGroups: (agentIds: string[], groups: string[]) => Promise<void>
  onArchive: (agentIds: string[]) => Promise<void>
  onUnarchive: (agentIds: string[]) => Promise<void>
  onDelete?: (agents: Array<{ id: string; archived?: boolean }>) => Promise<void>
  onChat?: (agentIds: string[]) => void
}

export default function BulkOperationsPanel({
  selectedAgents,
  allCommunities,
  allGroups,
  onClose,
  onAddToCommunities,
  onAddToGroups,
  onArchive,
  onUnarchive,
  onDelete,
  onChat,
}: BulkOperationsPanelProps) {
  const [operation, setOperation] = useState<'communities' | 'groups' | 'archive' | 'unarchive' | 'delete' | null>(null)
  const [selectedCommunities, setSelectedCommunities] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [processing, setProcessing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleteImpact, setDeleteImpact] = useState<any>(null)
  const [showSecondConfirm, setShowSecondConfirm] = useState(false)

  const archivedCount = selectedAgents.filter(a => a.archived).length
  const activeCount = selectedAgents.length - archivedCount

  async function handleFirstConfirm() {
    // For delete, fetch impact and show second confirmation
    if (operation === 'delete' && onDelete) {
      setProcessing(true)
      try {
        const agents = selectedAgents.map(a => ({ id: a.id, archived: a.archived }))
        const resp = await fetch('/api/agents/bulk-impact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agents })
        })
        const data = await resp.json()
        setDeleteImpact(data.summary)
        setShowConfirm(true)
        setShowSecondConfirm(true)
      } catch (err) {
        console.error('Failed to fetch impact:', err)
      } finally {
        setProcessing(false)
      }
    } else {
      // For other operations, just set showConfirm
      setShowConfirm(true)
    }
  }

  async function handleExecute() {
    setProcessing(true)
    try {
      const agentIds = selectedAgents.map(a => a.id)

      if (operation === 'communities' && selectedCommunities.size > 0) {
        await onAddToCommunities(agentIds, Array.from(selectedCommunities))
      } else if (operation === 'groups' && selectedGroups.size > 0) {
        await onAddToGroups(agentIds, Array.from(selectedGroups))
      } else if (operation === 'archive') {
        await onArchive(agentIds)
      } else if (operation === 'unarchive') {
        await onUnarchive(agentIds)
      } else if (operation === 'delete' && onDelete) {
        const agents = selectedAgents.map(a => ({ id: a.id, archived: a.archived }))
        await onDelete(agents)
      }

      onClose()
    } catch (err) {
      console.error('Bulk operation failed:', err)
    } finally {
      setProcessing(false)
      setShowConfirm(false)
      setShowSecondConfirm(false)
    }
  }

  function toggleCommunity(name: string) {
    const next = new Set(selectedCommunities)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedCommunities(next)
  }

  function toggleGroup(name: string) {
    const next = new Set(selectedGroups)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedGroups(next)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            Bulk Operations ({selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''})
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            disabled={processing}
          >
            ×
          </button>
        </div>

        {/* Agent list */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="text-sm text-gray-600 mb-2">Selected agents:</div>
          <div className="flex flex-wrap gap-2">
            {selectedAgents.map(a => (
              <span
                key={a.id}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  a.archived ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-700'
                }`}
              >
                {a.name}{a.archived ? ' (archived)' : ''}
              </span>
            ))}
          </div>
        </div>

        {!showConfirm ? (
          <>
            {/* Operation selection */}
            <div className="px-6 py-4">
              <div className="text-sm font-medium text-gray-700 mb-3">Choose an operation:</div>
              <div className="space-y-2">
                {onChat && (
                  <button
                    onClick={() => {
                      onChat(selectedAgents.map(a => a.id))
                      onClose()
                    }}
                    className="w-full text-left px-4 py-3 rounded-lg border-2 border-gray-200 hover:border-blue-300 bg-white transition-colors"
                  >
                    <div className="font-medium text-gray-900">Chat with Selected</div>
                    <div className="text-sm text-gray-500">Open a chat with the selected agents</div>
                  </button>
                )}

                <button
                  onClick={() => setOperation('communities')}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                    operation === 'communities'
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-purple-300 bg-white'
                  }`}
                >
                  <div className="font-medium text-gray-900">Add to Communities</div>
                  <div className="text-sm text-gray-500">Add selected agents to one or more communities</div>
                </button>

                <button
                  onClick={() => setOperation('groups')}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                    operation === 'groups'
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300 bg-white'
                  }`}
                >
                  <div className="font-medium text-gray-900">Add to Groups</div>
                  <div className="text-sm text-gray-500">Add selected agents to one or more groups</div>
                </button>

                {activeCount > 0 && (
                  <button
                    onClick={() => setOperation('archive')}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                      operation === 'archive'
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-orange-300 bg-white'
                    }`}
                  >
                    <div className="font-medium text-gray-900">Archive Agents</div>
                    <div className="text-sm text-gray-500">Archive {activeCount} active agent{activeCount !== 1 ? 's' : ''}</div>
                  </button>
                )}

                {archivedCount > 0 && (
                  <button
                    onClick={() => setOperation('unarchive')}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                      operation === 'unarchive'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-green-300 bg-white'
                    }`}
                  >
                    <div className="font-medium text-gray-900">Unarchive Agents</div>
                    <div className="text-sm text-gray-500">Unarchive {archivedCount} archived agent{archivedCount !== 1 ? 's' : ''}</div>
                  </button>
                )}

                {onDelete && (
                  <button
                    onClick={() => setOperation('delete')}
                    className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${
                      operation === 'delete'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-red-300 bg-white'
                    }`}
                  >
                    <div className="font-medium text-gray-900 text-red-700">⚠️ Delete Agents Permanently</div>
                    <div className="text-sm text-red-600">Permanently delete {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''} (cannot be undone)</div>
                  </button>
                )}
              </div>
            </div>

            {/* Communities selection */}
            {operation === 'communities' && (
              <div className="px-6 py-4 border-t border-gray-100">
                <div className="text-sm font-medium text-gray-700 mb-3">Select communities:</div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {allCommunities.map(c => (
                    <label key={c.name} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCommunities.has(c.name)}
                        onChange={() => toggleCommunity(c.name)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{c.name}</div>
                        {c.description && <div className="text-sm text-gray-500">{c.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Groups selection */}
            {operation === 'groups' && (
              <div className="px-6 py-4 border-t border-gray-100">
                <div className="text-sm font-medium text-gray-700 mb-3">Select groups:</div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {allGroups.map(g => (
                    <label key={g.name} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedGroups.has(g.name)}
                        onChange={() => toggleGroup(g.name)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{g.name}</div>
                        {g.description && <div className="text-sm text-gray-500">{g.description}</div>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                disabled={processing}
              >
                Cancel
              </button>
              <button
                onClick={handleFirstConfirm}
                disabled={
                  processing ||
                  !operation ||
                  (operation === 'communities' && selectedCommunities.size === 0) ||
                  (operation === 'groups' && selectedGroups.size === 0)
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {processing ? 'Loading...' : 'Next →'}
              </button>
            </div>
          </>
        ) : !showSecondConfirm ? (
          <>
            {/* First Confirmation screen */}
            <div className="px-6 py-6">
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="text-yellow-600 text-xl">⚠️</div>
                  <div>
                    <div className="font-medium text-yellow-900 mb-1">Confirm Bulk Operation</div>
                    <div className="text-sm text-yellow-800">
                      You are about to perform the following operation on {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''}:
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium text-gray-700">Operation:</div>
                  <div className="text-base text-gray-900">
                    {operation === 'communities' && `Add to ${selectedCommunities.size} communit${selectedCommunities.size !== 1 ? 'ies' : 'y'}`}
                    {operation === 'groups' && `Add to ${selectedGroups.size} group${selectedGroups.size !== 1 ? 's' : ''}`}
                    {operation === 'archive' && `Archive ${activeCount} agent${activeCount !== 1 ? 's' : ''}`}
                    {operation === 'unarchive' && `Unarchive ${archivedCount} agent${archivedCount !== 1 ? 's' : ''}`}
                  </div>
                </div>

                {operation === 'communities' && (
                  <div>
                    <div className="text-sm font-medium text-gray-700">Communities:</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {Array.from(selectedCommunities).map(name => (
                        <span key={name} className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm font-medium">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {operation === 'groups' && (
                  <div>
                    <div className="text-sm font-medium text-gray-700">Groups:</div>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {Array.from(selectedGroups).map(name => (
                        <span key={name} className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-sm font-medium">
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Confirmation footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                disabled={processing}
              >
                ← Back
              </button>
              <button
                onClick={handleExecute}
                disabled={processing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {processing ? 'Processing...' : 'Confirm & Execute'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Second Confirmation screen (for delete only) */}
            <div className="px-6 py-6">
              <div className="mb-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="text-red-600 text-2xl">🚨</div>
                  <div>
                    <div className="font-bold text-red-900 mb-2 text-lg">FINAL WARNING: Permanent Deletion</div>
                    <div className="text-sm text-red-800 space-y-1">
                      <p>You are about to <strong>permanently delete {selectedAgents.length} agent{selectedAgents.length !== 1 ? 's' : ''}</strong>.</p>
                      <p className="font-semibold">This action CANNOT be undone!</p>
                    </div>
                  </div>
                </div>
              </div>

              {deleteImpact && (
                <div className="space-y-3 mb-4">
                  <div className="text-sm font-medium text-gray-700">Impact Summary:</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-gray-50 rounded border border-gray-200">
                      <div className="text-xs text-gray-500">Agents to delete</div>
                      <div className="text-2xl font-bold text-gray-900">{deleteImpact.agentCount}</div>
                    </div>
                    <div className="p-3 bg-purple-50 rounded border border-purple-200">
                      <div className="text-xs text-purple-600">Community memberships</div>
                      <div className="text-2xl font-bold text-purple-900">{deleteImpact.totalCommunities}</div>
                    </div>
                    <div className="p-3 bg-indigo-50 rounded border border-indigo-200">
                      <div className="text-xs text-indigo-600">Group memberships</div>
                      <div className="text-2xl font-bold text-indigo-900">{deleteImpact.totalGroups}</div>
                    </div>
                    <div className="p-3 bg-orange-50 rounded border border-orange-200">
                      <div className="text-xs text-orange-600">TODOs/notes</div>
                      <div className="text-2xl font-bold text-orange-900">{deleteImpact.totalTodos}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 bg-gray-50 rounded border border-gray-200">
                <div className="text-sm font-medium text-gray-700 mb-2">Agents to be deleted:</div>
                <div className="flex flex-wrap gap-2">
                  {selectedAgents.map(a => (
                    <span
                      key={a.id}
                      className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800"
                    >
                      {a.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Second confirmation footer */}
            <div className="sticky bottom-0 bg-white border-t-2 border-red-200 px-6 py-4 flex gap-3 justify-end bg-red-50">
              <button
                onClick={() => setShowSecondConfirm(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium"
                disabled={processing}
              >
                ← Cancel
              </button>
              <button
                onClick={handleExecute}
                disabled={processing}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-lg"
              >
                {processing ? 'Deleting...' : '🗑️ Delete Permanently'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
