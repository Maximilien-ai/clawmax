import fs from 'fs'
import path from 'path'
import Ajv from 'ajv'
import { getWorkspacePath, getAgentsDir, parseIdentity, listAgents, parseGroups, readWorkspaceFile, writeWorkspaceFile } from './workspace'
import { listWorkflows, createWorkflow } from './workflows'

// Template storage paths (dynamic functions)

// Global templates (shared across all workspaces - ClawMax system templates)
export function getGlobalTemplatesDir(): string {
  const HOME = process.env.HOME || ''
  // ClawMax repo root is ~/.openclaw/workspace
  return path.join(HOME, '.openclaw', 'workspace', 'TEMPLATES')
}

export function getGlobalAgentTemplatesDir(): string {
  return path.join(getGlobalTemplatesDir(), 'agents')
}

export function getGlobalOrgTemplatesDir(): string {
  return path.join(getGlobalTemplatesDir(), 'organizations')
}

// Workspace templates (private to current workspace - user-created)
export function getTemplatesDir(): string {
  return path.join(getWorkspacePath(), 'TEMPLATES')
}

export function getAgentTemplatesDir(): string {
  return path.join(getTemplatesDir(), 'agents')
}

export function getOrgTemplatesDir(): string {
  return path.join(getTemplatesDir(), 'organizations')
}

// Ensure template directories exist
export function ensureTemplateDirs(): void {
  // Global directories
  fs.mkdirSync(getGlobalAgentTemplatesDir(), { recursive: true })
  fs.mkdirSync(getGlobalOrgTemplatesDir(), { recursive: true })

  // Workspace directories
  fs.mkdirSync(getAgentTemplatesDir(), { recursive: true })
  fs.mkdirSync(getOrgTemplatesDir(), { recursive: true })
}

// ============================================================================
// TypeScript Types
// ============================================================================

export interface AgentTemplateAgent {
  id: string
  name?: string
  role: string
  tags?: string[]
  skills?: string[]
}

export interface AgentTemplate {
  name: string
  type: 'agent'
  version: string
  description?: string
  author?: string
  tags?: string[]
  agents: [AgentTemplateAgent]  // Always exactly 1 agent
  metadata?: {
    aiPrompt?: string
    model?: string
    createdAt?: string
  }
}

export interface OrganizationTemplateAgent {
  id: string
  name?: string
  role: string
  tags?: string[]
  skills?: string[]
  communities?: string[]
  groups?: string[]
}

export interface Community {
  name: string
  description?: string
  tags?: string[]
  channels?: string[]
}

export interface Group {
  name: string
  description?: string
  tags?: string[]
  community?: string
  channels?: string[]
}

export interface Workflow {
  id: string
  name: string
  description: string
  schedule: string
  enabled: boolean
  executionMode: 'automated' | 'managed'
  targeting: {
    communities: string[]
    groups: string[]
    tags: string[]
    agents: string[]
  }
  content: string
}

export interface OrganizationTemplate {
  name: string
  type: 'organization'
  version: string
  description?: string
  author?: string
  tags?: string[]
  agents: OrganizationTemplateAgent[]
  communities?: Community[]
  groups?: Group[]
  workflows?: Workflow[]
}

export type Template = AgentTemplate | OrganizationTemplate

// ============================================================================
// Template Validation
// ============================================================================

const ajv = new Ajv({ strict: false, validateFormats: false })

// Load schemas
const agentSchemaPath = path.join(__dirname, '..', 'schemas', 'agent-template.schema.json')
const orgSchemaPath = path.join(__dirname, '..', 'schemas', 'organization-template.schema.json')

const agentSchema = JSON.parse(fs.readFileSync(agentSchemaPath, 'utf-8'))
const orgSchema = JSON.parse(fs.readFileSync(orgSchemaPath, 'utf-8'))

const validateAgentTemplate = ajv.compile(agentSchema)
const validateOrgTemplate = ajv.compile(orgSchema)

export function validateTemplate(template: any): { valid: boolean; errors?: string[] } {
  if (template.type === 'agent') {
    const valid = validateAgentTemplate(template)
    if (!valid) {
      return {
        valid: false,
        errors: validateAgentTemplate.errors?.map(e => `${e.instancePath} ${e.message}`) || []
      }
    }
  } else if (template.type === 'organization') {
    const valid = validateOrgTemplate(template)
    if (!valid) {
      return {
        valid: false,
        errors: validateOrgTemplate.errors?.map(e => `${e.instancePath} ${e.message}`) || []
      }
    }
  } else {
    return { valid: false, errors: ['Template type must be "agent" or "organization"'] }
  }
  return { valid: true }
}

// ============================================================================
// Template Storage Operations
// ============================================================================

/**
 * Generate a filesystem-safe slug from a template name
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Save template to filesystem
 */
export function saveTemplate(template: Template): { ok: boolean; path?: string; error?: string } {
  try {
    ensureTemplateDirs()

    // Validate template
    const validation = validateTemplate(template)
    if (!validation.valid) {
      return { ok: false, error: `Validation failed: ${validation.errors?.join(', ')}` }
    }

    // Determine storage path
    const slug = slugify(template.name)
    const templateDir = template.type === 'agent'
      ? path.join(getAgentTemplatesDir(), slug)
      : path.join(getOrgTemplatesDir(), slug)

    // Create template directory
    fs.mkdirSync(templateDir, { recursive: true })

    // Write template.json
    const templateJsonPath = path.join(templateDir, 'template.json')
    fs.writeFileSync(templateJsonPath, JSON.stringify(template, null, 2), 'utf-8')

    return { ok: true, path: templateDir }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * List all templates of a given type
 */
export function listTemplates(type?: 'agent' | 'organization'): Template[] {
  ensureTemplateDirs()
  const templates: Template[] = []
  const seen = new Set<string>() // Track by name to avoid duplicates

  const dirs = []

  // Collect templates from both global and workspace directories
  if (!type || type === 'agent') {
    // Global agent templates (system)
    try {
      const globalAgentDirs = fs.readdirSync(getGlobalAgentTemplatesDir(), { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(getGlobalAgentTemplatesDir(), d.name))
      dirs.push(...globalAgentDirs)
    } catch {}

    // Workspace agent templates (user-created)
    try {
      const agentDirs = fs.readdirSync(getAgentTemplatesDir(), { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(getAgentTemplatesDir(), d.name))
      dirs.push(...agentDirs)
    } catch {}
  }

  if (!type || type === 'organization') {
    // Global org templates (system)
    try {
      const globalOrgDirs = fs.readdirSync(getGlobalOrgTemplatesDir(), { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(getGlobalOrgTemplatesDir(), d.name))
      dirs.push(...globalOrgDirs)
    } catch {}

    // Workspace org templates (user-created)
    try {
      const orgDirs = fs.readdirSync(getOrgTemplatesDir(), { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(getOrgTemplatesDir(), d.name))
      dirs.push(...orgDirs)
    } catch {}
  }

  for (const dir of dirs) {
    try {
      const templateJsonPath = path.join(dir, 'template.json')
      if (fs.existsSync(templateJsonPath)) {
        const template = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'))
        // Avoid duplicates (workspace templates override global)
        if (!seen.has(template.name)) {
          seen.add(template.name)
          templates.push(template)
        }
      }
    } catch (err) {
      console.error(`Failed to read template at ${dir}:`, err)
    }
  }

  return templates
}

/**
 * Get a specific template by type and name slug
 * Checks workspace first (user templates), then global (system templates)
 */
export function getTemplate(type: 'agent' | 'organization', slug: string): Template | null {
  ensureTemplateDirs()

  // Check workspace templates first (user-created, higher priority)
  const workspaceTemplateDir = type === 'agent'
    ? path.join(getAgentTemplatesDir(), slug)
    : path.join(getOrgTemplatesDir(), slug)

  const workspaceTemplatePath = path.join(workspaceTemplateDir, 'template.json')
  if (fs.existsSync(workspaceTemplatePath)) {
    try {
      return JSON.parse(fs.readFileSync(workspaceTemplatePath, 'utf-8'))
    } catch {}
  }

  // Check global templates second (system templates)
  const globalTemplateDir = type === 'agent'
    ? path.join(getGlobalAgentTemplatesDir(), slug)
    : path.join(getGlobalOrgTemplatesDir(), slug)

  const globalTemplatePath = path.join(globalTemplateDir, 'template.json')
  if (fs.existsSync(globalTemplatePath)) {
    try {
      return JSON.parse(fs.readFileSync(globalTemplatePath, 'utf-8'))
    } catch {}
  }

  return null
}

/**
 * Delete a template
 */
export function deleteTemplate(type: 'agent' | 'organization', slug: string): { ok: boolean; error?: string } {
  try {
    const templateDir = type === 'agent'
      ? path.join(getAgentTemplatesDir(), slug)
      : path.join(getOrgTemplatesDir(), slug)

    if (!fs.existsSync(templateDir)) {
      return { ok: false, error: 'Template not found' }
    }

    fs.rmSync(templateDir, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ============================================================================
// Agent File Operations
// ============================================================================

/**
 * Copy agent files (SOUL.md, TOOLS.md, IDENTITY.md) to template directory
 * For agent templates: copies directly to template root
 * For org templates: copies to agents/{agentId}/ subdirectory
 */
export function copyAgentFilesToTemplate(
  agentId: string,
  templateDir: string,
  isOrgTemplate = false
): { ok: boolean; error?: string } {
  try {
    const agentDir = path.join(getAgentsDir(), agentId)

    // Agent templates: put files directly in template root
    // Org templates: put files in agents/{agentId}/ subdirectory
    const targetDir = isOrgTemplate
      ? path.join(templateDir, 'agents', agentId)
      : templateDir

    if (!fs.existsSync(agentDir)) {
      return { ok: false, error: `Agent directory not found: ${agentDir}` }
    }

    // Create target directory
    fs.mkdirSync(targetDir, { recursive: true })

    // Copy SOUL.md, TOOLS.md, IDENTITY.md
    const files = ['SOUL.md', 'TOOLS.md', 'IDENTITY.md']
    for (const file of files) {
      const srcPath = path.join(agentDir, file)
      const dstPath = path.join(targetDir, file)
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, dstPath)
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Copy agent files from template to agent directory
 * For agent templates: reads from template root
 * For org templates: reads from agents/{agentId}/ subdirectory
 */
export function copyAgentFilesFromTemplate(
  templateDir: string,
  sourceAgentId: string,
  targetAgentId: string,
  isOrgTemplate = false
): { ok: boolean; error?: string } {
  try {
    // Agent templates: read from template root
    // Org templates: read from agents/{agentId}/ subdirectory
    const templateAgentDir = isOrgTemplate
      ? path.join(templateDir, 'agents', sourceAgentId)
      : templateDir

    const targetAgentDir = path.join(getAgentsDir(), targetAgentId)

    if (!fs.existsSync(templateAgentDir)) {
      return { ok: false, error: `Template agent directory not found: ${templateAgentDir}` }
    }

    // Create target directory
    fs.mkdirSync(targetAgentDir, { recursive: true })

    // Copy and transform files
    const files = ['SOUL.md', 'TOOLS.md', 'IDENTITY.md']
    for (const file of files) {
      const srcPath = path.join(templateAgentDir, file)
      const dstPath = path.join(targetAgentDir, file)

      if (fs.existsSync(srcPath)) {
        let content = fs.readFileSync(srcPath, 'utf-8')

        // Replace agent ID references in IDENTITY.md
        if (file === 'IDENTITY.md') {
          content = content.replace(
            new RegExp(`\\b${sourceAgentId}\\b`, 'g'),
            targetAgentId
          )
        }

        fs.writeFileSync(dstPath, content, 'utf-8')
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ============================================================================
// Template Import - Create Agents from Templates
// ============================================================================

/**
 * Import an agent from a template, creating a new agent in AGENTS/ directory
 */
export function importAgentFromTemplate(
  templateSlug: string,
  options: {
    newAgentId?: string
    model?: string
    port?: number
    whatsapp?: string
  }
): { ok: boolean; agentId?: string; error?: string } {
  try {
    // Check workspace templates first (user-created, higher priority)
    let templateDir = path.join(getAgentTemplatesDir(), templateSlug)
    let templateJsonPath = path.join(templateDir, 'template.json')

    // If not found in workspace, check global system templates
    if (!fs.existsSync(templateJsonPath)) {
      templateDir = path.join(getGlobalAgentTemplatesDir(), templateSlug)
      templateJsonPath = path.join(templateDir, 'template.json')
    }

    if (!fs.existsSync(templateJsonPath)) {
      return { ok: false, error: `Template not found: ${templateSlug}` }
    }

    const template: AgentTemplate = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'))

    if (template.type !== 'agent') {
      return { ok: false, error: 'Only agent templates can be imported via this endpoint' }
    }

    if (template.agents.length !== 1) {
      return { ok: false, error: 'Agent template must contain exactly 1 agent' }
    }

    const sourceAgent = template.agents[0]
    const targetAgentId = options.newAgentId || sourceAgent.id

    // Validate target agent ID
    if (!/^[a-z][a-z0-9_-]*$/.test(targetAgentId)) {
      return { ok: false, error: 'Invalid agent ID format' }
    }

    const targetAgentDir = path.join(getAgentsDir(), targetAgentId)
    if (fs.existsSync(targetAgentDir)) {
      return { ok: false, error: `Agent already exists: ${targetAgentId}` }
    }

    // Copy template files to new agent directory (isOrgTemplate = false)
    const copyResult = copyAgentFilesFromTemplate(
      templateDir,
      sourceAgent.id,
      targetAgentId,
      false
    )

    if (!copyResult.ok) {
      return { ok: false, error: copyResult.error }
    }

    // Update IDENTITY.md with new agent ID and optional metadata
    const identityPath = path.join(targetAgentDir, 'IDENTITY.md')
    if (fs.existsSync(identityPath)) {
      let identity = fs.readFileSync(identityPath, 'utf-8')

      // Replace agent ID in identity content
      identity = identity.replace(
        new RegExp(`\\b${sourceAgent.id}\\b`, 'g'),
        targetAgentId
      )

      // Update model if provided
      if (options.model) {
        identity = identity.replace(
          /\*\*Model:\*\*\s+.+/,
          `**Model:** ${options.model}`
        )
      }

      // Add creation metadata
      const now = new Date().toISOString()
      const metadataSection = `
## Creation Metadata
- **Created:** ${now}
- **Source Template:** ${template.name} (v${template.version})
${options.model ? `- **Model:** ${options.model}` : ''}
${template.author ? `- **Template Author:** ${template.author}` : ''}
`

      // Insert metadata before the first ## heading or at the end
      const firstHeading = identity.match(/\n## /)?.[0]
      if (firstHeading) {
        identity = identity.replace(/\n## /, `${metadataSection}\n## `)
      } else {
        identity += `\n${metadataSection}`
      }

      fs.writeFileSync(identityPath, identity, 'utf-8')
    }

    return { ok: true, agentId: targetAgentId }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ============================================================================
// Template Creation from Existing Agents
// ============================================================================

/**
 * Create an agent template from an existing agent
 */
export function createAgentTemplateFromAgent(
  agentId: string,
  templateName: string,
  options?: {
    description?: string
    author?: string
    tags?: string[]
  }
): { ok: boolean; template?: AgentTemplate; error?: string } {
  try {
    const agentDir = path.join(getAgentsDir(), agentId)
    if (!fs.existsSync(agentDir)) {
      return { ok: false, error: `Agent not found: ${agentId}` }
    }

    // Read agent IDENTITY.md to extract metadata
    const identityPath = path.join(agentDir, 'IDENTITY.md')
    const identityContent = fs.existsSync(identityPath)
      ? fs.readFileSync(identityPath, 'utf-8')
      : ''

    const identity = parseIdentity(identityContent)

    // Extract creation metadata if available
    let aiPrompt: string | undefined
    let model: string | undefined
    let createdAt: string | undefined

    const metadataMatch = identityContent.match(/## Creation Metadata\s+([\s\S]*?)(?=\n##|\n---|$)/i)
    if (metadataMatch) {
      const metadataSection = metadataMatch[1]
      const modelMatch = metadataSection.match(/\*\*Model:\*\*\s+(.+)/i)
      const aiDescMatch = metadataSection.match(/\*\*AI Description:\*\*\s+(.+)/i)
      const createdMatch = metadataSection.match(/\*\*Created:\*\*\s+(.+)/i)

      if (modelMatch) model = modelMatch[1].trim()
      if (aiDescMatch && aiDescMatch[1].trim() !== 'N/A') aiPrompt = aiDescMatch[1].trim()
      if (createdMatch) createdAt = createdMatch[1].trim()
    }

    // Create template object
    const template: AgentTemplate = {
      name: templateName,
      type: 'agent',
      version: '1.0.0',
      description: options?.description,
      author: options?.author,
      tags: options?.tags || identity.tags || [],
      agents: [{
        id: agentId,
        name: identity.name || agentId,
        role: identity.creature || 'AI Agent',
        tags: identity.tags || [],
        skills: []  // TODO: Extract from skills/ directory when implemented
      }],
      metadata: {
        aiPrompt,
        model,
        createdAt
      }
    }

    // Validate template
    const validation = validateTemplate(template)
    if (!validation.valid) {
      return { ok: false, error: `Validation failed: ${validation.errors?.join(', ')}` }
    }

    // Save template
    const saveResult = saveTemplate(template)
    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error }
    }

    // Copy agent files to template directory (isOrgTemplate = false)
    const copyResult = copyAgentFilesToTemplate(agentId, saveResult.path!, false)
    if (!copyResult.ok) {
      return { ok: false, error: copyResult.error }
    }

    return { ok: true, template }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Create an organization template from the current workspace state
 * Exports all agents, communities, and groups
 */
export function createOrganizationTemplate(
  templateName: string,
  options?: {
    description?: string
    author?: string
    tags?: string[]
  }
): { ok: boolean; template?: OrganizationTemplate; error?: string } {
  try {
    // Filter out archived agents
    const allAgents = listAgents()
    const agents = allAgents.filter(a => !a.archived)

    if (agents.length === 0) {
      return { ok: false, error: 'No active agents found in workspace' }
    }

    // Build maps for communities and groups
    const communityMap = new Map<string, Community>()
    const groupMap = new Map<string, Group>()

    // Process each agent to extract communities and groups
    for (const agentInfo of agents) {
      const agentDir = path.join(getAgentsDir(), agentInfo.id)

      // Read IDENTITY.md for agent metadata
      const identityPath = path.join(agentDir, 'IDENTITY.md')
      const identityContent = fs.existsSync(identityPath)
        ? fs.readFileSync(identityPath, 'utf-8')
        : ''
      const identity = parseIdentity(identityContent)

      // Read COMMUNITIES.md and GROUPS.md if they exist
      const communitiesPath = path.join(agentDir, 'COMMUNITIES.md')
      const groupsPath = path.join(agentDir, 'GROUPS.md')

      if (fs.existsSync(communitiesPath)) {
        const content = fs.readFileSync(communitiesPath, 'utf-8')
        const { communities } = parseGroups(content)

        for (const comm of communities) {
          if (!communityMap.has(comm.name)) {
            communityMap.set(comm.name, {
              name: comm.name,
              description: comm.description || undefined,
              tags: comm.tags || [],
              channels: comm.channels || []
            })
          }
        }
      }

      if (fs.existsSync(groupsPath)) {
        const content = fs.readFileSync(groupsPath, 'utf-8')
        const { groups } = parseGroups(content)

        for (const grp of groups) {
          if (!groupMap.has(grp.name)) {
            groupMap.set(grp.name, {
              name: grp.name,
              description: grp.description || undefined,
              tags: grp.tags || [],
              channels: grp.channels || [],
              community: grp.community || undefined
            })
          }
        }
      }
    }

    // Build organization template
    const templateAgents: OrganizationTemplateAgent[] = agents.map(agentInfo => {
      const agentDir = path.join(getAgentsDir(), agentInfo.id)
      const identityPath = path.join(agentDir, 'IDENTITY.md')
      const identityContent = fs.existsSync(identityPath)
        ? fs.readFileSync(identityPath, 'utf-8')
        : ''
      const identity = parseIdentity(identityContent)

      // Get agent's communities and groups
      const agentCommunities: string[] = []
      const agentGroups: string[] = []

      const communitiesPath = path.join(agentDir, 'COMMUNITIES.md')
      const groupsPath = path.join(agentDir, 'GROUPS.md')

      if (fs.existsSync(communitiesPath)) {
        const content = fs.readFileSync(communitiesPath, 'utf-8')
        const { communities } = parseGroups(content)
        agentCommunities.push(...communities.map(c => c.name))
      }

      if (fs.existsSync(groupsPath)) {
        const content = fs.readFileSync(groupsPath, 'utf-8')
        const { groups } = parseGroups(content)
        agentGroups.push(...groups.map(g => g.name))
      }

      return {
        id: agentInfo.id,
        name: identity.name || agentInfo.id,
        role: identity.creature || 'AI Agent',
        tags: identity.tags || [],
        skills: [],  // TODO: Extract from skills/ directory
        communities: agentCommunities.length > 0 ? agentCommunities : undefined,
        groups: agentGroups.length > 0 ? agentGroups : undefined
      }
    })

    // Get all workflows
    const workflows = listWorkflows()
    const workflowsData: Workflow[] = workflows.map(wf => ({
      id: wf.id,
      name: wf.name,
      description: wf.description,
      schedule: wf.schedule,
      enabled: wf.enabled,
      executionMode: wf.executionMode,
      targeting: wf.targeting,
      content: wf.content
    }))

    const template: OrganizationTemplate = {
      name: templateName,
      type: 'organization',
      version: '1.0.0',
      description: options?.description,
      author: options?.author,
      tags: options?.tags || [],
      agents: templateAgents,
      communities: communityMap.size > 0 ? Array.from(communityMap.values()) : undefined,
      groups: groupMap.size > 0 ? Array.from(groupMap.values()) : undefined,
      workflows: workflowsData.length > 0 ? workflowsData : undefined
    }

    // Validate template
    const validation = validateTemplate(template)
    if (!validation.valid) {
      return { ok: false, error: `Validation failed: ${validation.errors?.join(', ')}` }
    }

    // Save template
    const saveResult = saveTemplate(template)
    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error }
    }

    // Copy agent files to template directory (isOrgTemplate = true)
    for (const agentInfo of agents) {
      const copyResult = copyAgentFilesToTemplate(agentInfo.id, saveResult.path!, true)
      if (!copyResult.ok) {
        // Clean up and return error
        try {
          fs.rmSync(saveResult.path!, { recursive: true, force: true })
        } catch {}
        return { ok: false, error: `Failed to copy agent files: ${copyResult.error}` }
      }
    }

    return { ok: true, template }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Import an organization template and create all agents, communities, and groups
 * Supports prefix/suffix for agent IDs to avoid conflicts
 */
export function importOrganizationTemplate(
  templateSlug: string,
  options?: {
    prefix?: string
    suffix?: string
    includeBuiltIn?: boolean
  }
): { ok: boolean; agentIds?: string[]; error?: string } {
  try {
    // Check workspace templates first (user templates)
    let templateDir = path.join(getOrgTemplatesDir(), templateSlug)
    let templateJsonPath = path.join(templateDir, 'template.json')

    // If not found in workspace, check global templates (system templates)
    if (!fs.existsSync(templateJsonPath)) {
      templateDir = path.join(getGlobalOrgTemplatesDir(), templateSlug)
      templateJsonPath = path.join(templateDir, 'template.json')
    }

    if (!fs.existsSync(templateJsonPath)) {
      return { ok: false, error: `Template not found: ${templateSlug}` }
    }

    const template: OrganizationTemplate = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'))

    if (template.type !== 'organization') {
      return { ok: false, error: 'Only organization templates can be imported via this endpoint' }
    }

    // Validate template
    const validation = validateTemplate(template)
    if (!validation.valid) {
      return { ok: false, error: `Template validation failed: ${validation.errors?.join(', ')}` }
    }

    const prefix = options?.prefix || ''
    const suffix = options?.suffix || ''
    const includeBuiltIn = options?.includeBuiltIn !== false // Default to true
    const createdAgents: string[] = []

    // Filter out built-in agents if includeBuiltIn is false
    const agentsToCreate = includeBuiltIn
      ? template.agents
      : template.agents.filter(a => !a.tags?.includes('built-in'))

    try {
      // Step 1: Create all agents with their files
      for (const templateAgent of agentsToCreate) {
        const sourceAgentId = templateAgent.id
        const targetAgentId = `${prefix}${sourceAgentId}${suffix}`

        // Validate target agent ID
        if (!/^[a-z][a-z0-9_-]*$/.test(targetAgentId)) {
          throw new Error(`Invalid agent ID format after prefix/suffix: ${targetAgentId}`)
        }

        const targetAgentDir = path.join(getAgentsDir(), targetAgentId)
        if (fs.existsSync(targetAgentDir)) {
          throw new Error(`Agent already exists: ${targetAgentId}`)
        }

        // Copy agent files from template (isOrgTemplate = true)
        const copyResult = copyAgentFilesFromTemplate(
          templateDir,
          sourceAgentId,
          targetAgentId,
          true
        )

        if (!copyResult.ok) {
          throw new Error(`Failed to copy agent files: ${copyResult.error}`)
        }

        // Add tags to IDENTITY.md if specified in template
        if (templateAgent.tags && templateAgent.tags.length > 0) {
          const identityPath = path.join(targetAgentDir, 'IDENTITY.md')
          if (fs.existsSync(identityPath)) {
            let identityContent = fs.readFileSync(identityPath, 'utf-8')

            // Check if IDENTITY.md already has a Tags field
            const tagsPattern = /^-\s+\*\*Tags:\*\*\s+.+$/m
            const tagsSectionPattern = /^##\s+Tags\s*\n[\s\S]*?(?=\n##|\n---|$)/m

            const tagsLine = `- **Tags:** ${templateAgent.tags.join(', ')}`

            if (tagsPattern.test(identityContent)) {
              // Replace existing Tags field
              identityContent = identityContent.replace(tagsPattern, tagsLine)
            } else if (tagsSectionPattern.test(identityContent)) {
              // Replace Tags section with Tags field
              identityContent = identityContent.replace(tagsSectionPattern, tagsLine)
            } else {
              // Add Tags field after Name/Creature/etc fields
              // Find the first occurrence of WhatsApp field or the first blank line
              const whatsappMatch = identityContent.match(/^-\s+\*\*WhatsApp:\*\*.*$/m)
              if (whatsappMatch) {
                // Insert Tags before WhatsApp
                identityContent = identityContent.replace(
                  /^(-\s+\*\*WhatsApp:\*\*.*$)/m,
                  `${tagsLine}\n$1`
                )
              } else {
                // Find the end of the metadata section (first blank line after Name/Creature)
                const lines = identityContent.split('\n')
                let insertIndex = -1
                let foundMetadata = false

                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].match(/^-\s+\*\*(Name|Creature|Vibe|Emoji):/)) {
                    foundMetadata = true
                  } else if (foundMetadata && lines[i].trim() === '') {
                    insertIndex = i
                    break
                  }
                }

                if (insertIndex > 0) {
                  lines.splice(insertIndex, 0, tagsLine)
                  identityContent = lines.join('\n')
                } else {
                  // Fallback: append after first heading
                  identityContent = identityContent.replace(
                    /^(#[^\n]+\n)/,
                    `$1\n${tagsLine}\n`
                  )
                }
              }
            }

            fs.writeFileSync(identityPath, identityContent, 'utf-8')
          }
        }

        createdAgents.push(targetAgentId)
      }

      // Step 2: Create COMMUNITIES.md for agents with community memberships
      if (template.communities && template.communities.length > 0) {
        for (const templateAgent of agentsToCreate) {
          const targetAgentId = `${prefix}${templateAgent.id}${suffix}`
          const agentCommunities = templateAgent.communities || []

          if (agentCommunities.length > 0) {
            const agentDir = path.join(getAgentsDir(), targetAgentId)
            const communitiesPath = path.join(agentDir, 'COMMUNITIES.md')

            // Build COMMUNITIES.md content
            const communitiesContent = template.communities
              .filter(comm => agentCommunities.includes(comm.name))
              .map(comm => {
                let content = `## ${comm.name}\n\n`
                if (comm.description) content += `${comm.description}\n\n`
                if (comm.tags && comm.tags.length > 0) {
                  content += `**Tags:** ${comm.tags.join(', ')}\n\n`
                }
                if (comm.channels && comm.channels.length > 0) {
                  content += `**Channels:** ${comm.channels.join(', ')}\n\n`
                }
                return content
              })
              .join('\n---\n\n')

            fs.writeFileSync(communitiesPath, `# Communities\n\n${communitiesContent}`, 'utf-8')
          }
        }
      }

      // Step 3: Create GROUPS.md for agents with group memberships
      if (template.groups && template.groups.length > 0) {
        for (const templateAgent of agentsToCreate) {
          const targetAgentId = `${prefix}${templateAgent.id}${suffix}`
          const agentGroups = templateAgent.groups || []

          if (agentGroups.length > 0) {
            const agentDir = path.join(getAgentsDir(), targetAgentId)
            const groupsPath = path.join(agentDir, 'GROUPS.md')

            // Build GROUPS.md content
            const groupsContent = template.groups
              .filter(grp => agentGroups.includes(grp.name))
              .map(grp => {
                let content = `## ${grp.name}\n\n`
                if (grp.description) content += `${grp.description}\n\n`
                if (grp.community) content += `**Community:** ${grp.community}\n\n`
                if (grp.tags && grp.tags.length > 0) {
                  content += `**Tags:** ${grp.tags.join(', ')}\n\n`
                }
                if (grp.channels && grp.channels.length > 0) {
                  content += `**Channels:** ${grp.channels.join(', ')}\n\n`
                }
                return content
              })
              .join('\n---\n\n')

            fs.writeFileSync(groupsPath, `# Groups\n\n${groupsContent}`, 'utf-8')
          }
        }
      }

      // Step 4: Update workspace-level ORG/COMMUNITIES.md and ORG/GROUPS.md
      if (template.communities && template.communities.length > 0) {
        const orgDir = path.join(getWorkspacePath(), 'ORG')
        fs.mkdirSync(orgDir, { recursive: true })

        const communitiesPath = path.join(orgDir, 'COMMUNITIES.md')

        // Read existing communities if file exists
        let existingContent = ''
        const existingCommunityNames = new Set<string>()
        if (fs.existsSync(communitiesPath)) {
          existingContent = fs.readFileSync(communitiesPath, 'utf-8')
          // Parse existing community names
          const communityHeaderRegex = /^###\s+(.+)$/gm
          let match
          while ((match = communityHeaderRegex.exec(existingContent)) !== null) {
            existingCommunityNames.add(match[1].trim())
          }
        }

        // Build content for new communities (skip existing ones)
        const newCommunitiesContent = template.communities
          .filter(comm => !existingCommunityNames.has(comm.name))
          .map(comm => {
            let content = `### ${comm.name}\n`
            if (comm.description) content += `- **Description:** ${comm.description}\n`
            if (comm.tags && comm.tags.length > 0) {
              content += `- **Tags:** ${comm.tags.join(', ')}\n`
            }
            if (comm.channels && comm.channels.length > 0) {
              content += `- **Channels:** ${comm.channels.join(', ')}\n`
            }

            // List agent members
            const members = agentsToCreate
              .filter(a => (a.communities || []).includes(comm.name))
              .map(a => `${prefix}${a.id}${suffix}`)

            if (members.length > 0) {
              content += `- **Members:** ${members.join(', ')}\n`
            }

            return content
          }).join('\n')

        // Only write if there's new content
        if (newCommunitiesContent.trim()) {
          // Append to existing content or create new
          const trimmed = existingContent.trim().replace(/\s+/g, ' ')
          if (trimmed === '# Communities ## Communities' || trimmed === '# Communities') {
            // Empty template, replace entirely
            fs.writeFileSync(communitiesPath, `# COMMUNITIES.md - Organization Communities\n\n## Communities\n\n${newCommunitiesContent}`, 'utf-8')
          } else if (existingContent.trim() === '') {
            // Completely empty file
            fs.writeFileSync(communitiesPath, `# COMMUNITIES.md - Organization Communities\n\n## Communities\n\n${newCommunitiesContent}`, 'utf-8')
          } else {
            // Append new communities
            fs.writeFileSync(communitiesPath, `${existingContent}\n${newCommunitiesContent}`, 'utf-8')
          }
        } else {
          // Communities exist, but need to add new agent members to existing communities
          console.log('All communities already exist, updating member lists')
          let updatedContent = existingContent

          for (const comm of template.communities) {
            // Find agents that belong to this community
            const newMembers = agentsToCreate
              .filter(a => (a.communities || []).includes(comm.name))
              .map(a => `${prefix}${a.id}${suffix}`)

            if (newMembers.length > 0) {
              // Find the community section and update members
              const communityRegex = new RegExp(`^###\\s+${comm.name}\\s*$`, 'm')
              const match = communityRegex.exec(updatedContent)

              if (match) {
                const sectionStart = match.index
                // Find the next ### or end of file
                const nextSectionMatch = updatedContent.slice(sectionStart + match[0].length).match(/^###\s+/m)
                const sectionEnd = nextSectionMatch && nextSectionMatch.index !== undefined
                  ? sectionStart + match[0].length + nextSectionMatch.index
                  : updatedContent.length

                const section = updatedContent.slice(sectionStart, sectionEnd)

                // Check if Members line exists
                const membersMatch = section.match(/^-\s+\*\*Members:\*\*\s*(.*)$/m)

                if (membersMatch) {
                  // Parse existing members
                  const existingMembers = membersMatch[1]
                    .split(',')
                    .map(m => m.trim())
                    .filter(m => m.length > 0)

                  // Add new members (avoid duplicates)
                  const allMembers = [...new Set([...existingMembers, ...newMembers])]

                  // Replace the members line
                  const newMembersLine = `- **Members:** ${allMembers.join(', ')}`
                  const updatedSection = section.replace(/^-\s+\*\*Members:\*\*.*$/m, newMembersLine)

                  updatedContent = updatedContent.slice(0, sectionStart) + updatedSection + updatedContent.slice(sectionEnd)
                } else {
                  // Add Members line before the end of the section
                  const newMembersLine = `- **Members:** ${newMembers.join(', ')}\n`
                  const insertPos = sectionEnd
                  updatedContent = updatedContent.slice(0, insertPos) + newMembersLine + updatedContent.slice(insertPos)
                }
              }
            }
          }

          fs.writeFileSync(communitiesPath, updatedContent, 'utf-8')
        }
      }

      if (template.groups && template.groups.length > 0) {
        const orgDir = path.join(getWorkspacePath(), 'ORG')
        fs.mkdirSync(orgDir, { recursive: true })

        const groupsPath = path.join(orgDir, 'GROUPS.md')

        // Read existing groups if file exists
        let existingContent = ''
        const existingGroupNames = new Set<string>()
        if (fs.existsSync(groupsPath)) {
          existingContent = fs.readFileSync(groupsPath, 'utf-8')
          // Parse existing group names
          const groupHeaderRegex = /^###\s+(.+)$/gm
          let match
          while ((match = groupHeaderRegex.exec(existingContent)) !== null) {
            existingGroupNames.add(match[1].trim())
          }
        }

        // Build content for new groups (skip existing ones)
        const newGroupsContent = template.groups
          .filter(grp => !existingGroupNames.has(grp.name))
          .map(grp => {
            let content = `### ${grp.name}\n`
            if (grp.description) content += `- **Description:** ${grp.description}\n`
            if (grp.community) content += `- **Community:** ${grp.community}\n`
            if (grp.tags && grp.tags.length > 0) {
              content += `- **Tags:** ${grp.tags.join(', ')}\n`
            }
            if (grp.channels && grp.channels.length > 0) {
              content += `- **Channels:** ${grp.channels.join(', ')}\n`
            }

            // List agent members
            const members = agentsToCreate
              .filter(a => (a.groups || []).includes(grp.name))
              .map(a => `${prefix}${a.id}${suffix}`)

            if (members.length > 0) {
              content += `- **Members:** ${members.join(', ')}\n`
            }

            return content
          }).join('\n')

        // Only write if there's new content
        if (newGroupsContent.trim()) {
          // Append to existing content or create new
          const trimmed = existingContent.trim().replace(/\s+/g, ' ')
          if (trimmed === '# Groups ## Groups' || trimmed === '# Groups') {
            // Empty template, replace entirely
            fs.writeFileSync(groupsPath, `# GROUPS.md - Organization Groups\n\n## Groups\n\n${newGroupsContent}`, 'utf-8')
          } else if (existingContent.trim() === '') {
            // Completely empty file
            fs.writeFileSync(groupsPath, `# GROUPS.md - Organization Groups\n\n## Groups\n\n${newGroupsContent}`, 'utf-8')
          } else {
            // Append new groups
            fs.writeFileSync(groupsPath, `${existingContent}\n${newGroupsContent}`, 'utf-8')
          }
        } else {
          // Groups exist, but need to add new agent members to existing groups
          console.log('All groups already exist, updating member lists')
          let updatedContent = existingContent

          for (const grp of template.groups) {
            // Find agents that belong to this group
            const newMembers = agentsToCreate
              .filter(a => (a.groups || []).includes(grp.name))
              .map(a => `${prefix}${a.id}${suffix}`)

            if (newMembers.length > 0) {
              // Find the group section and update members
              const groupRegex = new RegExp(`^###\\s+${grp.name}\\s*$`, 'm')
              const match = groupRegex.exec(updatedContent)

              if (match) {
                const sectionStart = match.index
                // Find the next ### or end of file
                const nextSectionMatch = updatedContent.slice(sectionStart + match[0].length).match(/^###\s+/m)
                const sectionEnd = nextSectionMatch && nextSectionMatch.index !== undefined
                  ? sectionStart + match[0].length + nextSectionMatch.index
                  : updatedContent.length

                const section = updatedContent.slice(sectionStart, sectionEnd)

                // Check if Members line exists
                const membersMatch = section.match(/^-\s+\*\*Members:\*\*\s*(.*)$/m)

                if (membersMatch) {
                  // Parse existing members
                  const existingMembers = membersMatch[1]
                    .split(',')
                    .map(m => m.trim())
                    .filter(m => m.length > 0)

                  // Add new members (avoid duplicates)
                  const allMembers = [...new Set([...existingMembers, ...newMembers])]

                  // Replace the members line
                  const newMembersLine = `- **Members:** ${allMembers.join(', ')}`
                  const updatedSection = section.replace(/^-\s+\*\*Members:\*\*.*$/m, newMembersLine)

                  updatedContent = updatedContent.slice(0, sectionStart) + updatedSection + updatedContent.slice(sectionEnd)
                } else {
                  // Add Members line before the end of the section
                  const newMembersLine = `- **Members:** ${newMembers.join(', ')}\n`
                  const insertPos = sectionEnd
                  updatedContent = updatedContent.slice(0, insertPos) + newMembersLine + updatedContent.slice(insertPos)
                }
              }
            }
          }

          fs.writeFileSync(groupsPath, updatedContent, 'utf-8')
        }
      }

      // Step 5: Create/update workflows from template
      if (template.workflows && template.workflows.length > 0) {
        const existingWorkflows = listWorkflows()
        const existingWorkflowMap = new Map(existingWorkflows.map(w => [w.name, w]))

        for (const wf of template.workflows) {
          // Update targeting to use new agent IDs if prefix/suffix was applied
          const newAgents = wf.targeting.agents.map(agentId => `${prefix}${agentId}${suffix}`)

          const existing = existingWorkflowMap.get(wf.name)
          if (existing) {
            // Workflow exists - merge new targeting with existing
            const existingAgents = existing.targeting.agents || []
            const existingGroups = existing.targeting.groups || []
            const existingCommunities = existing.targeting.communities || []
            const existingTags = existing.targeting.tags || []

            const newGroups = wf.targeting.groups || []
            const newCommunities = wf.targeting.communities || []
            const newTags = wf.targeting.tags || []

            const mergedAgents = [...new Set([...existingAgents, ...newAgents])]
            const mergedGroups = [...new Set([...existingGroups, ...newGroups])]
            const mergedCommunities = [...new Set([...existingCommunities, ...newCommunities])]
            const mergedTags = [...new Set([...existingTags, ...newTags])]

            // Check if there are any new targets to add
            const hasNewTargets =
              mergedAgents.length > existingAgents.length ||
              mergedGroups.length > existingGroups.length ||
              mergedCommunities.length > existingCommunities.length ||
              mergedTags.length > existingTags.length

            if (hasNewTargets) {
              const { updateWorkflow } = require('./workflows')
              const result = updateWorkflow(existing.id, {
                targeting: {
                  agents: mergedAgents,
                  groups: mergedGroups,
                  communities: mergedCommunities,
                  tags: mergedTags
                }
              })

              if (result.success) {
                const changes = []
                if (mergedAgents.length > existingAgents.length) changes.push(`${mergedAgents.length - existingAgents.length} agent(s)`)
                if (mergedGroups.length > existingGroups.length) changes.push(`${mergedGroups.length - existingGroups.length} group(s)`)
                if (mergedCommunities.length > existingCommunities.length) changes.push(`${mergedCommunities.length - existingCommunities.length} communit${mergedCommunities.length - existingCommunities.length > 1 ? 'ies' : 'y'}`)
                if (mergedTags.length > existingTags.length) changes.push(`${mergedTags.length - existingTags.length} tag(s)`)
                console.log(`Updated workflow "${wf.name}" with ${changes.join(', ')}`)
              } else {
                console.warn(`Failed to update workflow ${wf.name}: ${result.error}`)
              }
            } else {
              console.log(`Workflow "${wf.name}" already has all targets, no update needed`)
            }
          } else {
            // Workflow doesn't exist - create it
            const updatedTargeting = {
              ...wf.targeting,
              agents: newAgents
            }

            const result = createWorkflow({
              name: wf.name,
              description: wf.description,
              schedule: wf.schedule,
              enabled: wf.enabled,
              executionMode: wf.executionMode,
              targeting: updatedTargeting,
              content: wf.content,
              author: template.author || 'imported'
            })

            if (!result.success) {
              console.warn(`Failed to create workflow ${wf.name}: ${result.error}`)
              // Don't fail the whole import for workflow creation failures
            }
          }
        }
      }

      // Step 6: Register all created agents in openclaw.json
      // This is critical - agents must be registered to receive messages via gateway
      const { execSync } = require('child_process')
      for (const agentId of createdAgents) {
        try {
          const workspaceArg = path.join(getWorkspacePath(), 'AGENTS', agentId)
          const agentDirArg = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'agent')

          // Use openclaw agents add to register the agent
          execSync(`openclaw agents add ${agentId} --workspace "${workspaceArg}" --agent-dir "${agentDirArg}" --non-interactive`, {
            encoding: 'utf-8',
            stdio: 'pipe'
          })
          console.log(`Registered agent ${agentId} in openclaw.json`)
        } catch (err) {
          console.warn(`Failed to register agent ${agentId}: ${err}`)
          // Don't fail the import if registration fails - agent files are still created
        }
      }

      return { ok: true, agentIds: createdAgents }
    } catch (err) {
      // Rollback: delete all created agents
      for (const agentId of createdAgents) {
        try {
          const agentDir = path.join(getAgentsDir(), agentId)
          if (fs.existsSync(agentDir)) {
            fs.rmSync(agentDir, { recursive: true, force: true })
          }
        } catch (cleanupErr) {
          console.error(`Failed to cleanup agent ${agentId}:`, cleanupErr)
        }
      }

      return { ok: false, error: String(err) }
    }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
