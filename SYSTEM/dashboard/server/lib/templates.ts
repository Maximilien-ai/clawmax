import fs from 'fs'
import path from 'path'
import Ajv from 'ajv'
import { WORKSPACE, AGENTS_DIR, parseIdentity } from './workspace'

// Template storage paths
export const TEMPLATES_DIR = path.join(WORKSPACE, 'TEMPLATES')
export const AGENT_TEMPLATES_DIR = path.join(TEMPLATES_DIR, 'agents')
export const ORG_TEMPLATES_DIR = path.join(TEMPLATES_DIR, 'organizations')

// Ensure template directories exist
export function ensureTemplateDirs(): void {
  fs.mkdirSync(AGENT_TEMPLATES_DIR, { recursive: true })
  fs.mkdirSync(ORG_TEMPLATES_DIR, { recursive: true })
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
}

export type Template = AgentTemplate | OrganizationTemplate

// ============================================================================
// Template Validation
// ============================================================================

const ajv = new Ajv({ strict: false })

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
      ? path.join(AGENT_TEMPLATES_DIR, slug)
      : path.join(ORG_TEMPLATES_DIR, slug)

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

  const dirs = []
  if (!type || type === 'agent') {
    try {
      const agentDirs = fs.readdirSync(AGENT_TEMPLATES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(AGENT_TEMPLATES_DIR, d.name))
      dirs.push(...agentDirs)
    } catch {}
  }

  if (!type || type === 'organization') {
    try {
      const orgDirs = fs.readdirSync(ORG_TEMPLATES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(ORG_TEMPLATES_DIR, d.name))
      dirs.push(...orgDirs)
    } catch {}
  }

  for (const dir of dirs) {
    try {
      const templateJsonPath = path.join(dir, 'template.json')
      if (fs.existsSync(templateJsonPath)) {
        const template = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'))
        templates.push(template)
      }
    } catch (err) {
      console.error(`Failed to read template at ${dir}:`, err)
    }
  }

  return templates
}

/**
 * Get a specific template by type and name slug
 */
export function getTemplate(type: 'agent' | 'organization', slug: string): Template | null {
  ensureTemplateDirs()
  const templateDir = type === 'agent'
    ? path.join(AGENT_TEMPLATES_DIR, slug)
    : path.join(ORG_TEMPLATES_DIR, slug)

  const templateJsonPath = path.join(templateDir, 'template.json')
  if (!fs.existsSync(templateJsonPath)) {
    return null
  }

  try {
    return JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Delete a template
 */
export function deleteTemplate(type: 'agent' | 'organization', slug: string): { ok: boolean; error?: string } {
  try {
    const templateDir = type === 'agent'
      ? path.join(AGENT_TEMPLATES_DIR, slug)
      : path.join(ORG_TEMPLATES_DIR, slug)

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
    const agentDir = path.join(AGENTS_DIR, agentId)

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

    const targetAgentDir = path.join(AGENTS_DIR, targetAgentId)

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
    const templateDir = path.join(AGENT_TEMPLATES_DIR, templateSlug)
    const templateJsonPath = path.join(templateDir, 'template.json')

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

    const targetAgentDir = path.join(AGENTS_DIR, targetAgentId)
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
    const agentDir = path.join(AGENTS_DIR, agentId)
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
