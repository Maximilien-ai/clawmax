import { Router } from 'express'
import {
  listTemplates,
  getTemplate,
  deleteTemplate,
  createAgentTemplateFromAgent,
  validateTemplate,
  slugify
} from '../lib/templates'

const router = Router()

// GET /api/templates - List all templates (with optional type filter)
// Query params: ?type=agent or ?type=organization
router.get('/', (req, res) => {
  const { type } = req.query

  if (type && type !== 'agent' && type !== 'organization') {
    return res.status(400).json({ error: 'Type must be "agent" or "organization"' })
  }

  const templates = listTemplates(type as 'agent' | 'organization' | undefined)

  // Separate by type for easier frontend consumption
  const agents = templates.filter(t => t.type === 'agent')
  const organizations = templates.filter(t => t.type === 'organization')

  res.json({ agents, organizations, total: templates.length })
})

// GET /api/templates/agents - List agent templates only
router.get('/agents', (req, res) => {
  const templates = listTemplates('agent')
  res.json({ templates })
})

// GET /api/templates/organizations - List organization templates only
router.get('/organizations', (req, res) => {
  const templates = listTemplates('organization')
  res.json({ templates })
})

// GET /api/templates/:type/:slug - Get a specific template
router.get('/:type/:slug', (req, res) => {
  const { type, slug } = req.params

  if (type !== 'agents' && type !== 'organizations') {
    return res.status(400).json({ error: 'Type must be "agents" or "organizations"' })
  }

  const templateType = type === 'agents' ? 'agent' : 'organization'
  const template = getTemplate(templateType, slug)

  if (!template) {
    return res.status(404).json({ error: 'Template not found' })
  }

  res.json(template)
})

// POST /api/templates/agents/:agentId/save - Save an agent as a template
router.post('/agents/:agentId/save', (req, res) => {
  const { agentId } = req.params
  const { name, description, tags, author } = req.body

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Template name is required' })
  }

  if (!/^[a-z][a-z0-9_-]*$/.test(agentId)) {
    return res.status(400).json({ error: 'Invalid agent ID' })
  }

  const result = createAgentTemplateFromAgent(agentId, name, {
    description,
    author,
    tags: Array.isArray(tags) ? tags : undefined
  })

  if (!result.ok) {
    return res.status(500).json({ error: result.error })
  }

  res.json({
    ok: true,
    template: result.template,
    slug: slugify(name)
  })
})

// DELETE /api/templates/:type/:slug - Delete a template
router.delete('/:type/:slug', (req, res) => {
  const { type, slug } = req.params

  if (type !== 'agents' && type !== 'organizations') {
    return res.status(400).json({ error: 'Type must be "agents" or "organizations"' })
  }

  const templateType = type === 'agents' ? 'agent' : 'organization'
  const result = deleteTemplate(templateType, slug)

  if (!result.ok) {
    return res.status(404).json({ error: result.error })
  }

  res.json({ ok: true })
})

// POST /api/templates/validate - Validate a template JSON
router.post('/validate', (req, res) => {
  const template = req.body

  const validation = validateTemplate(template)

  if (!validation.valid) {
    return res.status(400).json({
      valid: false,
      errors: validation.errors
    })
  }

  res.json({ valid: true })
})

export default router
