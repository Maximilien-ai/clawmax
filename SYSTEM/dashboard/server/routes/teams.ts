import { Router } from 'express'
import { createTeam, deleteTeam, getTeam, listTeams, updateTeam } from '../lib/teams'

const router = Router()

router.get('/', (_req, res) => {
  res.json({ teams: listTeams() })
})

router.get('/:id', (req, res) => {
  const team = getTeam(req.params.id)
  if (!team) return res.status(404).json({ error: 'Team not found' })
  res.json(team)
})

router.post('/', (req, res) => {
  try {
    const team = createTeam(req.body || {})
    res.status(201).json(team)
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to create team' })
  }
})

router.patch('/:id', (req, res) => {
  try {
    const team = updateTeam(req.params.id, req.body || {})
    if (!team) return res.status(404).json({ error: 'Team not found' })
    res.json(team)
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update team' })
  }
})

router.delete('/:id', (req, res) => {
  const deleted = deleteTeam(req.params.id)
  if (!deleted) return res.status(404).json({ error: 'Team not found' })
  res.status(204).end()
})

export default router
