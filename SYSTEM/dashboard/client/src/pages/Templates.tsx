import React, { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'
import ApplyOrgTemplateModal from '../components/ApplyOrgTemplateModal'

interface AgentTemplate {
  name: string
  type: 'agent'
  version: string
  description?: string
  author?: string
  tags?: string[]
  agents: Array<{
    id: string
    name?: string
    role: string
    tags?: string[]
  }>
  metadata?: {
    aiPrompt?: string
    model?: string
    createdAt?: string
  }
}

interface OrganizationTemplate {
  name: string
  type: 'organization'
  version: string
  description?: string
  author?: string
  tags?: string[]
  agents: Array<{ id: string; role: string }>
  communities?: Array<{ name: string }>
  groups?: Array<{ name: string }>
}

interface WorkflowTemplate {
  id: string
  name: string
  description: string
  schedule: string
  enabled: boolean
  targeting: {
    communities: string[]
    groups: string[]
    tags: string[]
    agents: string[]
  }
  created: string
  modified: string
  author: string
  owner?: string
  executionMode: 'automated' | 'managed'
  content: string
}

type Template = AgentTemplate | OrganizationTemplate

export default function Templates() {
  const { showSuccess, showError } = useToast()
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([])
  const [orgTemplates, setOrgTemplates] = useState<OrganizationTemplate[]>([])
  const [workflowTemplates, setWorkflowTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
  const [applyingTemplate, setApplyingTemplate] = useState<OrganizationTemplate | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const fetchTemplates = () => {
    setLoading(true)
    fetch('/api/templates')
      .then(r => r.json())
      .then(data => {
        setAgentTemplates(data.agents || [])
        setOrgTemplates(data.organizations || [])
        setWorkflowTemplates(data.workflows || [])
        setLoading(false)
      })
      .catch(err => {
        showError('Failed to load templates')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchTemplates()

    // Listen for template save events to auto-refresh
    const handleTemplateCreated = () => {
      fetchTemplates()
    }

    window.addEventListener('template-created', handleTemplateCreated)
    return () => window.removeEventListener('template-created', handleTemplateCreated)
  }, [])

  const handleDelete = async (type: 'agent' | 'organization', name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const typeParam = type === 'agent' ? 'agents' : 'organizations'

    if (!confirm(`Delete template "${name}"?`)) return

    try {
      const resp = await fetch(`/api/templates/${typeParam}/${slug}`, {
        method: 'DELETE',
      })

      if (!resp.ok) throw new Error('Failed to delete')

      showSuccess(`Deleted template "${name}"`)
      fetchTemplates()
      setSelectedTemplate(null)
    } catch (err) {
      showError('Failed to delete template')
    }
  }

  // Filter templates by search query
  const filteredAgentTemplates = React.useMemo(() => {
    if (!searchQuery.trim()) return agentTemplates
    const query = searchQuery.trim().toLowerCase()
    return agentTemplates.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.author?.toLowerCase().includes(query) ||
      t.tags?.some(tag => tag.toLowerCase().includes(query)) ||
      t.agents.some(a => a.id.toLowerCase().includes(query) || a.role.toLowerCase().includes(query))
    )
  }, [agentTemplates, searchQuery])

  const filteredOrgTemplates = React.useMemo(() => {
    if (!searchQuery.trim()) return orgTemplates
    const query = searchQuery.trim().toLowerCase()
    return orgTemplates.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description?.toLowerCase().includes(query) ||
      t.author?.toLowerCase().includes(query) ||
      t.tags?.some(tag => tag.toLowerCase().includes(query)) ||
      t.agents.some(a => a.id.toLowerCase().includes(query) || a.role.toLowerCase().includes(query)) ||
      t.communities?.some(c => c.name.toLowerCase().includes(query)) ||
      t.groups?.some(g => g.name.toLowerCase().includes(query))
    )
  }, [orgTemplates, searchQuery])

  const filteredWorkflowTemplates = React.useMemo(() => {
    if (!searchQuery.trim()) return workflowTemplates
    const query = searchQuery.trim().toLowerCase()
    return workflowTemplates.filter(t =>
      t.name.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.author.toLowerCase().includes(query) ||
      t.targeting.communities.some(c => c.toLowerCase().includes(query)) ||
      t.targeting.groups.some(g => g.toLowerCase().includes(query)) ||
      t.targeting.tags.some(tag => tag.toLowerCase().includes(query)) ||
      t.targeting.agents.some(a => a.toLowerCase().includes(query))
    )
  }, [workflowTemplates, searchQuery])

  const totalFiltered = filteredAgentTemplates.length + filteredOrgTemplates.length + filteredWorkflowTemplates.length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading templates...</div>
      </div>
    )
  }

  const totalTemplates = agentTemplates.length + orgTemplates.length + workflowTemplates.length

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
            <p className="text-sm text-gray-500 mt-1">
              {searchQuery ? (
                <>
                  {totalFiltered} of {totalTemplates} template{totalTemplates !== 1 ? 's' : ''} •
                  {' '}{filteredAgentTemplates.length} agent{filteredAgentTemplates.length !== 1 ? 's' : ''},
                  {' '}{filteredOrgTemplates.length} organization{filteredOrgTemplates.length !== 1 ? 's' : ''},
                  {' '}{filteredWorkflowTemplates.length} workflow{filteredWorkflowTemplates.length !== 1 ? 's' : ''}
                </>
              ) : (
                <>
                  {totalTemplates} template{totalTemplates !== 1 ? 's' : ''} •
                  {' '}{agentTemplates.length} agent{agentTemplates.length !== 1 ? 's' : ''},
                  {' '}{orgTemplates.length} organization{orgTemplates.length !== 1 ? 's' : ''},
                  {' '}{workflowTemplates.length} workflow{workflowTemplates.length !== 1 ? 's' : ''}
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchTemplates}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="mt-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates by name, description, tags, or agents..."
              className="w-full px-4 py-2 pr-10 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {totalTemplates === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-6xl mb-4">📑</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No templates yet</h2>
            <p className="text-gray-500 mb-4">
              Save agents as templates to reuse them later
            </p>
            <p className="text-sm text-gray-400">
              Click the 💾 button on any agent card to create a template
            </p>
          </div>
        ) : totalFiltered === 0 && searchQuery ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-6xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No templates found</h2>
            <p className="text-gray-500 mb-4">
              No templates match your search query "{searchQuery}"
            </p>
            <button
              onClick={() => setSearchQuery('')}
              className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Agent Templates */}
            {filteredAgentTemplates.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span>🤖 Agent Templates</span>
                  <span className="text-sm font-normal text-gray-400">({filteredAgentTemplates.length})</span>
                </h2>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredAgentTemplates.map((template, idx) => (
                    <TemplateCard
                      key={idx}
                      template={template}
                      onDelete={() => handleDelete('agent', template.name)}
                      onClick={() => setSelectedTemplate(template)}
                      selected={selectedTemplate?.name === template.name}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Organization Templates */}
            {filteredOrgTemplates.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span>🏢 Organization Templates</span>
                  <span className="text-sm font-normal text-gray-400">({filteredOrgTemplates.length})</span>
                </h2>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredOrgTemplates.map((template, idx) => (
                    <TemplateCard
                      key={idx}
                      template={template}
                      onDelete={() => handleDelete('organization', template.name)}
                      onClick={() => setSelectedTemplate(template)}
                      selected={selectedTemplate?.name === template.name}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Workflow Templates */}
            {filteredWorkflowTemplates.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <span>⚡ Workflow Templates</span>
                  <span className="text-sm font-normal text-gray-400">({filteredWorkflowTemplates.length})</span>
                </h2>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredWorkflowTemplates.map((template, idx) => (
                    <WorkflowTemplateCard
                      key={idx}
                      template={template}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedTemplate && (
        <TemplateDetailPanel
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onDelete={() => handleDelete(selectedTemplate.type, selectedTemplate.name)}
          onApply={selectedTemplate.type === 'organization' ? () => {
            setApplyingTemplate(selectedTemplate as OrganizationTemplate)
            setSelectedTemplate(null)
          } : undefined}
        />
      )}

      {/* Apply Template Modal */}
      {applyingTemplate && (
        <ApplyOrgTemplateModal
          template={applyingTemplate}
          onClose={() => setApplyingTemplate(null)}
          onSuccess={() => {
            setApplyingTemplate(null)
            showSuccess('Organization template applied successfully!')
          }}
        />
      )}
    </div>
  )
}

function TemplateCard({ template, onDelete, onClick, selected }: {
  template: Template
  onDelete: () => void
  onClick: () => void
  selected: boolean
}) {
  const isOrg = template.type === 'organization'
  const agentCount = template.agents.length
  const communityCount = isOrg && template.communities ? template.communities.length : 0
  const groupCount = isOrg && template.groups ? template.groups.length : 0

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight flex-1">
          {template.name}
        </h3>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-gray-300 hover:text-red-500 transition-colors text-xs p-1"
          title="Delete template"
        >
          🗑
        </button>
      </div>

      {template.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{template.description}</p>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
        <span>{agentCount} agent{agentCount !== 1 ? 's' : ''}</span>
        {isOrg && communityCount > 0 && (
          <>
            <span>•</span>
            <span>{communityCount} communit{communityCount !== 1 ? 'ies' : 'y'}</span>
          </>
        )}
        {isOrg && groupCount > 0 && (
          <>
            <span>•</span>
            <span>{groupCount} group{groupCount !== 1 ? 's' : ''}</span>
          </>
        )}
      </div>

      {template.tags && template.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-600 border border-sky-200">
              {tag}
            </span>
          ))}
          {template.tags.length > 3 && (
            <span className="text-xs px-1.5 py-0.5 text-gray-400">+{template.tags.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>v{template.version}</span>
        {template.author && <span>by {template.author}</span>}
      </div>
    </div>
  )
}

function TemplateDetailPanel({ template, onClose, onDelete, onApply }: {
  template: Template
  onClose: () => void
  onDelete: () => void
  onApply?: () => void
}) {
  const isOrg = template.type === 'organization'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{template.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Type & Version */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isOrg ? '🏢' : '🤖'}</span>
            <div>
              <div className="text-sm font-medium text-gray-700">
                {isOrg ? 'Organization Template' : 'Agent Template'}
              </div>
              <div className="text-xs text-gray-400">Version {template.version}</div>
            </div>
          </div>

          {/* Description */}
          {template.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Description</h3>
              <p className="text-sm text-gray-600">{template.description}</p>
            </div>
          )}

          {/* Author */}
          {template.author && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Author</h3>
              <p className="text-sm text-gray-600">{template.author}</p>
            </div>
          )}

          {/* Tags */}
          {template.tags && template.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {template.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-1 rounded bg-sky-50 text-sky-600 border border-sky-200">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Agents */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Agents ({template.agents.length})
            </h3>
            <div className="space-y-2">
              {template.agents.map((agent, idx) => (
                <div key={idx} className="bg-gray-50 rounded px-3 py-2 text-sm">
                  <div className="font-mono text-sky-600">{agent.id}</div>
                  <div className="text-gray-600">{agent.role}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Communities & Groups (for org templates) */}
          {isOrg && template.communities && template.communities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Communities ({template.communities.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {template.communities.map((comm, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 rounded bg-purple-50 text-purple-600 border border-purple-200">
                    {comm.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isOrg && template.groups && template.groups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                Groups ({template.groups.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {template.groups.map((group, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 rounded bg-green-50 text-green-600 border border-green-200">
                    {group.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata (for agent templates) */}
          {!isOrg && template.metadata && (
            <div className="bg-sky-50 border border-sky-200 rounded p-3 text-xs space-y-1">
              <div className="font-semibold text-sky-700">Template Metadata</div>
              {template.metadata.model && (
                <div className="text-sky-600">Model: {template.metadata.model}</div>
              )}
              {template.metadata.createdAt && (
                <div className="text-sky-600">Created: {new Date(template.metadata.createdAt).toLocaleDateString()}</div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            {isOrg && onApply && (
              <button
                onClick={onApply}
                className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm font-medium"
              >
                ⚡ Apply Template
              </button>
            )}
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
            >
              Delete Template
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkflowTemplateCard({ template }: { template: WorkflowTemplate }) {
  const targetingCount =
    template.targeting.communities.length +
    template.targeting.groups.length +
    template.targeting.tags.length +
    template.targeting.agents.length

  return (
    <a
      href={`/#/workflows/${template.id}`}
      className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm hover:shadow-md hover:border-sky-400 transition-all block"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight flex-1">
          {template.name}
        </h3>
        <span className="text-lg">⚡</span>
      </div>

      {template.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{template.description}</p>
      )}

      <div className="space-y-2 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">📅</span>
          <span>{template.schedule}</span>
        </div>
        {targetingCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400">🎯</span>
            <span>{targetingCount} target{targetingCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-gray-400">⚙️</span>
          <span className="capitalize">{template.executionMode}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
        <span>{template.enabled ? '✓ Enabled' : '○ Disabled'}</span>
        {template.author && <span>by {template.author}</span>}
      </div>
    </a>
  )
}
