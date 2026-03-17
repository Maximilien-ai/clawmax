import React, { useState } from 'react'

interface Agent {
  id: string
  name: string
  communityCount?: number
  groupCount?: number
  whatsapp?: string | null
}

interface ArchiveAgentPanelProps {
  agent: Agent
  onClose: () => void
  onArchived: () => void
}

export default function ArchiveAgentPanel({ agent, onClose, onArchived }: ArchiveAgentPanelProps) {
  const [reason, setReason] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  async function handleArchive() {
    setArchiving(true)
    setArchiveError(null)
    try {
      const resp = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      })
      const data = await resp.json()
      if (data.ok) {
        setTimeout(() => { onArchived(); onClose() }, 500)
      } else {
        setArchiveError(data.error ?? 'Archive failed')
        setArchiving(false)
      }
    } catch (e) {
      setArchiveError(String(e))
      setArchiving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[480px] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-orange-700">Archive Agent</h2>
          <button
            onClick={onClose}
            disabled={archiving}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Agent name */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">📦</span>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">{agent.name}</p>
              <p className="font-mono text-xs text-gray-400">{agent.id}</p>
            </div>
          </div>

          {/* Impact summary */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider">What happens</p>
            <ul className="space-y-1 text-sm text-orange-800">
              <li className="flex items-center gap-2">
                <span className="w-4 text-center">📁</span>
                <span>Agent directory moved to <code className="text-xs bg-white dark:bg-gray-800/50 px-1 rounded">AGENTS/archive/{agent.id}/</code></span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 text-center">⏸️</span>
                <span>Agent will no longer be active</span>
              </li>
              {agent.communityCount && agent.communityCount > 0 && (
                <li className="flex items-center gap-2">
                  <span className="w-4 text-center">👥</span>
                  <span>Will be removed from {agent.communityCount} communit{agent.communityCount !== 1 ? 'ies' : 'y'}</span>
                </li>
              )}
              {agent.groupCount && agent.groupCount > 0 && (
                <li className="flex items-center gap-2">
                  <span className="w-4 text-center">💬</span>
                  <span>Will be removed from {agent.groupCount} group{agent.groupCount !== 1 ? 's' : ''}</span>
                </li>
              )}
              {agent.whatsapp && (
                <li className="flex items-center gap-2">
                  <span className="w-4 text-center">📱</span>
                  <span>WhatsApp connection will remain</span>
                </li>
              )}
              <li className="flex items-center gap-2">
                <span className="w-4 text-center">♻️</span>
                <span className="text-green-700">You can unarchive this agent later to restore it</span>
              </li>
            </ul>
          </div>

          {/* Reason input */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Archive reason (optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g., No longer needed, Replaced by new agent, Testing..."
              disabled={archiving}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md outline-none transition-colors focus:border-orange-400 dark:border-gray-700"
            />
          </div>

          {archiveError && (
            <p className="text-sm text-red-600">{archiveError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={archiving}
            className="text-sm px-4 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleArchive}
            disabled={archiving}
            className={`text-sm px-4 py-1.5 rounded font-medium transition-colors ${
              archiving
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-orange-600 text-white hover:bg-orange-700'
            }`}
          >
            {archiving ? 'Archiving…' : 'Archive Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
