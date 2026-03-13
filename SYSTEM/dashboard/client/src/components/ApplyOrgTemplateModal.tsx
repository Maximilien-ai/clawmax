import React, { useState } from 'react'

interface OrganizationTemplate {
  name: string
  type: 'organization'
  version: string
  description?: string
  agents: Array<{ id: string; role: string; tags?: string[] }>
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
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Separate built-in agents from regular agents
  const builtInAgents = template.agents.filter(a => a.tags?.includes('built-in'))
  const regularAgents = template.agents.filter(a => !a.tags?.includes('built-in'))
  const agentsToCreate = includeBuiltIn ? template.agents : regularAgents

  // Calculate what the agent IDs will look like with current prefix/suffix
  const exampleAgentId = regularAgents[0]?.id || template.agents[0]?.id || 'agent'
  const previewId = `${prefix}${exampleAgentId}${suffix}`

  const handleApply = async () => {
    setApplying(true)
    setError(null)

    try {
      // Generate template slug from name
      const templateSlug = template.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

      const resp = await fetch('/api/templates/organizations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateSlug,
          prefix: prefix || undefined,
          suffix: suffix || undefined,
          includeBuiltIn,
        }),
      })

      const data = await resp.json()

      if (resp.ok) {
        onSuccess()
        onClose()
      } else {
        setError(data.error || 'Failed to apply template')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Apply Organization Template</h2>
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
                  className="mt-0.5 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <div className="flex-1">
                  <label htmlFor="include-built-in" className="text-sm font-semibold text-purple-900 cursor-pointer">
                    Include built-in system agents 🤖
                  </label>
                  <p className="text-xs text-purple-700 mt-1">
                    This template includes {builtInAgents.length} built-in ClawMax system agent{builtInAgents.length !== 1 ? 's' : ''} that provide{builtInAgents.length === 1 ? 's' : ''} system functionality.
                  </p>
                  {includeBuiltIn && (
                    <div className="mt-2 bg-white border border-purple-200 rounded p-2">
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

          {/* Agent ID Customization */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-sky-900 mb-3">Agent ID Customization</h3>
            <p className="text-xs text-sky-700 mb-3">
              Add a prefix or suffix to avoid conflicts with existing agents. Leave blank to keep original IDs.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Prefix
                </label>
                <input
                  type="text"
                  value={prefix}
                  onChange={e => setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="e.g., proj1-"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Suffix
                </label>
                <input
                  type="text"
                  value={suffix}
                  onChange={e => setSuffix(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="e.g., -v2"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm"
                />
              </div>
            </div>

            <div className="bg-white border border-sky-300 rounded p-2">
              <div className="text-xs text-gray-500 mb-1">Preview:</div>
              <div className="font-mono text-sm text-sky-700">
                {exampleAgentId} → <span className="font-semibold">{previewId}</span>
              </div>
            </div>
          </div>

          {/* Agent List Preview */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Will Create ({agentsToCreate.length} agent{agentsToCreate.length !== 1 ? 's' : ''}):
            </h3>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 max-h-40 overflow-y-auto">
              <div className="space-y-1">
                {agentsToCreate.map((agent, idx) => {
                  const newId = `${prefix}${agent.id}${suffix}`
                  const isBuiltIn = agent.tags?.includes('built-in')
                  return (
                    <div key={idx} className="text-xs flex items-center gap-2">
                      {isBuiltIn && <span className="text-purple-500">🤖</span>}
                      <span className="font-mono text-gray-500">{agent.id}</span>
                      <span className="text-gray-400">→</span>
                      <span className={`font-mono font-semibold ${isBuiltIn ? 'text-purple-700' : 'text-sky-700'}`}>{newId}</span>
                      <span className="text-gray-400 text-xs">({agent.role})</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            disabled={applying}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying}
            className="px-4 py-2 text-sm bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {applying ? 'Applying Template...' : '⚡ Apply Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
