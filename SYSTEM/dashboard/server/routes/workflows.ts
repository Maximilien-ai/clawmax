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
  syncWorkflowToCron,
  removeCronJob
} from '../lib/workflows'
import { listAgents } from '../lib/workspace'
import { generateCronFromText } from '../lib/ai-generator'

const router = Router()

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
      return {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        schedule: workflow.schedule,
        enabled: workflow.enabled,
        executionMode: workflow.executionMode,
        owner: workflow.owner,
        created: workflow.created,
        modified: workflow.modified,
        participantCount: participants.length,
        targeting: workflow.targeting
      }
    })

    res.json({ workflows: workflowsWithCounts })
  } catch (error: any) {
    console.error('Error listing workflows:', error)
    res.status(500).json({ error: 'Failed to list workflows', message: error.message })
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

    // Include cron human-readable description
    const cronValidation = validateCron(workflow.schedule)
    const response = {
      ...workflow,
      scheduleHuman: cronValidation.humanReadable || workflow.schedule
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

    // Validate workflow ID format
    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid workflow ID' })
    }

    // Check if workflow exists
    const workflow = getWorkflow(id)
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found', workflowId: id })
    }

    // Trigger the workflow
    const result = triggerWorkflow(id)

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
      return res.status(400).json({ error: 'Invalid workflow data', details: result.error })
    }

    // Sync to OpenClaw cron if enabled
    if (req.body.enabled && req.body.schedule !== 'manual' && result.id) {
      const workflow = getWorkflow(result.id)
      if (workflow) {
        const agents = listAgents()
        const participants = resolveParticipants(workflow, agents).map(p => p.agentId)
        const cronResult = syncWorkflowToCron(workflow, participants)
        if (cronResult.ok && cronResult.cronJobId) {
          updateWorkflow(result.id, { cronJobId: cronResult.cronJobId })
        }
      }
    }

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
      return res.status(400).json({ error: 'Invalid workflow data', details: result.error })
    }

    // Sync cron state after update
    const updated = getWorkflow(id)
    if (updated) {
      if (updated.enabled && updated.schedule !== 'manual') {
        const agents = listAgents()
        const participants = resolveParticipants(updated, agents).map(p => p.agentId)
        const cronResult = syncWorkflowToCron(updated, participants)
        if (cronResult.ok && cronResult.cronJobId) {
          updateWorkflow(id, { cronJobId: cronResult.cronJobId })
        }
      } else if (updated.cronJobId) {
        // Workflow disabled or set to manual — remove cron jobs
        removeCronJob(updated.cronJobId)
        updateWorkflow(id, { cronJobId: undefined } as any)
      }
    }

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
      failureCount: exec.participants.filter(p => p.status === 'failed').length
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
          failureCount: execution.participants.filter((p: any) => p.status === 'failed').length
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

export default router
