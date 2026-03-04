import React, { useEffect, useState } from 'react'
import { useToast } from '../components/Toast'
import WorkflowEditorDialog from '../components/WorkflowEditorDialog'

interface AgentTargeting {
  communities: string[]
  groups: string[]
  tags: string[]
  agents: string[]
}

interface Workflow {
  id: string
  name: string
  description: string
  schedule: string
  enabled: boolean
  executionMode: 'automated' | 'managed'
  owner?: string
  created: string
  modified: string
  author: string
  participantCount: number
  targeting: AgentTargeting
}

interface WorkflowDetails extends Workflow {
  targeting: AgentTargeting
  content: string
  scheduleHuman: string
}

interface WorkflowExecution {
  id: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  triggerType: 'scheduled' | 'manual' | 'agent'
  participantCount: number
  successCount: number
  failureCount: number
}

interface WorkflowsProps {
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToGroup?: (groupName: string) => void
  onNavigateToCommunity?: (communityName: string) => void
}

export default function Workflows({ onNavigateToAgent, onNavigateToGroup, onNavigateToCommunity }: WorkflowsProps = {}) {
  const { showSuccess, showError } = useToast()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDetails | null>(null)
  const [executions, setExecutions] = useState<WorkflowExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [showEditorDialog, setShowEditorDialog] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDetails | null>(null)
  const [workspacePath, setWorkspacePath] = useState('')

  // Get workspace path
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(data => setWorkspacePath(data.workspace || ''))
      .catch(() => {})
  }, [])

  const fetchWorkflows = () => {
    setLoading(true)
    fetch('/api/workflows')
      .then(r => r.json())
      .then(data => {
        setWorkflows(data.workflows || [])
        setLoading(false)
      })
      .catch(err => {
        showError('Failed to load workflows')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchWorkflows()
  }, [])

  const fetchWorkflowDetails = async (id: string) => {
    try {
      const [workflowResp, executionsResp] = await Promise.all([
        fetch(`/api/workflows/${id}`),
        fetch(`/api/workflows/${id}/executions?limit=10`)
      ])

      const workflow = await workflowResp.json()
      const executionsData = await executionsResp.json()

      setSelectedWorkflow(workflow)
      setExecutions(executionsData.executions || [])
      setShowDetailPanel(true)
    } catch (err) {
      showError('Failed to load workflow details')
    }
  }

  const handleToggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      const resp = await fetch(`/api/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      })

      if (!resp.ok) throw new Error('Failed to update')

      showSuccess(`Workflow ${!currentEnabled ? 'enabled' : 'disabled'}`)
      fetchWorkflows()

      if (selectedWorkflow?.id === id) {
        fetchWorkflowDetails(id)
      }
    } catch (err) {
      showError('Failed to toggle workflow')
    }
  }

  const handleDelete = async (id: string) => {
    const workflow = workflows.find(w => w.id === id)
    if (!workflow || !confirm(`Delete workflow "${workflow.name}"?`)) return

    try {
      const resp = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE'
      })

      if (!resp.ok) throw new Error('Failed to delete')

      showSuccess(`Deleted workflow "${workflow.name}"`)
      fetchWorkflows()

      if (selectedWorkflow?.id === id) {
        setSelectedWorkflow(null)
        setShowDetailPanel(false)
      }
    } catch (err) {
      showError('Failed to delete workflow')
    }
  }

  const handleCreateWorkflow = async (data: any) => {
    try {
      const resp = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          schedule: data.schedule,
          enabled: data.enabled,
          targeting: data.targeting,
          author: 'dashboard',
          executionMode: data.executionMode,
          owner: data.owner,
          content: data.content
        })
      })

      if (!resp.ok) {
        const error = await resp.json()
        throw new Error(error.details || 'Failed to create workflow')
      }

      showSuccess('Workflow created successfully')
      fetchWorkflows()
    } catch (err: any) {
      showError(err.message || 'Failed to create workflow')
      throw err
    }
  }

  const handleEditWorkflow = async (data: any) => {
    if (!editingWorkflow) return

    try {
      const resp = await fetch(`/api/workflows/${editingWorkflow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          schedule: data.schedule,
          enabled: data.enabled,
          targeting: data.targeting,
          executionMode: data.executionMode,
          owner: data.owner,
          content: data.content
        })
      })

      if (!resp.ok) {
        const error = await resp.json()
        throw new Error(error.details || 'Failed to update workflow')
      }

      showSuccess('Workflow updated successfully')
      fetchWorkflows()

      // Refresh detail panel if it's still open
      if (selectedWorkflow?.id === editingWorkflow.id) {
        fetchWorkflowDetails(editingWorkflow.id)
      }

      setEditingWorkflow(null)
    } catch (err: any) {
      showError(err.message || 'Failed to update workflow')
      throw err
    }
  }

  // Get all unique tags from workflow targeting
  const allTags = React.useMemo(() => {
    const tags = new Set<string>()
    workflows.forEach(w => {
      w.targeting.tags.forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  }, [workflows])

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  // Filter workflows by search query and selected tags
  const filteredWorkflows = React.useMemo(() => {
    let filtered = workflows

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      filtered = filtered.filter(w =>
        w.name.toLowerCase().includes(query) ||
        w.description.toLowerCase().includes(query) ||
        w.id.toLowerCase().includes(query)
      )
    }

    // Filter by selected tags
    if (selectedTags.size > 0) {
      filtered = filtered.filter(w =>
        w.targeting.tags.some(t => selectedTags.has(t))
      )
    }

    return filtered
  }, [workflows, searchQuery, selectedTags])

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Workflows</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Scheduled tasks and multi-agent coordination
            </p>
          </div>
          <button
            onClick={() => setShowEditorDialog(true)}
            className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-md hover:bg-sky-700 transition-colors"
          >
            + New Workflow
          </button>
        </div>

        {/* Search */}
        <div className="mt-4 relative">
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400 font-medium">Filter by tags:</span>
              <button
                onClick={() => setSelectedTags(new Set())}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                  selectedTags.size === 0
                    ? 'bg-sky-600 text-white border border-sky-600'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
                }`}
              >
                All
              </button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                    selectedTags.has(tag)
                      ? 'bg-sky-600 text-white border border-sky-600'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading workflows...</div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            {searchQuery ? 'No workflows match your search' : 'No workflows yet'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkflows.map(workflow => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                workspacePath={workspacePath}
                onClick={() => fetchWorkflowDetails(workflow.id)}
                onToggle={(enabled) => handleToggleEnabled(workflow.id, enabled)}
                onDelete={() => handleDelete(workflow.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel Slide-out */}
      {showDetailPanel && selectedWorkflow && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowDetailPanel(false)}
          />

          {/* Panel */}
          <div className="fixed top-0 right-0 bottom-0 w-full md:w-2/3 lg:w-1/2 bg-white shadow-2xl z-50 overflow-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">{selectedWorkflow.name}</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setEditingWorkflow(selectedWorkflow)
                    setShowDetailPanel(false)
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50 rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowDetailPanel(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Status and basic info */}
              <div className="flex items-center gap-4">
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  selectedWorkflow.enabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {selectedWorkflow.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  selectedWorkflow.executionMode === 'automated'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {selectedWorkflow.executionMode === 'automated' ? 'Automated' : 'Managed'}
                </span>
                {selectedWorkflow.owner && (
                  <span className="text-xs text-gray-500">
                    Owner: <span className="font-medium">{selectedWorkflow.owner}</span>
                  </span>
                )}
              </div>

              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
                <p className="text-sm text-gray-600">{selectedWorkflow.description}</p>
              </div>

              {/* Schedule */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Schedule</h3>
                <p className="text-sm text-gray-900 font-mono">{selectedWorkflow.schedule}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedWorkflow.scheduleHuman}</p>
              </div>

              {/* Participants */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Target Agents ({selectedWorkflow.participantCount})
                </h3>
                <div className="space-y-2">
                  {selectedWorkflow.targeting.communities.length > 0 && (
                    <div className="text-sm">
                      <span className="text-gray-500">Communities:</span>{' '}
                      {selectedWorkflow.targeting.communities.map((community, idx) => (
                        <React.Fragment key={community}>
                          {idx > 0 && ', '}
                          <button
                            onClick={() => onNavigateToCommunity?.(community)}
                            className="text-sky-600 hover:text-sky-700 hover:underline"
                          >
                            {community}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                  {selectedWorkflow.targeting.groups.length > 0 && (
                    <div className="text-sm">
                      <span className="text-gray-500">Groups:</span>{' '}
                      {selectedWorkflow.targeting.groups.map((group, idx) => (
                        <React.Fragment key={group}>
                          {idx > 0 && ', '}
                          <button
                            onClick={() => onNavigateToGroup?.(group)}
                            className="text-sky-600 hover:text-sky-700 hover:underline"
                          >
                            {group}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                  {selectedWorkflow.targeting.tags.length > 0 && (
                    <div className="text-sm">
                      <span className="text-gray-500">Tags:</span>{' '}
                      <span className="text-gray-900">{selectedWorkflow.targeting.tags.join(', ')}</span>
                    </div>
                  )}
                  {selectedWorkflow.targeting.agents.length > 0 && (
                    <div className="text-sm">
                      <span className="text-gray-500">Specific Agents:</span>{' '}
                      {selectedWorkflow.targeting.agents.map((agent, idx) => (
                        <React.Fragment key={agent}>
                          {idx > 0 && ', '}
                          <button
                            onClick={() => onNavigateToAgent?.(agent)}
                            className="text-sky-600 hover:text-sky-700 hover:underline"
                          >
                            {agent}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                  {selectedWorkflow.participantCount === 0 && (
                    <p className="text-sm text-gray-500">No agents match the targeting criteria</p>
                  )}
                </div>
              </div>

              {/* Content */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Workflow Content</h3>
                <pre className="text-xs text-gray-700 bg-gray-50 p-4 rounded border border-gray-200 overflow-x-auto whitespace-pre-wrap">
                  {selectedWorkflow.content}
                </pre>
              </div>

              {/* Recent Executions */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent Executions</h3>
                {executions.length === 0 ? (
                  <p className="text-sm text-gray-500">No execution history</p>
                ) : (
                  <div className="space-y-2">
                    {executions.map(exec => (
                      <div
                        key={exec.id}
                        className="text-sm border border-gray-200 rounded p-3 bg-gray-50"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            exec.status === 'completed' ? 'bg-green-100 text-green-700' :
                            exec.status === 'failed' ? 'bg-red-100 text-red-700' :
                            exec.status === 'running' ? 'bg-blue-100 text-blue-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {exec.status}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(exec.startedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600">
                          {exec.participantCount} agents · {exec.successCount} succeeded · {exec.failureCount} failed
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-1">
                <div>ID: <span className="font-mono">{selectedWorkflow.id}</span></div>
                <div>Created: {new Date(selectedWorkflow.created).toLocaleString()}</div>
                <div>Modified: {new Date(selectedWorkflow.modified).toLocaleString()}</div>
                <div>Author: {selectedWorkflow.author}</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Create Dialog */}
      <WorkflowEditorDialog
        isOpen={showEditorDialog}
        onClose={() => setShowEditorDialog(false)}
        onSave={handleCreateWorkflow}
        mode="create"
      />

      {/* Edit Dialog */}
      {editingWorkflow && (
        <WorkflowEditorDialog
          isOpen={!!editingWorkflow}
          onClose={() => setEditingWorkflow(null)}
          onSave={handleEditWorkflow}
          initialData={{
            name: editingWorkflow.name,
            description: editingWorkflow.description,
            schedule: editingWorkflow.schedule,
            enabled: editingWorkflow.enabled,
            executionMode: editingWorkflow.executionMode,
            owner: editingWorkflow.owner,
            targeting: editingWorkflow.targeting,
            content: editingWorkflow.content
          }}
          mode="edit"
        />
      )}
    </div>
  )
}

function WorkflowCard({ workflow, workspacePath, onClick, onToggle, onDelete }: {
  workflow: Workflow
  workspacePath: string
  onClick: () => void
  onToggle: (currentEnabled: boolean) => void
  onDelete: () => void
}) {
  const [showMenu, setShowMenu] = React.useState(false)

  const handleOpenFile = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const filePath = `${workspacePath}/WORKFLOWS/${workflow.id}.md`

    try {
      const resp = await fetch('/api/open-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      })

      if (!resp.ok) {
        const error = await resp.json()
        console.error('Failed to open file:', error.error || 'Unknown error')
      }
    } catch (err) {
      console.error('Failed to open file:', err)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow cursor-pointer relative">
      <div onClick={onClick}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 text-sm">{workflow.name}</h3>
            <button
              onClick={handleOpenFile}
              className="text-gray-400 hover:text-sky-600 transition-colors"
              title="Open file in editor"
            >
              📄
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              workflow.enabled ? 'bg-green-400' : 'bg-gray-300'
            }`} />
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1"
              title="Actions"
            >
              ⋮
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-600 mb-3 line-clamp-2">{workflow.description}</p>

        <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
          <span className="font-mono">{workflow.schedule}</span>
          <span>·</span>
          <span>{workflow.participantCount} agents</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
            workflow.executionMode === 'automated'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-purple-100 text-purple-700'
          }`}>
            {workflow.executionMode}
          </span>
          {workflow.owner && (
            <span className="text-xs text-gray-500">→ {workflow.owner}</span>
          )}
        </div>
      </div>

      {/* Actions Menu Dropdown */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
          />
          <div className="absolute right-4 top-12 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
            <button
              onClick={handleOpenFile}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
            >
              📄 Open File
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(workflow.enabled); setShowMenu(false); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {workflow.enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
