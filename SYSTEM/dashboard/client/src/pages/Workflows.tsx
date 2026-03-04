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

export default function Workflows() {
  const { showSuccess, showError } = useToast()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDetails | null>(null)
  const [executions, setExecutions] = useState<WorkflowExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [showEditorDialog, setShowEditorDialog] = useState(false)

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

  // Filter workflows by search query
  const filteredWorkflows = React.useMemo(() => {
    if (!searchQuery.trim()) return workflows
    const query = searchQuery.trim().toLowerCase()
    return workflows.filter(w =>
      w.name.toLowerCase().includes(query) ||
      w.description.toLowerCase().includes(query) ||
      w.id.toLowerCase().includes(query)
    )
  }, [workflows, searchQuery])

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
        <div className="mt-4">
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
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
              <button
                onClick={() => setShowDetailPanel(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
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
                      <span className="text-gray-900">{selectedWorkflow.targeting.communities.join(', ')}</span>
                    </div>
                  )}
                  {selectedWorkflow.targeting.groups.length > 0 && (
                    <div className="text-sm">
                      <span className="text-gray-500">Groups:</span>{' '}
                      <span className="text-gray-900">{selectedWorkflow.targeting.groups.join(', ')}</span>
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
                      <span className="text-gray-900">{selectedWorkflow.targeting.agents.join(', ')}</span>
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

      {/* Editor Dialog */}
      <WorkflowEditorDialog
        isOpen={showEditorDialog}
        onClose={() => setShowEditorDialog(false)}
        onSave={handleCreateWorkflow}
        mode="create"
      />
    </div>
  )
}

function WorkflowCard({ workflow, onClick, onToggle, onDelete }: {
  workflow: Workflow
  onClick: () => void
  onToggle: (currentEnabled: boolean) => void
  onDelete: () => void
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow cursor-pointer">
      <div onClick={onClick}>
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-gray-900 text-sm">{workflow.name}</h3>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              workflow.enabled ? 'bg-green-400' : 'bg-gray-300'
            }`} />
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

      {/* Actions */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(workflow.enabled); }}
          className="text-xs px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
        >
          {workflow.enabled ? 'Disable' : 'Enable'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-xs px-3 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-700 font-medium transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
