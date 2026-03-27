import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useToast } from '../components/Toast'
import WorkflowEditorDialog from '../components/WorkflowEditorDialog'
import { ConfirmDeleteDialog } from '../components/ConfirmDeleteDialog'
import { readStoredByokKeys } from '../lib/byok'

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
  scheduleHuman?: string
  nextRunAt?: string | null
  enabled: boolean
  executionMode: 'automated' | 'managed'
  owner?: string
  created: string
  modified: string
  author: string
  participantCount: number
  targeting: AgentTargeting
  maxRuns?: number
  runCount?: number
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

type WorkflowSortColumn = 'name' | 'status' | 'participants' | 'schedule' | 'mode' | 'runs' | 'updated'
type WorkflowHealthState = 'running' | 'enabled' | 'failed' | 'paused' | 'disabled'

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

function formatNextRun(nextRunAt?: string | null): string {
  if (!nextRunAt) return 'Not scheduled'
  const date = new Date(nextRunAt)
  if (Number.isNaN(date.getTime())) return 'Not scheduled'
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatNextRunRelative(nextRunAt?: string | null): string {
  if (!nextRunAt) return 'No upcoming run'
  const date = new Date(nextRunAt)
  if (Number.isNaN(date.getTime())) return 'No upcoming run'

  const diffMs = date.getTime() - Date.now()
  if (diffMs <= 0) return 'Due now'

  const diffMins = Math.round(diffMs / 60000)
  if (diffMins < 60) return `In ${diffMins}m`

  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 48) return `In ${diffHours}h`

  const diffDays = Math.round(diffHours / 24)
  return `In ${diffDays}d`
}

function getWorkflowStatusLabel(state: WorkflowHealthState): string {
  switch (state) {
    case 'running':
      return 'Running'
    case 'failed':
      return 'Failed'
    case 'paused':
      return 'Paused'
    case 'disabled':
      return 'Disabled'
    case 'enabled':
    default:
      return 'Ready'
  }
}

function getWorkflowStatusHelp(state: WorkflowHealthState, nextRunAt?: string | null): string {
  switch (state) {
    case 'running':
      return 'Workflow is actively executing now.'
    case 'failed':
      return 'Latest execution failed. Open the workflow for execution details.'
    case 'paused':
      return 'Workflow is paused and will not schedule new runs until resumed.'
    case 'disabled':
      return 'Workflow is disabled and will not run automatically.'
    case 'enabled':
    default:
      return nextRunAt
        ? `Workflow is enabled. Next run ${formatNextRun(nextRunAt)}.`
        : 'Workflow is enabled and waiting for the next valid scheduled run.'
  }
}

export default function Workflows({ onNavigateToAgent, onNavigateToGroup, onNavigateToCommunity, onNavigateToDoc, initialWorkflowId }: WorkflowsProps = {}) {
  const { showSuccess, showError } = useToast()
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDetails | null>(null)
  const [executions, setExecutions] = useState<WorkflowExecution[]>([])
  const [loading, setLoading] = useState(true)
  const [agentCosts, setAgentCosts] = useState<Record<string, number>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [showEditorDialog, setShowEditorDialog] = useState(false)
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowDetails | null>(null)
  const [showAiPrompt, setShowAiPrompt] = useState(false)
  const [aiPromptText, setAiPromptText] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiInitialData, setAiInitialData] = useState<any>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedWorkflowIds, setSelectedWorkflowIds] = useState<Set<string>>(new Set())
  const [runningWorkflows, setRunningWorkflows] = useState<Set<string>>(new Set())
  const [latestExecutionStatuses, setLatestExecutionStatuses] = useState<Record<string, WorkflowExecution['status'] | undefined>>({})
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecutionDetails | null>(null)
  const [showExecutionPanel, setShowExecutionPanel] = useState(false)
  const [executionWorkflow, setExecutionWorkflow] = useState<WorkflowDetails | null>(null)
  const [executionsList, setExecutionsList] = useState<WorkflowExecution[]>([])
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    const saved = localStorage.getItem('workflows-view-mode')
    return saved === 'list' ? 'list' : 'grid'
  })
  useEffect(() => { localStorage.setItem('workflows-view-mode', viewMode) }, [viewMode])
  const [sortColumn, setSortColumn] = useState<WorkflowSortColumn>('name')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [executionsPage, setExecutionsPage] = useState(1)
  const executionsPerPage = 5
  const [showArchivedModal, setShowArchivedModal] = useState(false)
  const [archivedExecutions, setArchivedExecutions] = useState<WorkflowExecution[]>([])
  const [archivedWorkflowId, setArchivedWorkflowId] = useState<string | null>(null)
  const [trackedExecutions, setTrackedExecutions] = useState<Map<string, { status: string; executionId: string; workflowName: string }>>(new Map())
  const [deleteDialog, setDeleteDialog] = useState<{
    itemName: string
    consequences: string[]
    onConfirm: () => Promise<void>
  } | null>(null)

  const fetchWorkflows = () => {
    setLoading(true)
    fetch('/api/workflows')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load workflows')))
      .then(data => {
        setWorkflows(Array.isArray(data.workflows) ? data.workflows : [])
        setLoading(false)
      })
      .catch(() => {
        setWorkflows([])
        showError('Failed to load workflows')
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchWorkflows()
    // Fetch metering costs per agent
    fetch('/api/metering').then(r => r.ok ? r.json() : null).then(d => {
      const costs: Record<string, number> = {}
      for (const a of Array.isArray(d?.byAgent) ? d.byAgent : []) costs[a.agentId] = a.estimatedCostUsd
      setAgentCosts(costs)
    }).catch(() => {})
  }, [])

  // Use refs to access latest values without re-creating interval
  const workflowsRef = useRef(workflows)
  const selectedWorkflowRef = useRef(selectedWorkflow)
  const showSuccessRef = useRef(showSuccess)
  const showErrorRef = useRef(showError)
  const trackedExecutionsRef = useRef(trackedExecutions)

  useEffect(() => {
    workflowsRef.current = workflows
  }, [workflows])

  useEffect(() => {
    selectedWorkflowRef.current = selectedWorkflow
  }, [selectedWorkflow])

  useEffect(() => {
    showSuccessRef.current = showSuccess
    showErrorRef.current = showError
  }, [showSuccess, showError])

  useEffect(() => {
    trackedExecutionsRef.current = trackedExecutions
  }, [trackedExecutions])

  // Poll for running workflows and detect completions
  useEffect(() => {
    const checkRunningWorkflows = async () => {
      try {
        const currentWorkflows = workflowsRef.current
        const workflowIds = currentWorkflows.map(w => w.id)
        const checks = await Promise.all(
          workflowIds.map(async id => {
            const workflow = currentWorkflows.find(w => w.id === id)
            // Fetch recent executions (limit=10) to catch fast-completing ones
            const res = await fetch(`/api/workflows/${id}/executions?limit=10`)
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
        const latestStatuses = Object.fromEntries(
          checks.map(check => [check.id, check.execution?.status as WorkflowExecution['status'] | undefined])
        )
        setLatestExecutionStatuses(latestStatuses)

        // Check for completion transitions and show toasts
        // IMPORTANT: Do this BEFORE setState so toastQueue is populated synchronously
        const toastQueue: Array<{ workflowName: string; status: string; successRate: string }> = []
        const toCheckAsync: Array<{ workflowId: string; executionId: string; workflowName: string }> = []

        const prev = trackedExecutionsRef.current
        const next = new Map(prev)
        const seenKeys = new Set<string>()
        const handledKeys = new Set<string>()

        for (const check of checks) {
          // Check ALL recent executions for this workflow, not just the latest
          for (const execution of check.executions || []) {
            const key = `${check.id}:${execution.id}`
            seenKeys.add(key)
            const tracked = prev.get(key)

            // Detect transition from running/pending to completed/failed
            const wasInProgress = tracked && (tracked.status === 'running' || tracked.status === 'pending')
            const isComplete = execution.status === 'completed' || execution.status === 'failed'

            if (wasInProgress && isComplete) {
              const status = execution.status
              const successRate = execution.participantCount > 0
                ? `${execution.successCount}/${execution.participantCount}`
                : '0/0'

              // Queue for toast
              toastQueue.push({
                workflowName: check.workflowName,
                status,
                successRate
              })

              // Mark as handled
              handledKeys.add(key)

              // Delete from Map IMMEDIATELY to prevent duplicate toasts
              next.delete(key)

              // Refresh the workflow details if it's currently selected
              if (selectedWorkflowRef.current?.id === check.id) {
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
            else if (execution.status === 'running' || execution.status === 'pending') {
              next.set(key, {
                status: execution.status,
                executionId: execution.id,
                workflowName: check.workflowName
              })
            }
            // Remove completed executions that were tracked but completed
            else if (isComplete && tracked) {
              next.delete(key)
            }
          }
        }

        // Clean up tracked executions that are no longer in recent list (likely completed)
        // Only check if they weren't already handled in the loop above
        for (const [key, tracked] of prev.entries()) {
          if (!seenKeys.has(key) && !handledKeys.has(key)) {
            const [workflowId, executionId] = key.split(':')
            // Queue for async check
            toCheckAsync.push({ workflowId, executionId, workflowName: tracked.workflowName })
            // Remove from tracking
            next.delete(key)
          }
        }

        // Update tracked executions with the new Map
        setTrackedExecutions(next)

        // Show toasts for completed executions
        for (const toast of toastQueue) {
          const isSuccess = toast.status === 'completed'
          const icon = isSuccess ? '✅' : '❌'
          if (isSuccess) {
            showSuccessRef.current(`${icon} ${toast.workflowName} completed (${toast.successRate} agents)`)
          } else {
            showErrorRef.current(`${icon} ${toast.workflowName} ${toast.status} (${toast.successRate} agents)`)
          }
        }

        // Check missing executions asynchronously
        for (const missing of toCheckAsync) {
          fetch(`/api/workflows/${missing.workflowId}/executions/${missing.executionId}`)
            .then(r => r.json())
            .then(execution => {
              if (execution.status === 'completed' || execution.status === 'failed') {
                const isSuccess = execution.status === 'completed'
                const icon = isSuccess ? '✅' : '❌'
                const successRate = execution.participantCount > 0
                  ? `${execution.successCount}/${execution.participantCount}`
                  : '0/0'

                if (isSuccess) {
                  showSuccessRef.current(`${icon} ${missing.workflowName} completed (${successRate} agents)`)
                } else {
                  showErrorRef.current(`${icon} ${missing.workflowName} ${execution.status} (${successRate} agents)`)
                }
              }
            })
            .catch(() => {})
        }

        setRunningWorkflows(running)
      } catch (err) {
        console.error('Error checking running workflows:', err)
      }
    }

    checkRunningWorkflows()
    const interval = setInterval(checkRunningWorkflows, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      // Also refresh the card list to keep counts/status in sync
      fetchWorkflows()
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
      // Only open the panel if this is not a silent polling update
      if (!silent) {
        setShowExecutionPanel(true)
        setShowDetailPanel(false) // Close workflow panel when viewing execution
      }
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
        body: JSON.stringify({
          enabled: !currentEnabled,
          // Reset run count when re-enabling so limited workflows can run again
          ...(!currentEnabled ? { runCount: 0 } : {})
        })
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

  const handleDelete = (id: string) => {
    const workflow = workflows.find(w => w.id === id)
    if (!workflow) return

    setDeleteDialog({
      itemName: workflow.name,
      consequences: getWorkflowDeleteConsequences([workflow]),
      onConfirm: async () => {
        try {
          const resp = await fetch(`/api/workflows/${workflow.id}`, {
            method: 'DELETE'
          })

          if (!resp.ok) throw new Error('Failed to delete')

          showSuccess(`Deleted workflow "${workflow.name}"`)
          fetchWorkflows()

          if (selectedWorkflow?.id === workflow.id) {
            setSelectedWorkflow(null)
            setShowDetailPanel(false)
          }

          setDeleteDialog(null)
        } catch (err) {
          showError('Failed to delete workflow')
        }
      }
    })
  }

  const handleAiGenerate = async () => {
    if (!aiPromptText.trim()) return
    setAiGenerating(true)
    try {
      const resp = await fetch('/api/workflows/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: aiPromptText.trim() }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Generation failed')
      setAiInitialData(data.workflow)
      setShowAiPrompt(false)
      setShowEditorDialog(true)
      setAiPromptText('')
      showSuccess('Workflow generated — review and save')
    } catch (err: any) {
      showError(err.message || 'Failed to generate workflow')
    } finally {
      setAiGenerating(false)
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
          content: data.content,
          maxRuns: data.maxRuns || 0
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
      const responses = await Promise.all(
        workflowsToDisable.map(async w => {
          const resp = await fetch(`/api/workflows/${w.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: false })
          })
          if (!resp.ok) {
            throw new Error(`Failed to disable ${w.name}`)
          }
          return resp
        })
      )
      if (responses.length === 0) throw new Error('No workflows disabled')
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
    if (selectedWorkflowsList.length === 0) {
      return
    }

    setDeleteDialog({
      itemName: `${selectedWorkflowsList.length} workflow${selectedWorkflowsList.length !== 1 ? 's' : ''}`,
      consequences: getWorkflowDeleteConsequences(selectedWorkflowsList),
      onConfirm: async () => {
        try {
          await Promise.all(
            selectedWorkflowsList.map(async workflow => {
              const resp = await fetch(`/api/workflows/${workflow.id}`, { method: 'DELETE' })
              if (!resp.ok) throw new Error(`Failed to delete ${workflow.name}`)
            })
          )
          showSuccess(`Deleted ${selectedWorkflowsList.length} workflow${selectedWorkflowsList.length !== 1 ? 's' : ''}`)
          fetchWorkflows()
          setSelectedWorkflowIds(new Set())
          setSelectionMode(false)

          if (selectedWorkflow && selectedWorkflowIds.has(selectedWorkflow.id)) {
            setSelectedWorkflow(null)
            setShowDetailPanel(false)
          }
          setDeleteDialog(null)
        } catch (err) {
          showError('Failed to delete workflows')
        }
      }
    })
  }

  // Get all unique tags from workflow targeting
  const allTags = React.useMemo(() => {
    const tags = new Set<string>()
    workflows.forEach(w => {
      (w.targeting?.tags || []).forEach(tag => tags.add(tag))
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

  const toggleWorkflowTagSelection = (tag: string) => {
    const matchingIds = sortedWorkflows
      .filter(workflow => workflow.targeting.tags.includes(tag))
      .map(workflow => workflow.id)

    if (matchingIds.length === 0) return

    const allSelected = matchingIds.every(id => selectedWorkflowIds.has(id))
    setSelectedWorkflowIds(prev => {
      const next = new Set(prev)
      for (const id of matchingIds) {
        if (allSelected) next.delete(id)
        else next.add(id)
      }
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

  const sortedWorkflows = React.useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    const rows = [...filteredWorkflows]

    rows.sort((a, b) => {
      switch (sortColumn) {
        case 'status': {
          const aRunning = runningWorkflows.has(a.id) ? 2 : a.enabled ? 1 : 0
          const bRunning = runningWorkflows.has(b.id) ? 2 : b.enabled ? 1 : 0
          return (aRunning - bRunning) * direction
        }
        case 'participants':
          return (a.participantCount - b.participantCount) * direction
        case 'schedule':
          return (a.scheduleHuman || a.schedule || '').localeCompare(b.scheduleHuman || b.schedule || '') * direction
        case 'mode':
          return a.executionMode.localeCompare(b.executionMode) * direction
        case 'runs': {
          const aRuns = a.maxRuns && a.maxRuns > 0 ? `${String(a.runCount || 0).padStart(6, '0')}/${String(a.maxRuns).padStart(6, '0')}` : '999999/unlimited'
          const bRuns = b.maxRuns && b.maxRuns > 0 ? `${String(b.runCount || 0).padStart(6, '0')}/${String(b.maxRuns).padStart(6, '0')}` : '999999/unlimited'
          return aRuns.localeCompare(bRuns) * direction
        }
        case 'updated':
          return (new Date(a.modified).getTime() - new Date(b.modified).getTime()) * direction
        case 'name':
        default:
          return a.name.localeCompare(b.name) * direction
      }
    })

    return rows
  }, [filteredWorkflows, sortColumn, sortDirection, runningWorkflows])

  const allVisibleSelected = sortedWorkflows.length > 0 && sortedWorkflows.every(workflow => selectedWorkflowIds.has(workflow.id))
  const selectedWorkflows = workflows.filter(workflow => selectedWorkflowIds.has(workflow.id))
  const selectedEnabledCount = selectedWorkflows.filter(workflow => workflow.enabled).length
  const selectedDisabledCount = selectedWorkflows.filter(workflow => !workflow.enabled).length

  const selectVisibleWorkflows = () => {
    setSelectedWorkflowIds(new Set(sortedWorkflows.map(w => w.id)))
  }

  const deselectVisibleWorkflows = () => {
    setSelectedWorkflowIds(new Set())
  }

  const handleSort = (column: WorkflowSortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
      return
    }

    setSortColumn(column)
    setSortDirection('asc')
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Workflows</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Scheduled tasks and multiagent coordination
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden dark:border-gray-700 bg-white dark:bg-gray-800">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'grid' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                title="Grid view"
              >
                ⊞
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700 ${viewMode === 'list' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
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
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
              title={selectionMode ? 'Exit selection mode' : 'Select multiple workflows'}
            >
              <span className="text-base leading-none">☑</span> {selectionMode ? 'Cancel' : 'Select'}
            </button>
            {selectionMode && (
              <button
                onClick={() => {
                  if (allVisibleSelected) {
                    deselectVisibleWorkflows()
                  } else {
                    selectVisibleWorkflows()
                  }
                }}
                className="text-sm font-medium px-3 py-1.5 rounded-md bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                {allVisibleSelected ? 'Deselect All' : 'Select All'}
              </button>
            )}
            <button
              onClick={() => setShowAiPrompt(true)}
              className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors"
            >
              AI Generate
            </button>
            <button
              onClick={() => { setAiInitialData(null); setShowEditorDialog(true) }}
              className="px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-md hover:bg-sky-700 transition-colors"
            >
              + New Workflow
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <input
          type="text"
          placeholder="Search workflows..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600"
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

      {/* Content */}
      <div>
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
                    : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
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
                      : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-sky-300 hover:text-sky-600'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            {selectionMode && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className="text-xs text-gray-400 font-medium">Select tag groups:</span>
                {allTags.map(tag => {
                  const matchingVisible = sortedWorkflows.filter(workflow => workflow.targeting.tags.includes(tag))
                  const allMatchingSelected = matchingVisible.length > 0 && matchingVisible.every(workflow => selectedWorkflowIds.has(workflow.id))
                  return (
                    <button
                      key={`select-${tag}`}
                      onClick={() => toggleWorkflowTagSelection(tag)}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                        allMatchingSelected
                          ? 'bg-blue-600 text-white border border-blue-600'
                          : 'bg-white dark:bg-gray-800 text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {allMatchingSelected ? 'Deselect' : 'Select'} {tag}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading workflows...</div>
        ) : sortedWorkflows.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            {searchQuery ? 'No workflows match your search' : 'No workflows yet'}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedWorkflows.map(workflow => (
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
                healthState={getWorkflowHealthState(workflow, runningWorkflows.has(workflow.id), latestExecutionStatuses[workflow.id])}
                totalCost={Object.values(agentCosts).reduce((s, c) => s + c, 0)}
              />
            ))}
          </div>
        ) : (
          <WorkflowsTable
            workflows={sortedWorkflows}
            selectionMode={selectionMode}
            selectedWorkflowIds={selectedWorkflowIds}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            onToggleSelect={toggleWorkflowSelection}
            onOpenWorkflow={fetchWorkflowDetails}
            onToggleEnabled={handleToggleEnabled}
            onDelete={handleDelete}
            onOpenFile={(workflowId) => onNavigateToDoc?.(`WORKFLOWS/${workflowId}.md`)}
            runningWorkflows={runningWorkflows}
            latestExecutionStatuses={latestExecutionStatuses}
            totalCost={Object.values(agentCosts).reduce((s, c) => s + c, 0)}
            allVisibleSelected={allVisibleSelected}
            onSelectVisible={selectVisibleWorkflows}
            onDeselectVisible={deselectVisibleWorkflows}
          />
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
          <div className="fixed top-0 right-0 bottom-0 w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-gray-800 shadow-2xl z-50 overflow-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 px-6 py-4 flex items-center justify-between dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{selectedWorkflow.name}</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    // Run immediately without confirmation
                    try {
                      console.log('[Workflow Toast] Triggering workflow:', selectedWorkflow.id, selectedWorkflow.name)
                      const resp = await fetch(`/api/workflows/${selectedWorkflow.id}/trigger`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ byok: readStoredByokKeys() }),
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
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                }`}>
                  {selectedWorkflow.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <span className={`px-2 py-1 text-xs font-medium rounded ${
                  selectedWorkflow.executionMode === 'automated'
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
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
                <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">Description</h3>
                <p className="text-sm text-gray-600">{selectedWorkflow.description}</p>
              </div>

              {/* Schedule */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">Schedule</h3>
                <p className="text-sm text-gray-900 font-mono dark:text-gray-100">{selectedWorkflow.schedule}</p>
                <p className="text-xs text-gray-500 mt-1">{selectedWorkflow.scheduleHuman}</p>
                <p className="text-xs text-sky-600 dark:text-sky-400 mt-1">
                  Next run: {formatNextRun(selectedWorkflow.nextRunAt)} · {formatNextRunRelative(selectedWorkflow.nextRunAt)}
                </p>
                {selectedWorkflow.maxRuns != null && selectedWorkflow.maxRuns > 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Run {selectedWorkflow.runCount || 0} of {selectedWorkflow.maxRuns}
                    {(selectedWorkflow.runCount || 0) >= selectedWorkflow.maxRuns ? ' — limit reached, auto-disabled' : ''}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">
                    {(selectedWorkflow.runCount || 0) > 0 ? `${selectedWorkflow.runCount} run${selectedWorkflow.runCount === 1 ? '' : 's'} completed` : 'No runs yet'} · Unlimited
                  </p>
                )}
              </div>

              {/* Participants */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">
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
                      <span className="text-gray-900 dark:text-gray-100">{selectedWorkflow.targeting.tags.join(', ')}</span>
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
                  {/* Resolved agents */}
                  {selectedWorkflow.resolvedParticipants && selectedWorkflow.resolvedParticipants.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedWorkflow.resolvedParticipants.map((p: any) => (
                        <button
                          key={p.id}
                          onClick={() => onNavigateToAgent?.(p.id)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
                          title={p.reason}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                          {p.name || p.id}
                        </button>
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
                <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">Workflow Content</h3>
                <pre className="text-xs text-gray-700 bg-gray-50 p-4 rounded border border-gray-200 overflow-x-auto whitespace-pre-wrap dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  {stripFrontmatter(selectedWorkflow.content) || '(No content)'}
                </pre>
              </div>

              {/* Recent Executions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Executions</h3>
                    <button
                      onClick={() => fetchArchivedExecutions(selectedWorkflow.id)}
                      className="px-2 py-0.5 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded border border-gray-300 dark:text-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700"
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
                        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed dark:text-gray-100"
                      >
                        ‹ Prev
                      </button>
                      <span className="text-xs text-gray-500">
                        Page {executionsPage} of {Math.ceil(executions.length / executionsPerPage)}
                      </span>
                      <button
                        onClick={() => setExecutionsPage(p => Math.min(Math.ceil(executions.length / executionsPerPage), p + 1))}
                        disabled={executionsPage >= Math.ceil(executions.length / executionsPerPage)}
                        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-not-allowed dark:text-gray-100"
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
                            className="w-full text-left text-sm border border-gray-200 rounded p-3 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700"
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
                              {exec.participantCount} agent{exec.participantCount !== 1 ? 's' : ''} · {exec.successCount} succeeded · {exec.failureCount} failed
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
              <div className="pt-4 border-t border-gray-200 text-xs text-gray-500 space-y-1 dark:border-gray-700">
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
          <div className="fixed right-0 top-0 bottom-0 w-2/3 bg-white dark:bg-gray-800 shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
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
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Execution Details</h2>
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
                    className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-gray-600"
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
                <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">Status</h3>
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
                  <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">Workflow Targets</h3>
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
                        <span className="text-gray-900 dark:text-gray-100">{executionWorkflow.targeting.tags.join(', ')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Participants */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">
                  Participants ({selectedExecution.participants.length})
                </h3>
                {selectedExecution.participants.length === 0 ? (
                  <p className="text-sm text-gray-500">No participants</p>
                ) : (
                  <div className="space-y-2">
                    {selectedExecution.participants.map(participant => (
                      <div
                        key={participant.agentId}
                        className="border border-gray-200 rounded p-3 bg-gray-50 dark:border-gray-700 dark:bg-gray-900"
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
                <h3 className="text-sm font-semibold text-gray-700 mb-2 dark:text-gray-300">Execution Logs</h3>
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
      {/* AI Generate Prompt */}
      {showAiPrompt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Generate Workflow with AI</h2>
              <button onClick={() => setShowAiPrompt(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Describe what you want the workflow to do in natural language. The AI will generate a workflow definition you can review and edit.
            </p>
            <textarea
              value={aiPromptText}
              onChange={(e) => setAiPromptText(e.target.value)}
              placeholder="e.g., Every weekday at 9am, have the engineering team share status updates and the PM summarize blockers"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px] resize-y"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && e.metaKey) handleAiGenerate() }}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowAiPrompt(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAiGenerate}
                disabled={aiGenerating || !aiPromptText.trim()}
                className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {aiGenerating ? 'Generating...' : 'Generate Workflow'}
              </button>
            </div>
          </div>
        </div>
      )}

      <WorkflowEditorDialog
        isOpen={showEditorDialog}
        onClose={() => { setShowEditorDialog(false); setAiInitialData(null) }}
        onSave={handleCreateWorkflow}
        initialData={aiInitialData || undefined}
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
            content: editingWorkflow.content,
            maxRuns: editingWorkflow.maxRuns
          }}
          mode="edit"
        />
      )}

      {/* Archived Executions Modal */}
      {showArchivedModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowArchivedModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Archived Executions</h2>
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
                    <div key={exec.id} className="relative group border border-gray-200 rounded p-3 bg-gray-50 hover:bg-gray-100 transition-colors dark:border-gray-700 dark:bg-gray-900 dark:bg-gray-800 dark:hover:bg-gray-700">
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
                        {exec.participantCount} agent{exec.participantCount !== 1 ? 's' : ''} · {exec.successCount} succeeded · {exec.failureCount} failed
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

            <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowArchivedModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedWorkflowIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 z-40 max-w-[calc(100vw-2rem)] overflow-x-auto">
          <span className="font-medium whitespace-nowrap">
            {selectedWorkflowIds.size} workflow{selectedWorkflowIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setSelectedWorkflowIds(new Set())}
            className="px-3 py-1 bg-blue-700 hover:bg-blue-800 rounded transition-colors text-sm whitespace-nowrap"
          >
            Clear
          </button>
          <button
            onClick={handleBulkEnable}
            disabled={selectedDisabledCount === 0}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded transition-colors text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enable
          </button>
          <button
            onClick={handleBulkDisable}
            disabled={selectedEnabledCount === 0}
            className="px-3 py-1 bg-orange-600 hover:bg-orange-700 rounded transition-colors text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Disable
          </button>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded transition-colors text-sm whitespace-nowrap"
          >
            Delete
          </button>
        </div>
      )}

      <ConfirmDeleteDialog
        isOpen={deleteDialog !== null}
        itemName={deleteDialog?.itemName || ''}
        itemType="workflows"
        warningMessage="Deleting workflows removes their definitions and execution history. Scheduled runs will stop immediately."
        consequences={deleteDialog?.consequences}
        onConfirm={async () => {
          if (deleteDialog) {
            await deleteDialog.onConfirm()
          }
        }}
        onCancel={() => setDeleteDialog(null)}
      />
    </div>
  )
}

function getWorkflowDeleteConsequences(workflows: Workflow[]): string[] {
  const consequences: string[] = []

  workflows.forEach(workflow => {
    consequences.push(`${workflow.name} — ${workflow.scheduleHuman || workflow.schedule || 'Manual'}`)
    consequences.push(`  • ${workflow.participantCount} targeted agent${workflow.participantCount !== 1 ? 's' : ''}`)
    consequences.push(`  • WORKFLOWS/${workflow.id}.md will be removed`)
    if (workflow.targeting?.groups?.length > 0) {
      consequences.push(`  • targets ${workflow.targeting.groups.length} group${workflow.targeting.groups.length !== 1 ? 's' : ''}`)
    }
    if (workflow.targeting?.communities?.length > 0) {
      consequences.push(`  • targets ${workflow.targeting.communities.length} communit${workflow.targeting.communities.length !== 1 ? 'ies' : 'y'}`)
    }
  })

  consequences.push('All execution history for deleted workflows will be lost')
  return consequences
}

function WorkflowsTable({
  workflows,
  selectionMode,
  selectedWorkflowIds,
  sortColumn,
  sortDirection,
  onSort,
  onToggleSelect,
  onOpenWorkflow,
  onToggleEnabled,
  onDelete,
  onOpenFile,
  runningWorkflows,
  latestExecutionStatuses,
  totalCost,
  allVisibleSelected,
  onSelectVisible,
  onDeselectVisible,
}: {
  workflows: Workflow[]
  selectionMode: boolean
  selectedWorkflowIds: Set<string>
  sortColumn: WorkflowSortColumn
  sortDirection: 'asc' | 'desc'
  onSort: (column: WorkflowSortColumn) => void
  onToggleSelect: (workflowId: string) => void
  onOpenWorkflow: (workflowId: string) => void
  onToggleEnabled: (workflowId: string, enabled: boolean) => void
  onDelete: (workflowId: string) => void
  onOpenFile: (workflowId: string) => void
  runningWorkflows: Set<string>
  latestExecutionStatuses: Record<string, WorkflowExecution['status'] | undefined>
  totalCost: number
  allVisibleSelected: boolean
  onSelectVisible: () => void
  onDeselectVisible: () => void
}) {
  const SortHeader = ({ column, label }: { column: WorkflowSortColumn; label: string }) => (
    <button
      onClick={() => onSort(column)}
      className="flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
    >
      {label}
      {sortColumn === column && (
        <span className="text-sky-600 dark:text-sky-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  )

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
            <tr>
              {selectionMode && (
                <th className="px-4 py-3 text-left w-12 dark:bg-gray-800">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (allVisibleSelected) setSelectedWorkflowIds(new Set())
                      else setSelectedWorkflowIds(new Set(sortedWorkflows.map(w => w.id)))
                    }}
                    title={allVisibleSelected ? 'Deselect all visible workflows' : 'Select all visible workflows'}
                    className={`flex h-6 w-6 items-center justify-center rounded border text-xs font-bold transition-colors ${
                      allVisibleSelected
                        ? 'bg-sky-600 border-sky-600 text-white'
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                    } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400`}
                  >
                    {allVisibleSelected ? '✓' : '□'}
                  </button>
                </th>
              )}
              <th className="px-4 py-3 text-left min-w-[280px]"><SortHeader column="name" label="Workflow" /></th>
              <th className="px-4 py-3 text-left w-[140px]"><SortHeader column="status" label="Status" /></th>
              <th className="px-4 py-3 text-left w-[80px]"><SortHeader column="participants" label="Agents" /></th>
              <th className="px-4 py-3 text-left min-w-[260px]"><SortHeader column="schedule" label="Schedule" /></th>
              <th className="px-4 py-3 text-left w-[120px]"><SortHeader column="mode" label="Mode" /></th>
              <th className="px-4 py-3 text-left w-[110px]"><SortHeader column="runs" label="Runs" /></th>
              <th className="px-4 py-3 text-left w-[110px]"><SortHeader column="updated" label="Updated" /></th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map(workflow => {
              const isRunning = runningWorkflows.has(workflow.id)
              const healthState = getWorkflowHealthState(workflow, isRunning, latestExecutionStatuses[workflow.id])
              const statusDotClass = getWorkflowHealthDotClass(healthState)
              const statusLabel = getWorkflowStatusLabel(healthState)
              const statusHelp = getWorkflowStatusHelp(healthState, workflow.nextRunAt)

              return (
                <tr
                  key={workflow.id}
                  onClick={() => onOpenWorkflow(workflow.id)}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/40 cursor-pointer"
                >
                  {selectionMode && (
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleSelect(workflow.id)
                        }}
                        className={`h-6 w-6 flex items-center justify-center rounded border text-xs font-bold transition-colors ${
                          selectedWorkflowIds.has(workflow.id)
                            ? 'bg-sky-600 border-sky-600 text-white'
                            : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400`}
                        title={selectedWorkflowIds.has(workflow.id) ? 'Deselect workflow' : 'Select workflow'}
                      >
                        {selectedWorkflowIds.has(workflow.id) ? '✓' : '□'}
                      </button>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onOpenWorkflow(workflow.id)
                      }}
                      className="text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass}`} />
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[260px]">{workflow.name}</div>
                      </div>
                      <div className="text-xs text-gray-500 truncate mt-0.5 max-w-[300px]">{workflow.description}</div>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-semibold border ${
                        healthState === 'running'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                          : healthState === 'failed'
                            ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                            : healthState === 'paused'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
                              : healthState === 'disabled'
                                ? 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
                                : 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-400 dark:border-sky-800'
                    }`}>
                      <span className={`h-2 w-2 rounded-full shrink-0 ${statusDotClass}`} />
                      {statusLabel}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 truncate" title={statusHelp}>
                      {statusHelp}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">{workflow.participantCount}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    <div className="leading-snug truncate" title={workflow.scheduleHuman || workflow.schedule || 'Manual'}>
                      {workflow.scheduleHuman || workflow.schedule || 'Manual'}
                    </div>
                    <div className="mt-1 text-xs text-sky-600 dark:text-sky-400 truncate" title={`Next run ${formatNextRun(workflow.nextRunAt)}`}>
                      {workflow.nextRunAt ? `Next ${formatNextRunRelative(workflow.nextRunAt)}` : 'No upcoming run'}
                    </div>
                    <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {workflow.nextRunAt ? formatNextRun(workflow.nextRunAt) : 'Enable this workflow to schedule runs'}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{workflow.executionMode}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {workflow.maxRuns && workflow.maxRuns > 0
                      ? `${workflow.runCount || 0}/${workflow.maxRuns}`
                      : 'Unlimited'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{new Date(workflow.modified).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {totalCost > 0 && (
                        <span className="px-2 py-1 text-xs rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
                          ${(totalCost || 0).toFixed(3)}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onToggleEnabled(workflow.id, workflow.enabled)
                        }}
                        className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        {workflow.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenFile(workflow.id)
                        }}
                        className="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        File
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(workflow.id)
                        }}
                        className="px-2 py-1 text-xs rounded bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WorkflowCard({ workflow, onClick, onToggle, onDelete, onOpenFile, isSelected, onToggleSelect, isRunning, healthState, totalCost }: {
  workflow: Workflow
  onClick: () => void
  onToggle: (currentEnabled: boolean) => void
  onDelete: () => void
  onOpenFile: () => void
  isSelected?: boolean
  onToggleSelect?: () => void
  isRunning?: boolean
  healthState?: WorkflowHealthState
  totalCost?: number
}) {
  const [showMenu, setShowMenu] = React.useState(false)
  const statusDotClass = getWorkflowHealthDotClass(healthState || getWorkflowHealthState(workflow, Boolean(isRunning)))

  return (
    <div className={`border rounded-lg p-4 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow cursor-pointer relative ${
      isSelected ? 'border-blue-500 border-2 bg-blue-50 dark:bg-blue-900/30'
        : isRunning ? 'border-blue-400 dark:border-blue-500 shadow-sm shadow-blue-200 dark:shadow-blue-900'
        : 'border-gray-200 dark:border-gray-700'
    }`}>
      {onToggleSelect && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className={`absolute top-3 right-3 z-10 flex h-6 w-6 items-center justify-center rounded border text-xs font-bold transition-colors ${
            isSelected
              ? 'bg-sky-600 border-sky-600 text-white'
              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
          }`}
          title={isSelected ? 'Deselect workflow' : 'Select workflow'}
        >
          {isSelected ? '✓' : '□'}
        </button>
      )}
      <div onClick={onToggleSelect || onClick}>
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2 pr-8">
            <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass}`} />
            <h3 className="font-semibold text-gray-900 text-sm dark:text-gray-100">{workflow.name}</h3>
            {isRunning && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded animate-pulse">
                Running
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!onToggleSelect && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-400 text-lg leading-none p-1"
                title="Actions"
              >
                ⋮
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-600 mb-3 line-clamp-2">{workflow.description}</p>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500 mb-3">
          <span>{workflow.scheduleHuman || workflow.schedule}</span>
          <span>·</span>
          <span className="text-gray-600 dark:text-gray-300">Next {formatNextRunRelative(workflow.nextRunAt)}</span>
          <span>·</span>
          <span>{workflow.participantCount} agent{workflow.participantCount !== 1 ? 's' : ''}</span>
          {workflow.maxRuns && workflow.maxRuns > 0 ? (
            <>
              <span>·</span>
              <span className="text-amber-600 dark:text-amber-400">{workflow.runCount || 0}/{workflow.maxRuns} runs</span>
            </>
          ) : null}
          {totalCost != null && totalCost > 0 && (
            <>
              <span>·</span>
              <span className="text-emerald-600 dark:text-emerald-400">${totalCost.toFixed(3)}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
            workflow.executionMode === 'automated'
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
              : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
          }`}>
            {workflow.executionMode}
          </span>
          {workflow.owner && (
            <span className="text-xs text-gray-500">→ {workflow.owner}</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenFile() }}
            className="ml-auto text-gray-300 hover:text-sky-600 transition-colors text-xs shrink-0"
            title="Open file"
          >
            📄
          </button>
        </div>
      </div>

      {/* Actions Menu Dropdown - only show when not in selection mode */}
      {showMenu && !onToggleSelect && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); }}
          />
          <div className="absolute right-4 top-12 z-20 bg-white dark:bg-gray-800 border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] dark:border-gray-700">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenFile(); setShowMenu(false); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              📄 Open File
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(workflow.enabled); setShowMenu(false); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {workflow.enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function getWorkflowHealthState(
  workflow: Workflow,
  isRunning: boolean,
  latestStatus?: WorkflowExecution['status']
): WorkflowHealthState {
  if (isRunning || latestStatus === 'running') return 'running'
  if (!workflow.enabled) return 'disabled'
  if (latestStatus === 'failed') return 'failed'
  if (latestStatus === 'paused') return 'paused'
  return 'enabled'
}

function getWorkflowHealthDotClass(state: WorkflowHealthState): string {
  switch (state) {
    case 'running':
      return 'bg-green-400 animate-pulse'
    case 'failed':
      return 'bg-red-400'
    case 'paused':
      return 'bg-amber-400'
    case 'disabled':
      return 'bg-gray-400 dark:bg-gray-500'
    case 'enabled':
    default:
      return 'bg-sky-400'
  }
}
