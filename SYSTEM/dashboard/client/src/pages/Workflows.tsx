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

interface WorkflowExecutionParticipant {
  agentId: string
  agentName: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  result?: any
  error?: string
}

interface WorkflowExecutionDetails {
  id: string
  workflowId: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  triggerType: 'scheduled' | 'manual' | 'agent'
  triggeredBy?: string
  participants: WorkflowExecutionParticipant[]
  logs: string[]
}

interface WorkflowsProps {
  onNavigateToAgent?: (agentId: string) => void
  onNavigateToGroup?: (groupName: string) => void
  onNavigateToCommunity?: (communityName: string) => void
  onNavigateToDoc?: (file: string) => void
  initialWorkflowId?: string
}

// Helper function to strip YAML frontmatter from markdown content
function stripFrontmatter(content: string): string {
  // Match YAML frontmatter: starts with ---, ends with ---
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/
  const match = content.match(frontmatterRegex)
  if (match) {
    return content.slice(match[0].length).trim()
  }
  return content.trim()
}

export default function Workflows({ onNavigateToAgent, onNavigateToGroup, onNavigateToCommunity, onNavigateToDoc, initialWorkflowId }: WorkflowsProps = {}) {
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
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<Set<string>>(new Set())
  const [runningWorkflows, setRunningWorkflows] = useState<Set<string>>(new Set())
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecutionDetails | null>(null)
  const [showExecutionPanel, setShowExecutionPanel] = useState(false)
  const [executionWorkflow, setExecutionWorkflow] = useState<WorkflowDetails | null>(null)
  const [executionsList, setExecutionsList] = useState<WorkflowExecution[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [executionsPage, setExecutionsPage] = useState(1)
  const executionsPerPage = 5
  const [showArchivedModal, setShowArchivedModal] = useState(false)
  const [archivedExecutions, setArchivedExecutions] = useState<WorkflowExecution[]>([])
  const [archivedWorkflowId, setArchivedWorkflowId] = useState<string | null>(null)
  const [trackedExecutions, setTrackedExecutions] = useState<Map<string, { status: string; executionId: string; workflowName: string }>>(new Map())

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

  // Poll for running workflows and detect completions
  useEffect(() => {
    const checkRunningWorkflows = async () => {
      try {
        console.log('[Workflow Toast] Polling workflows...', workflows.length, 'workflows')
        const workflowIds = workflows.map(w => w.id)
        const checks = await Promise.all(
          workflowIds.map(async id => {
            const workflow = workflows.find(w => w.id === id)
            // Fetch recent executions (limit=5) to catch newly triggered ones
            const res = await fetch(`/api/workflows/${id}/executions?limit=5`)
            const data = await res.json()
            const executions = data.executions || []
            const latest = executions[0]
            return {
              id,
              isRunning: latest?.status === 'running',
              executions, // Return all executions to check tracked ones
              execution: latest,
              workflowName: workflow?.name || id
            }
          })
        )

        const running = new Set(checks.filter(c => c.isRunning).map(c => c.id))

        // Check for completion transitions and show toasts
        setTrackedExecutions(prev => {
          console.log('[Workflow Toast] Current trackedExecutions:', prev.size, Array.from(prev.keys()))
          const next = new Map(prev)

          for (const check of checks) {
            // Check ALL recent executions for this workflow, not just the latest
            for (const execution of check.executions || []) {
              const key = `${check.id}:${execution.id}`
              const tracked = prev.get(key)

              console.log('[Workflow Toast] Checking execution:', {
                key,
                executionStatus: execution.status,
                wasTracked: !!tracked,
                trackedStatus: tracked?.status
              })

              // Detect transition from running/pending to completed/failed
              const wasInProgress = tracked && (tracked.status === 'running' || tracked.status === 'pending')
              const isComplete = execution.status === 'completed' || execution.status === 'failed'

              if (wasInProgress && isComplete) {
                const status = execution.status
                const isSuccess = status === 'completed'
                const icon = isSuccess ? '✅' : '❌'
                const successRate = execution.participantCount > 0
                  ? `${execution.successCount}/${execution.participantCount}`
                  : '0/0'

                console.log(`[Workflow Toast] TRANSITION DETECTED! ${check.workflowName} ${tracked.status} → ${status}`)
                console.log('[Workflow Toast] Showing toast with showSuccess:', typeof showSuccess)

                if (isSuccess) {
                  showSuccess(`${icon} ${check.workflowName} completed (${successRate} agents)`)
                } else {
                  showError(`${icon} ${check.workflowName} ${status} (${successRate} agents)`)
                }

                // Refresh the workflow details if it's currently selected
                if (selectedWorkflow?.id === check.id) {
                  // Inline refresh to avoid circular dependency
                  fetch(`/api/workflows/${check.id}`).then(r => r.json()).then(workflow => {
                    setSelectedWorkflow(workflow)
                  }).catch(() => {})
                  fetch(`/api/workflows/${check.id}/executions?limit=10`).then(r => r.json()).then(data => {
                    const sortedExecutions = (data.executions || []).sort((a: WorkflowExecution, b: WorkflowExecution) => {
                      if (a.status === 'running' && b.status !== 'running') return -1
                      if (a.status !== 'running' && b.status === 'running') return 1
                      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
                    })
                    setExecutions(sortedExecutions)
                  }).catch(() => {})
                }
              }

              // Track all non-complete execution states
              const isInProgress = execution.status === 'running' || execution.status === 'pending'
              if (isInProgress || wasInProgress) {
                console.log('[Workflow Toast] Tracking execution:', key, execution.status)
                next.set(key, {
                  status: execution.status,
                  executionId: execution.id,
                  workflowName: check.workflowName
                })
              } else {
                // Clean up completed executions after notification
                if (tracked) {
                  console.log('[Workflow Toast] Cleaning up tracked execution:', key)
                  next.delete(key)
                }
              }
            }
          }

          console.log('[Workflow Toast] Updated trackedExecutions:', next.size, Array.from(next.keys()))
          return next
        })

        setRunningWorkflows(running)
      } catch (err) {
        console.error('[Workflow Toast] Error checking running workflows:', err)
      }
    }

    if (workflows.length > 0) {
      console.log('[Workflow Toast] Setting up polling for', workflows.length, 'workflows')
      checkRunningWorkflows()
      const interval = setInterval(checkRunningWorkflows, 5000)
      console.log('[Workflow Toast] Polling interval set up (every 5s)')
      return () => {
        console.log('[Workflow Toast] Cleaning up polling interval')
        clearInterval(interval)
      }
    } else {
      console.log('[Workflow Toast] No workflows, skipping polling setup')
    }
  }, [workflows, selectedWorkflow, showSuccess, showError])

  // Handle initialWorkflowId
  useEffect(() => {
    if (initialWorkflowId && workflows.length > 0) {
      const workflow = workflows.find(w => w.id === initialWorkflowId)
      if (workflow) {
        fetchWorkflowDetails(initialWorkflowId)
      }
    }
  }, [initialWorkflowId, workflows])

  const fetchWorkflowDetails = async (id: string) => {
    try {
      const [workflowResp, executionsResp] = await Promise.all([
        fetch(`/api/workflows/${id}`),
        fetch(`/api/workflows/${id}/executions?limit=10`)
      ])

      const workflow = await workflowResp.json()
      const executionsData = await executionsResp.json()

      // Sort executions: running first, then by start time descending
      const sortedExecutions = (executionsData.executions || []).sort((a: WorkflowExecution, b: WorkflowExecution) => {
        // Running executions always come first
        if (a.status === 'running' && b.status !== 'running') return -1
        if (a.status !== 'running' && b.status === 'running') return 1
        // Otherwise sort by start time (most recent first)
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      })

      setSelectedWorkflow(workflow)
      setExecutions(sortedExecutions)
      setShowDetailPanel(true)
      setShowExecutionPanel(false) // Close execution panel when viewing workflow
    } catch (err) {
      showError('Failed to load workflow details')
    }
  }

  const fetchExecutionDetails = async (workflowId: string, executionId: string, silent = false) => {
    try {
      const [execResp, workflowResp, executionsResp] = await Promise.all([
        fetch(`/api/workflows/${workflowId}/executions/${executionId}`),
        fetch(`/api/workflows/${workflowId}`),
        fetch(`/api/workflows/${workflowId}/executions?limit=20`)
      ])
      if (!execResp.ok) throw new Error('Failed to fetch execution')
      const execution = await execResp.json()
      const workflow = workflowResp.ok ? await workflowResp.json() : null
      const executionsData = executionsResp.ok ? await executionsResp.json() : { executions: [] }

      // Sort executions: running first, then by start time descending
      const sortedExecutions = (executionsData.executions || []).sort((a: WorkflowExecution, b: WorkflowExecution) => {
        // Running executions always come first
        if (a.status === 'running' && b.status !== 'running') return -1
        if (a.status !== 'running' && b.status === 'running') return 1
        // Otherwise sort by start time (most recent first)
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      })

      setSelectedExecution(execution)
      setExecutionWorkflow(workflow)
      setExecutionsList(sortedExecutions)
      setShowExecutionPanel(true)
      setShowDetailPanel(false) // Close workflow panel when viewing execution
    } catch (err) {
      if (!silent) {
        showError('Failed to load execution details')
      }
    }
  }

  const fetchArchivedExecutions = async (workflowId: string) => {
    try {
      const resp = await fetch(`/api/workflows/${workflowId}/executions/archived`)
      if (!resp.ok) throw new Error('Failed to fetch archived executions')
      const data = await resp.json()
      setArchivedExecutions(data.executions || [])
      setArchivedWorkflowId(workflowId)
      setShowArchivedModal(true)
    } catch (err) {
      showError('Failed to load archived executions')
    }
  }

  const archiveExecution = async (workflowId: string, executionId: string) => {
    try {
      const resp = await fetch(`/api/workflows/${workflowId}/executions/${executionId}/archive`, {
        method: 'POST'
      })
      if (!resp.ok) throw new Error('Failed to archive execution')

      // Remove from current executions list
      setExecutions(executions.filter(e => e.id !== executionId))
      showSuccess('Execution archived')

      // If we're viewing the execution panel, refresh it
      if (selectedWorkflow) {
        const executionsResp = await fetch(`/api/workflows/${selectedWorkflow.id}/executions?limit=20`)
        const executionsData = executionsResp.ok ? await executionsResp.json() : { executions: [] }
        setExecutions(executionsData.executions || [])
      }
    } catch (err) {
      showError('Failed to archive execution')
    }
  }

  const unarchiveExecution = async (workflowId: string, executionId: string) => {
    try {
      const resp = await fetch(`/api/workflows/${workflowId}/executions/${executionId}/unarchive`, {
        method: 'POST'
      })
      if (!resp.ok) throw new Error('Failed to unarchive execution')

      // Remove from archived executions list
      setArchivedExecutions(archivedExecutions.filter(e => e.id !== executionId))
      showSuccess('Execution unarchived')

      // Refresh current executions list
      if (archivedWorkflowId) {
        const executionsResp = await fetch(`/api/workflows/${archivedWorkflowId}/executions?limit=20`)
        const executionsData = executionsResp.ok ? await executionsResp.json() : { executions: [] }
        setExecutions(executionsData.executions || [])
      }
    } catch (err) {
      showError('Failed to unarchive execution')
    }
  }

  // Poll execution details when status is running
  useEffect(() => {
    if (selectedExecution && selectedExecution.status === 'running') {
      const interval = setInterval(() => {
        fetchExecutionDetails(selectedExecution.workflowId, selectedExecution.id, true)
      }, 3000) // Poll every 3 seconds
      return () => clearInterval(interval)
    }
  }, [selectedExecution?.id, selectedExecution?.status])

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

  const toggleWorkflowSelection = (workflowId: string) => {
    const next = new Set(selectedWorkflowIds)
    if (next.has(workflowId)) next.delete(workflowId)
    else next.add(workflowId)
    setSelectedWorkflowIds(next)
  }

  const handleBulkEnable = async () => {
    const workflowsToEnable = workflows.filter(w => selectedWorkflowIds.has(w.id) && !w.enabled)
    if (workflowsToEnable.length === 0) {
      showError('No disabled workflows selected')
      return
    }

    try {
      await Promise.all(
        workflowsToEnable.map(w =>
          fetch(`/api/workflows/${w.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true })
          })
        )
      )
      showSuccess(`Enabled ${workflowsToEnable.length} workflow${workflowsToEnable.length !== 1 ? 's' : ''}`)
      fetchWorkflows()
      setSelectedWorkflowIds(new Set())
      setSelectionMode(false)
    } catch (err) {
      showError('Failed to enable workflows')
    }
  }

  const handleBulkDisable = async () => {
    const workflowsToDisable = workflows.filter(w => selectedWorkflowIds.has(w.id) && w.enabled)
    if (workflowsToDisable.length === 0) {
      showError('No enabled workflows selected')
      return
    }

    try {
      await Promise.all(
        workflowsToDisable.map(w =>
          fetch(`/api/workflows/${w.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: false })
          })
        )
      )
      showSuccess(`Disabled ${workflowsToDisable.length} workflow${workflowsToDisable.length !== 1 ? 's' : ''}`)
      fetchWorkflows()
      setSelectedWorkflowIds(new Set())
      setSelectionMode(false)
    } catch (err) {
      showError('Failed to disable workflows')
    }
  }

  const handleBulkDelete = async () => {
    if (selectedWorkflowIds.size === 0) return

    const selectedWorkflowsList = workflows.filter(w => selectedWorkflowIds.has(w.id))
    const workflowNames = selectedWorkflowsList.map(w => w.name).join(', ')

    if (!confirm(`Delete ${selectedWorkflowIds.size} workflow${selectedWorkflowIds.size !== 1 ? 's' : ''}?\n\n${workflowNames}`)) {
      return
    }

    try {
      await Promise.all(
        Array.from(selectedWorkflowIds).map(id =>
          fetch(`/api/workflows/${id}`, { method: 'DELETE' })
        )
      )
      showSuccess(`Deleted ${selectedWorkflowIds.size} workflow${selectedWorkflowIds.size !== 1 ? 's' : ''}`)
      fetchWorkflows()
      setSelectedWorkflowIds(new Set())
      setSelectionMode(false)

      // Close detail panel if showing a deleted workflow
      if (selectedWorkflow && selectedWorkflowIds.has(selectedWorkflow.id)) {
        setSelectedWorkflow(null)
        setShowDetailPanel(false)
      }
    } catch (err) {
      showError('Failed to delete workflows')
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
          <div className="flex items-center gap-2">
            {selectionMode && selectedWorkflowIds.size > 0 && (
              <>
                <span className="text-sm text-gray-600 mr-2">
                  {selectedWorkflowIds.size} selected
                </span>
                <button
                  onClick={handleBulkEnable}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                >
                  Enable Selected
                </button>
                <button
                  onClick={handleBulkDisable}
                  className="px-3 py-1.5 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700 transition-colors"
                >
                  Disable Selected
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                >
                  Delete Selected
                </button>
              </>
            )}
            <div className="flex items-center gap-1 bg-gray-200 rounded-md p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Grid view"
              >
                ⊞
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="List view"
              >
                ☰
              </button>
            </div>
            <button
              onClick={() => {
                setSelectionMode(!selectionMode)
                if (selectionMode) {
                  setSelectedWorkflowIds(new Set())
                }
              }}
              className={`text-sm font-medium px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                selectionMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title={selectionMode ? 'Exit selection mode' : 'Select multiple workflows'}
            >
              <span className="text-base leading-none">☑</span> {selectionMode ? 'Cancel' : 'Select'}
            </button>
            <button
              onClick={() => setShowEditorDialog(true)}
              className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-md hover:bg-sky-700 transition-colors"
            >
              + New Workflow
            </button>
          </div>
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
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredWorkflows.map(workflow => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                onClick={() => fetchWorkflowDetails(workflow.id)}
                onToggle={(enabled) => handleToggleEnabled(workflow.id, enabled)}
                onDelete={() => handleDelete(workflow.id)}
                onOpenFile={() => onNavigateToDoc?.(`WORKFLOWS/${workflow.id}.md`)}
                isSelected={selectedWorkflowIds.has(workflow.id)}
                onToggleSelect={selectionMode ? () => toggleWorkflowSelection(workflow.id) : undefined}
                isRunning={runningWorkflows.has(workflow.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredWorkflows.map(workflow => (
              <div
                key={workflow.id}
                className="bg-white border border-gray-200 rounded-lg hover:border-sky-300 transition-colors"
              >
                <div className="px-4 py-3 flex items-center gap-4">
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedWorkflowIds.has(workflow.id)}
                      onChange={() => toggleWorkflowSelection(workflow.id)}
                      className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                    />
                  )}
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => fetchWorkflowDetails(workflow.id)}>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{workflow.name}</h3>
                      {runningWorkflows.has(workflow.id) && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded animate-pulse">
                          Running
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                        workflow.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {workflow.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{workflow.description}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{workflow.participantCount} agents</span>
                    <span>·</span>
                    <span>{workflow.schedule || 'Manual'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleEnabled(workflow.id, !workflow.enabled)}
                      className="p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                      title={workflow.enabled ? 'Disable workflow' : 'Enable workflow'}
                    >
                      {workflow.enabled ? '⏸' : '▶'}
                    </button>
                    <button
                      onClick={() => onNavigateToDoc?.(`WORKFLOWS/${workflow.id}.md`)}
                      className="p-1.5 text-gray-400 hover:text-sky-600 hover:bg-sky-50 rounded transition-colors"
                      title="Open file"
                    >
                      📄
                    </button>
                    <button
                      onClick={() => handleDelete(workflow.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete workflow"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
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
                  onClick={async () => {
                    if (!confirm('Trigger this workflow to run now?')) return
                    try {
                      console.log('[Workflow Toast] Triggering workflow:', selectedWorkflow.id, selectedWorkflow.name)
                      const resp = await fetch(`/api/workflows/${selectedWorkflow.id}/trigger`, {
                        method: 'POST'
                      })
                      if (!resp.ok) throw new Error('Failed to trigger workflow')
                      const data = await resp.json()
                      console.log('[Workflow Toast] Trigger response:', data)
                      showSuccess('Workflow triggered successfully')
                      // Add to running workflows immediately
                      setRunningWorkflows(prev => new Set(prev).add(selectedWorkflow.id))
                      // Track the execution for completion toast
                      if (data.executionId) {
                        const key = `${selectedWorkflow.id}:${data.executionId}`
                        console.log('[Workflow Toast] Adding to tracked executions:', key, {
                          status: 'pending',
                          executionId: data.executionId,
                          workflowName: selectedWorkflow.name
                        })
                        setTrackedExecutions(prev => {
                          const next = new Map(prev)
                          next.set(key, {
                            status: 'pending',
                            executionId: data.executionId,
                            workflowName: selectedWorkflow.name
                          })
                          console.log('[Workflow Toast] trackedExecutions after add:', next.size, Array.from(next.keys()))
                          return next
                        })
                      } else {
                        console.warn('[Workflow Toast] No executionId in trigger response!')
                      }
                      // Refresh executions after 2 seconds
                      setTimeout(() => {
                        fetchWorkflowDetails(selectedWorkflow.id)
                      }, 2000)
                    } catch (err) {
                      console.error('[Workflow Toast] Failed to trigger workflow:', err)
                      showError('Failed to trigger workflow')
                    }
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
                >
                  ▶ Run Now
                </button>
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
                  {stripFrontmatter(selectedWorkflow.content) || '(No content)'}
                </pre>
              </div>

              {/* Recent Executions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-700">Recent Executions</h3>
                    <button
                      onClick={() => fetchArchivedExecutions(selectedWorkflow.id)}
                      className="px-2 py-0.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded border border-gray-300"
                      title="View archived executions"
                    >
                      📦 Archived
                    </button>
                  </div>
                  {executions.length > executionsPerPage && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExecutionsPage(p => Math.max(1, p - 1))}
                        disabled={executionsPage === 1}
                        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                      >
                        ‹ Prev
                      </button>
                      <span className="text-xs text-gray-500">
                        Page {executionsPage} of {Math.ceil(executions.length / executionsPerPage)}
                      </span>
                      <button
                        onClick={() => setExecutionsPage(p => Math.min(Math.ceil(executions.length / executionsPerPage), p + 1))}
                        disabled={executionsPage >= Math.ceil(executions.length / executionsPerPage)}
                        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed"
                      >
                        Next ›
                      </button>
                    </div>
                  )}
                </div>
                {executions.length === 0 ? (
                  <p className="text-sm text-gray-500">No execution history</p>
                ) : (
                  <div className="space-y-2">
                    {executions
                      .slice((executionsPage - 1) * executionsPerPage, executionsPage * executionsPerPage)
                      .map(exec => (
                        <div key={exec.id} className="relative group">
                          <button
                            onClick={() => fetchExecutionDetails(selectedWorkflow.id, exec.id)}
                            className="w-full text-left text-sm border border-gray-200 rounded p-3 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors"
                          >
                            <div className="flex items-center mb-1">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                exec.status === 'completed' ? 'bg-green-100 text-green-700' :
                                exec.status === 'failed' ? 'bg-red-100 text-red-700' :
                                exec.status === 'running' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                'bg-yellow-100 text-yellow-700'
                              }`}>
                                {exec.status}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 mb-1">
                              {exec.participantCount} agents · {exec.successCount} succeeded · {exec.failureCount} failed
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(exec.startedAt).toLocaleString()}
                            </div>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              archiveExecution(selectedWorkflow.id, exec.id)
                            }}
                            className="absolute top-2 right-9 p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Archive execution"
                          >
                            📦
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm(`Delete execution ${exec.id}?`)) {
                                fetch(`/api/workflows/${selectedWorkflow.id}/executions/${exec.id}`, { method: 'DELETE' })
                                  .then(() => {
                                    setExecutions(executions.filter(e => e.id !== exec.id))
                                    showSuccess('Execution deleted')
                                  })
                                  .catch(() => showError('Failed to delete execution'))
                              }
                            }}
                            className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete execution"
                          >
                            🗑
                          </button>
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

      {/* Execution Detail Panel */}
      {showExecutionPanel && selectedExecution && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowExecutionPanel(false)}
          />
          <div className="fixed right-0 top-0 bottom-0 w-2/3 bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setShowExecutionPanel(false)
                      if (executionWorkflow) {
                        fetchWorkflowDetails(executionWorkflow.id)
                      }
                    }}
                    className="text-gray-400 hover:text-gray-600 text-xl"
                    title="Back to workflow"
                  >
                    ←
                  </button>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Execution Details</h2>
                    {executionWorkflow && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Workflow: <span className="font-medium">{executionWorkflow.name}</span>
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowExecutionPanel(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* Execution selector */}
              {executionsList.length > 1 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 font-medium">View execution:</label>
                  <select
                    value={selectedExecution.id}
                    onChange={(e) => fetchExecutionDetails(selectedExecution.workflowId, e.target.value)}
                    className="text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {executionsList.map(exec => (
                      <option key={exec.id} value={exec.id}>
                        {new Date(exec.startedAt).toLocaleString()} - {exec.status} ({exec.successCount}/{exec.participantCount})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="p-6 space-y-6">
              {/* Status and timing */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Status</h3>
                <div className="flex items-center gap-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${
                    selectedExecution.status === 'completed' ? 'bg-green-100 text-green-700' :
                    selectedExecution.status === 'failed' ? 'bg-red-100 text-red-700' :
                    selectedExecution.status === 'running' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {selectedExecution.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    Trigger: {selectedExecution.triggerType}
                    {selectedExecution.triggeredBy && ` by ${selectedExecution.triggeredBy}`}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-600 space-y-1">
                  <div>Started: {new Date(selectedExecution.startedAt).toLocaleString()}</div>
                  {selectedExecution.completedAt && (
                    <div>Completed: {new Date(selectedExecution.completedAt).toLocaleString()}</div>
                  )}
                </div>
              </div>

              {/* Workflow Targeting */}
              {executionWorkflow && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Workflow Targets</h3>
                  <div className="space-y-2">
                    {executionWorkflow.targeting.groups.length > 0 && (
                      <div className="text-sm">
                        <span className="text-gray-500">Groups:</span>{' '}
                        {executionWorkflow.targeting.groups.map((group, idx) => (
                          <React.Fragment key={group}>
                            {idx > 0 && ', '}
                            <button
                              onClick={() => onNavigateToGroup?.(group)}
                              className="text-sky-600 hover:text-sky-700 hover:underline font-medium"
                            >
                              {group}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                    {executionWorkflow.targeting.communities.length > 0 && (
                      <div className="text-sm">
                        <span className="text-gray-500">Communities:</span>{' '}
                        {executionWorkflow.targeting.communities.map((community, idx) => (
                          <React.Fragment key={community}>
                            {idx > 0 && ', '}
                            <button
                              onClick={() => onNavigateToCommunity?.(community)}
                              className="text-sky-600 hover:text-sky-700 hover:underline font-medium"
                            >
                              {community}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                    {executionWorkflow.targeting.tags.length > 0 && (
                      <div className="text-sm">
                        <span className="text-gray-500">Tags:</span>{' '}
                        <span className="text-gray-900">{executionWorkflow.targeting.tags.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Participants */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Participants ({selectedExecution.participants.length})
                </h3>
                {selectedExecution.participants.length === 0 ? (
                  <p className="text-sm text-gray-500">No participants</p>
                ) : (
                  <div className="space-y-2">
                    {selectedExecution.participants.map(participant => (
                      <div
                        key={participant.agentId}
                        className="border border-gray-200 rounded p-3 bg-gray-50"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <button
                            onClick={() => onNavigateToAgent?.(participant.agentId)}
                            className="text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
                          >
                            {participant.agentName}
                          </button>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            participant.status === 'completed' ? 'bg-green-100 text-green-700' :
                            participant.status === 'failed' ? 'bg-red-100 text-red-700' :
                            participant.status === 'running' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {participant.status}
                          </span>
                        </div>
                        {participant.error && (
                          <div className="text-xs text-red-600 mt-1 bg-red-50 p-2 rounded">
                            Error: {participant.error}
                          </div>
                        )}
                        {participant.result && (
                          <div className="text-xs text-gray-600 mt-1">
                            Result: <pre className="inline font-mono">{JSON.stringify(participant.result, null, 2)}</pre>
                          </div>
                        )}
                        {participant.startedAt && (
                          <div className="text-xs text-gray-500 mt-1">
                            Started: {new Date(participant.startedAt).toLocaleString()}
                          </div>
                        )}
                        {participant.completedAt && (
                          <div className="text-xs text-gray-500">
                            Completed: {new Date(participant.completedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Logs */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Execution Logs</h3>
                {selectedExecution.logs.length === 0 ? (
                  <p className="text-sm text-gray-500">No logs available</p>
                ) : (
                  <div className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-xs overflow-x-auto">
                    {selectedExecution.logs.map((log, idx) => (
                      <div key={idx} className="whitespace-pre-wrap">{log}</div>
                    ))}
                  </div>
                )}
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

      {/* Archived Executions Modal */}
      {showArchivedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowArchivedModal(false)}>
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Archived Executions</h2>
              <button
                onClick={() => setShowArchivedModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {archivedExecutions.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No archived executions</p>
              ) : (
                <div className="space-y-2">
                  {archivedExecutions.map(exec => (
                    <div key={exec.id} className="relative group border border-gray-200 rounded p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center mb-1">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                          exec.status === 'completed' ? 'bg-green-100 text-green-700' :
                          exec.status === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {exec.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mb-1">
                        {exec.participantCount} agents · {exec.successCount} succeeded · {exec.failureCount} failed
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(exec.startedAt).toLocaleString()}
                      </div>
                      <button
                        onClick={() => archivedWorkflowId && unarchiveExecution(archivedWorkflowId, exec.id)}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Unarchive execution"
                      >
                        ↩️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200">
              <button
                onClick={() => setShowArchivedModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function WorkflowCard({ workflow, onClick, onToggle, onDelete, onOpenFile, isSelected, onToggleSelect, isRunning }: {
  workflow: Workflow
  onClick: () => void
  onToggle: (currentEnabled: boolean) => void
  onDelete: () => void
  onOpenFile: () => void
  isSelected?: boolean
  onToggleSelect?: () => void
  isRunning?: boolean
}) {
  const [showMenu, setShowMenu] = React.useState(false)

  return (
    <div className={`border rounded-lg p-4 bg-white hover:shadow-md transition-shadow cursor-pointer relative ${
      isSelected ? 'border-blue-500 border-2 bg-blue-50' : 'border-gray-200'
    }`}>
      <div onClick={onToggleSelect || onClick}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation()
                  onToggleSelect()
                }}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            )}
            <h3 className="font-semibold text-gray-900 text-sm">{workflow.name}</h3>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenFile()
              }}
              className="text-gray-400 hover:text-sky-600 transition-colors text-base"
              title="Open file in Documents"
            >
              📄
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${
              workflow.enabled ? 'bg-green-400' : 'bg-gray-300'
            } ${isRunning ? 'animate-pulse' : ''}`} />
            {!onToggleSelect && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1"
                title="Actions"
              >
                ⋮
              </button>
            )}
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

      {/* Actions Menu Dropdown - only show when not in selection mode */}
      {showMenu && !onToggleSelect && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
          />
          <div className="absolute right-4 top-12 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenFile(); setShowMenu(false); }}
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
