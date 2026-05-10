import React, { useEffect, useState } from 'react'
import { useToast } from './Toast'
import { fetchModelsWithByok, hasChatExecutionAccess } from '../lib/byok'

interface AgentTemplate {
  name: string
  slug?: string
  agents: Array<{ id: string; role: string; model?: string }>
}

interface ExecutionConfig {
  allowSystemKeysForUserExecution?: boolean
  ollamaEnabled?: boolean
  defaultOllamaBaseUrl?: string
  recommendedModel?: string
  systemKeyDefaults?: {
    openai?: boolean
    anthropic?: boolean
    gemini?: boolean
  }
  userKeyDefaults?: {
    openai?: boolean
    anthropic?: boolean
    gemini?: boolean
  }
}

export default function ApplyAgentTemplateModal({
  template,
  onClose,
  onSuccess,
  defaultAgentId,
}: {
  template: AgentTemplate
  onClose: () => void
  onSuccess: () => void
  defaultAgentId?: string
}) {
  const { showSuccess, showError } = useToast()
  const [agentId, setAgentId] = useState(defaultAgentId || template.agents[0]?.id || '')
  const [model, setModel] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [executionConfig, setExecutionConfig] = useState<ExecutionConfig | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/config')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setExecutionConfig(data))
      .catch(() => {})

    fetchModelsWithByok()
      .then(d => setAvailableModels(d.models || []))
      .catch(() => {})
  }, [])

  const templateDefaultModel = template.agents[0]?.model?.trim() || ''
  const hasExecutionPath = hasChatExecutionAccess(executionConfig)
  const hasResolvedDefaultModel = !!(model || templateDefaultModel || executionConfig?.recommendedModel || availableModels[0])
  const applyBlockReason = !hasExecutionPath
    ? 'No chat execution path is configured for this dashboard. Add provider keys or enable the on-prem Ollama runtime before applying this agent.'
    : !hasResolvedDefaultModel
      ? 'No default model is available for this agent template. Choose a model override or configure a default execution model first.'
      : null

  const handleApply = async () => {
    if (!agentId.trim()) {
      setError('Agent ID is required')
      return
    }
    if (applyBlockReason) {
      setError(applyBlockReason)
      return
    }

    setApplying(true)
    setError(null)

    try {
      const resp = await fetch('/api/templates/agents/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateSlug: template.slug || template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
          agentId: agentId.trim(),
          model: model || undefined,
        }),
      })

      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data.error || 'Failed to apply template')
      }

      showSuccess(`Created agent "${data.agentId || agentId.trim()}" from template "${template.name}"`)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to apply template')
      showError(err.message || 'Failed to apply template')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900 mb-1 dark:text-gray-100">Apply Agent Template</h2>
        <p className="text-sm text-gray-600 mb-4 dark:text-gray-300">
          <span className="font-semibold">{template.name}</span> will create 1 new agent from the template.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {error}
          </div>
        )}

        {applyBlockReason && !error && (
          <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {applyBlockReason}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Agent ID</label>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder={template.agents[0]?.id || 'new-agent-id'}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
              autoFocus
            />
            <p className="mt-1 text-xs text-gray-500">Lowercase letters, numbers, `_`, and `-` only.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-gray-300">Model Override (optional)</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
            >
              <option value="">Use template/default model</option>
              {availableModels.map(availableModel => (
                <option key={availableModel} value={availableModel}>{availableModel}</option>
              ))}
            </select>
          </div>

          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded p-3 text-sm">
            <div className="font-medium text-sky-800 dark:text-sky-300">{template.agents[0]?.role || 'Agent Template'}</div>
            <div className="text-sky-700 dark:text-sky-400 text-xs mt-1">
              New agent preview: <span className="font-mono">{agentId || template.agents[0]?.id}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300"
            disabled={applying}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying || !agentId.trim() || !!applyBlockReason}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {applying ? 'Applying...' : 'Apply Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
