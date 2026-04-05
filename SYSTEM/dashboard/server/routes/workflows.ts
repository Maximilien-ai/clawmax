import { Router } from 'express'
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  resolveParticipants,
  listExecutions,
  getExecution,
  validateCron,
  triggerWorkflow,
  completeWorkflow,
  getDAGStatus,
  parseWorkflowMd,
} from '../lib/workflows'
import { getNextCronRun } from '../lib/cron-next-run'
import { listAgents } from '../lib/workspace'
import { generateCronFromText, generateWorkflowFromNL } from '../lib/ai-generator'
import { syncAllWorkflows } from '../lib/scheduler'

const router = Router()

/**
 * POST /api/workflows/import-md
 * Import a workflow from WORKFLOW.md markdown content.
 */
router.post('/import-md', (req, res) => {
  try {
    const { content } = req.body
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Markdown content is required' })
    }

    const parsed = parseWorkflowMd(content)
    if (!parsed) {
      return res.status(400).json({ error: 'Failed to parse WORKFLOW.md — ensure it has valid YAML frontmatter with name' })
    }

    if (!parsed.author) parsed.author = 'imported'

    const result = createWorkflow(parsed)
    if (!result.success) {
      return res.status(400).json({ error: result.error, errors: result.errors })
    }

    res.json({ ok: true, id: result.id })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to import workflow' })
  }
})

/**
 * POST /api/workflows/generate-cron
 * Convert natural language to cron expression using AI
 */
router.post('/generate-cron', (req, res) => {
  const { text } = req.body
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text is required' })
  }

  generateCronFromText(text)
    .then(result => {
      if (result.error) {
        return res.status(500).json({ error: result.error })
      }

      // Validate the generated cron
      if (result.cron) {
        const validation = validateCron(result.cron)
        if (!validation.valid) {
          return res.json({ cron: '', explanation: `Could not generate a valid cron: ${result.explanation}`, valid: false })
        }
        return res.json({ cron: result.cron, explanation: result.explanation, humanReadable: validation.humanReadable, valid: true })
      }

      res.json({ cron: '', explanation: result.explanation, valid: false })
    })
    .catch(err => {
      console.error('Error generating cron:', err)
      res.status(500).json({ error: 'Failed to generate cron expression' })
    })
})

/**
 * POST /api/workflows/generate
 * Generate a complete workflow definition from natural language using AI
 */
router.post('/generate', async (req, res) => {
  const { description } = req.body
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'description is required' })
  }

  try {
    const agents = listAgents()
    const agentIds = agents.filter(a => !a.archived).map(a => a.id)
    const allTags = [...new Set(agents.flatMap(a => a.tags))]
    const workflow = await generateWorkflowFromNL(description, agentIds, allTags)
    res.json({ ok: true, workflow })
  } catch (err: any) {
    console.error('Error generating workflow:', err)
    res.status(500).json({ error: err.message || 'Failed to generate workflow' })
  }
})

/**
 * GET /api/workflows
 * List all workflows
 */
router.get('/', (req, res) => {
  try {
    const workflows = listWorkflows()

    // Include participant count and targeting for each workflow
    const agents = listAgents()
    const workflowsWithCounts = workflows.map(workflow => {
      const participants = resolveParticipants(workflow, agents)
      const cronInfo = validateCron(workflow.schedule)
      return {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        schedule: workflow.schedule,
        scheduleHuman: cronInfo.humanReadable || workflow.schedule,
        nextRunAt: workflow.enabled ? getNextCronRun(workflow.schedule)?.toISOString() || null : null,
        enabled: workflow.enabled,
        executionMode: workflow.executionMode,
        owner: workflow.owner,
        created: workflow.created,
        modified: workflow.modified,
        participantCount: participants.length,
        targeting: workflow.targeting,
        maxRuns: workflow.maxRuns || 0,
        runCount: workflow.runCount || 0,
        dependsOn: workflow.dependsOn,
        type: workflow.type,
        progress: workflow.progress,
        status: workflow.status,
        secretRequirements: workflow.secretRequirements,
      }
    })

    res.json({ workflows: workflowsWithCounts })
  } catch (error: any) {
    console.error('Error listing workflows:', error)
    res.status(500).json({ error: 'Failed to list workflows', message: error.message })
  }
})

// GET /api/workflows/dag — full DAG status with dependency resolution
router.get('/dag', (_req, res) => {
  try {
    const dag = getDAGStatus()
    res.json({ ok: true, dag })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/workflows/:id
 * Get workflow details
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const workflow = getWorkflow(id)

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    // Include cron human-readable description and resolved participants
    const cronValidation = validateCron(workflow.schedule)
    const agents = listAgents()
    const participants = resolveParticipants(workflow, agents)
    const response = {
      ...workflow,
      scheduleHuman: cronValidation.humanReadable || workflow.schedule,
      nextRunAt: workflow.enabled ? getNextCronRun(workflow.schedule)?.toISOString() || null : null,
      participantCount: participants.length,
      resolvedParticipants: participants.map(p => ({ id: p.agentId, name: p.agentName, reason: p.reason }))
    }

    res.json(response)
  } catch (error: any) {
    console.error('Error getting workflow:', error)
    res.status(500).json({ error: 'Failed to get workflow', message: error.message })
  }
})

/**
 * POST /api/workflows/:id/trigger
 * Trigger workflow manually
 */
router.post('/:id/trigger', (req, res) => {
  try {
    const { id } = req.params
    const { byok, secrets, inputs } = req.body as {
      byok?: {
        openai?: string
        anthropic?: string
        gemini?: string
        ollamaBaseUrl?: string
        ollamaDefaultModel?: string
        preferredModel?: string
      }
      secrets?: Record<string, string>
      inputs?: Record<string, string>
    }

    // Validate workflow ID format
    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    // Check if workflow exists
    const workflow = getWorkflow(id)
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    // Trigger the workflow (manual = true bypasses maxRuns limit)
    const result = triggerWorkflow(id, { manual: true, byok, secrets, inputs })

    if (!result.success) {
      return res.status(500).json({ error: 'Failed to trigger workflow', details: result.error })
    }

    res.status(200).json({
      message: 'Workflow triggered successfully',
      executionId: result.executionId,
      workflowId: id
    })
  } catch (error: any) {
    console.error('Error triggering workflow:', error)
    res.status(500).json({ error: 'Failed to trigger workflow', message: error.message })
  }
})

/**
 * POST /api/workflows
 * Create new workflow
 */
router.post('/', (req, res) => {
  try {
    const result = createWorkflow(req.body)

    if (!result.success) {
      return res.status(400).json({ error: 'Invalid workflow data', details: result.error, validationErrors: result.errors })
    }

    syncAllWorkflows() // Update scheduler
    res.status(201).json({ id: result.id, message: 'Workflow created successfully' })
  } catch (error: any) {
    console.error('Error creating workflow:', error)
    res.status(500).json({ error: 'Failed to create workflow', message: error.message })
  }
})

/**
 * PUT /api/workflows/:id
 * Update workflow
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const result = updateWorkflow(id, req.body)

    if (!result.success) {
      if (result.error === 'Workflow not found') {
        return res.status(404).json({ error: result.error, workflowId: id })
      }
      return res.status(400).json({ error: 'Invalid workflow data', details: result.error, validationErrors: result.errors })
    }

    syncAllWorkflows() // Update scheduler
    res.json({ message: 'Workflow updated successfully' })
  } catch (error: any) {
    console.error('Error updating workflow:', error)
    res.status(500).json({ error: 'Failed to update workflow', message: error.message })
  }
})

/**
 * DELETE /api/workflows/:id
 * Delete workflow
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const result = deleteWorkflow(id)

    if (!result.success) {
      if (result.error === 'Workflow not found') {
        return res.status(404).json({ error: result.error, workflowId: id })
      }
      return res.status(500).json({ error: 'Failed to delete workflow', details: result.error })
    }

    syncAllWorkflows() // Update scheduler
    res.json({ message: 'Workflow deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting workflow:', error)
    res.status(500).json({ error: 'Failed to delete workflow', message: error.message })
  }
})

/**
 * GET /api/workflows/:id/participants
 * Resolve workflow participants
 */
router.get('/:id/participants', (req, res) => {
  try {
    const { id } = req.params

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const workflow = getWorkflow(id)

    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    const agents = listAgents()
    const participants = resolveParticipants(workflow, agents)

    res.json({
      workflowId: id,
      participants,
      count: participants.length
    })
  } catch (error: any) {
    console.error('Error resolving participants:', error)
    res.status(500).json({ error: 'Failed to resolve participants', message: error.message })
  }
})

/**
 * GET /api/workflows/:id/executions
 * Get execution history for workflow
 */
router.get('/:id/executions', (req, res) => {
  try {
    const { id } = req.params
    const limit = parseInt(req.query.limit as string) || 10

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const workflow = getWorkflow(id)
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    const executions = listExecutions(id, limit)

    // Simplify execution data for list view
    const simplifiedExecutions = executions.map(exec => ({
      id: exec.id,
      startedAt: exec.startedAt,
      completedAt: exec.completedAt,
      status: exec.status,
      triggerType: exec.triggerType,
      participantCount: exec.participants.length,
      successCount: exec.participants.filter(p => p.status === 'completed').length,
      failureCount: exec.participants.filter(p => p.status === 'failed').length,
      inputs: exec.inputs,
    }))

    res.json({
      workflowId: id,
      executions: simplifiedExecutions
    })
  } catch (error: any) {
    console.error('Error listing executions:', error)
    res.status(500).json({ error: 'Failed to list executions', message: error.message })
  }
})

/**
 * GET /api/workflows/:id/executions/archived
 * Get archived executions for workflow
 * NOTE: This must come BEFORE /:id/executions/:executionId to avoid route collision
 */
router.get('/:id/executions/archived', (req, res) => {
  try {
    const { id } = req.params

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const workflow = getWorkflow(id)
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const WORKSPACE_DIR = path.join(os.homedir(), '.openclaw', 'workspace')
    const WORKFLOWS_DIR = path.join(WORKSPACE_DIR, 'WORKFLOWS')
    const EXECUTIONS_DIR = path.join(WORKFLOWS_DIR, 'executions')
    const archivedDir = path.join(EXECUTIONS_DIR, id, 'archived')

    if (!fs.existsSync(archivedDir)) {
      return res.json({ executions: [] })
    }

    const files = fs.readdirSync(archivedDir)
      .filter((f: string) => f.endsWith('.json'))
      .sort()

    const executions = []
    for (const file of files) {
      try {
        const filePath = path.join(archivedDir, file)
        const content = fs.readFileSync(filePath, 'utf-8')
        const execution = JSON.parse(content)

        // Simplify execution data for list view
        executions.push({
          id: execution.id,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          status: execution.status,
          triggerType: execution.triggerType,
          participantCount: execution.participants.length,
          successCount: execution.participants.filter((p: any) => p.status === 'completed').length,
          failureCount: execution.participants.filter((p: any) => p.status === 'failed').length,
          inputs: execution.inputs,
        })
      } catch (error) {
        console.error(`Error reading archived execution ${file}:`, error)
      }
    }

    res.json({ executions })
  } catch (error: any) {
    console.error('Error listing archived executions:', error)
    res.status(500).json({ error: 'Failed to list archived executions', message: error.message })
  }
})

/**
 * POST /api/workflows/:id/executions/:executionId/archive
 * Archive an execution
 */
router.post('/:id/executions/:executionId/archive', (req, res) => {
  try {
    const { id, executionId } = req.params

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const workflow = getWorkflow(id)
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    // Move execution file to archived subdirectory
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const WORKSPACE_DIR = path.join(os.homedir(), '.openclaw', 'workspace')
    const WORKFLOWS_DIR = path.join(WORKSPACE_DIR, 'WORKFLOWS')
    const EXECUTIONS_DIR = path.join(WORKFLOWS_DIR, 'executions')
    const executionPath = path.join(EXECUTIONS_DIR, id, `${executionId}.json`)
    const archivedDir = path.join(EXECUTIONS_DIR, id, 'archived')
    const archivedPath = path.join(archivedDir, `${executionId}.json`)

    if (!fs.existsSync(executionPath)) {
      return res.status(404).json({ error: 'Execution not found', executionId })
    }

    // Create archived directory if it doesn't exist
    if (!fs.existsSync(archivedDir)) {
      fs.mkdirSync(archivedDir, { recursive: true })
    }

    // Move file to archived directory
    fs.renameSync(executionPath, archivedPath)
    res.json({ message: 'Execution archived successfully' })
  } catch (error: any) {
    console.error('Error archiving execution:', error)
    res.status(500).json({ error: 'Failed to archive execution', message: error.message })
  }
})

/**
 * POST /api/workflows/:id/executions/:executionId/unarchive
 * Unarchive an execution
 */
router.post('/:id/executions/:executionId/unarchive', (req, res) => {
  try {
    const { id, executionId } = req.params

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const workflow = getWorkflow(id)
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    // Move execution file from archived subdirectory back to main
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const WORKSPACE_DIR = path.join(os.homedir(), '.openclaw', 'workspace')
    const WORKFLOWS_DIR = path.join(WORKSPACE_DIR, 'WORKFLOWS')
    const EXECUTIONS_DIR = path.join(WORKFLOWS_DIR, 'executions')
    const archivedDir = path.join(EXECUTIONS_DIR, id, 'archived')
    const archivedPath = path.join(archivedDir, `${executionId}.json`)
    const executionPath = path.join(EXECUTIONS_DIR, id, `${executionId}.json`)

    if (!fs.existsSync(archivedPath)) {
      return res.status(404).json({ error: 'Archived execution not found', executionId })
    }

    // Move file from archived directory back to main
    fs.renameSync(archivedPath, executionPath)
    res.json({ message: 'Execution unarchived successfully' })
  } catch (error: any) {
    console.error('Error unarchiving execution:', error)
    res.status(500).json({ error: 'Failed to unarchive execution', message: error.message })
  }
})

/**
 * GET /api/workflows/:id/executions/:executionId
 * Get detailed execution data
 */
router.get('/:id/executions/:executionId', (req, res) => {
  try {
    const { id, executionId } = req.params

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const workflow = getWorkflow(id)
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    const execution = getExecution(id, executionId)
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found', executionId })
    }

    res.json(execution)
  } catch (error: any) {
    console.error('Error getting execution:', error)
    res.status(500).json({ error: 'Failed to get execution', message: error.message })
  }
})

/**
 * DELETE /api/workflows/:id/executions/:executionId
 * Delete an execution
 */
router.delete('/:id/executions/:executionId', (req, res) => {
  try {
    const { id, executionId } = req.params

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    const workflow = getWorkflow(id)
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    // Delete execution file
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    const WORKSPACE_DIR = path.join(os.homedir(), '.openclaw', 'workspace')
    const WORKFLOWS_DIR = path.join(WORKSPACE_DIR, 'WORKFLOWS')
    const EXECUTIONS_DIR = path.join(WORKFLOWS_DIR, 'executions')
    const executionPath = path.join(EXECUTIONS_DIR, id, `${executionId}.json`)

    if (!fs.existsSync(executionPath)) {
      return res.status(404).json({ error: 'Execution not found', executionId })
    }

    fs.unlinkSync(executionPath)
    res.json({ message: 'Execution deleted successfully' })
  } catch (error: any) {
    console.error('Error deleting execution:', error)
    res.status(500).json({ error: 'Failed to delete execution', message: error.message })
  }
})

// ============================================================================
// Workflow v2: DAG, Progress & Dependencies
// ============================================================================

// POST /api/workflows/:id/complete — mark workflow as completed, advance DAG
router.post('/:id/complete', (req, res) => {
  try {
    const workflow = getWorkflow(req.params.id)
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' })

    const { readyToRun } = completeWorkflow(req.params.id)

    // Auto-trigger ready workflows if they're enabled
    const triggered: string[] = []
    for (const wfId of readyToRun) {
      const wf = getWorkflow(wfId)
      if (wf?.enabled) {
        const result = triggerWorkflow(wfId)
        if (result.success) {
          triggered.push(wfId)
          updateWorkflow(wfId, { status: 'running' } as any)
        }
      }
    }

    res.json({
      ok: true,
      completed: req.params.id,
      readyToRun,
      triggered,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/workflows/:id/progress — report workflow progress (0-100)
router.post('/:id/progress', (req, res) => {
  try {
    const { id } = req.params
    const { progress, detail, agentId } = req.body

    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      return res.status(400).json({ error: 'Progress must be 0-100' })
    }

    const workflow = getWorkflow(id)
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' })

    // Update workflow progress
    const result = updateWorkflow(id, {
      progress,
      status: progress >= 100 ? 'completed' : 'running',
    } as any)

    if (!result.success) {
      return res.status(500).json({ error: result.error })
    }

    // Create/update progress notification
    const { createNotification } = require('../lib/notifications')
    createNotification({
      type: 'workflow-progress',
      title: `${workflow.name}: ${progress}%`,
      message: detail || `Progress: ${progress}%${agentId ? ` (reported by ${agentId})` : ''}`,
      entityId: id,
      entityType: 'workflow',
      fingerprint: `workflow-progress:${id}`,
      workflowId: id,
      progress,
    })

    res.json({ ok: true, progress })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/workflows/:id/dependencies — check if dependencies are met
router.get('/:id/dependencies', (req, res) => {
  try {
    const workflow = getWorkflow(req.params.id)
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' })

    const deps = (workflow as any).dependsOn || []
    if (deps.length === 0) {
      return res.json({ ok: true, met: true, dependencies: [] })
    }

    const depStatus = deps.map((depId: string) => {
      const dep = getWorkflow(depId)
      return {
        id: depId,
        name: dep?.name || depId,
        status: (dep as any)?.status || 'idle',
        progress: (dep as any)?.progress || 0,
        met: (dep as any)?.status === 'completed' || (dep as any)?.progress >= 100,
      }
    })

    const allMet = depStatus.every((d: any) => d.met)
    res.json({ ok: true, met: allMet, dependencies: depStatus })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/workflows/:id/blocker — agent declares a blocker
router.post('/:id/blocker', (req, res) => {
  try {
    const { id } = req.params
    const { agentId, blockerType, title, message, options } = req.body

    if (!agentId || !blockerType || !title) {
      return res.status(400).json({ error: 'agentId, blockerType, and title are required' })
    }

    const workflow = getWorkflow(id)
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' })

    // Update workflow status to blocked
    updateWorkflow(id, { status: 'blocked' } as any)

    // Create blocker notification
    const { createNotification } = require('../lib/notifications')
    const actions = blockerType === 'approval'
      ? [{ type: 'approve', label: 'Approve' }, { type: 'reject', label: 'Reject' }]
      : blockerType === 'choice' && options
        ? options.map((o: string) => ({ type: 'choose', label: o, value: o }))
        : []

    createNotification({
      type: 'workflow-blocked',
      title: `${workflow.name}: ${title}`,
      message: message || `Agent ${agentId} needs a decision`,
      entityId: agentId,
      entityType: 'agent',
      fingerprint: `blocker:${id}:${agentId}:${Date.now()}`,
      actions,
      blockerType,
      blockerOptions: options,
      workflowId: id,
    })

    res.json({ ok: true })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
