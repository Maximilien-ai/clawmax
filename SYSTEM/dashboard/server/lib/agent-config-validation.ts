import fs from 'fs'
import path from 'path'
import { validateSoul, validateTools } from './validator'
import { getAgentTemplatesDir, getGlobalAgentTemplatesDir, slugify } from './templates'

const AGENT_ID_REGEX = /^[a-z][a-z0-9_-]*$/
const TAG_REGEX = /^[a-z][a-z0-9_-]*$/
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/

export interface AgentConfigValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface ProvisionValidationInput {
  name?: string
  model?: string
  whatsapp?: string
  port?: number
  cloneFrom?: string
  templateSlug?: string
  tags?: string[]
  generatedFiles?: {
    identity?: string
    soul?: string
    tools?: string
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function extractIdentityField(content: string, field: string): string | null {
  const match = content.match(new RegExp(`\\*\\*${field}:\\*\\*\\s*([^\\n]*)`, 'i'))
  if (!match) return null
  return match[1].trim()
}

function validateIdentityMarkdown(content: string, expectedId?: string): AgentConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    return {
      valid: false,
      errors: ['IDENTITY.md cannot be empty'],
      warnings,
    }
  }

  const name = extractIdentityField(content, 'Name')
  const creature = extractIdentityField(content, 'Creature')
  const vibe = extractIdentityField(content, 'Vibe')
  const emoji = extractIdentityField(content, 'Emoji')
  const whatsapp = extractIdentityField(content, 'WhatsApp')
  const tagsValue = extractIdentityField(content, 'Tags')

  if (!name) {
    errors.push('IDENTITY.md is missing a **Name:** field')
  } else {
    if (!AGENT_ID_REGEX.test(name)) {
      errors.push(`Name "${name}" must be lowercase alphanumeric with dashes/underscores only`)
    }
    if (expectedId && name !== expectedId) {
      errors.push(`Name "${name}" must match the agent ID "${expectedId}"`)
    }
  }

  if (!creature) warnings.push('IDENTITY.md is missing a **Creature:** field')
  if (!vibe) warnings.push('IDENTITY.md is missing a **Vibe:** field')
  if (!emoji) warnings.push('IDENTITY.md is missing an **Emoji:** field')

  if (whatsapp && !PHONE_REGEX.test(whatsapp)) {
    errors.push(`WhatsApp number "${whatsapp}" must be in E.164 format (for example +14155551234)`)
  }

  if (tagsValue) {
    const tags = tagsValue.split(',').map(tag => tag.trim()).filter(Boolean)
    const duplicateTags = tags.filter((tag, index) => tags.indexOf(tag) !== index)
    for (const tag of tags) {
      if (!TAG_REGEX.test(tag)) {
        errors.push(`Tag "${tag}" must be lowercase alphanumeric with dashes/underscores only`)
      }
    }
    for (const tag of unique(duplicateTags)) {
      errors.push(`Duplicate tag: "${tag}"`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

function validateMarkdownSection(
  fileName: 'SOUL.md' | 'TOOLS.md',
  content: string,
  validator: (content: string) => { valid: boolean; errors: Array<{ message: string }> }
): AgentConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.trim()) {
    return {
      valid: false,
      errors: [`${fileName} cannot be empty`],
      warnings,
    }
  }

  if (!/^#/m.test(content)) {
    warnings.push(`${fileName} should include at least one markdown heading`)
  }

  if (content.trim().length < 80) {
    warnings.push(`${fileName} looks unusually short`)
  }

  try {
    const result = validator(content)
    if (!result.valid) {
      warnings.push(...result.errors.map(error => `${fileName}: ${error.message}`))
    }
  } catch {
    warnings.push(`${fileName} schema validation is unavailable in this environment`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

export function validateAgentConfigSections(config: {
  identity?: string
  soul?: string
  tools?: string
}, expectedId?: string): AgentConfigValidationResult {
  const identity = validateIdentityMarkdown(config.identity || '', expectedId)
  const soul = validateMarkdownSection('SOUL.md', config.soul || '', validateSoul)
  const tools = validateMarkdownSection('TOOLS.md', config.tools || '', validateTools)

  const errors = [...identity.errors, ...soul.errors, ...tools.errors]
  const warnings = [...identity.warnings, ...soul.warnings, ...tools.warnings]

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

function templateExists(templateSlug: string): boolean {
  const slug = slugify(templateSlug)
  const workspaceTemplateDir = path.join(getAgentTemplatesDir(), slug)
  const globalTemplateDir = path.join(getGlobalAgentTemplatesDir(), slug)
  return fs.existsSync(workspaceTemplateDir) || fs.existsSync(globalTemplateDir)
}

export function validateProvisionInput(
  input: ProvisionValidationInput,
  context: {
    existingAgentIds: string[]
    availableModels: string[]
  }
): AgentConfigValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!input.name || !AGENT_ID_REGEX.test(input.name)) {
    errors.push('Agent name must be lowercase alphanumeric with dashes/underscores only')
  } else if (context.existingAgentIds.includes(input.name)) {
    errors.push(`Agent "${input.name}" already exists`)
  }

  if (!input.model || !input.model.trim()) {
    errors.push('Model is required')
  } else if (context.availableModels.length > 0 && !context.availableModels.includes(input.model)) {
    warnings.push(`Model "${input.model}" is not currently advertised by /api/agents/models and may fall back during provisioning`)
  }

  if (input.whatsapp && !PHONE_REGEX.test(input.whatsapp)) {
    errors.push(`WhatsApp number "${input.whatsapp}" must be in E.164 format`)
  }

  if (input.port !== undefined && input.port !== 0) {
    if (!Number.isInteger(input.port) || input.port < 1024 || input.port > 65535) {
      errors.push('Gateway port must be an integer between 1024 and 65535')
    }
  }

  if (input.cloneFrom && !context.existingAgentIds.includes(input.cloneFrom)) {
    errors.push(`Clone source "${input.cloneFrom}" was not found`)
  }

  if (input.cloneFrom && input.templateSlug) {
    errors.push('Choose either clone source or template source, not both')
  }

  if (input.templateSlug && !templateExists(input.templateSlug)) {
    errors.push(`Template "${input.templateSlug}" was not found`)
  }

  if (input.tags && input.tags.length > 0) {
    const duplicates = input.tags.filter((tag, index) => input.tags!.indexOf(tag) !== index)
    for (const tag of input.tags) {
      if (!TAG_REGEX.test(tag)) {
        errors.push(`Tag "${tag}" must be lowercase alphanumeric with dashes/underscores only`)
      }
    }
    for (const tag of unique(duplicates)) {
      errors.push(`Duplicate tag: "${tag}"`)
    }
  }

  if (input.generatedFiles) {
    const generatedValidation = validateAgentConfigSections({
      identity: input.generatedFiles.identity || '',
      soul: input.generatedFiles.soul || '',
      tools: input.generatedFiles.tools || '',
    }, input.name)
    errors.push(...generatedValidation.errors)
    warnings.push(...generatedValidation.warnings)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
