import React, { useState } from 'react'

interface TemplateParameter {
  agentId: string
  label: string
  default: number
  min: number
  max: number
}

interface OrganizationTemplate {
  name: string
  type: 'organization'
  version: string
  description?: string
  parameters?: TemplateParameter[]
  agents: Array<{ id: string; name?: string; role: string; model?: string; tags?: string[] }>
  communities?: Array<{ name: string }>
  groups?: Array<{ name: string }>
  workflows?: Array<{ id: string; name: string }>
}

interface ApplyOrgTemplateModalProps {
  template: OrganizationTemplate
  onClose: () => void
  onSuccess: () => void
}

export default function ApplyOrgTemplateModal({ template, onClose, onSuccess }: ApplyOrgTemplateModalProps) {
  const [prefix, setPrefix] = useState('')
  const [suffix, setSuffix] = useState('')
  const [includeBuiltIn, setIncludeBuiltIn] = useState(true)
  const [modelOverride, setModelOverride] = useState('')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [modelsByProvider, setModelsByProvider] = useState<Record<string, { name: string; models: string[] }>>({})
  const [showModelSection, setShowModelSection] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyProgress, setApplyProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Agent count parameters — initialize from template defaults
  const [agentCounts, setAgentCounts] = useState<Record<string, number>>(() => {
    const counts: Record<string, number> = {}
    if (template.parameters) {
      for (const param of template.parameters) {
        counts[param.agentId] = param.default
      }
    }
    return counts
  })

  // Fetch available models
  React.useEffect(() => {
    fetch('/api/agents/models')
      .then(r => r.json())
      .then(d => {
        setAvailableModels(d.models || [])
        setModelsByProvider(d.modelsByProvider || {})
      })
      .catch(() => {})
  }, [])

  // Expand parameterized agents based on counts
  const paramAgentIds = new Set((template.parameters || []).map(p => p.agentId))

  const expandedAgents = template.agents.flatMap(agent => {
    if (paramAgentIds.has(agent.id)) {
      const count = agentCounts[agent.id] || 1
      return Array.from({ length: count }, (_, i) => ({
        ...agent,
        id: count === 1 ? agent.id : `${agent.id}${i + 1}`,
        name: count === 1 ? (agent.name || agent.id) : `${agent.name || agent.role} ${i + 1}`,
      }))
    }
    return [agent]
  })

  // Separate built-in agents from regular agents
  const builtInAgents = expandedAgents.filter(a => a.tags?.includes('built-in'))
  const regularAgents = expandedAgents.filter(a => !a.tags?.includes('built-in'))
  const agentsToCreate = includeBuiltIn ? expandedAgents : regularAgents

  // Calculate what the agent IDs will look like with current prefix/suffix
  const exampleAgentId = regularAgents[0]?.id || template.agents[0]?.id || 'agent'
  const previewId = `${prefix}${exampleAgentId}${suffix}`

  const handleApply = async () => {
    setApplying(true)
    setError(null)
    setApplyProgress(`Creating ${agentsToCreate.length} agent${agentsToCreate.length !== 1 ? 's' : ''}...`)

    try {
      // Generate template slug from name
      const templateSlug = template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

      // Show progress steps
      const steps = [
        `Creating ${agentsToCreate.length} agent${agentsToCreate.length !== 1 ? 's' : ''}...`,
        ...(template.communities?.length ? [`Setting up ${template.communities.length} communit${template.communities.length !== 1 ? 'ies' : 'y'}...`] : []),
        ...(template.groups?.length ? [`Creating ${template.groups.length} group${template.groups.length !== 1 ? 's' : ''}...`] : []),
        ...(template.workflows?.length ? [`Configuring ${template.workflows.length} workflow${template.workflows.length !== 1 ? 's' : ''}...`] : []),
      ]
      let stepIdx = 0
      const progressInterval = setInterval(() => {
        stepIdx++
        if (stepIdx < steps.length) {
          setApplyProgress(steps[stepIdx])
        }
      }, 800)

      const resp = await fetch('/api/templates/organizations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateSlug,
          prefix: prefix || undefined,
          suffix: suffix || undefined,
          includeBuiltIn,
          modelOverride: modelOverride || undefined,
          agentCounts: Object.keys(agentCounts).length > 0 ? agentCounts : undefined,
        }),
      })

      const data = await resp.json()
      clearInterval(progressInterval)

      if (resp.ok) {
        setApplyProgress('Done! Refreshing workspace...')
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 500)
      } else {
        setApplyProgress(null)
        setError(data.error || 'Failed to apply template')
      }
    } catch (err) {
      setApplyProgress(null)
      setError('Network error')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900 mb-1 dark:text-gray-100">Apply Organization Template</h2>
        <p className="text-sm text-gray-600 mb-4">
          <span className="font-semibold">{template.name}</span> —
          Will create {agentsToCreate.length} agent{agentsToCreate.length !== 1 ? 's' : ''}
          {template.communities && template.communities.length > 0 && `, ${template.communities.length} communit${template.communities.length !== 1 ? 'ies' : 'y'}`}
          {template.groups && template.groups.length > 0 && `, ${template.groups.length} group${template.groups.length !== 1 ? 's' : ''}`}
          {template.workflows && template.workflows.length > 0 && `, ${template.workflows.length} workflow${template.workflows.length !== 1 ? 's' : ''}`}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Built-in Agents Option */}
          {builtInAgents.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <input
                  id="include-built-in"
                  type="checkbox"
                  checked={includeBuiltIn}
                  onChange={e => setIncludeBuiltIn(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 dark:border-gray-600"
                />
                <div className="flex-1">
                  <label htmlFor="include-built-in" className="text-sm font-semibold text-purple-900 cursor-pointer">
                    Include built-in system agents 🤖
                  </label>
                  <p className="text-xs text-purple-700 mt-1">
                    This template includes {builtInAgents.length} built-in ClawMax system agent{builtInAgents.length !== 1 ? 's' : ''} that provide{builtInAgents.length === 1 ? 's' : ''} system functionality.
                  </p>
                  {includeBuiltIn && (
                    <div className="mt-2 bg-white dark:bg-gray-800 border border-purple-200 rounded p-2">
                      <div className="text-xs text-purple-600 font-medium mb-1">Will add:</div>
                      <div className="space-y-0.5">
                        {builtInAgents.map((agent, idx) => (
                          <div key={idx} className="text-xs flex items-center gap-2">
                            <span className="text-purple-500">🤖</span>
                            <span className="font-mono text-purple-700">{agent.id}</span>
                            <span className="text-purple-500">—</span>
                            <span className="text-purple-600">{agent.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!includeBuiltIn && (
                    <p className="text-xs text-purple-600 mt-2">
                      ℹ️ You can add these agents later from the Templates page if needed.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Agent Count Parameters */}
          {template.parameters && template.parameters.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 dark:bg-green-900/20 dark:border-green-700">
              <h3 className="text-sm font-semibold text-green-900 dark:text-green-200 mb-3">Team Size</h3>
              <div className="space-y-3">
                {template.parameters.map(param => (
                  <div key={param.agentId} className="flex items-center gap-3">
                    <label className="text-sm text-green-800 dark:text-green-300 flex-1">{param.label}</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAgentCounts(prev => ({
                          ...prev,
                          [param.agentId]: Math.max(param.min, (prev[param.agentId] || param.default) - 1)
                        }))}
                        disabled={agentCounts[param.agentId] <= param.min}
                        className="w-8 h-8 rounded-md border border-green-300 dark:border-green-600 bg-white dark:bg-gray-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold"
                      >
                        -
                      </button>
                      <span className="w-10 text-center text-lg font-bold text-green-800 dark:text-green-200">
                        {agentCounts[param.agentId] || param.default}
                      </span>
                      <button
                        onClick={() => setAgentCounts(prev => ({
                          ...prev,
                          [param.agentId]: Math.min(param.max, (prev[param.agentId] || param.default) + 1)
                        }))}
                        disabled={agentCounts[param.agentId] >= param.max}
                        className="w-8 h-8 rounded-md border border-green-300 dark:border-green-600 bg-white dark:bg-gray-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-bold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                Agents will be created as {template.parameters[0]?.agentId}1, {template.parameters[0]?.agentId}2, etc.
              </p>
            </div>
          )}

          {/* Agent ID Customization */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-sky-900 mb-3">Agent ID Customization</h3>
            <p className="text-xs text-sky-700 mb-3">
              Add a prefix or suffix to avoid conflicts with existing agents. Leave blank to keep original IDs.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Prefix
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={e => setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="e.g., proj1-"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm dark:border-gray-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-gray-300">
                  Suffix
                </label>
                <input
                  type="text"
                  value={suffix}
                  onChange={e => setSuffix(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="e.g., -v2"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm dark:border-gray-600"
                />
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 border border-sky-300 rounded p-2">
              <div className="text-xs text-gray-500 mb-1">Preview:</div>
              <div className="font-mono text-sm text-sky-700">
                {exampleAgentId} → <span className="font-semibold">{previewId}</span>
              </div>
            </div>
          </div>

          {/* Agent List with Models (collapsible) */}
          <div className="border border-gray-200 rounded-lg overflow-hidden dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowModelSection(!showModelSection)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Agents & Models ({agentsToCreate.length} agent{agentsToCreate.length !== 1 ? 's' : ''})
              </h3>
              <span className="text-gray-400 text-xs">{showModelSection ? '▼' : '▶'}</span>
            </button>

            {showModelSection && (
              <div className="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
                {/* Agent table with models */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden dark:border-gray-700 dark:bg-gray-900">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100 dark:bg-gray-800">
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Agent</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Role</th>
                        <th className="px-3 py-2 text-left text-gray-600 dark:text-gray-400">Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentsToCreate.map((agent, idx) => {
                        const newId = `${prefix}${agent.id}${suffix}`
                        const effectiveModel = modelOverride || agent.model || 'not set'
                        const isOverridden = modelOverride && agent.model && modelOverride !== agent.model
                        return (
                          <tr key={idx} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-3 py-2 font-mono font-medium text-sky-700 dark:text-sky-400">{newId}</td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{agent.role}</td>
                            <td className="px-3 py-2">
                              <span className={isOverridden ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}>
                                {effectiveModel}
                              </span>
                              {isOverridden && <span className="ml-1 text-amber-500" title={`Template default: ${agent.model}`}>*</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Model override dropdown */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 dark:bg-amber-900/20 dark:border-amber-700">
                  <label className="text-xs font-medium text-amber-900 dark:text-amber-200">Override model for all agents:</label>
                  <select
                    value={modelOverride}
                    onChange={e => setModelOverride(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border border-amber-300 rounded-md text-sm bg-white dark:bg-gray-800 dark:border-amber-600 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Use template defaults</option>
                    {Object.keys(modelsByProvider).length > 0 ? (
                      Object.entries(modelsByProvider).map(([providerId, provider]) => (
                        <optgroup key={providerId} label={provider.name || providerId}>
                          {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
                        </optgroup>
                      ))
                    ) : (
                      availableModels.map(m => <option key={m} value={m}>{m}</option>)
                    )}
                  </select>
                  {modelOverride && (
                    <p className="text-xs text-amber-600 mt-2 dark:text-amber-400">
                      ⚠ Changing the model may affect agent behavior. Templates are tested with their default models.
                    </p>
                  )}
                  <p className="text-xs text-amber-700 mt-2 dark:text-amber-500">
                    You can also change individual agent models after import via the agent's Edit Config menu.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 transition-colors dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
            disabled={applying}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying}
            className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {applying && applyProgress ? applyProgress : applying ? 'Applying...' : '⚡ Apply Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
