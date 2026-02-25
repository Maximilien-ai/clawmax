import fs from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'

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
      console.warn(`Skill file missing name: ${filePath}`)
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

    // Skills can be in agent.skills.allowBundled or agent.skills.entries
    const allowBundled = agent.skills?.allowBundled || []

    return Array.isArray(allowBundled) ? allowBundled : []
  } catch (err) {
    console.error(`Error reading skills for agent ${agentId}:`, err)
    return []
  }
}

/**
 * Set agent's assigned skills in openclaw.json
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

    // Initialize skills object if it doesn't exist
    if (!config.agents.list[agentIndex].skills) {
      config.agents.list[agentIndex].skills = {}
    }

    // Set allowBundled array
    config.agents.list[agentIndex].skills.allowBundled = skillIds

    saveOpenClawConfig(config)
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
      skills?: {
        allowBundled?: string[]
        entries?: Record<string, any>
      }
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
 * Save openclaw.json configuration
 */
function saveOpenClawConfig(config: OpenClawConfig): void {
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

    console.log('Successfully saved openclaw.json')
  } catch (err) {
    console.error('Error saving openclaw.json:', err)
    throw new Error('Failed to save openclaw.json')
  }
}
