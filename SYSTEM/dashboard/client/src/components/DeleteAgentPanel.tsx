import React, { useEffect, useState } from 'react'

interface AgentImpact {
  todoCount: number
  communityCount: number
  groupCount: number
  whatsapp: string | null
  hasStateDir: boolean
  tags?: string[]
}

interface DeleteAgentPanelProps {
  agentId: string
  onClose: () => void
  onDeleted: () => void
}

export default function DeleteAgentPanel({ agentId, onClose, onDeleted }: DeleteAgentPanelProps) {
  const [impact, setImpact] = useState<AgentImpact | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState('')
  const [removeStateDir, setRemoveStateDir] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [steps, setSteps] = useState<string[]>([])

  useEffect(() => {
    fetch(`/api/agents/${encodeURIComponent(agentId)}/impact`)
      .then(r => r.json())
      .then(d => setImpact(d))
      .catch(() => setLoadError('Failed to load impact summary'))
  }, [agentId])

  const confirmed = confirm === agentId

  async function handleDelete() {
    if (!confirmed) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const resp = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeStateDir }),
      })
      const data = await resp.json()
      if (data.ok) {
        setSteps(data.steps ?? [])
        setTimeout(() => { onDeleted(); onClose() }, 1500)
      } else {
        setDeleteError(data.error ?? 'Delete failed')
        setSteps(data.steps ?? [])
        setDeleting(false)
      }
    } catch (e) {
      setDeleteError(String(e))
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-base font-semibold text-red-700">Delete Agent</h2>
          <button
            onClick={onClose}
            disabled={deleting}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          >×</button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Agent name */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <p className="font-mono font-bold text-gray-800">{agentId}</p>
              <p className="text-xs text-gray-400">This action is permanent and cannot be undone.</p>
            </div>
          </div>

          {/* Built-in warning */}
          {impact?.tags?.includes('built-in') && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-2">
                <span>⚠️</span> Built-in System Agent
              </p>
              <p className="text-sm text-purple-800">
                This is a ClawMax built-in agent that provides system functionality. You can delete it, but you may want to archive it instead to preserve the template.
              </p>
              <p className="text-xs text-purple-600 mt-2">
                💡 <strong>Tip:</strong> Use Archive instead to keep the agent configuration without running it.
              </p>
            </div>
          )}

          {/* Impact summary */}
          {loadError && (
            <p className="text-sm text-red-600">{loadError}</p>
          )}
          {!impact && !loadError && (
            <p className="text-sm text-gray-400">Loading impact…</p>
          )}
          {impact && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Impact</p>
              <ul className="space-y-1 text-sm text-amber-800">
                <li className="flex items-center gap-2">
                  <span className="w-4 text-center">📋</span>
                  <span>{impact.todoCount} open TODO{impact.todoCount !== 1 ? 's' : ''}</span>
                </li>
                {impact.communityCount > 0 && (
                  <li className="flex items-center gap-2">
                    <span className="w-4 text-center">👥</span>
                    <span>{impact.communityCount} communit{impact.communityCount !== 1 ? 'ies' : 'y'}</span>
                  </li>
                )}
                {impact.groupCount > 0 && (
                  <li className="flex items-center gap-2">
                    <span className="w-4 text-center">💬</span>
                    <span>{impact.groupCount} group{impact.groupCount !== 1 ? 's' : ''}</span>
                  </li>
                )}
                {impact.whatsapp && (
                  <li className="flex items-center gap-2">
                    <span className="w-4 text-center">📱</span>
                    <span>WhatsApp: {impact.whatsapp}</span>
                  </li>
                )}
                <li className="flex items-center gap-2">
                  <span className="w-4 text-center">📁</span>
                  <span>Workspace directory <code>AGENTS/{agentId}/</code> will be removed</span>
                </li>
              </ul>
            </div>
          )}

          {/* State dir option */}
          {impact?.hasStateDir && (
            <div className="flex items-start gap-3">
              <input
                id="remove-state"
                type="checkbox"
                checked={removeStateDir}
                onChange={e => setRemoveStateDir(e.target.checked)}
                className="mt-0.5"
              />
              <label htmlFor="remove-state" className="text-sm text-gray-700 cursor-pointer">
                <span className="font-medium">Also remove state directory</span>
                <span className="block text-xs text-gray-400 mt-0.5">
                  Permanently deletes <code>~/.openclaw-{agentId}/</code> including credentials and message history.
                </span>
              </label>
            </div>
          )}

          {/* Type-to-confirm */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Type <strong className="font-mono">{agentId}</strong> to confirm
            </label>
            <input
              type="text"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder={agentId}
              disabled={deleting}
              className={`w-full px-3 py-2 text-sm border rounded-md outline-none transition-colors font-mono ${
                confirm && !confirmed ? 'border-red-300 bg-red-50' :
                confirmed ? 'border-green-400 bg-green-50' :
                'border-gray-200 focus:border-red-400'
              }`}
            />
          </div>

          {/* Steps log after delete */}
          {steps.length > 0 && (
            <ul className="text-xs text-gray-500 space-y-0.5 font-mono">
              {steps.map((s, i) => <li key={i} className="flex items-center gap-1"><span className="text-green-500">✓</span>{s}</li>)}
            </ul>
          )}

          {deleteError && (
            <p className="text-sm text-red-600">{deleteError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            disabled={deleting}
            className="text-sm px-4 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!confirmed || deleting}
            className={`text-sm px-4 py-1.5 rounded font-medium transition-colors ${
              !confirmed || deleting
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            {deleting ? 'Deleting…' : 'Delete Agent'}
          </button>
        </div>
      </div>
    </div>
  )
}
