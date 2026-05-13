import fs from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'
import { getGatewayClient } from './gateway-rpc'
import { getWorkspacePath } from './workspace'
import { writeDashboardManagedOpenClawConfig } from './openclaw-config'
import { REPO_ROOT } from './paths'

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
  dirty?: boolean
  variantOf?: string
  originalSource?: 'bundled' | 'managed' | 'workspace'
  requires?: SkillRequirements
  install?: SkillInstallOption[]
  homepage?: string
  tags?: string[]
  registryProvider?: 'shipables' | 'tessl'
  registryName?: string
  secretRequirements?: Array<{
    key: string
    label: string
    kind?: 'api_key' | 'token' | 'text' | 'id' | 'url'
    required?: boolean
    help?: string
    placeholder?: string
    sensitive?: boolean
  }>
}

export interface SkillRequirementInstallCommand {
  kind: 'brew'
  command: string
  args: string[]
  display: string
}

// Paths to skill directories
// Auto-detect OpenClaw installation path instead of hardcoding
function findOpenClawSkillsDir(): string {
  const home = os.homedir()
  const candidates: string[] = []

  if (process.env.OPENCLAW_SKILLS_DIR) {
    candidates.push(process.env.OPENCLAW_SKILLS_DIR)
  }

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
    path.join('/opt/openclaw/node_modules/openclaw/skills'),
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
const REPO_CUSTOM_SKILLS_DIR = path.join(REPO_ROOT, 'SKILLS', 'custom')

function slugifySkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'custom-skill'
}

function getSkillDirectoryId(filePath: string): string {
  return path.basename(path.dirname(filePath))
}

function resolveSkillMarkdownPath(skillDir: string): string {
  const skillMdUpper = path.join(skillDir, 'SKILL.md')
  const skillMdLower = path.join(skillDir, 'skill.md')
  if (!fs.existsSync(skillMdUpper) && fs.existsSync(skillMdLower)) {
    fs.renameSync(skillMdLower, skillMdUpper)
  }
  return fs.existsSync(skillMdUpper) ? skillMdUpper : skillMdLower
}

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
  const skillsByName = new Map<string, OpenClawSkill>()

  function getSkillPriority(skill: OpenClawSkill): number {
    if (skill.source === 'workspace') return 3
    if (skill.source === 'managed') return 2
    return 1
  }

  function pushSkill(skill: OpenClawSkill | null) {
    if (!skill) return
    const existing = skillsByName.get(skill.name)
    if (!existing || getSkillPriority(skill) >= getSkillPriority(existing)) {
      skillsByName.set(skill.name, skill)
    }
  }

  // Load bundled skills from OpenClaw repo
  if (fs.existsSync(BUNDLED_SKILLS_DIR)) {
    try {
      const dirs = fs.readdirSync(BUNDLED_SKILLS_DIR, { withFileTypes: true })
      for (const dir of dirs) {
        if (!dir.isDirectory()) continue

        const skillPath = path.join(BUNDLED_SKILLS_DIR, dir.name, 'SKILL.md')
        if (fs.existsSync(skillPath)) {
          const skill = parseSkillFile(skillPath, 'bundled')
          pushSkill(skill)
        }
      }
    } catch (err) {
      console.error('Error loading bundled skills:', err)
    }
  }

  // Load ClawMax repo-level packaged custom skills
  if (fs.existsSync(REPO_CUSTOM_SKILLS_DIR)) {
    try {
      const dirs = fs.readdirSync(REPO_CUSTOM_SKILLS_DIR, { withFileTypes: true })
      for (const dir of dirs) {
        if (!dir.isDirectory() || dir.name.startsWith('.')) continue

        const uppercaseSkillPath = path.join(REPO_CUSTOM_SKILLS_DIR, dir.name, 'SKILL.md')
        const lowercaseSkillPath = path.join(REPO_CUSTOM_SKILLS_DIR, dir.name, 'skill.md')
        const skillPath = fs.existsSync(uppercaseSkillPath) ? uppercaseSkillPath : lowercaseSkillPath
        if (fs.existsSync(skillPath)) {
          const skill = parseWorkspaceSkillFile(skillPath, dir.name)
          if (skill) {
            pushSkill({
              ...skill,
              bundled: true,
              source: 'bundled'
            })
          }
        }
      }
    } catch (err) {
      console.error('Error loading repo custom skills:', err)
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
          pushSkill(skill)
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

        const uppercaseSkillPath = path.join(workspaceSkillsDir, dir.name, 'SKILL.md')
        const lowercaseSkillPath = path.join(workspaceSkillsDir, dir.name, 'skill.md')
        const skillPath = fs.existsSync(uppercaseSkillPath) ? uppercaseSkillPath : lowercaseSkillPath
        if (fs.existsSync(skillPath)) {
          const skill = parseWorkspaceSkillFile(skillPath, dir.name)
          pushSkill(skill)
          continue
        }

        const tileJsonPath = path.join(workspaceSkillsDir, dir.name, 'tile.json')
        if (fs.existsSync(tileJsonPath)) {
          try {
            const tileJson = JSON.parse(fs.readFileSync(tileJsonPath, 'utf-8'))
            const skills = tileJson?.skills && typeof tileJson.skills === 'object' ? Object.values(tileJson.skills) as Array<any> : []
            for (const entry of skills) {
              const relativeSkillPath = entry?.path
              if (!relativeSkillPath || typeof relativeSkillPath !== 'string') continue
              const nestedSkillPath = path.join(workspaceSkillsDir, dir.name, relativeSkillPath)
              if (!fs.existsSync(nestedSkillPath)) continue
              const skill = parseWorkspaceSkillFile(nestedSkillPath, dir.name)
              pushSkill(skill)
            }
          } catch (err) {
            console.error(`Error loading workspace tile skill container ${dir.name}:`, err)
          }
        }
      }
    } catch (err) {
      console.error('Error loading workspace custom skills:', err)
    }
  }

  return Array.from(skillsByName.values()).sort((a, b) => a.name.localeCompare(b.name))
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
      id: source === 'bundled' ? undefined : getSkillDirectoryId(filePath),
      name: data.name,
      description: data.description || '',
      emoji: openclawMeta.emoji,
      filePath,
      bundled: source === 'bundled',
      source,
      dirty: !!openclawMeta.dirty,
      variantOf: openclawMeta.variantOf,
      originalSource: openclawMeta.originalSource,
      requires: openclawMeta.requires,
      install: openclawMeta.install,
      homepage: openclawMeta.homepage,
      tags: openclawMeta.tags || data.tags || [],
      registryProvider: openclawMeta.registryProvider,
      registryName: openclawMeta.registryName,
      secretRequirements: openclawMeta.secretRequirements || data.secretRequirements || []
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

    const openclawMeta = data.metadata?.openclaw || {}

    return {
      id: skillId, // Store directory name for deletion
      name,
      description,
      emoji: data.emoji || openclawMeta.emoji,
      filePath,
      bundled: false,
      source: 'workspace',
      dirty: !!openclawMeta.dirty,
      variantOf: openclawMeta.variantOf,
      originalSource: openclawMeta.originalSource,
      requires: data.requires || openclawMeta.requires,
      install: data.install || openclawMeta.install,
      homepage: data.homepage || openclawMeta.homepage,
      tags: data.tags || openclawMeta.tags || [],
      registryProvider: openclawMeta.registryProvider,
      registryName: openclawMeta.registryName,
      secretRequirements: data.secretRequirements || openclawMeta.secretRequirements || []
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
  const direct = skills.find(s => s.name === id || s.id === id)
  if (direct) return direct

  const repoSkillDir = path.join(REPO_CUSTOM_SKILLS_DIR, id)
  const uppercaseSkillPath = path.join(repoSkillDir, 'SKILL.md')
  const lowercaseSkillPath = path.join(repoSkillDir, 'skill.md')
  const skillPath = fs.existsSync(uppercaseSkillPath) ? uppercaseSkillPath : lowercaseSkillPath
  if (fs.existsSync(skillPath)) {
    const fallback = parseWorkspaceSkillFile(skillPath, id)
    if (fallback) {
      return {
        ...fallback,
        bundled: true,
        source: 'bundled',
      }
    }
  }

  return null
}

export function getSkillContent(skillId: string): { skill: OpenClawSkill; content: string; editable: boolean } | null {
  const skill = getSkillById(skillId)
  if (!skill) return null

  const content = fs.readFileSync(skill.filePath, 'utf-8')
  const editable = true
  return { skill, content, editable }
}

export function getSkillRequirementInstallCommands(skill: OpenClawSkill): SkillRequirementInstallCommand[] {
  const commands: SkillRequirementInstallCommand[] = []
  const seen = new Set<string>()

  for (const option of skill.install || []) {
    if (option.kind !== 'brew' || !option.formula) continue
    const formula = option.formula.trim()
    if (!formula || seen.has(formula)) continue
    seen.add(formula)
    commands.push({
      kind: 'brew',
      command: 'brew',
      args: ['install', formula],
      display: `brew install ${formula}`,
    })
  }

  return commands
}

export function updateSkillContent(
  skillId: string,
  content: string,
  overrides?: { name?: string; description?: string }
): { skill: OpenClawSkill; content: string; editable: boolean } {
  const skill = getSkillById(skillId)
  if (!skill) {
    throw new Error(`Skill "${skillId}" not found`)
  }

  const parsed = matter(content)
  const nextName = (overrides?.name ?? parsed.data?.name ?? skill.name ?? '').trim()
  const nextDescriptionRaw = overrides?.description ?? parsed.data?.description ?? skill.description ?? ''
  const nextDescription = String(nextDescriptionRaw).trim()
  if (!nextName) {
    throw new Error('Skill name is required')
  }
  if (!/^[a-z0-9_-]+$/i.test(nextName)) {
    throw new Error('Skill name must contain only alphanumeric characters, dashes, and underscores')
  }

  const nextSkillId = slugifySkillName(nextName)
  let targetPath = skill.filePath
  let lookupId = skillId
  let targetSource = skill.source

  const existingSkill = getSkillById(nextName)
  if (existingSkill && existingSkill.name !== skill.name && existingSkill.id !== skill.id) {
    throw new Error(`Skill "${nextName}" already exists`)
  }

  if (skill.source === 'bundled') {
    const workspaceSkillsDir = getWorkspaceSkillsDir()
    fs.mkdirSync(workspaceSkillsDir, { recursive: true })
    const targetDirName = nextSkillId
    const workspaceSkillDir = path.join(workspaceSkillsDir, targetDirName)
    if (fs.existsSync(workspaceSkillDir)) {
      const existingPath = resolveSkillMarkdownPath(workspaceSkillDir)
      if (path.resolve(existingPath) !== path.resolve(skill.filePath)) {
        throw new Error(`Skill "${nextName}" already exists`)
      }
    }

    if (!fs.existsSync(workspaceSkillDir)) {
      copyDirectorySync(path.dirname(skill.filePath), workspaceSkillDir)
    }

    targetPath = resolveSkillMarkdownPath(workspaceSkillDir)
    lookupId = targetDirName
    targetSource = 'workspace'
  } else if (skill.id) {
    const rootDir = skill.source === 'managed' ? MANAGED_SKILLS_DIR : getWorkspaceSkillsDir()
    const currentDir = path.dirname(skill.filePath)
    const currentDirName = path.basename(currentDir)
    const currentRoot = path.dirname(currentDir)
    if (path.resolve(currentRoot) === path.resolve(rootDir) && currentDirName !== nextSkillId) {
      const targetDir = path.join(rootDir, nextSkillId)
      if (fs.existsSync(targetDir)) {
        throw new Error(`Skill "${nextName}" already exists`)
      }
      fs.renameSync(currentDir, targetDir)
      targetPath = resolveSkillMarkdownPath(targetDir)
      lookupId = nextSkillId
    } else {
      lookupId = skill.id
    }
  }

  const nextVariantOf = skill.source === 'bundled'
    ? skill.name
    : (parsed.data?.metadata?.openclaw?.variantOf || skill.variantOf)
  const nextOriginalSource = skill.source === 'bundled'
    ? skill.source
    : (parsed.data?.metadata?.openclaw?.originalSource || skill.originalSource || targetSource)

  const openclawMetadata = {
    ...(parsed.data?.metadata?.openclaw || {}),
    dirty: true,
    dirtyEditedAt: new Date().toISOString(),
    dirtyEditedBy: 'dashboard',
    ...(nextVariantOf ? { variantOf: nextVariantOf } : {}),
    ...(nextOriginalSource ? { originalSource: nextOriginalSource } : {}),
  }

  const updatedData = {
    ...parsed.data,
    name: nextName,
    description: nextDescription,
    metadata: {
      ...(parsed.data?.metadata || {}),
      openclaw: openclawMetadata
    }
  }

  const nextContent = matter.stringify(parsed.content, updatedData)
  fs.writeFileSync(targetPath, nextContent, 'utf-8')

  const refreshed = getSkillContent(lookupId) || getSkillContent(nextName)
  if (!refreshed) {
    throw new Error(`Skill "${nextName}" not found after update`)
  }

  return refreshed
}

/**
 * Get agent's assigned skills from openclaw.json
 */
export function getAgentSkills(agentId: string): string[] {
  try {
    const config = loadOpenClawConfig()
    const activeWorkspaceAgentDir = path.join(getWorkspacePath(), 'AGENTS', agentId)
    const records = (config.agents?.list || []).filter((a: any) => a.id === agentId)
    const agent = records.find((entry: any) => entry.workspace === activeWorkspaceAgentDir)
      || records.find((entry: any) => {
        const workspace = String(entry.workspace || '')
        return workspace && activeWorkspaceAgentDir.startsWith(workspace)
      })
      || records[0]

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

    const activeWorkspaceAgentDir = path.join(getWorkspacePath(), 'AGENTS', agentId)
    let agentIndex = config.agents.list.findIndex((a: any) => a.id === agentId && a.workspace === activeWorkspaceAgentDir)
    if (agentIndex === -1) {
      agentIndex = config.agents.list.findIndex((a: any) => {
        const workspace = String(a.workspace || '')
        return a.id === agentId && workspace && activeWorkspaceAgentDir.startsWith(workspace)
      })
    }
    if (agentIndex === -1) {
      agentIndex = config.agents.list.findIndex((a: any) => a.id === agentId)
    }
    if (agentIndex === -1) {
      throw new Error(`Agent ${agentId} not found in openclaw.json`)
    }

    const normalizedSkillIds = Array.from(new Set(skillIds))
    const existingSkills = config.agents.list[agentIndex].skills
    const currentSkills: string[] = Array.isArray(existingSkills)
      ? [...existingSkills]
      : []
    const unchanged = currentSkills.length === normalizedSkillIds.length
      && currentSkills.every((skillId: string, index: number) => skillId === normalizedSkillIds[index])
    if (unchanged) {
      return
    }

    config.agents.list[agentIndex] = {
      ...config.agents.list[agentIndex],
      skills: normalizedSkillIds,
    }

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

  const indexTsPath = path.join(skillDir, 'index.ts')
  fs.writeFileSync(indexTsPath, `// Auto-generated ClawMax skill entrypoint for ${name}\nexport {}\n`, 'utf-8')

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
  if (!saveOpenClawConfigDeprecationWarned) {
    console.warn('⚠️  saveOpenClawConfig() is deprecated - use Gateway RPC instead')
    saveOpenClawConfigDeprecationWarned = true
  }
  try {
    // Create backup before saving
    const backupPath = `${OPENCLAW_CONFIG_PATH}.bak`
    fs.copyFileSync(OPENCLAW_CONFIG_PATH, backupPath)

    writeDashboardManagedOpenClawConfig(OPENCLAW_CONFIG_PATH, config, 'setAgentSkills')

    if (!saveOpenClawConfigDeprecatedPathLogged) {
      console.log('Successfully saved openclaw.json (DEPRECATED PATH)')
      saveOpenClawConfigDeprecatedPathLogged = true
    }
  } catch (err) {
    console.error('Error saving openclaw.json:', err)
    throw new Error('Failed to save openclaw.json')
  }
}

let saveOpenClawConfigDeprecationWarned = false
let saveOpenClawConfigDeprecatedPathLogged = false

// ============================================================================
// Workspace Custom Skills Management
// ============================================================================

/**
 * Validate workspace skill structure (must have skill.md/SKILL.md and index.ts or index.js)
 */
export function validateWorkspaceSkill(skillPath: string): { valid: boolean; error?: string; needsIndexTsShim?: boolean } {
  try {
    const skillMdLower = path.join(skillPath, 'skill.md')
    const skillMdUpper = path.join(skillPath, 'SKILL.md')
    const indexTsPath = path.join(skillPath, 'index.ts')
    const indexJsPath = path.join(skillPath, 'index.js')

    // Accept either skill.md or SKILL.md
    if (!fs.existsSync(skillMdLower) && !fs.existsSync(skillMdUpper)) {
      return { valid: false, error: 'Missing skill.md or SKILL.md file' }
    }

    if (!fs.existsSync(indexTsPath) && !fs.existsSync(indexJsPath)) {
      return { valid: false, error: 'Missing index.ts or index.js file' }
    }

    return { valid: true, needsIndexTsShim: !fs.existsSync(indexTsPath) && fs.existsSync(indexJsPath) }
  } catch (err) {
    return { valid: false, error: String(err) }
  }
}

/**
 * Import workspace custom skill from local directory
 */
export function importWorkspaceSkill(sourcePath: string, tags?: string[]): { success: boolean; skillId?: string; error?: string; warning?: string } {
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

    let warning: string | undefined
    if (validation.needsIndexTsShim) {
      const indexTsPath = path.join(targetPath, 'index.ts')
      const shimContent = `// Auto-generated by ClawMax because the imported skill only provided index.js.\nexport {}\n`
      fs.writeFileSync(indexTsPath, shimContent, 'utf-8')
      warning = `Imported '${skillName}' with index.js only. ClawMax generated a minimal index.ts compatibility shim.`
    }

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
    return { success: true, skillId: skillName, warning }
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
    let managedSkillPath = path.join(MANAGED_SKILLS_DIR, skillIdOrName)

    // First try direct directory match (skillId)
    let skillPath = path.join(workspaceSkillsDir, skillIdOrName)

    // If not found, try to find by skill name
    if (!fs.existsSync(skillPath)) {
      const skills = listAvailableSkills().filter(s => s.source === 'workspace' || s.source === 'managed')
      const skill = skills.find(s => s.name === skillIdOrName || s.id === skillIdOrName)

      if (!skill) {
        return { success: false, error: 'Skill not found' }
      }

      if (skill.source === 'managed') {
        managedSkillPath = path.join(MANAGED_SKILLS_DIR, skill.name)
      } else if (skill.id) {
        skillPath = path.join(workspaceSkillsDir, skill.id)
      }
    }

    const existingWorkspacePath = fs.existsSync(skillPath) ? skillPath : null
    const existingManagedPath = fs.existsSync(managedSkillPath) ? managedSkillPath : null

    if (!existingWorkspacePath && !existingManagedPath) {
      return { success: false, error: 'Skill not found' }
    }

    if (existingWorkspacePath) {
      fs.rmSync(existingWorkspacePath, { recursive: true, force: true })
    } else if (existingManagedPath) {
      fs.rmSync(existingManagedPath, { recursive: true, force: true })
    }

    console.log(`✓ Deleted user skill: ${skillIdOrName}`)
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
