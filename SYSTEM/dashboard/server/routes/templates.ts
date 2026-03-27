import { Router } from 'express'
import {
  listTemplates,
  getTemplate,
  deleteTemplate,
  createAgentTemplateFromAgent,
  createOrganizationTemplate,
  importAgentFromTemplate,
  importOrganizationTemplate,
  validateTemplate,
  slugify
} from '../lib/templates'
import { listWorkflowTemplates } from '../lib/workflows'
import { generateTemplateFromNL } from '../lib/ai-generator'

const router = Router()

// GET /api/templates - List all templates (with optional type filter)
// Query params: ?type=agent or ?type=organization or ?type=workflow
router.get('/', (req, res) => {
  const { type } = req.query

  if (type && type !== 'agent' && type !== 'organization' && type !== 'workflow') {
    return res.status(400).json({ error: 'Type must be "agent", "organization", or "workflow"' })
  }

  const templates = listTemplates(type as 'agent' | 'organization' | undefined)
  const workflowTemplates = listWorkflowTemplates()

  // Separate by type for easier frontend consumption
  const agents = templates.filter(t => t.type === 'agent')
  const organizations = templates.filter(t => t.type === 'organization')
  const workflows = workflowTemplates

  // Filter by type if specified
  if (type === 'agent') {
    return res.json({ agents, organizations: [], workflows: [], total: agents.length })
  }
  if (type === 'organization') {
    return res.json({ agents: [], organizations, workflows: [], total: organizations.length })
  }
  if (type === 'workflow') {
    return res.json({ agents: [], organizations: [], workflows, total: workflows.length })
  }

  res.json({ agents, organizations, workflows, total: agents.length + organizations.length + workflows.length })
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

// POST /api/templates/organizations/save - Save entire organization as template
router.post('/organizations/save', (req, res) => {
  const { name, description, tags, author } = req.body

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Template name is required' })
  }

  const result = createOrganizationTemplate(name, {
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

// POST /api/templates/generate - Generate an organization template from natural language
router.post('/generate', async (req, res) => {
  const { description } = req.body
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'description is required' })
  }

  try {
    const template = await generateTemplateFromNL(description)
    res.json({ ok: true, template })
  } catch (err: any) {
    console.error('Error generating template:', err)
    res.status(500).json({ error: err.message || 'Failed to generate template' })
  }
})

// POST /api/templates/agents/import - Import an agent from a template
router.post('/agents/import', (req, res) => {
  const { templateSlug, agentId, model, port, whatsapp } = req.body

  if (!templateSlug || typeof templateSlug !== 'string') {
    return res.status(400).json({ error: 'Template slug is required' })
  }

  const result = importAgentFromTemplate(templateSlug, {
    newAgentId: agentId,
    model,
    port,
    whatsapp
  })

  if (!result.ok) {
    return res.status(400).json({ error: result.error })
  }

  res.json({
    ok: true,
    agentId: result.agentId
  })
})

// POST /api/templates/organizations/import - Import organization from template
router.post('/organizations/import', (req, res) => {
  const { templateSlug, prefix, suffix, includeBuiltIn, modelOverride, agentCounts, workflowOverrides } = req.body

  if (!templateSlug || typeof templateSlug !== 'string') {
    return res.status(400).json({ error: 'Template slug is required' })
  }

  const result = importOrganizationTemplate(templateSlug, {
    prefix,
    suffix,
    includeBuiltIn: includeBuiltIn !== false, // Default to true
    modelOverride: modelOverride || undefined,
    agentCounts: agentCounts || undefined,
    workflowOverrides: workflowOverrides || undefined,
  })

  if (!result.ok) {
    return res.status(400).json({ error: result.error })
  }

  res.json({
    ok: true,
    agentIds: result.agentIds
  })
})

export default router
