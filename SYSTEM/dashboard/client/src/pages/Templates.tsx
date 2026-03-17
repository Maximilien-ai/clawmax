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
  agents: Array<{ id: string; role: string; tags?: string[] }>
  communities?: Array<{ name: string }>
  groups?: Array<{ name: string }>
  workflows?: Array<{ id: string; name: string }>
}

interface WorkflowTemplate {
  id: string
  name: string
  type: 'workflow'
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

type Template = AgentTemplate | OrganizationTemplate | WorkflowTemplate

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

  const handleDelete = async (type: 'agent' | 'organization' | 'workflow', name: string, id?: string) => {
    if (type === 'workflow') {
      if (!confirm(`Delete workflow "${name}"? This cannot be undone.`)) return

      try {
        const resp = await fetch(`/api/workflows/${id}`, {
          method: 'DELETE',
        })

        if (!resp.ok) throw new Error('Failed to delete')

        showSuccess(`Deleted workflow "${name}"`)
        fetchTemplates()
        setSelectedTemplate(null)
      } catch (err) {
        showError('Failed to delete workflow')
      }
    } else {
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
  }

  const handleEditWorkflow = (id: string) => {
    // Navigate to workflows page with this workflow selected
    // This will be implemented by the parent component
    window.location.hash = `#/workflows/${id}`
    window.location.reload()
  }

  const handleInstantiateWorkflow = async (id: string, name: string) => {
    if (!confirm(`Run workflow "${name}" now?`)) return

    try {
      const resp = await fetch(`/api/workflows/${id}/run`, {
        method: 'POST',
      })

      if (!resp.ok) throw new Error('Failed to run workflow')

      showSuccess(`Started workflow "${name}"`)
      setSelectedTemplate(null)
    } catch (err) {
      showError('Failed to run workflow')
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
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Templates</h1>
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
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors dark:bg-gray-800 dark:text-gray-300"
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
              className="w-full px-4 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
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
            <h2 className="text-xl font-semibold text-gray-700 mb-2 dark:text-gray-300">No templates yet</h2>
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
            <h2 className="text-xl font-semibold text-gray-700 mb-2 dark:text-gray-300">No templates found</h2>
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
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2 dark:text-gray-100">
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
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2 dark:text-gray-100">
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
                <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2 dark:text-gray-100">
                  <span>⚡ Workflow Templates</span>
                  <span className="text-sm font-normal text-gray-400">({filteredWorkflowTemplates.length})</span>
                </h2>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredWorkflowTemplates.map((template, idx) => (
                    <WorkflowTemplateCard
                      key={idx}
                      template={template}
                      onClick={() => setSelectedTemplate(template)}
                      selected={selectedTemplate?.name === template.name}
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
          onDelete={() => handleDelete(
            selectedTemplate.type,
            selectedTemplate.name,
            selectedTemplate.type === 'workflow' ? selectedTemplate.id : undefined
          )}
          onApply={selectedTemplate.type === 'organization' ? () => {
            setApplyingTemplate(selectedTemplate as OrganizationTemplate)
            setSelectedTemplate(null)
          } : undefined}
          onEdit={selectedTemplate.type === 'workflow' ? () => handleEditWorkflow(selectedTemplate.id) : undefined}
          onInstantiate={selectedTemplate.type === 'workflow' ? () => handleInstantiateWorkflow(selectedTemplate.id, selectedTemplate.name) : undefined}
        />
      )}

      {/* Apply Template Modal */}
      {applyingTemplate && (
        <ApplyOrgTemplateModal
          template={applyingTemplate}
          onClose={() => setApplyingTemplate(null)}
          onSuccess={() => {
            setApplyingTemplate(null)
            showSuccess('Organization template applied successfully! Refreshing...')
            // Refresh to show new agents, groups, communities, and workflows
            setTimeout(() => window.location.reload(), 500)
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
      className={`bg-white dark:bg-gray-800 rounded-lg border p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight flex-1 dark:text-gray-100">
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
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700">
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

function TemplateDetailPanel({ template, onClose, onDelete, onApply, onEdit, onInstantiate }: {
  template: Template
  onClose: () => void
  onDelete: () => void
  onApply?: () => void
  onEdit?: () => void
  onInstantiate?: () => void
}) {
  const isOrg = template.type === 'organization'
  const isWorkflow = template.type === 'workflow'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 px-6 py-4 flex items-center justify-between dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{template.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Type & Version */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isOrg ? '🏢' : isWorkflow ? '⚡' : '🤖'}</span>
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {isOrg ? 'Organization Template' : isWorkflow ? 'Workflow Template' : 'Agent Template'}
              </div>
              {!isWorkflow && <div className="text-xs text-gray-400">Version {template.version}</div>}
            </div>
          </div>

          {/* Description */}
          {template.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-300">Description</h3>
              <p className="text-sm text-gray-600">{template.description}</p>
            </div>
          )}

          {/* Author */}
          {template.author && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-300">Author</h3>
              <p className="text-sm text-gray-600">{template.author}</p>
            </div>
          )}

          {/* Tags */}
          {!isWorkflow && template.tags && template.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {template.tags.map(tag => (
                  <span key={tag} className="text-xs px-2 py-1 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Workflow-specific details */}
          {isWorkflow && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-300">Schedule</h3>
                <p className="text-sm text-gray-600 font-mono">{template.schedule}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-300">Execution Mode</h3>
                <p className="text-sm text-gray-600 capitalize">{template.executionMode}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-1 dark:text-gray-300">Status</h3>
                <p className="text-sm text-gray-600">{template.enabled ? '✓ Enabled' : '○ Disabled'}</p>
              </div>

              {/* Targeting */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">Targeting</h3>
                <div className="space-y-2 text-sm">
                  {template.targeting.communities.length > 0 && (
                    <div>
                      <span className="text-gray-500">Communities:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.targeting.communities.map((c, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.targeting.groups.length > 0 && (
                    <div>
                      <span className="text-gray-500">Groups:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.targeting.groups.map((g, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700">
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.targeting.tags.length > 0 && (
                    <div>
                      <span className="text-gray-500">Tags:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.targeting.tags.map((t, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-700">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.targeting.agents.length > 0 && (
                    <div>
                      <span className="text-gray-500">Agents:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.targeting.agents.map((a, i) => (
                          <span key={i} className="text-xs px-2 py-1 rounded bg-green-50 text-green-600 border border-green-200">
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {template.targeting.communities.length === 0 &&
                   template.targeting.groups.length === 0 &&
                   template.targeting.tags.length === 0 &&
                   template.targeting.agents.length === 0 && (
                    <span className="text-xs text-gray-400 italic">No targeting configured</span>
                  )}
                </div>
              </div>

              {/* Workflow Content Preview */}
              {template.content && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">Content Preview</h3>
                  <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-60 text-gray-700 whitespace-pre-wrap dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                    {template.content.substring(0, 500)}{template.content.length > 500 ? '...' : ''}
                  </pre>
                </div>
              )}
            </>
          )}

          {/* Agents */}
          {!isWorkflow && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">
              Agents ({template.agents.length})
            </h3>
            <div className="space-y-2">
              {template.agents.map((agent, idx) => (
                <div key={idx} className="bg-gray-50 rounded px-3 py-2 text-sm dark:bg-gray-900">
                  <div className="font-mono text-sky-600">{agent.id}</div>
                  <div className="text-gray-600">{agent.role}</div>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Communities & Groups (for org templates) */}
          {isOrg && template.communities && template.communities.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">
                Communities ({template.communities.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {template.communities.map((comm, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700">
                    {comm.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isOrg && template.groups && template.groups.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">
                Groups ({template.groups.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {template.groups.map((group, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 rounded bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-700">
                    {group.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Metadata (for agent templates) */}
          {!isOrg && template.metadata && (
            <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded p-3 text-xs space-y-1">
              <div className="font-semibold text-sky-700 dark:text-sky-400">Template Metadata</div>
              {template.metadata.model && (
                <div className="text-sky-600 dark:text-sky-400">Model: {template.metadata.model}</div>
              )}
              {template.metadata.createdAt && (
                <div className="text-sky-600 dark:text-sky-400">Created: {new Date(template.metadata.createdAt).toLocaleDateString()}</div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            {isOrg && onApply && (
              <button
                onClick={onApply}
                className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm font-medium"
              >
                ⚡ Apply Template
              </button>
            )}
            {isWorkflow && onInstantiate && (
              <button
                onClick={onInstantiate}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
              >
                ▶ Run Workflow
              </button>
            )}
            {isWorkflow && onEdit && (
              <button
                onClick={onEdit}
                className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700 transition-colors text-sm font-medium"
              >
                ✏️ Edit Workflow
              </button>
            )}
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
            >
              {isWorkflow ? 'Delete Workflow' : 'Delete Template'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm dark:bg-gray-800 dark:text-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WorkflowTemplateCard({ template, onClick, selected }: { template: WorkflowTemplate; onClick: () => void; selected: boolean }) {
  const targetingCount =
    template.targeting.communities.length +
    template.targeting.groups.length +
    template.targeting.tags.length +
    template.targeting.agents.length

  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-gray-800 rounded-lg border p-4 shadow-sm hover:shadow-md transition-all cursor-pointer ${
        selected ? 'border-sky-400 ring-2 ring-sky-100' : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight flex-1 dark:text-gray-100">
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
    </div>
  )
}
