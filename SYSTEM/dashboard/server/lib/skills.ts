import fs from 'fs'
import path from 'path'
import os from 'os'
import matter from 'gray-matter'
import { getGatewayClient } from './gateway-rpc'
import { getWorkspacePath } from './workspace'
import { writeDashboardManagedOpenClawConfig } from './openclaw-config'
import { REPO_ROOT } from './paths'
import { resetAgentSessionsForModelChange } from './agent-model'

/**
 * Get workspace directory (uses active workspace from workspace manager)
 */
export function getWorkspaceDir(): string {
  return getWorkspacePath()
}

export interface SkillRequirements {
  bins?: string[]
  env?: string[]
  config?: string[]
}

export interface SkillRequirementStatus {
  checkable: boolean
  installSatisfied: boolean
  presentBins: string[]
  missingBins: string[]
}

export interface SkillInstallOption {
  id: string
  kind: 'brew' | 'npm' | 'pnpm' | 'apt' | 'download' | 'uv' | 'go' | 'node'
  label: string
  formula?: string
  package?: string
  module?: string
  bins?: string[]
  os?: string[]
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
  registryProvider?: 'clawhub' | 'shipables' | 'tessl'
  registryName?: string
  registryInstallName?: string
  registryVersion?: string
  registryDownloadsWeekly?: number
  registryCategories?: string[]
  registryHomepage?: string
  registryImportedAt?: string
  requirementStatus?: SkillRequirementStatus
  secretRequirements?: Array<{
    key: string
    label: string
    kind?: 'api_key' | 'token' | 'text' | 'id' | 'url'
    required?: boolean
    help?: string
    placeholder?: string
    sensitive?: boolean
  }>
  setupRequirements?: {
    label?: string
    message: string
    commands?: string[]
    actionId?: string
    actionLabel?: string
    successMessage?: string
    inputs?: Array<{
      key: string
      label: string
      kind?: 'text' | 'email' | 'path' | 'password' | 'url'
      required?: boolean
      help?: string
      placeholder?: string
      sensitive?: boolean
    }>
  }
}

export interface SkillRequirementInstallCommand {
  kind: 'brew' | 'apt' | 'npm' | 'pnpm' | 'uv' | 'go' | 'node'
  command: string
  args: string[]
  display: string
}

export interface SkillSetupCommand {
  command: string
  args: string[]
  display: string
}

export interface ImportedRegistrySkillMetadata {
  provider: 'clawhub' | 'shipables' | 'tessl'
  registryName: string
  installName?: string
  version?: string
  downloadsWeekly?: number
  categories?: string[]
  homepage?: string
  emoji?: string
}

const DEFAULT_SKILL_SETUP_REQUIREMENTS: Record<string, NonNullable<OpenClawSkill['setupRequirements']>> = {
  '1password': {
    label: 'Needs setup',
    message: '1Password CLI needs account sign-in/authorization before an agent can use it.',
    commands: [
      'op signin',
      'op whoami',
    ],
  },
  github: {
    label: 'Needs setup',
    message: 'GitHub CLI needs account authentication before an agent can use GitHub operations.',
    commands: [
      'gh auth login',
      'gh auth status',
    ],
  },
  gog: {
    label: 'Needs setup',
    message: 'gog needs Google Workspace auth/account setup before an agent can actually use Gmail, Calendar, Drive, Docs, or Sheets.',
    commands: [
      'gog auth credentials /path/to/client_secret.json',
      'gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets',
      'gog auth list',
    ],
    actionId: 'gog-google-workspace-auth',
    actionLabel: 'Complete Setup',
    successMessage: 'Setup flow completed. If gog opened a browser, finish the consent flow there and then retry the agent.',
    inputs: [
      {
        key: 'clientSecretPath',
        label: 'Client Secret JSON',
        kind: 'path',
        required: true,
        placeholder: '/path/to/client_secret.json',
      },
      {
        key: 'accountEmail',
        label: 'Google Account Email',
        kind: 'email',
        required: true,
        placeholder: 'you@gmail.com',
      },
    ],
  },
  gemini: {
    label: 'Needs setup',
    message: 'Gemini CLI may need an interactive login/auth flow before an agent can use it.',
    commands: [
      'gemini',
    ],
  },
  himalaya: {
    label: 'Needs setup',
    message: 'Himalaya needs an email account configured before an agent can use it.',
    commands: [
      'himalaya account configure',
      'himalaya account list',
    ],
  },
  wacli: {
    label: 'Needs setup',
    message: 'wacli needs WhatsApp authentication and an initial sync before an agent can use it.',
    commands: [
      'wacli auth',
      'wacli sync --follow',
      'wacli doctor',
    ],
  },
  eightctl: {
    label: 'Needs setup',
    message: 'eightctl needs Eight Sleep credentials/config before an agent can use it.',
    commands: [
      'export EIGHTCTL_EMAIL="you@example.com"',
      'export EIGHTCTL_PASSWORD="..."',
    ],
  },
}

const DEFAULT_SKILL_INSTALL_OPTIONS: Record<string, SkillInstallOption[]> = {
  '1password': [
    {
      id: 'brew',
      kind: 'brew',
      formula: '1password-cli',
      bins: ['op'],
      label: 'Install 1Password CLI (brew)',
      os: ['darwin'],
    },
    {
      id: 'apt',
      kind: 'apt',
      package: '1password-cli',
      bins: ['op'],
      label: 'Install 1Password CLI (apt)',
      os: ['linux'],
    },
  ],
  github: [
    {
      id: 'brew',
      kind: 'brew',
      formula: 'gh',
      bins: ['gh'],
      label: 'Install GitHub CLI (brew)',
    },
    {
      id: 'apt',
      kind: 'apt',
      package: 'gh',
      bins: ['gh'],
      label: 'Install GitHub CLI (apt)',
    },
  ],
  himalaya: [
    {
      id: 'brew',
      kind: 'brew',
      formula: 'himalaya',
      bins: ['himalaya'],
      label: 'Install Himalaya (brew)',
      os: ['darwin'],
    },
    {
      id: 'apt',
      kind: 'apt',
      package: 'himalaya',
      bins: ['himalaya'],
      label: 'Install Himalaya (apt)',
      os: ['linux'],
    },
  ],
}

const SKILL_PLATFORM_SUPPORT: Record<string, NodeJS.Platform[]> = {
  'apple-notes': ['darwin'],
  'apple-reminders': ['darwin'],
  'calendar-app': ['darwin'],
  'contacts-app': ['darwin'],
  imsg: ['darwin'],
  'mail-app': ['darwin'],
  'things-mac': ['darwin'],
}

function buildGenericSkillSetupRequirement(skill: {
  requires?: SkillRequirements
  secretRequirements?: OpenClawSkill['secretRequirements']
}): OpenClawSkill['setupRequirements'] | undefined {
  const secretKeys = (skill.secretRequirements || []).map((entry) => entry.key).filter(Boolean)
  if (secretKeys.length > 0) {
    return {
      label: 'Needs setup',
      message: `This skill needs secrets or API keys configured before an agent can use it: ${secretKeys.join(', ')}.`,
    }
  }

  const envKeys = (skill.requires?.env || []).filter(Boolean)
  if (envKeys.length > 0) {
    return {
      label: 'Needs setup',
      message: `This skill needs environment variables or API keys configured before an agent can use it: ${envKeys.join(', ')}.`,
    }
  }

  const configKeys = (skill.requires?.config || []).filter(Boolean)
  if (configKeys.length > 0) {
    return {
      label: 'Needs setup',
      message: `This skill needs runtime configuration before an agent can use it: ${configKeys.join(', ')}.`,
    }
  }

  return undefined
}

function normalizeSkillSetupRequirements(
  name: string,
  setupRequirements: OpenClawSkill['setupRequirements'] | undefined,
  context?: {
    requires?: SkillRequirements
    secretRequirements?: OpenClawSkill['secretRequirements']
  }
): OpenClawSkill['setupRequirements'] | undefined {
  const defaults = DEFAULT_SKILL_SETUP_REQUIREMENTS[name]
  const generic = buildGenericSkillSetupRequirement(context || {})
  if (!defaults && !setupRequirements && !generic) return undefined
  return {
    ...(generic || {}),
    ...(defaults || {}),
    ...(setupRequirements || {}),
    inputs: setupRequirements?.inputs || defaults?.inputs,
    commands: setupRequirements?.commands || defaults?.commands,
  }
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

function normalizeSkillTags(tags: string[] | undefined): string[] {
  return normalizeStringArray(tags).slice(0, 12)
}

export function normalizeSkillInstallOptions(name: string, install: SkillInstallOption[] | undefined): SkillInstallOption[] | undefined {
  const merged = [...(DEFAULT_SKILL_INSTALL_OPTIONS[name] || []), ...(Array.isArray(install) ? install : [])]
  if (merged.length === 0) return undefined
  const seen = new Set<string>()
  const normalized: SkillInstallOption[] = []
  for (const option of merged) {
    const key = [
      option.kind,
      option.formula?.trim() || '',
      option.package?.trim() || '',
      option.label?.trim() || '',
    ].join(':')
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(option)
  }
  return normalized
}

function getPreferredDisplayInstallKinds(platform: NodeJS.Platform = process.platform): Array<SkillInstallOption['kind']> {
  switch (platform) {
    case 'darwin':
      return ['brew', 'uv', 'go', 'npm', 'pnpm', 'node', 'apt', 'download']
    case 'linux':
      return ['apt', 'uv', 'go', 'npm', 'pnpm', 'node', 'brew', 'download']
    default:
      return ['npm', 'pnpm', 'uv', 'go', 'node', 'apt', 'brew', 'download']
  }
}

export function getVisibleSkillInstallOptions(
  install: SkillInstallOption[] | undefined,
  platform: NodeJS.Platform = process.platform,
): SkillInstallOption[] | undefined {
  const options = Array.isArray(install) ? install : []
  if (options.length === 0) return undefined
  const compatible = options.filter((option) => {
    const supportedPlatforms = (option as any).os
    return !Array.isArray(supportedPlatforms) || supportedPlatforms.length === 0 || supportedPlatforms.includes(platform)
  })
  if (compatible.length === 0) return undefined

  const preferredKinds = getPreferredDisplayInstallKinds(platform)
  for (const kind of preferredKinds) {
    const matching = compatible.filter((option) => option.kind === kind)
    if (matching.length > 0) return matching
  }

  return compatible
}

export function isSkillSupportedOnPlatform(
  name: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const supportedPlatforms = SKILL_PLATFORM_SUPPORT[name]
  if (!Array.isArray(supportedPlatforms) || supportedPlatforms.length === 0) {
    return true
  }
  return supportedPlatforms.includes(platform)
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
const TOOLS_SKILL_SECTION_START = '<!-- CLAWMAX_ASSIGNED_SKILLS_START -->'
const TOOLS_SKILL_SECTION_END = '<!-- CLAWMAX_ASSIGNED_SKILLS_END -->'

function buildBinarySearchPaths(): string[] {
  const pathEntries = String(process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)

  return Array.from(new Set([
    ...pathEntries,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]))
}

function defaultBinaryExists(bin: string): boolean {
  if (!bin) return false
  if (bin.includes(path.sep)) {
    return fs.existsSync(bin)
  }

  return buildBinarySearchPaths().some((dir) => fs.existsSync(path.join(dir, bin)))
}

function commandExists(command: string): boolean {
  return defaultBinaryExists(command)
}

function getPreferredInstallKinds(platform: NodeJS.Platform = process.platform, commandExistsFn: (command: string) => boolean = commandExists): Array<SkillInstallOption['kind']> {
  switch (platform) {
    case 'darwin':
      return ['brew', 'npm', 'pnpm', 'uv', 'go', 'node', 'apt']
    case 'linux':
      if (commandExistsFn('apt-get') || commandExistsFn('apt')) return ['apt', 'npm', 'pnpm', 'uv', 'go', 'node', 'brew']
      if (commandExistsFn('brew')) return ['brew', 'npm', 'pnpm', 'uv', 'go', 'node', 'apt']
      return ['apt', 'npm', 'pnpm', 'uv', 'go', 'node', 'brew']
    default:
      return ['npm', 'pnpm', 'uv', 'go', 'node', 'brew', 'apt']
  }
}

function canRunInstallOption(
  option: SkillInstallOption,
  platform: NodeJS.Platform = process.platform,
  commandExistsFn: (command: string) => boolean = commandExists
): boolean {
  if ((option as any).os && Array.isArray((option as any).os) && (option as any).os.length > 0 && !(option as any).os.includes(platform)) {
    return false
  }
  switch (option.kind) {
    case 'brew':
      return commandExistsFn('brew')
    case 'apt':
      return commandExistsFn('apt-get') || commandExistsFn('apt')
    case 'npm':
    case 'node':
      return commandExistsFn('npm')
    case 'pnpm':
      return commandExistsFn('pnpm')
    case 'uv':
      return commandExistsFn('uv')
    case 'go':
      return commandExistsFn('go')
    default:
      return false
  }
}

function getInstallCheckBins(skill: Pick<OpenClawSkill, 'requires' | 'install'>): string[] {
  const bins = new Set<string>()

  for (const bin of skill.requires?.bins || []) {
    if (typeof bin === 'string' && bin.trim()) bins.add(bin.trim())
  }

  for (const option of skill.install || []) {
    for (const bin of option.bins || []) {
      if (typeof bin === 'string' && bin.trim()) bins.add(bin.trim())
    }
  }

  return Array.from(bins)
}

export function getSkillRequirementStatus(
  skill: Pick<OpenClawSkill, 'requires' | 'install'>,
  binaryExists: (bin: string) => boolean = defaultBinaryExists
): SkillRequirementStatus | undefined {
  const bins = getInstallCheckBins(skill)
  if (bins.length === 0) return undefined

  const presentBins: string[] = []
  const missingBins: string[] = []
  for (const bin of bins) {
    if (binaryExists(bin)) presentBins.push(bin)
    else missingBins.push(bin)
  }

  return {
    checkable: true,
    installSatisfied: missingBins.length === 0,
    presentBins,
    missingBins,
  }
}

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

function renderAssignedSkillsSection(skillIds: string[]): string {
  const lines = skillIds.length > 0
    ? skillIds.map((skillId) => `- ${skillId}`)
    : ['- No assigned skills configured yet.']
  return `${TOOLS_SKILL_SECTION_START}
## Assigned Skills

These skills are currently assigned to this agent in the dashboard/runtime config.
Use them when relevant before claiming you do not have access.

${lines.join('\n')}
${TOOLS_SKILL_SECTION_END}`
}

function syncAgentToolsAssignedSkills(agentWorkspaceDir: string, skillIds: string[]) {
  const toolsPath = path.join(agentWorkspaceDir, 'TOOLS.md')
  if (!fs.existsSync(toolsPath)) return

  const current = fs.readFileSync(toolsPath, 'utf-8')
  const section = renderAssignedSkillsSection(skillIds)
  const next = current.includes(TOOLS_SKILL_SECTION_START) && current.includes(TOOLS_SKILL_SECTION_END)
    ? current.replace(
        new RegExp(`${TOOLS_SKILL_SECTION_START}[\\s\\S]*?${TOOLS_SKILL_SECTION_END}`, 'm'),
        section,
      )
    : `${current.trimEnd()}\n\n---\n\n${section}\n`

  if (next !== current) {
    fs.writeFileSync(toolsPath, next, 'utf-8')
  }
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
    if (!isSkillSupportedOnPlatform(data.name)) {
      return null
    }

    const openclawMeta = data.metadata?.openclaw || {}

    const requires = openclawMeta.requires
    const normalizedInstall = normalizeSkillInstallOptions(data.name, openclawMeta.install)
    const secretRequirements = openclawMeta.secretRequirements || data.secretRequirements || []
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
      requires,
      install: getVisibleSkillInstallOptions(normalizedInstall),
      requirementStatus: getSkillRequirementStatus({ requires, install: normalizedInstall }),
      homepage: openclawMeta.homepage,
      tags: openclawMeta.tags || data.tags || [],
      registryProvider: openclawMeta.registryProvider,
      registryName: openclawMeta.registryName,
      registryInstallName: openclawMeta.registryInstallName,
      registryVersion: openclawMeta.registryVersion,
      registryDownloadsWeekly: typeof openclawMeta.registryDownloadsWeekly === 'number' ? openclawMeta.registryDownloadsWeekly : undefined,
      registryCategories: normalizeStringArray(openclawMeta.registryCategories),
      registryHomepage: openclawMeta.registryHomepage,
      registryImportedAt: openclawMeta.registryImportedAt,
      secretRequirements,
      setupRequirements: normalizeSkillSetupRequirements(
        data.name,
        openclawMeta.setupRequirements || data.setupRequirements,
        { requires, secretRequirements }
      ),
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
    if (!isSkillSupportedOnPlatform(name)) {
      return null
    }

    const openclawMeta = data.metadata?.openclaw || {}

    const requires = data.requires || openclawMeta.requires
    const normalizedInstall = normalizeSkillInstallOptions(name, data.install || openclawMeta.install)
    const secretRequirements = data.secretRequirements || openclawMeta.secretRequirements || []
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
      requires,
      install: getVisibleSkillInstallOptions(normalizedInstall),
      requirementStatus: getSkillRequirementStatus({ requires, install: normalizedInstall }),
      homepage: data.homepage || openclawMeta.homepage,
      tags: data.tags || openclawMeta.tags || [],
      registryProvider: openclawMeta.registryProvider,
      registryName: openclawMeta.registryName,
      registryInstallName: openclawMeta.registryInstallName,
      registryVersion: openclawMeta.registryVersion,
      registryDownloadsWeekly: typeof openclawMeta.registryDownloadsWeekly === 'number' ? openclawMeta.registryDownloadsWeekly : undefined,
      registryCategories: normalizeStringArray(openclawMeta.registryCategories),
      registryHomepage: openclawMeta.registryHomepage,
      registryImportedAt: openclawMeta.registryImportedAt,
      secretRequirements,
      setupRequirements: normalizeSkillSetupRequirements(
        name,
        data.setupRequirements || openclawMeta.setupRequirements,
        { requires, secretRequirements }
      ),
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

export function getSkillRequirementInstallCommands(
  skill: OpenClawSkill,
  options?: {
    platform?: NodeJS.Platform
    commandExists?: (command: string) => boolean
  }
): SkillRequirementInstallCommand[] {
  const commands: SkillRequirementInstallCommand[] = []
  const seen = new Set<string>()
  const installOptions = skill.install || []
  const platform = options?.platform || process.platform
  const commandExistsFn = options?.commandExists || commandExists
  const preferredKinds = getPreferredInstallKinds(platform, commandExistsFn)

  const sortedOptions = [...installOptions].sort((a, b) => {
    const ai = preferredKinds.indexOf(a.kind)
    const bi = preferredKinds.indexOf(b.kind)
    return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
  })

  for (const option of sortedOptions) {
    if (!canRunInstallOption(option, platform, commandExistsFn)) continue
    if (option.kind === 'brew' && option.formula) {
      const formula = option.formula.trim()
      const key = `brew:${formula}`
      if (!formula || seen.has(key)) continue
      seen.add(key)
      commands.push({
        kind: 'brew',
        command: 'brew',
        args: ['install', formula],
        display: `brew install ${formula}`,
      })
      continue
    }
    if (option.kind === 'apt' && option.package) {
      const pkg = option.package.trim()
      const key = `apt:${pkg}`
      if (!pkg || seen.has(key)) continue
      seen.add(key)
      commands.push({
        kind: 'apt',
        command: 'apt-get',
        args: ['install', '-y', pkg],
        display: `apt-get install -y ${pkg}`,
      })
      continue
    }
    if (option.kind === 'npm' && option.package) {
      const pkg = option.package.trim()
      const key = `npm:${pkg}`
      if (!pkg || seen.has(key)) continue
      seen.add(key)
      commands.push({
        kind: 'npm',
        command: 'npm',
        args: ['install', '-g', pkg],
        display: `npm install -g ${pkg}`,
      })
      continue
    }
    if (option.kind === 'pnpm' && option.package) {
      const pkg = option.package.trim()
      const key = `pnpm:${pkg}`
      if (!pkg || seen.has(key)) continue
      seen.add(key)
      commands.push({
        kind: 'pnpm',
        command: 'pnpm',
        args: ['add', '-g', pkg],
        display: `pnpm add -g ${pkg}`,
      })
      continue
    }
    if (option.kind === 'uv' && option.package) {
      const pkg = option.package.trim()
      const key = `uv:${pkg}`
      if (!pkg || seen.has(key)) continue
      seen.add(key)
      commands.push({
        kind: 'uv',
        command: 'uv',
        args: ['tool', 'install', pkg],
        display: `uv tool install ${pkg}`,
      })
      continue
    }
    if ((option.kind === 'go') && ((option as any).module || option.package)) {
      const moduleName = String((option as any).module || option.package || '').trim()
      const key = `go:${moduleName}`
      if (!moduleName || seen.has(key)) continue
      seen.add(key)
      commands.push({
        kind: 'go',
        command: 'go',
        args: ['install', moduleName],
        display: `go install ${moduleName}`,
      })
      continue
    }
    if ((option.kind === 'node') && option.package) {
      const pkg = option.package.trim()
      const key = `node:${pkg}`
      if (!pkg || seen.has(key)) continue
      seen.add(key)
      commands.push({
        kind: 'node',
        command: 'npm',
        args: ['install', '-g', pkg],
        display: `npm install -g ${pkg}`,
      })
      continue
    }
  }

  return commands
}

export function getSkillSetupCommands(
  skill: OpenClawSkill,
  options?: { inputs?: Record<string, string> }
): SkillSetupCommand[] {
  const actionId = skill.setupRequirements?.actionId
  const inputs = options?.inputs || {}

  if (actionId === 'gog-google-workspace-auth') {
    const clientSecretPath = (inputs.clientSecretPath || '').trim()
    const accountEmail = (inputs.accountEmail || '').trim()
    if (!clientSecretPath) {
      throw new Error('Client secret JSON path is required for gog setup')
    }
    if (!accountEmail) {
      throw new Error('Google account email is required for gog setup')
    }

    return [
      {
        command: 'gog',
        args: ['auth', 'credentials', clientSecretPath],
        display: `gog auth credentials ${clientSecretPath}`,
      },
      {
        command: 'gog',
        args: ['auth', 'add', accountEmail, '--services', 'gmail,calendar,drive,contacts,docs,sheets'],
        display: `gog auth add ${accountEmail} --services gmail,calendar,drive,contacts,docs,sheets`,
      },
      {
        command: 'gog',
        args: ['auth', 'list'],
        display: 'gog auth list',
      },
    ]
  }

  return []
}

export function updateSkillContent(
  skillId: string,
  content: string,
  overrides?: { name?: string; description?: string; tags?: string[] }
): { skill: OpenClawSkill; content: string; editable: boolean } {
  const skill = getSkillById(skillId)
  if (!skill) {
    throw new Error(`Skill "${skillId}" not found`)
  }

  const parsed = matter(content)
  const nextName = (overrides?.name ?? parsed.data?.name ?? skill.name ?? '').trim()
  const nextDescriptionRaw = overrides?.description ?? parsed.data?.description ?? skill.description ?? ''
  const nextDescription = String(nextDescriptionRaw).trim()
  const nextTags = normalizeSkillTags(overrides?.tags ?? parsed.data?.tags ?? skill.tags ?? [])
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
    tags: nextTags,
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

export function stampImportedRegistrySkillMetadata(
  skillDir: string,
  metadata: ImportedRegistrySkillMetadata,
): void {
  const skillPath = resolveSkillMarkdownPath(skillDir)
  if (!fs.existsSync(skillPath)) return

  const raw = fs.readFileSync(skillPath, 'utf-8')
  const parsed = matter(raw)
  const nextTags = normalizeSkillTags([
    ...(Array.isArray(parsed.data?.tags) ? parsed.data.tags : []),
    ...(metadata.categories || []),
  ])

  const next = {
    ...parsed.data,
    ...(metadata.emoji && !parsed.data?.emoji ? { emoji: metadata.emoji } : {}),
    ...(!parsed.data?.homepage && metadata.homepage ? { homepage: metadata.homepage } : {}),
    tags: nextTags,
    metadata: {
      ...(parsed.data?.metadata || {}),
      openclaw: {
        ...(parsed.data?.metadata?.openclaw || {}),
        registryProvider: metadata.provider,
        registryName: metadata.registryName,
        ...(metadata.installName || metadata.registryName ? { registryInstallName: metadata.installName || metadata.registryName } : {}),
        ...(metadata.version ? { registryVersion: metadata.version } : {}),
        ...(typeof metadata.downloadsWeekly === 'number' ? { registryDownloadsWeekly: metadata.downloadsWeekly } : {}),
        ...(metadata.categories ? { registryCategories: metadata.categories } : {}),
        ...(metadata.homepage ? { registryHomepage: metadata.homepage } : {}),
        registryImportedAt: new Date().toISOString(),
      },
    },
  }

  fs.writeFileSync(skillPath, matter.stringify(parsed.content, next), 'utf-8')
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
    const targetAgentRecord = config.agents.list[agentIndex]
    const targetWorkspaceDir = typeof targetAgentRecord.workspace === 'string' && targetAgentRecord.workspace.trim()
      ? targetAgentRecord.workspace
      : activeWorkspaceAgentDir
    const existingSkills = targetAgentRecord.skills
    const currentSkills: string[] = Array.isArray(existingSkills)
      ? [...existingSkills]
      : []
    const unchanged = currentSkills.length === normalizedSkillIds.length
      && currentSkills.every((skillId: string, index: number) => skillId === normalizedSkillIds[index])
    if (unchanged) {
      return
    }

    config.agents.list[agentIndex] = {
      ...targetAgentRecord,
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
    syncAgentToolsAssignedSkills(targetWorkspaceDir, normalizedSkillIds)
    const reset = resetAgentSessionsForModelChange(process.env.HOME || os.homedir(), agentId)
    if (!reset.ok) {
      console.warn(`Failed to reset sessions after skill change for ${agentId}: ${reset.error}`)
    }
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

export function validateSkillChanges(currentSkills: string[], nextSkills: string[]): {
  invalidAdded: string[]
  invalidPreserved: string[]
} {
  const currentSet = new Set(currentSkills)
  const added = nextSkills.filter((skill) => !currentSet.has(skill))
  const preserved = nextSkills.filter((skill) => currentSet.has(skill))

  return {
    invalidAdded: validateSkills(added).missing,
    invalidPreserved: validateSkills(preserved).missing,
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
  tags?: string[]
  content: string
}): OpenClawSkill {
  const { name, description, emoji, requires, install, homepage, tags, content } = params

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
    ...(normalizeSkillTags(tags).length > 0 ? { tags: normalizeSkillTags(tags) } : {}),
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
    tags: normalizeSkillTags(tags)
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
    const parsed = JSON.parse(content || '{}')
    if (!parsed.agents || typeof parsed.agents !== 'object') parsed.agents = {}
    if (!Array.isArray(parsed.agents.list)) parsed.agents.list = []
    return parsed
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
