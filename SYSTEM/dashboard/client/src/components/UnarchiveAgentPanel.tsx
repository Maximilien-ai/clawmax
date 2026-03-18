import React, { useState } from 'react'

interface Agent {
  id: string
  name: string
  communityCount?: number
  groupCount?: number
  whatsapp?: string | null
}

interface UnarchiveAgentPanelProps {
  agent: Agent
  onClose: () => void
  onUnarchived: () => void
}

export default function UnarchiveAgentPanel({ agent, onClose, onUnarchived }: UnarchiveAgentPanelProps) {
  const [unarchiving, setUnarchiving] = useState(false)
  const [unarchiveError, setUnarchiveError] = useState<string | null>(null)

  async function handleUnarchive() {
    setUnarchiving(true)
    setUnarchiveError(null)
    try {
      const resp = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/unarchive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await resp.json()
      if (data.ok) {
        setTimeout(() => { onUnarchived(); onClose() }, 500)
      } else {
        setUnarchiveError(data.error ?? 'Unarchive failed')
        setUnarchiving(false)
      }
    } catch (e) {
      setUnarchiveError(String(e))
      setUnarchiving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full sm:w-[480px] mx-2 sm:mx-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-emerald-700">Unarchive Agent</h2>
          <button
            onClick={onClose}
            disabled={unarchiving}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Agent name */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">📤</span>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-200">{agent.name}</p>
              <p className="font-mono text-xs text-gray-400">{agent.id}</p>
            </div>
          </div>

          {/* Impact summary */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-2">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">What happens</p>
            <ul className="space-y-1 text-sm text-emerald-800">
              <li className="flex items-center gap-2">
                <span className="w-4 text-center">📁</span>
                <span>Agent directory moved from <code className="text-xs bg-white dark:bg-gray-800/50 px-1 rounded">AGENTS/archive/{agent.id}/</code> to <code className="text-xs bg-white dark:bg-gray-800/50 px-1 rounded">AGENTS/{agent.id}/</code></span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 text-center">▶️</span>
                <span>Agent will become active again</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 text-center">👥</span>
                <span className="text-amber-700">You'll need to manually re-add to communities if needed</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-4 text-center">💬</span>
                <span className="text-amber-700">You'll need to manually re-add to groups if needed</span>
              </li>
              {agent.whatsapp && (
                <li className="flex items-center gap-2">
                  <span className="w-4 text-center">📱</span>
                  <span>WhatsApp connection will remain</span>
                </li>
              )}
              <li className="flex items-center gap-2">
                <span className="w-4 text-center">🗑️</span>
                <span className="text-gray-600">Archive metadata will be removed from IDENTITY.md</span>
              </li>
            </ul>
          </div>

          {unarchiveError && (
            <p className="text-sm text-red-600">{unarchiveError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={unarchiving}
            className="text-sm px-4 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleUnarchive}
            disabled={unarchiving}
            className={`text-sm px-4 py-1.5 rounded font-medium transition-colors ${
              unarchiving
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {unarchiving ? 'Unarchiving…' : 'Unarchive Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
