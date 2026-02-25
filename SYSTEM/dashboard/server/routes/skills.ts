import express from 'express'
import {
  listAvailableSkills,
  getSkillById,
  getAgentSkills,
  setAgentSkills,
  validateSkills
} from '../lib/skills'

const router = express.Router()

// GET /api/skills - List all available skills
router.get('/', (req, res) => {
  try {
    const skills = listAvailableSkills()
    res.json({ skills })
  } catch (err) {
    console.error('Error listing skills:', err)
    res.status(500).json({ error: 'Failed to load skills' })
  }
})

// GET /api/skills/:skillId - Get skill details
router.get('/:skillId', (req, res) => {
  try {
    const { skillId } = req.params
    const skill = getSkillById(skillId)

    if (!skill) {
      return res.status(404).json({ error: `Skill '${skillId}' not found` })
    }

    res.json(skill)
  } catch (err) {
    console.error('Error getting skill:', err)
    res.status(500).json({ error: 'Failed to load skill' })
  }
})

// GET /api/skills/agent/:agentId - Get agent's assigned skills
router.get('/agent/:agentId', (req, res) => {
  try {
    const { agentId } = req.params
    const skillIds = getAgentSkills(agentId)

    // Return full skill objects, not just IDs
    const allSkills = listAvailableSkills()
    const skills = skillIds
      .map(skillId => allSkills.find(s => s.name === skillId))
      .filter(Boolean)

    res.json({ skills, skillIds })
  } catch (err) {
    console.error('Error getting agent skills:', err)
    res.status(500).json({ error: 'Failed to load agent skills' })
  }
})

// PUT /api/skills/agent/:agentId - Update agent's skills
router.put('/agent/:agentId', (req, res) => {
  try {
    const { agentId } = req.params
    const { skills } = req.body

    if (!Array.isArray(skills)) {
      return res.status(400).json({ error: 'Skills must be an array' })
    }

    // Validate all skills exist
    const validation = validateSkills(skills)
    if (!validation.valid) {
      return res.status(400).json({
        error: `Invalid skills: ${validation.missing.join(', ')}`,
        missing: validation.missing
      })
    }

    // Update agent's skills
    setAgentSkills(agentId, skills)

    res.json({ ok: true, skills })
  } catch (err: any) {
    console.error('Error updating agent skills:', err)

    if (err.message?.includes('not found')) {
      return res.status(404).json({ error: err.message })
    }

    res.status(500).json({ error: 'Failed to update agent skills' })
  }
})

// POST /api/skills/validate - Validate skill IDs exist
router.post('/validate', (req, res) => {
  try {
    const { skills } = req.body

    if (!Array.isArray(skills)) {
      return res.status(400).json({ error: 'Skills must be an array' })
    }

    const validation = validateSkills(skills)

    res.json(validation)
  } catch (err) {
    console.error('Error validating skills:', err)
    res.status(500).json({ error: 'Failed to validate skills' })
  }
})

export default router
