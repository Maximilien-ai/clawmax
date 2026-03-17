import fs from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'
import { getGatewayClient } from './gateway-rpc'
import { getWorkspacePath } from './workspace'

/**
 * Get workspace directory (uses active workspace from workspace manager)
 */
export function getWorkspaceDir(): string {
  return getWorkspacePath()
}

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
  id?: string // Directory name for workspace skills, used for deletion
  name: string
  description: string
  emoji?: string
  filePath: string
  bundled: boolean
  source: 'bundled' | 'managed' | 'workspace'
  requires?: SkillRequirements
  install?: SkillInstallOption[]
  homepage?: string
  tags?: string[]
}

// Paths to skill directories
// Auto-detect OpenClaw installation path instead of hardcoding
function findOpenClawSkillsDir(): string {
  const home = os.homedir()
  const candidates: string[] = []

  // 1. pnpm global install (macOS / Linux)
  const pnpmDir = path.join(home, 'Library/pnpm/global/5/.pnpm')
  if (fs.existsSync(pnpmDir)) {
    try {
      const dirs = fs.readdirSync(pnpmDir, { withFileTypes: true })
      for (const d of dirs) {
        if (d.isDirectory() && d.name.startsWith('openclaw@')) {
          const p = path.join(pnpmDir, d.name, 'node_modules/openclaw/skills')
          if (fs.existsSync(p)) candidates.push(p)
        }
      }
    } catch {}
  }

  // 2. npm global installs (Homebrew, system)
  candidates.push(
    path.join('/opt/homebrew/lib/node_modules/openclaw/skills'),
    path.join('/usr/local/lib/node_modules/openclaw/skills'),
  )

  // 3. Development repo clone
  candidates.push(path.join(home, 'github/maximilien/openclaw/skills'))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  // Final fallback — will fail gracefully in listAvailableSkills()
  return path.join(home, '.openclaw', 'skills')
}

const BUNDLED_SKILLS_DIR = findOpenClawSkillsDir()
const MANAGED_SKILLS_DIR = path.join(os.homedir(), '.openclaw', 'skills')

/**
 * Get workspace custom skills directory
 */
export function getWorkspaceSkillsDir(): string {
  return path.join(getWorkspaceDir(), 'SKILLS', 'custom')
}

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

  // Load workspace custom skills
  const workspaceSkillsDir = getWorkspaceSkillsDir()
  if (fs.existsSync(workspaceSkillsDir)) {
    try {
      const dirs = fs.readdirSync(workspaceSkillsDir, { withFileTypes: true })
      for (const dir of dirs) {
        if (!dir.isDirectory() || dir.name.startsWith('.')) continue

        const skillPath = path.join(workspaceSkillsDir, dir.name, 'skill.md')
        if (fs.existsSync(skillPath)) {
          const skill = parseWorkspaceSkillFile(skillPath, dir.name)
          if (skill) skills.push(skill)
        }
      }
    } catch (err) {
      console.error('Error loading workspace custom skills:', err)
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
      homepage: openclawMeta.homepage,
      tags: openclawMeta.tags || data.tags || []
    }
  } catch (err) {
    console.error(`Failed to parse skill ${filePath}:`, err)
    return null
  }
}

/**
 * Parse a workspace custom skill.md file (simpler format, no YAML frontmatter required)
 */
function parseWorkspaceSkillFile(filePath: string, skillId: string): OpenClawSkill | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')

    // Try parsing as YAML frontmatter first
    const { data, content: markdownContent } = matter(content)

    // Extract name and description
    const lines = markdownContent.split('\n').filter(l => l.trim())
    const name = data.name || lines[0]?.replace(/^#\s*/, '') || skillId
    const description = data.description || lines.find(l => !l.startsWith('#'))?.trim() || 'Custom skill'

    return {
      id: skillId, // Store directory name for deletion
      name,
      description,
      emoji: data.emoji,
      filePath,
      bundled: false,
      source: 'workspace',
      requires: data.requires,
      install: data.install,
      homepage: data.homepage,
      tags: data.tags || []
    }
  } catch (err) {
    console.error(`Failed to parse workspace skill ${filePath}:`, err)
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
    homepage,
    tags: []
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

// Auto-detect OpenClaw config: scan gateway-specific dirs (.openclaw-*)
// and prefer whichever config has agents defined
function findOpenClawConfigPath(): string {
  const home = os.homedir()
  const candidates: string[] = []

  // Scan for gateway-specific configs (.openclaw-<name>/openclaw.json)
  try {
    const entries = fs.readdirSync(home, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('.openclaw-')) {
        candidates.push(path.join(home, entry.name, 'openclaw.json'))
      }
    }
  } catch {}

  // Default global config
  candidates.push(path.join(home, '.openclaw', 'openclaw.json'))

  // Prefer config with the most agents defined
  let bestPath = ''
  let bestCount = 0
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const content = JSON.parse(fs.readFileSync(candidate, 'utf-8'))
        const count = content.agents?.list?.length || 0
        if (count > bestCount) {
          bestCount = count
          bestPath = candidate
        }
      } catch {}
    }
  }
  if (bestPath) return bestPath

  // Fallback to first existing
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return path.join(home, '.openclaw', 'openclaw.json')
}

const OPENCLAW_CONFIG_PATH = findOpenClawConfigPath()

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

// ============================================================================
// Workspace Custom Skills Management
// ============================================================================

/**
 * Validate workspace skill structure (must have skill.md and index.ts)
 */
export function validateWorkspaceSkill(skillPath: string): { valid: boolean; error?: string } {
  try {
    const skillMdLower = path.join(skillPath, 'skill.md')
    const skillMdUpper = path.join(skillPath, 'SKILL.md')
    const indexTsPath = path.join(skillPath, 'index.ts')

    // Accept either skill.md or SKILL.md
    if (!fs.existsSync(skillMdLower) && !fs.existsSync(skillMdUpper)) {
      return { valid: false, error: 'Missing skill.md or SKILL.md file' }
    }

    if (!fs.existsSync(indexTsPath)) {
      return { valid: false, error: 'Missing index.ts file' }
    }

    return { valid: true }
  } catch (err) {
    return { valid: false, error: String(err) }
  }
}

/**
 * Import workspace custom skill from local directory
 */
export function importWorkspaceSkill(sourcePath: string, tags?: string[]): { success: boolean; skillId?: string; error?: string } {
  try {
    // Validate source path exists
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: 'Source path does not exist' }
    }

    // Validate skill structure
    const validation = validateWorkspaceSkill(sourcePath)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // Extract skill name from path
    const skillName = path.basename(sourcePath)

    // Validate skill name (alphanumeric, dash, underscore only)
    if (!/^[a-zA-Z0-9_-]+$/.test(skillName)) {
      return { success: false, error: 'Invalid skill name. Use only letters, numbers, dashes, and underscores.' }
    }

    // Check if skill already exists
    const workspaceSkillsDir = getWorkspaceSkillsDir()
    const targetPath = path.join(workspaceSkillsDir, skillName)

    if (fs.existsSync(targetPath)) {
      return { success: false, error: `Skill '${skillName}' already exists` }
    }

    // Ensure custom skills directory exists
    if (!fs.existsSync(workspaceSkillsDir)) {
      fs.mkdirSync(workspaceSkillsDir, { recursive: true })
    }

    // Copy skill directory
    copyDirectorySync(sourcePath, targetPath)

    // Auto-rename skill.md → SKILL.md if lowercase version exists
    // Note: On case-insensitive filesystems (macOS/Windows), we need to check actual filename
    const files = fs.readdirSync(targetPath)
    const hasLowercaseSkillMd = files.includes('skill.md')
    const hasUppercaseSkillMd = files.includes('SKILL.md')

    if (hasLowercaseSkillMd && !hasUppercaseSkillMd) {
      const lowercaseSkillMd = path.join(targetPath, 'skill.md')
      const uppercaseSkillMd = path.join(targetPath, 'SKILL.md')
      fs.renameSync(lowercaseSkillMd, uppercaseSkillMd)
    }

    // Add tags to SKILL.md frontmatter if provided
    if (tags && tags.length > 0) {
      // After rename, file should be SKILL.md (or skill.md if it was already uppercase)
      // Re-check actual files after rename
      const filesAfterRename = fs.readdirSync(targetPath)
      const skillMdFilename = filesAfterRename.includes('SKILL.md') ? 'SKILL.md' : 'skill.md'
      const skillMdPath = path.join(targetPath, skillMdFilename)

      if (fs.existsSync(skillMdPath)) {
        const content = fs.readFileSync(skillMdPath, 'utf-8')
        const { data, content: markdownContent} = matter(content)

        // Add tags to frontmatter
        data.tags = tags

        // Rebuild file with updated frontmatter
        const updatedContent = matter.stringify(markdownContent, data)
        fs.writeFileSync(skillMdPath, updatedContent, 'utf-8')
      }
    }

    console.log(`✓ Imported workspace skill: ${skillName}`)
    return { success: true, skillId: skillName }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Delete workspace custom skill
 */
export function deleteWorkspaceSkill(skillIdOrName: string): { success: boolean; error?: string } {
  try {
    const workspaceSkillsDir = getWorkspaceSkillsDir()

    // First try direct directory match (skillId)
    let skillPath = path.join(workspaceSkillsDir, skillIdOrName)

    // If not found, try to find by skill name
    if (!fs.existsSync(skillPath)) {
      const skills = listAvailableSkills().filter(s => s.source === 'workspace')
      const skill = skills.find(s => s.name === skillIdOrName || s.id === skillIdOrName)

      if (!skill || !skill.id) {
        return { success: false, error: 'Skill not found' }
      }

      skillPath = path.join(workspaceSkillsDir, skill.id)
    }

    // Validate it exists
    if (!fs.existsSync(skillPath)) {
      return { success: false, error: 'Skill not found' }
    }

    // Delete directory recursively
    fs.rmSync(skillPath, { recursive: true, force: true })

    console.log(`✓ Deleted workspace skill: ${skillIdOrName}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/**
 * Copy directory recursively (synchronous)
 */
function copyDirectorySync(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDirectorySync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
