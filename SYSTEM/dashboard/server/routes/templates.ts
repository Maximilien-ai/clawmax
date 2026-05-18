import { Router } from 'express'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
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
  getAgentTemplatesDir,
  getGlobalAgentTemplatesDir,
  getOrgTemplatesDir,
  getGlobalOrgTemplatesDir,
  readOrganizationTemplateAgentFiles,
  readWorkspaceAgentFilesForOrganizationTemplate,
  buildTemplateFeedbackMetadata,
} from '../lib/templates'
import { listWorkflowTemplates, listWorkflows, getWorkflow, createWorkflow, parseWorkflowMd, workflowToMarkdown } from '../lib/workflows'
import { generateTemplateFromNL, normalizeTemplateGenerationTarget, setRequestByokKeys } from '../lib/ai-generator'
import { getWorkspacePath, listAgents as listWorkspaceAgents, parseGroups } from '../lib/workspace'
import { addTemplateFeedback, getAllTemplateFeedbackSummaries, getTemplateApplyCount, getTemplateFeedbackSummary } from '../lib/template-feedback'
import { getAuthenticatedSession } from '../lib/github-auth'

const router = Router()

function resolveSessionAuthor(req: any): string | undefined {
  const session = getAuthenticatedSession(req)
  if (!session) return undefined
  return (session.name || session.login || session.email || '').trim() || undefined
}

type CustomizationValidationInput = {
  githubRepo?: string
  useGithub?: boolean
  workflows?: Array<{ id: string; name?: string; content?: string }>
}

function getOrganizationTemplateConflicts(template: any, options?: {
  prefix?: string
  suffix?: string
  includeBuiltIn?: boolean
  agentCounts?: Record<string, number>
}) {
  const prefix = options?.prefix || ''
  const suffix = options?.suffix || ''
  const includeBuiltIn = options?.includeBuiltIn !== false
  const workspacePath = getWorkspacePath()
  const existingAgentIds = new Set(listWorkspaceAgents().map((agent) => agent.id))

  const paramAgentIds = new Set((template.parameters || []).map((param: any) => param.agentId))
  const expandedAgents = (template.agents || []).flatMap((agent: any) => {
    if (paramAgentIds.has(agent.id)) {
      const count = options?.agentCounts?.[agent.id] || (template.parameters || []).find((param: any) => param.agentId === agent.id)?.default || 1
      return Array.from({ length: count }, (_, i) => ({
        ...agent,
        id: count === 1 ? agent.id : `${agent.id}${i + 1}`,
      }))
    }
    return [agent]
  })
  const agentsToCreate = includeBuiltIn ? expandedAgents : expandedAgents.filter((agent: any) => !(agent.tags || []).includes('built-in'))
  const agentConflicts = agentsToCreate
    .map((agent: any) => `${prefix}${agent.id}${suffix}`)
    .filter((agentId: string) => existingAgentIds.has(agentId))

  const normalize = (value: string) => value.trim().toLowerCase()
  const referencedGroups = new Set<string>()
  const referencedCommunities = new Set<string>()
  const referencedWorkflowNames = new Set<string>()
  const referencedWorkflowIds = new Set<string>()
  const workflowConflictNames = new Set<string>()
  const templateWorkflowIds = new Set<string>()

  for (const group of template.groups || []) {
    if (group.name?.trim()) referencedGroups.add(group.name.trim())
    if (group.community?.trim()) referencedCommunities.add(group.community.trim())
  }
  for (const community of template.communities || []) {
    if (community.name?.trim()) referencedCommunities.add(community.name.trim())
  }
  for (const agent of template.agents || []) {
    for (const groupName of agent.groups || []) {
      if (groupName?.trim()) referencedGroups.add(groupName.trim())
    }
    for (const communityName of agent.communities || []) {
      if (communityName?.trim()) referencedCommunities.add(communityName.trim())
    }
  }
  for (const workflow of template.workflows || []) {
    if (workflow.id?.trim()) {
      referencedWorkflowIds.add(workflow.id.trim())
      templateWorkflowIds.add(workflow.id.trim())
    }
    if (workflow.name?.trim()) referencedWorkflowNames.add(workflow.name.trim())
    for (const groupName of workflow.targeting?.groups || []) {
      if (groupName?.trim()) referencedGroups.add(groupName.trim())
    }
    for (const communityName of workflow.targeting?.communities || []) {
      if (communityName?.trim()) referencedCommunities.add(communityName.trim())
    }
  }

  const existingGroupNames = new Set<string>()
  const existingCommunityNames = new Set<string>()
  const existingWorkflowNames = new Set<string>()
  const existingWorkflowIds = new Set<string>()
  const groupsPath = path.join(workspacePath, 'ORG', 'GROUPS.md')
  const communitiesPath = path.join(workspacePath, 'ORG', 'COMMUNITIES.md')
  if (fs.existsSync(groupsPath)) {
    const parsed = parseGroups(fs.readFileSync(groupsPath, 'utf-8'))
    for (const group of parsed.groups) {
      if (group.name?.trim()) existingGroupNames.add(normalize(group.name))
    }
  }
  if (fs.existsSync(communitiesPath)) {
    const parsed = parseGroups(fs.readFileSync(communitiesPath, 'utf-8'))
    for (const community of parsed.communities) {
      if (community.name?.trim()) existingCommunityNames.add(normalize(community.name))
    }
  }
  for (const workflow of listWorkflows()) {
    if (workflow.name?.trim()) existingWorkflowNames.add(normalize(workflow.name))
    if (workflow.id?.trim()) existingWorkflowIds.add(workflow.id.trim())
  }

  for (const workflow of template.workflows || []) {
    const workflowName = workflow.name?.trim()
    const workflowId = workflow.id?.trim()
    if (workflowName && existingWorkflowNames.has(normalize(workflowName))) {
      workflowConflictNames.add(workflowName)
      continue
    }
    if (workflowId && existingWorkflowIds.has(workflowId)) {
      workflowConflictNames.add(workflowName || workflowId)
      continue
    }
    for (const dependency of workflow.dependsOn || []) {
      const dep = String(dependency || '').trim()
      if (!dep) continue
      if (!templateWorkflowIds.has(dep) && existingWorkflowIds.has(dep)) {
        workflowConflictNames.add(workflowName || workflowId || dep)
        break
      }
    }
  }

  return {
    agentConflicts,
    groupConflicts: Array.from(referencedGroups).filter((name) => existingGroupNames.has(normalize(name))),
    communityConflicts: Array.from(referencedCommunities).filter((name) => existingCommunityNames.has(normalize(name))),
    workflowConflicts: Array.from(workflowConflictNames),
  }
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
  return (
    !trimmed ||
    /^\[[^\]]*\]$/.test(trimmed) ||
    /^\{\{[^}]+\}\}$/.test(trimmed) ||
    trimmed === '...' ||
    trimmed === '…'
  )
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

// GET /api/templates/feedback/summary - Get all local feedback summaries keyed by type:slug
router.get('/feedback/summary', async (_req, res) => {
  const templates = [
    ...listTemplates('agent').map((template) => ({ templateType: 'agent' as const, templateSlug: template.slug || slugify(template.name) })),
    ...listTemplates('organization').map((template) => ({ templateType: 'organization' as const, templateSlug: template.slug || slugify(template.name) })),
  ]
  try {
    res.json({ summaries: await getAllTemplateFeedbackSummaries(templates) })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load template feedback summaries' })
  }
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

// GET /api/templates/:type/:slug/feedback - Get local feedback summary for a template
router.get('/:type/:slug/feedback', async (req, res) => {
  const { type, slug } = req.params
  if (type !== 'agents' && type !== 'organizations') {
    return res.status(400).json({ error: 'Type must be "agents" or "organizations"' })
  }

  const templateType = type === 'agents' ? 'agent' : 'organization'
  try {
    const summary = await getTemplateFeedbackSummary(templateType, slug)
    res.json(summary)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load template feedback summary' })
  }
})

// POST /api/templates/:type/:slug/feedback - Save local feedback for a template
router.post('/:type/:slug/feedback', async (req, res) => {
  const { type, slug } = req.params
  if (type !== 'agents' && type !== 'organizations') {
    return res.status(400).json({ error: 'Type must be "agents" or "organizations"' })
  }

  const templateType = type === 'agents' ? 'agent' : 'organization'
  const template = getTemplate(templateType, slug)
  if (!template) {
    return res.status(404).json({ error: 'Template not found' })
  }

  const {
    rating,
    easyToUse,
    solvedUseCase,
    customized,
    otherUseCases,
    suggestions,
  } = req.body || {}

  const easyToUseValue = easyToUse === 'yes' || easyToUse === 'mixed' || easyToUse === 'no' ? easyToUse : ''
  const solvedUseCaseValue = solvedUseCase === 'yes' || solvedUseCase === 'partly' || solvedUseCase === 'no' ? solvedUseCase : ''
  const customizedValue = customized === 'yes' || customized === 'a-little' || customized === 'no' ? customized : ''

  const numericRating = Number(rating)
  if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' })
  }

  const session = getAuthenticatedSession(req)
  const actorKey = session?.email || session?.login || 'dashboard-user'
  const actorDisplay = session?.name || session?.email || session?.login || 'Dashboard User'
  const feedbackMetadata = buildTemplateFeedbackMetadata(template as any)

  try {
    const result = await addTemplateFeedback({
      templateType: feedbackMetadata.templateType,
      templateSlug: slug,
      templateId: feedbackMetadata.templateId,
      templateSource: feedbackMetadata.templateSource,
      applyCount: getTemplateApplyCount(feedbackMetadata.templateId),
      templateTags: feedbackMetadata.templateTags,
      templateInfo: feedbackMetadata.templateInfo,
      templateName: template.name,
      rating: numericRating,
      easyToUse: easyToUseValue,
      solvedUseCase: solvedUseCaseValue,
      customized: customizedValue,
      otherUseCases: typeof otherUseCases === 'string' ? otherUseCases.trim() : '',
      suggestions: typeof suggestions === 'string' ? suggestions.trim() : '',
    }, {
      actorKey,
      actorDisplay,
    })

    res.json({ ok: true, summary: result.summary })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save template feedback' })
  }
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

// PUT /api/templates/:type/:slug - Create or update a workspace template
router.put('/:type/:slug', (req, res) => {
  try {
    const { type, slug } = req.params
    if (type !== 'agents' && type !== 'organizations') {
      return res.status(400).json({ error: 'Type must be "agents" or "organizations"' })
    }

    const template = req.body
    if (!template || typeof template !== 'object') {
      return res.status(400).json({ error: 'Template body is required' })
    }
    const templateFiles = template.templateFiles

    const templateType = type === 'agents' ? 'agent' : 'organization'
    if (template.type !== templateType) {
      return res.status(400).json({ error: `Template body type must be "${templateType}"` })
    }

    const validation = validateTemplate(template)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.errors?.[0] || 'Template validation failed', errors: validation.errors })
    }

    const result = saveTemplate(template, { existingSlug: slug })
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'Failed to save template' })
    }

    if (templateType === 'agent' && result.path && templateFiles && typeof templateFiles === 'object') {
      if (typeof templateFiles.identity === 'string') {
        fs.writeFileSync(path.join(result.path, 'IDENTITY.md'), templateFiles.identity, 'utf-8')
      }
      if (typeof templateFiles.soul === 'string') {
        fs.writeFileSync(path.join(result.path, 'SOUL.md'), templateFiles.soul, 'utf-8')
      }
      if (typeof templateFiles.tools === 'string') {
        fs.writeFileSync(path.join(result.path, 'TOOLS.md'), templateFiles.tools, 'utf-8')
      }
    }

    const nextSlug = slugify(template.name)
    if (slug && slug !== nextSlug) {
      deleteTemplate(templateType, slug)
    }

    const savedTemplate = getTemplate(templateType, nextSlug)
    res.json({ ok: true, slug: nextSlug, template: savedTemplate || template })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save template' })
  }
})

// GET /api/templates/agents/:slug/files - read template config files for editing
router.get('/agents/:slug/files', (req, res) => {
  try {
    const { slug } = req.params
    const template = getTemplate('agent', slug) as any
    if (!template) {
      return res.status(404).json({ error: 'Template not found' })
    }

    const candidateDirs = [
      path.join(getAgentTemplatesDir(), slug),
      template.metadata?.basedOnSlug && template.metadata?.basedOnSource === 'workspace'
        ? path.join(getAgentTemplatesDir(), template.metadata.basedOnSlug)
        : null,
      template.metadata?.basedOnSlug && template.metadata?.basedOnSource === 'system'
        ? path.join(getGlobalAgentTemplatesDir(), template.metadata.basedOnSlug)
        : null,
      path.join(getGlobalAgentTemplatesDir(), slug),
    ].filter((dir): dir is string => !!dir && fs.existsSync(dir))

    if (template.source === 'workspace' && (!template.metadata?.basedOnSlug || !template.metadata?.basedOnSource)) {
      const sourceAgentId = template.agents?.[0]?.id
      const normalizedName = String(template.name || '').replace(/\s+copy$/i, '').trim().toLowerCase()
      const systemTemplateMatch = listTemplates('agent').find((entry: any) => {
        if (entry.source !== 'system' || !entry.slug) return false
        if (sourceAgentId && entry.agents?.[0]?.id === sourceAgentId) return true
        return String(entry.name || '').trim().toLowerCase() === normalizedName
      })
      if (systemTemplateMatch?.slug) {
        const inferredDir = path.join(getGlobalAgentTemplatesDir(), systemTemplateMatch.slug)
        if (fs.existsSync(inferredDir)) {
          candidateDirs.push(inferredDir)
        }
      }
    }

    const readFile = (name: string) => {
      for (const dir of candidateDirs) {
        const filePath = path.join(dir, name)
        if (!fs.existsSync(filePath)) continue
        const content = fs.readFileSync(filePath, 'utf-8')
        if (content.trim()) return content
      }
      return ''
    }
    res.json({
      identity: readFile('IDENTITY.md'),
      soul: readFile('SOUL.md'),
      tools: readFile('TOOLS.md'),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load template files' })
  }
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
  const { description, byokKeys, generationTarget } = req.body
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ error: 'description is required' })
  }

  try {
    setRequestByokKeys(byokKeys && typeof byokKeys === 'object' ? byokKeys : undefined)
    const template = await generateTemplateFromNL(
      description,
      normalizeTemplateGenerationTarget(generationTarget),
      resolveSessionAuthor(req) || 'ClawMax AI',
    )
    res.json({ ok: true, template })
  } catch (err: any) {
    console.error('Error generating template:', err)
    const message = err?.message || 'Failed to generate template'
    if (/No API key configured/i.test(message)) {
      return res.status(400).json({
        error: 'AI generation needs a configured browser key or shared preferred model. Open Workspaces Integrations or Keys & Secrets first.',
      })
    }
    res.status(500).json({ error: message })
  } finally {
    setRequestByokKeys(undefined)
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

router.post('/organizations/conflicts', (req, res) => {
  const { templateSlug, prefix, suffix, includeBuiltIn, agentCounts } = req.body
  if (!templateSlug || typeof templateSlug !== 'string') {
    return res.status(400).json({ error: 'templateSlug is required' })
  }

  const template = getTemplate('organization', templateSlug) as any
  if (!template) {
    return res.status(404).json({ error: 'Template not found' })
  }

  const conflicts = getOrganizationTemplateConflicts(template, {
    prefix: typeof prefix === 'string' ? prefix : undefined,
    suffix: typeof suffix === 'string' ? suffix : undefined,
    includeBuiltIn: includeBuiltIn !== false,
    agentCounts: agentCounts && typeof agentCounts === 'object' ? agentCounts : undefined,
  })

  res.json({
    ok: true,
    agentConflicts: conflicts.agentConflicts,
    groupConflicts: conflicts.groupConflicts,
    communityConflicts: conflicts.communityConflicts,
    workflowConflicts: conflicts.workflowConflicts,
  })
})

router.post('/organizations/import', (req, res) => {
  const { templateSlug, prefix, suffix, includeBuiltIn, modelOverride, agentCounts, workflowOverrides, groupRenames, communityRenames, workflowRenames } = req.body

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
    groupRenames: groupRenames || undefined,
    communityRenames: communityRenames || undefined,
    workflowRenames: workflowRenames || undefined,
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

  let agentFiles = undefined
  if (templateType === 'organization') {
    let templateDir = path.join(getOrgTemplatesDir(), slug)
    let isWorkspaceTemplate = true
    if (!fs.existsSync(path.join(templateDir, 'template.json')) && !fs.existsSync(path.join(templateDir, 'TEMPLATE.md'))) {
      templateDir = path.join(getGlobalOrgTemplatesDir(), slug)
      isWorkspaceTemplate = false
    }
    if (fs.existsSync(templateDir)) {
      agentFiles = readOrganizationTemplateAgentFiles(templateDir)
      if (isWorkspaceTemplate && (!agentFiles || Object.keys(agentFiles).length === 0)) {
        agentFiles = readWorkspaceAgentFilesForOrganizationTemplate(template)
        if (agentFiles && Object.keys(agentFiles).length > 0) {
          for (const [agentId, files] of Object.entries(agentFiles)) {
            const agentDir = path.join(templateDir, 'agents', agentId)
            fs.mkdirSync(agentDir, { recursive: true })
            for (const [filename, fileContent] of Object.entries(files || {})) {
              fs.writeFileSync(path.join(agentDir, filename), fileContent, 'utf-8')
            }
          }
        }
      }
    }
  }

  const md = templateToMarkdown(template, { agentFiles })
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

    if (validation.template.type === 'organization' && result.path && validation.agentFiles && typeof validation.agentFiles === 'object') {
      for (const [agentId, files] of Object.entries(validation.agentFiles)) {
        const agentDir = path.join(result.path, 'agents', agentId)
        fs.mkdirSync(agentDir, { recursive: true })
        for (const [filename, fileContent] of Object.entries(files || {})) {
          fs.writeFileSync(path.join(agentDir, filename), fileContent, 'utf-8')
        }
      }
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
