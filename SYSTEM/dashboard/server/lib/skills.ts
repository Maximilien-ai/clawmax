import fs from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'
import { getGatewayClient } from './gateway-rpc'

export interface SkillRequirements {
  bins?: string[]
  config?: string[]
}

export interface SkillInstallOption {
  id: string
  kind: 'brew' | 'npm' | 'pnpm' | 'apt' | 'download' | 'uv' | 'go' | 'node'
  label: string
  formula?: string
  package?: string
  bins?: string[]
}

export interface OpenClawSkill {
  name: string
  description: string
  emoji?: string
  filePath: string
  bundled: boolean
  source: 'bundled' | 'managed' | 'workspace'
  requires?: SkillRequirements
  install?: SkillInstallOption[]
  homepage?: string
}

// Paths to skill directories
const OPENCLAW_REPO = '/Users/maximilien/github/maximilien/openclaw'
const BUNDLED_SKILLS_DIR = path.join(OPENCLAW_REPO, 'skills')
const MANAGED_SKILLS_DIR = path.join(os.homedir(), '.openclaw', 'skills')

/**
 * Load all available skills from OpenClaw installation
 */
export function listAvailableSkills(): OpenClawSkill[] {
  const skills: OpenClawSkill[] = []

  // Load bundled skills from OpenClaw repo
  if (fs.existsSync(BUNDLED_SKILLS_DIR)) {
    try {
      const dirs = fs.readdirSync(BUNDLED_SKILLS_DIR, { withFileTypes: true })
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue

        const skillPath = path.join(BUNDLED_SKILLS_DIR, dir.name, 'SKILL.md')
        if (fs.existsSync(skillPath)) {
          const skill = parseSkillFile(skillPath, 'bundled')
          if (skill) skills.push(skill)
        }
      }
    } catch (err) {
      console.error('Error loading bundled skills:', err)
    }
  }

  // Load managed skills from ~/.openclaw/skills
  if (fs.existsSync(MANAGED_SKILLS_DIR)) {
    try {
      const dirs = fs.readdirSync(MANAGED_SKILLS_DIR, { withFileTypes: true })
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue

        const skillPath = path.join(MANAGED_SKILLS_DIR, dir.name, 'SKILL.md')
        if (fs.existsSync(skillPath)) {
          const skill = parseSkillFile(skillPath, 'managed')
          if (skill) skills.push(skill)
        }
      }
    } catch (err) {
      console.error('Error loading managed skills:', err)
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Parse a SKILL.md file with YAML frontmatter
 */
function parseSkillFile(
  filePath: string,
  source: 'bundled' | 'managed' | 'workspace'
): OpenClawSkill | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { data } = matter(content)

    if (!data.name) {
      // Silently skip skills without names (common in OpenClaw dev skills)
      return null
    }

    const openclawMeta = data.metadata?.openclaw || {}

    return {
      name: data.name,
      description: data.description || '',
      emoji: openclawMeta.emoji,
      filePath,
      bundled: source === 'bundled',
      source,
      requires: openclawMeta.requires,
      install: openclawMeta.install,
      homepage: openclawMeta.homepage
    }
  } catch (err) {
    console.error(`Failed to parse skill ${filePath}:`, err)
    return null
  }
}

/**
 * Get a single skill by ID
 */
export function getSkillById(id: string): OpenClawSkill | null {
  const skills = listAvailableSkills()
  return skills.find(s => s.name === id) || null
}

/**
 * Get agent's assigned skills from openclaw.json
 */
export function getAgentSkills(agentId: string): string[] {
  try {
    const config = loadOpenClawConfig()
    const agent = config.agents?.list?.find((a: any) => a.id === agentId)

    if (!agent) {
      return []
    }

    // Skills is an array of skill IDs
    const skills = agent.skills || []

    return Array.isArray(skills) ? skills : []
  } catch (err) {
    console.error(`Error reading skills for agent ${agentId}:`, err)
    return []
  }
}

/**
 * Set agent's assigned skills with metadata stamping
 *
 * Currently uses direct writes with metadata stamping for compatibility.
 * Gateway RPC requires operator.admin scope which token auth doesn't grant.
 * See BUGS.md for details on future Gateway RPC auth implementation.
 */
export function setAgentSkills(agentId: string, skillIds: string[]): void {
  try {
    const config = loadOpenClawConfig()
    if (!config.agents || !config.agents.list) {
      throw new Error('Invalid openclaw.json structure')
    }

    const agentIndex = config.agents.list.findIndex((a: any) => a.id === agentId)
    if (agentIndex === -1) {
      throw new Error(`Agent ${agentId} not found in openclaw.json`)
    }

    // Update skills
    config.agents.list[agentIndex].skills = skillIds

    // Stamp metadata (critical for OpenClaw compatibility)
    const now = new Date().toISOString()
    config.meta = {
      ...config.meta,
      lastTouchedVersion: 'dashboard-0.1.0',
      lastTouchedAt: now
    }

    saveOpenClawConfig(config)
    console.log(`✓ Successfully updated skills for agent ${agentId} (metadata stamped)`)
  } catch (err) {
    console.error(`Error setting skills for agent ${agentId}:`, err)
    throw err
  }
}

/**
 * Validate that all skill IDs exist
 */
export function validateSkills(skillIds: string[]): { valid: boolean; missing: string[] } {
  const allSkills = listAvailableSkills()
  const skillNames = new Set(allSkills.map(s => s.name))

  const missing = skillIds.filter(id => !skillNames.has(id))

  return {
    valid: missing.length === 0,
    missing
  }
}

/**
 * Create a new custom skill in managed skills directory
 */
export function createCustomSkill(params: {
  name: string
  description: string
  emoji?: string
  requires?: SkillRequirements
  install?: SkillInstallOption[]
  homepage?: string
  content: string
}): OpenClawSkill {
  const { name, description, emoji, requires, install, homepage, content } = params

  // Validate skill name (alphanumeric, dashes, underscores only)
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    throw new Error('Skill name must contain only alphanumeric characters, dashes, and underscores')
  }

  // Check if skill already exists
  const existing = getSkillById(name)
  if (existing) {
    throw new Error(`Skill "${name}" already exists`)
  }

  // Ensure managed skills directory exists
  if (!fs.existsSync(MANAGED_SKILLS_DIR)) {
    fs.mkdirSync(MANAGED_SKILLS_DIR, { recursive: true })
  }

  // Create skill directory
  const skillDir = path.join(MANAGED_SKILLS_DIR, name)
  if (fs.existsSync(skillDir)) {
    throw new Error(`Skill directory "${name}" already exists`)
  }
  fs.mkdirSync(skillDir, { recursive: true })

  // Build frontmatter
  const frontmatter: any = {
    name,
    description,
    metadata: {
      openclaw: {
        ...(emoji && { emoji }),
        ...(requires && { requires }),
        ...(install && { install }),
        ...(homepage && { homepage })
      }
    }
  }

  // Generate SKILL.md content
  const skillMd = `---
${Object.entries(frontmatter)
  .map(([key, value]) => `${key}: ${JSON.stringify(value, null, 2)}`)
  .join('\n')}
---

${content}
`

  // Write SKILL.md file
  const skillPath = path.join(skillDir, 'SKILL.md')
  fs.writeFileSync(skillPath, skillMd, 'utf-8')

  console.log(`✓ Created custom skill: ${name}`)

  // Return the created skill
  return {
    name,
    description,
    emoji,
    filePath: skillPath,
    bundled: false,
    source: 'managed',
    requires,
    install,
    homepage
  }
}

// ============================================================================
// OpenClaw Config Management
// ============================================================================

interface OpenClawConfig {
  agents?: {
    list?: Array<{
      id: string
      name: string
      workspace?: string
      agentDir?: string
      model?: string
      skills?: string[]  // Array of skill IDs
    }>
  }
  [key: string]: any
}

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json')

/**
 * Load openclaw.json configuration
 */
function loadOpenClawConfig(): OpenClawConfig {
  try {
    const content = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8')
    return JSON.parse(content)
  } catch (err) {
    console.error('Error loading openclaw.json:', err)
    throw new Error('Failed to load openclaw.json')
  }
}

/**
 * @deprecated Direct config writes bypass OpenClaw validation
 * Use Gateway RPC instead via getGatewayClient()
 *
 * This function is kept for backward compatibility but should not be used.
 * It bypasses:
 * - Zod schema validation
 * - Metadata stamping (lastTouchedVersion, lastTouchedAt)
 * - Environment variable preservation
 * - Merge patch logic
 * - Audit logging
 */
function saveOpenClawConfig(config: OpenClawConfig): void {
  console.warn('⚠️  saveOpenClawConfig() is deprecated - use Gateway RPC instead')
  try {
    // Create backup before saving
    const backupPath = `${OPENCLAW_CONFIG_PATH}.bak`
    fs.copyFileSync(OPENCLAW_CONFIG_PATH, backupPath)

    // Write config with pretty formatting
    fs.writeFileSync(
      OPENCLAW_CONFIG_PATH,
      JSON.stringify(config, null, 2),
      'utf-8'
    )

    console.log('Successfully saved openclaw.json (DEPRECATED PATH)')
  } catch (err) {
    console.error('Error saving openclaw.json:', err)
    throw new Error('Failed to save openclaw.json')
  }
}
