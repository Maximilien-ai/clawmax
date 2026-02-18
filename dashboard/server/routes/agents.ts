import { Router } from 'express'
import { listAgents, getAgentActivity } from '../lib/workspace'

const router = Router()

// GET /api/agents — list all agents
router.get('/', (_req, res) => {
  const agents = listAgents()
  res.json({ agents })
})

// GET /api/agents/:id — single agent
router.get('/:id', (req, res) => {
  const agents = listAgents()
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(agent)
})

// GET /api/agents/:id/activity — file activity + key docs for the detail panel
router.get('/:id/activity', (req, res) => {
  const agents = listAgents()
  const agent = agents.find(a => a.id === req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  const activity = getAgentActivity(agent.workspacePath)
  res.json(activity)
})

export default router
