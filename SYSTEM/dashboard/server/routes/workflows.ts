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
  validateCron
} from '../lib/workflows'
import { listAgents } from '../lib/workspace'

const router = Router()

/**
 * GET /api/workflows
 * List all workflows
 */
router.get('/', (req, res) => {
  try {
    const workflows = listWorkflows()

    // Include participant count for each workflow
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
        participantCount: participants.length
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
 * POST /api/workflows
 * Create new workflow
 */
router.post('/', (req, res) => {
  try {
    const result = createWorkflow(req.body)

    if (!result.success) {
      return res.status(400).json({ error: 'Invalid workflow data', details: result.error })
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

export default router
