import { Router } from 'express'
import { execFileSync } from 'child_process'
import {
  listTemplates,
  getTemplate,
  deleteTemplate,
  createAgentTemplateFromAgent,
  createOrganizationTemplate,
  importAgentFromTemplate,
  importOrganizationTemplate,
  validateTemplate,
  validateTemplateReferences,
  validateImportedTemplateMd,
  slugify,
  parseTemplateMd,
  templateToMarkdown,
  saveTemplate,
} from '../lib/templates'
import { listWorkflowTemplates, getWorkflow, createWorkflow, parseWorkflowMd, workflowToMarkdown } from '../lib/workflows'
import { generateTemplateFromNL } from '../lib/ai-generator'

const router = Router()

type CustomizationValidationInput = {
  githubRepo?: string
  useGithub?: boolean
  workflows?: Array<{ id: string; name?: string; content?: string }>
}

function commandExists(command: string): boolean {
  try {
    execFileSync('/bin/bash', ['-lc', `command -v ${command}`], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim()
  return !trimmed || /^\[[^\]]*\]$/.test(trimmed) || trimmed === '...' || trimmed === '…'
}

export function validateOrganizationCustomization(
  input: CustomizationValidationInput,
  options?: { repoExists?: (repo: string) => boolean }
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const repoPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

  if (input.useGithub) {
    if (!input.githubRepo?.trim()) {
      errors.push('GitHub is enabled but the GitHub repository is empty.')
    } else if (!repoPattern.test(input.githubRepo.trim())) {
      errors.push('GitHub repository must use the format owner/repo.')
    } else {
      const repo = input.githubRepo.trim()
      if (options?.repoExists) {
        if (!options.repoExists(repo)) {
          errors.push(`GitHub repository "${repo}" was not found or is not accessible.`)
        }
      } else if (commandExists('gh')) {
        try {
          execFileSync('gh', ['repo', 'view', repo, '--json', 'nameWithOwner'], { stdio: 'pipe' })
        } catch {
          errors.push(`GitHub repository "${repo}" was not found or is not accessible via gh.`)
        }
      } else {
        warnings.push('GitHub CLI is not installed, so repository existence could not be verified.')
      }
    }
  }

  const fieldRegex = /^-\s+\*\*(.+?):\*\*\s+(.+)$/gm
  const urlishLabelRegex = /\b(url|link|site|webhook|endpoint|api|docs?)\b/i

  for (const workflow of input.workflows || []) {
    const content = workflow.content || ''
    let match: RegExpExecArray | null
    while ((match = fieldRegex.exec(content)) !== null) {
      const label = match[1].trim()
      const value = match[2].trim()
      const workflowName = workflow.name || workflow.id
      const optional = /\boptional\b/i.test(label) || /\boptional\b/i.test(value)

      if (!optional && isPlaceholderValue(value)) {
        errors.push(`Workflow "${workflowName}" has an empty required field: ${label}.`)
        continue
      }

      if (/github repo/i.test(label) && !isPlaceholderValue(value) && !repoPattern.test(value)) {
        errors.push(`Workflow "${workflowName}" has an invalid GitHub repo for "${label}". Use owner/repo.`)
      }

      if (urlishLabelRegex.test(label) && !isPlaceholderValue(value) && !isValidUrl(value)) {
        errors.push(`Workflow "${workflowName}" has an invalid URL for "${label}".`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

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
// POST /api/templates/organizations/prereqs — check prerequisites before applying
router.post('/organizations/prereqs', (req, res) => {
  const { templateSlug, useGithub, githubRepo, useSenso, sensoContextLabel, useWorkspaceFs } = req.body
  if (!templateSlug) {
    return res.status(400).json({ error: 'templateSlug is required' })
  }

  const template = getTemplate('organization', templateSlug) as any
  if (!template) {
    return res.status(404).json({ error: 'Template not found' })
  }

  const { checkTemplatePrereqs } = require('../lib/prereqs')
  const result = checkTemplatePrereqs(template, {
    useGithub: !!useGithub,
    githubRepo: typeof githubRepo === 'string' ? githubRepo : undefined,
    useSenso: !!useSenso,
    sensoContextLabel: typeof sensoContextLabel === 'string' ? sensoContextLabel : undefined,
    useWorkspaceFs: !!useWorkspaceFs,
  })
  res.json(result)
})

router.post('/organizations/validate-customization', (req, res) => {
  const { templateSlug, githubRepo, useGithub, workflowOverrides } = req.body
  if (!templateSlug || typeof templateSlug !== 'string') {
    return res.status(400).json({ error: 'templateSlug is required' })
  }

  const template = getTemplate('organization', templateSlug) as any
  if (!template) {
    return res.status(404).json({ error: 'Template not found' })
  }

  const workflows = (template.workflows || []).map((workflow: any) => ({
    id: workflow.id,
    name: workflow.name,
    content: typeof workflowOverrides?.[workflow.id] === 'string' ? workflowOverrides[workflow.id] : workflow.content,
  }))

  const result = validateOrganizationCustomization({
    githubRepo,
    useGithub,
    workflows,
  })

  res.status(result.valid ? 200 : 400).json(result)
})

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

// ============================================================================
// Markdown Import/Export
// ============================================================================

// GET /api/templates/workflows/:id/export-md — Export workflow as WORKFLOW.md
// NOTE: must be before /:type/:slug/export-md to avoid being caught by it
router.get('/workflows/:id/export-md', (req, res) => {
  const workflow = getWorkflow(req.params.id)
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' })

  const md = workflowToMarkdown(workflow)
  res.setHeader('Content-Type', 'text/markdown')
  res.setHeader('Content-Disposition', `attachment; filename="${workflow.id}.md"`)
  res.send(md)
})

// GET /api/templates/:type/:slug/export-md — Export template as TEMPLATE.md
router.get('/:type/:slug/export-md', (req, res) => {
  const { type, slug } = req.params
  const templateType = type === 'agents' ? 'agent' : type === 'organizations' ? 'organization' : null
  if (!templateType) return res.status(400).json({ error: 'Invalid template type' })

  const template = getTemplate(templateType, slug)
  if (!template) return res.status(404).json({ error: 'Template not found' })

  const md = templateToMarkdown(template)
  res.setHeader('Content-Type', 'text/markdown')
  res.setHeader('Content-Disposition', `attachment; filename="TEMPLATE.md"`)
  res.send(md)
})

// POST /api/templates/import-md — Import template from TEMPLATE.md content
router.post('/import-md', (req, res) => {
  try {
    const { content, type } = req.body
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Markdown content is required' })
    }

    const validation = validateImportedTemplateMd(content, typeof type === 'string' ? type : undefined)
    if (!validation.valid || !validation.template) {
      return res.status(400).json({
        error: validation.errors[0] || 'Failed to import template',
        errors: validation.errors,
      })
    }

    // Save
    const result = saveTemplate(validation.template)
    if (!result.ok) {
      return res.status(500).json({ error: result.error })
    }

    res.json({
      ok: true,
      template: validation.template,
      slug: slugify(validation.template.name),
      warnings: validation.warnings.length > 0 ? validation.warnings : undefined,
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to import template' })
  }
})

// POST /api/workflows/import-md — Import workflow from WORKFLOW.md content
router.post('/workflows/import-md', (req, res) => {
  try {
    const { content } = req.body
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Markdown content is required' })
    }

    const parsed = parseWorkflowMd(content)
    if (!parsed) {
      return res.status(400).json({ error: 'Failed to parse WORKFLOW.md — ensure it has valid YAML frontmatter with name' })
    }

    // Default author if not provided
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

export default router
