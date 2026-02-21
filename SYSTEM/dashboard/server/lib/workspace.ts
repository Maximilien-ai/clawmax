import fs from 'fs'
import path from 'path'
import net from 'net'

export const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || '', '.openclaw', 'workspace')

/** Agents live under WORKSPACE/AGENTS/maxN/ */
export const AGENTS_DIR = path.join(WORKSPACE, 'AGENTS')

// Status check cache to avoid hammering lsof on every request
interface StatusCache {
  status: 'online' | 'offline' | 'unknown'
  lastHeartbeat: string | null
  timestamp: number
}
const statusCache = new Map<string, StatusCache>()
const STATUS_CACHE_TTL = 5000 // 5 seconds cache

export type DocSection = 'ORG' | 'AGENTS' | 'SYSTEM'

export interface DocEntry {
  path: string       // relative to WORKSPACE
  section: DocSection
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.pnpm', 'AGENTS'])

/** Return all .md file paths with section classification, sorted by section then path.
 *  ORG/ → ORG, AGENTS/ → AGENTS (per-agent docs), SYSTEM/ → SYSTEM, root → SYSTEM fallback */
export function listMarkdownFiles(): DocEntry[] {
  const results: DocEntry[] = []

  function sectionFor(relPath: string): DocSection {
    if (relPath.startsWith('ORG/') || relPath.startsWith('ORG\\')) return 'ORG'
    if (relPath.startsWith('AGENTS/') || relPath.startsWith('AGENTS\\')) return 'AGENTS'
    return 'SYSTEM'
  }

  function walk(dir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const rel = path.relative(WORKSPACE, full)
        results.push({ path: rel, section: sectionFor(rel) })
      }
    }
  }

  // Walk ORG, SYSTEM, and root (not AGENTS — those are scanned separately below)
  walk(WORKSPACE)

  // Walk AGENTS separately so we can classify correctly
  function walkAgents(dir: string) {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist'].includes(entry.name)) continue
        walkAgents(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push({ path: path.relative(WORKSPACE, full), section: 'AGENTS' })
      }
    }
  }
  walkAgents(AGENTS_DIR)

  return results.sort((a, b) => {
    const sOrder: Record<DocSection, number> = { ORG: 0, AGENTS: 1, SYSTEM: 2 }
    const sd = sOrder[a.section] - sOrder[b.section]
    return sd !== 0 ? sd : a.path.localeCompare(b.path)
  })
}

/** Read a workspace .md file by relative path. Returns null if outside workspace or not found */
export function readWorkspaceFile(relPath: string): string | null {
  const full = path.resolve(WORKSPACE, relPath)
  // Security: ensure it stays inside workspace
  if (!full.startsWith(WORKSPACE + path.sep) && full !== WORKSPACE) return null
  if (!full.endsWith('.md')) return null
  try {
    return fs.readFileSync(full, 'utf-8')
  } catch {
    return null
  }
}

/** Write a workspace .md file. Returns false if path is unsafe */
export function writeWorkspaceFile(relPath: string, content: string): boolean {
  const full = path.resolve(WORKSPACE, relPath)
  if (!full.startsWith(WORKSPACE + path.sep) && full !== WORKSPACE) return false
  if (!full.endsWith('.md')) return false
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
    return true
  } catch {
    return false
  }
}

export interface GroupEntry {
  name: string
  description: string | null
  tags: string[]
  community: string | null  // For groups only - which community they belong to
  channels: string[]  // Communication channels: 'whatsapp', 'slack', 'discord', etc.
}

/** Update tags for a community or group in its markdown file (verbose format only).
 *  Returns true on success, false if entry not found or file error */
export function updateGroupTags(type: 'community' | 'group', name: string, newTags: string[]): boolean {
  try {
    const filePath = type === 'community'
      ? path.join(WORKSPACE, 'ORG', 'COMMUNITIES.md')
      : path.join(WORKSPACE, 'ORG', 'GROUPS.md')

    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    let inTargetEntry = false
    let foundEntry = false
    const newLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Check if we're entering a new entry section
      if (trimmed.startsWith('###')) {
        const entryName = trimmed.replace(/^###\s+/, '').trim()
        // If we were in target entry and now hit a different entry, exit
        if (inTargetEntry && entryName !== name) {
          inTargetEntry = false
        }
        // Check if this is the start of our target entry
        if (entryName === name) {
          inTargetEntry = true
          foundEntry = true
        }
        newLines.push(line)
        continue
      }

      // If we hit a section header ##, exit the current entry
      if (trimmed.startsWith('##')) {
        inTargetEntry = false
        newLines.push(line)
        continue
      }

      // If we're in the target entry and this is the Tags line, replace it
      if (inTargetEntry && trimmed.match(/^-\s+\*\*Tags:\*\*/i)) {
        newLines.push(`- **Tags:** ${newTags.join(', ')}`)
        continue
      }

      newLines.push(line)
    }

    if (!foundEntry) return false

    fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8')
    return true
  } catch (err) {
    console.error(`Error updating ${type} tags:`, err)
    return false
  }
}

export interface AgentInfo {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
  lastHeartbeat: string | null
  whatsapp: string | null
  isProfile: boolean
  workspacePath: string
  communities: GroupEntry[]
  groups: GroupEntry[]
  tags: string[]
  validationWarnings?: string[] // Warnings from schema validation
}

/** Parse GROUPS.md into communities + groups arrays with optional descriptions, tags, community links, and channel indicators.
 *  Supports two formats:
 *  1. Compact: `- Name: Description [tag1, tag2] @CommunityName 📱 💬`
 *  2. Verbose:
 *     ### Name
 *     - **Description:** ...
 *     - **Tags:** tag1, tag2
 *     - **Community:** CommunityName
 *     - **Channels:** whatsapp, slack
 */
export interface GroupWithMembers extends GroupEntry {
  members: string[]
}

export function parseGroupsWithMembers(content: string): { communities: GroupWithMembers[]; groups: GroupWithMembers[] } {
  const communities: GroupWithMembers[] = []
  const groups: GroupWithMembers[] = []
  let section: 'communities' | 'groups' | null = null

  let currentName: string | null = null
  let currentDescription: string | null = null
  let currentTags: string[] = []
  let currentCommunity: string | null = null
  let currentChannels: string[] = []
  let currentMembers: string[] = []

  const flushEntry = () => {
    if (!currentName || !section) return
    const entry: GroupWithMembers = {
      name: currentName,
      description: currentDescription,
      tags: currentTags,
      community: section === 'groups' ? currentCommunity : null,
      channels: currentChannels,
      members: currentMembers
    }
    if (section === 'communities') communities.push(entry)
    else if (section === 'groups') groups.push(entry)

    // Reset
    currentName = null
    currentDescription = null
    currentTags = []
    currentCommunity = null
    currentChannels = []
    currentMembers = []
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    // Verbose format: ### Name
    if (trimmed.startsWith('###')) {
      flushEntry()
      currentName = trimmed.replace(/^###\s+/, '').trim()
      continue
    }

    // Section headers
    if (/^##\s+communities/i.test(trimmed)) {
      flushEntry()
      section = 'communities'
      continue
    }
    if (/^##\s+groups/i.test(trimmed)) {
      flushEntry()
      section = 'groups'
      continue
    }
    if (trimmed.startsWith('##')) {
      flushEntry()
      section = null
      continue
    }

    // Verbose format: field bullets
    if (trimmed.startsWith('-') && trimmed.includes('**')) {
      const descMatch = trimmed.match(/\*\*Description:\*\*\s*(.+)/i)
      if (descMatch) {
        currentDescription = descMatch[1].trim()
        continue
      }

      const tagsMatch = trimmed.match(/\*\*Tags:\*\*\s*(.+)/i)
      if (tagsMatch) {
        currentTags = tagsMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0)
        continue
      }

      const communityMatch = trimmed.match(/\*\*Community:\*\*\s*(.+)/i)
      if (communityMatch) {
        currentCommunity = communityMatch[1].trim()
        continue
      }

      const channelsMatch = trimmed.match(/\*\*Channels:\*\*\s*(.+)/i)
      if (channelsMatch) {
        currentChannels = channelsMatch[1].split(',').map(c => c.trim()).filter(c => c.length > 0)
        continue
      }

      const membersMatch = trimmed.match(/\*\*Members:\*\*\s*(.+)/i)
      if (membersMatch) {
        currentMembers = membersMatch[1].split(',').map(m => m.trim()).filter(m => m.length > 0)
        continue
      }
    }
  }

  flushEntry()
  return { communities, groups }
}

export function parseGroups(content: string): { communities: GroupEntry[]; groups: GroupEntry[] } {
  const communities: GroupEntry[] = []
  const groups: GroupEntry[] = []
  let section: 'communities' | 'groups' | null = null

  // Channel name to emoji mapping (for backward compat)
  const channelEmojis: Record<string, string> = {
    '📱': 'whatsapp',
    '💬': 'slack',
    '💠': 'discord',
    '📧': 'email',
    '💼': 'teams'
  }

  // Parse verbose format (### Name with field bullets)
  let currentName: string | null = null
  let currentDescription: string | null = null
  let currentTags: string[] = []
  let currentCommunity: string | null = null
  let currentChannels: string[] = []

  const flushEntry = () => {
    if (!currentName || !section) return
    const entry: GroupEntry = {
      name: currentName,
      description: currentDescription,
      tags: currentTags,
      community: section === 'groups' ? currentCommunity : null,
      channels: currentChannels
    }
    if (section === 'communities') communities.push(entry)
    else if (section === 'groups') groups.push(entry)

    // Reset
    currentName = null
    currentDescription = null
    currentTags = []
    currentCommunity = null
    currentChannels = []
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    // Verbose format: ### Name (CHECK THIS FIRST before ## checks!)
    if (trimmed.startsWith('###')) {
      flushEntry()
      currentName = trimmed.replace(/^###\s+/, '').trim()
      continue
    }

    // Section headers
    if (/^##\s+communities/i.test(trimmed)) {
      flushEntry()
      section = 'communities'
      continue
    }
    if (/^##\s+groups/i.test(trimmed)) {
      flushEntry()
      section = 'groups'
      continue
    }
    if (trimmed.startsWith('##')) {
      flushEntry()
      section = null
      continue
    }

    // Verbose format: field bullets
    if (trimmed.startsWith('-') && trimmed.includes('**')) {
      const descMatch = trimmed.match(/\*\*Description:\*\*\s*(.+)/i)
      if (descMatch) {
        currentDescription = descMatch[1].trim()
        continue
      }

      const tagsMatch = trimmed.match(/\*\*Tags:\*\*\s*(.+)/i)
      if (tagsMatch) {
        currentTags = tagsMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0)
        continue
      }

      const communityMatch = trimmed.match(/\*\*Community:\*\*\s*(.+)/i)
      if (communityMatch) {
        currentCommunity = communityMatch[1].trim()
        continue
      }

      const channelsMatch = trimmed.match(/\*\*Channels:\*\*\s*(.+)/i)
      if (channelsMatch) {
        currentChannels = channelsMatch[1].split(',').map(c => c.trim()).filter(c => c.length > 0)
        continue
      }
    }

    // Compact format: - Name: Description [tags] @Community 📱
    const bullet = trimmed.match(/^[-*]\s+(.+)/)
    if (bullet && !trimmed.includes('**')) {
      flushEntry()
      let raw = bullet[1].trim()

      // Extract channel indicators (📱 💬 💠 etc.)
      const channels: string[] = []
      for (const [emoji, channelName] of Object.entries(channelEmojis)) {
        if (raw.includes(emoji)) {
          channels.push(channelName)
          raw = raw.replace(new RegExp(emoji, 'g'), '').trim()
        }
      }

      // Extract community link (@CommunityName)
      let community: string | null = null
      const communityMatch = raw.match(/@([^\[\]]+)$/)
      if (communityMatch) {
        community = communityMatch[1].trim()
        raw = raw.slice(0, communityMatch.index).trim()
      }

      // Extract tags [tag1, tag2]
      let tags: string[] = []
      const tagsMatch = raw.match(/\[([^\]]+)\]\s*$/)
      if (tagsMatch) {
        tags = tagsMatch[1].split(',').map(t => t.trim()).filter(t => t.length > 0)
        raw = raw.slice(0, tagsMatch.index).trim()
      }

      // Extract name and description
      const colonIdx = raw.indexOf(':')
      const entry: GroupEntry = colonIdx >= 0
        ? {
            name: raw.slice(0, colonIdx).trim(),
            description: raw.slice(colonIdx + 1).trim() || null,
            tags,
            community: section === 'groups' ? community : null,
            channels
          }
        : {
            name: raw,
            description: null,
            tags,
            community: section === 'groups' ? community : null,
            channels
          }

      if (section === 'communities') communities.push(entry)
      else if (section === 'groups') groups.push(entry)
    }
  }

  flushEntry() // Flush last entry
  return { communities, groups }
}

/** Parse Tags from IDENTITY.md **Tags:** field.
 *  Format: `**Tags:** tag1, tag2, tag3` (comma-separated) */
export function parseTags(content: string): string[] {
  const tagsMatch = content.match(/\*\*Tags[:\*\s]*\*?\*?\s*\n?\s*([^\n]+)/mi)
  if (!tagsMatch) return []

  const tagsStr = tagsMatch[1].trim()
  if (!tagsStr) return []

  return tagsStr
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0)
}

/** Parse IDENTITY.md content into structured data */
export function parseIdentity(content: string): any {
  const identity: any = {}

  const nameMatch = content.match(/\*\*Name:\*\*\s*([^\n]+)/i)
  if (nameMatch) identity.name = nameMatch[1].trim()

  const creatureMatch = content.match(/\*\*Creature:\*\*\s*([^\n]+)/i)
  if (creatureMatch) identity.creature = creatureMatch[1].trim()

  const vibeMatch = content.match(/\*\*Vibe:\*\*\s*([^\n]+)/i)
  if (vibeMatch) identity.vibe = vibeMatch[1].trim()

  const emojiMatch = content.match(/\*\*Emoji:\*\*\s*([^\n]+)/i)
  if (emojiMatch) identity.emoji = emojiMatch[1].trim()

  const whatsappMatch = content.match(/\*\*WhatsApp:\*\*\s*(\+?[0-9]+)?/i)
  if (whatsappMatch) {
    const value = (whatsappMatch[1] || '').trim()
    identity.whatsapp = value || null
  }

  identity.tags = parseTags(content)

  return identity
}

/** Discover all maxN/ directories and return agent info */
export interface AgentActivity {
  recentFiles: { name: string; mtime: string; ageMins: number }[]
  todos: string | null
  completed: string | null
  identity: string | null
}

export function getAgentActivity(agentDir: string): AgentActivity {
  const recentFiles: { name: string; mtime: string; ageMins: number }[] = []
  try {
    const entries = fs.readdirSync(agentDir, { withFileTypes: true })
    for (const e of entries) {
      if (!e.isFile()) continue
      try {
        const s = fs.statSync(path.join(agentDir, e.name))
        const ageMins = (Date.now() - s.mtime.getTime()) / 60000
        recentFiles.push({ name: e.name, mtime: s.mtime.toISOString(), ageMins })
      } catch {}
    }
    recentFiles.sort((a, b) => a.ageMins - b.ageMins)
  } catch {}

  const readFile = (name: string): string | null => {
    try { return fs.readFileSync(path.join(agentDir, name), 'utf-8') } catch { return null }
  }

  return {
    recentFiles,
    todos: readFile('TODOs.md'),
    completed: readFile('COMPLETED.md'),
    identity: readFile('IDENTITY.md'),
  }
}

export interface ActivityEntry {
  agentId: string
  file: string
  mtime: string
  ageMins: number
}

/** Aggregated timeline of all file writes across all agent dirs, newest first */
export function getInstallationActivity(limit = 200): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  let dirs: fs.Dirent[]
  try {
    dirs = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
  } catch {
    return entries
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    if (d.name.startsWith('.') || d.name.startsWith('_')) continue
    const agentDir = path.join(AGENTS_DIR, d.name)
    try {
      const files = fs.readdirSync(agentDir, { withFileTypes: true })
      for (const f of files) {
        if (!f.isFile()) continue
        try {
          const s = fs.statSync(path.join(agentDir, f.name))
          entries.push({
            agentId: d.name,
            file: f.name,
            mtime: s.mtime.toISOString(),
            ageMins: (Date.now() - s.mtime.getTime()) / 60000,
          })
        } catch {}
      }
    } catch {}
  }
  return entries.sort((a, b) => a.ageMins - b.ageMins).slice(0, limit)
}

/** Read org name. Priority:
 *  1. ORG/IDENTITY.md `**Name:**` field (structured)
 *  2. ORG/MASTER_PLAN.md or MASTER_PLAN.md H1 (e.g. "# The Maximilien.ai Master Plan" → "Maximilien.ai")
 */
export function getOrgName(): string | null {
  // 1. Try ORG/IDENTITY.md **Name:** field (value may be on same line or next line)
  try {
    const identity = fs.readFileSync(path.join(WORKSPACE, 'ORG', 'IDENTITY.md'), 'utf-8')
    // Match "**Name:**" then capture value on same line OR next non-empty line
    const m = identity.match(/\*\*Name[:\*\s]*\*?\*?\s*\n?\s*([^\n_*\(].+)/m)
    if (m) {
      const name = m[1].replace(/\*+$/, '').trim()
      if (name && !name.startsWith('_') && !name.startsWith('(')) return name
    }
  } catch {}

  // 2. Fall back to MASTER_PLAN.md H1
  const candidates = [
    path.join(WORKSPACE, 'ORG', 'MASTER_PLAN.md'),
    path.join(WORKSPACE, 'MASTER_PLAN.md'),
  ]
  for (const p of candidates) {
    try {
      const content = fs.readFileSync(p, 'utf-8')
      for (const line of content.split('\n')) {
        const m = line.match(/^#\s+(.+)/)
        if (!m) continue
        const title = m[1].trim()
        // Try to extract a "Name.tld" token (e.g. Maximilien.ai)
        const dotMatch = title.match(/([A-Za-z0-9-]+\.[a-z]{2,})/)
        if (dotMatch) return dotMatch[1]
        // Fallback: strip common boilerplate words
        return title.replace(/^The\s+/i, '').replace(/\s+Master Plan.*$/i, '').trim() || null
      }
    } catch {}
  }
  return null
}

/** Read the latest semver git tag from refs/tags/ and packed-refs. Returns null if none. */
export function getLatestTag(): string | null {
  const tags: string[] = []

  // Loose refs
  try {
    tags.push(...fs.readdirSync(path.join(WORKSPACE, '.git', 'refs', 'tags')))
  } catch {}

  // Packed refs (git gc moves tags here)
  try {
    const packed = fs.readFileSync(path.join(WORKSPACE, '.git', 'packed-refs'), 'utf-8')
    for (const line of packed.split('\n')) {
      const m = line.match(/^[0-9a-f]+ refs\/tags\/(.+)$/)
      if (m && !m[1].endsWith('^{}')) tags.push(m[1])
    }
  } catch {}

  if (tags.length === 0) return null

  tags.sort((a, b) => {
    const av = a.replace(/^v/, '').split('.').map(Number)
    const bv = b.replace(/^v/, '').split('.').map(Number)
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const d = (av[i] ?? 0) - (bv[i] ?? 0)
      if (d !== 0) return d
    }
    return 0
  })
  return tags[tags.length - 1]
}

export function listAgents(): AgentInfo[] {
  const agents: AgentInfo[] = []
  let entries: fs.Dirent[]

  try {
    entries = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
  } catch {
    return agents
  }

  // Build a map from workspace path → registered agent ID from openclaw.json
  // Also validate the agents list structure
  const workspaceToIdMap = new Map<string, string>()
  const agentValidationWarnings = new Map<string, string[]>()

  try {
    const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list || []

    // Validate openclaw.json structure
    const { validateAgents } = require('./validator')
    const validation = validateAgents({ agents: { list: agentList } })

    // Map validation errors to agent IDs
    if (!validation.valid) {
      for (const error of validation.errors) {
        // Extract agent index from field path (e.g., "agents.list.0.id" → index 0)
        const match = error.field.match(/^agents\.list\.(\d+)/)
        if (match) {
          const idx = parseInt(match[1])
          const agent = agentList[idx]
          if (agent?.id) {
            const warnings = agentValidationWarnings.get(agent.id) || []
            warnings.push(`${error.field.replace(/^agents\.list\.\d+\./, '')}: ${error.message}`)
            agentValidationWarnings.set(agent.id, warnings)
          }
        }
      }
    }

    for (const agent of agentList) {
      if (agent.workspace) {
        workspaceToIdMap.set(agent.workspace, agent.id)
      }
    }
  } catch {}

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Skip hidden directories and common non-agent directories
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue

    const agentDir = path.join(AGENTS_DIR, entry.name)
    // Look up the registered ID from openclaw.json, fall back to directory name
    const registeredId = workspaceToIdMap.get(agentDir) || entry.name
    const agent = readAgentInfo(registeredId, agentDir, agentValidationWarnings.get(registeredId))
    agents.push(agent)
  }

  return agents.sort((a, b) => a.id.localeCompare(b.id))
}

function readAgentInfo(id: string, agentDir: string, validationWarnings?: string[]): AgentInfo {
  // Read name from IDENTITY.md
  let name = id
  const identityPath = path.join(agentDir, 'IDENTITY.md')
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    const nameMatch = identity.match(/\*\*Name[:\*\s]+\s*(.+)/m) || identity.match(/^-\s+Name[:\s]+(.+)$/m) || identity.match(/^#\s+(.+)$/m)
    if (nameMatch) name = nameMatch[1].trim()
  } catch {}

  // Check if agent gateway is actually running by checking if port is listening
  let status: AgentInfo['status'] = 'unknown'
  let lastHeartbeat: string | null = null

  // Check cache first to avoid excessive lsof calls
  const cached = statusCache.get(id)
  const now = Date.now()
  if (cached && (now - cached.timestamp) < STATUS_CACHE_TTL) {
    status = cached.status
    lastHeartbeat = cached.lastHeartbeat
  } else {
    // Cache miss or expired, check actual status
    const gatewayConfig = getAgentGatewayConfig(id)
    if (gatewayConfig && gatewayConfig.port) {
      try {
        const { execSync } = require('child_process')
        // Check if port is listening
        execSync(`lsof -ti:${gatewayConfig.port}`, { encoding: 'utf-8', stdio: 'pipe' })
        status = 'online' // Port is listening, gateway is running
        lastHeartbeat = new Date().toISOString()
      } catch {
      // Port not listening, check file activity as fallback
      try {
        const entries = fs.readdirSync(agentDir, { withFileTypes: true })
        let latestMtime = 0
        for (const e of entries) {
          if (!e.isFile()) continue
          try {
            const s = fs.statSync(path.join(agentDir, e.name))
            if (s.mtime.getTime() > latestMtime) latestMtime = s.mtime.getTime()
          } catch {}
        }
        if (latestMtime > 0) {
          lastHeartbeat = new Date(latestMtime).toISOString()
          const ageMins = (Date.now() - latestMtime) / 60000
          // offline = recent activity but no running process
          status = ageMins < 10080 ? 'offline' : 'unknown'
        }
      } catch {}
    }
  } else {
    // No gateway config, fall back to file-based detection
    try {
      const entries = fs.readdirSync(agentDir, { withFileTypes: true })
      let latestMtime = 0
      for (const e of entries) {
        if (!e.isFile()) continue
        try {
          const s = fs.statSync(path.join(agentDir, e.name))
          if (s.mtime.getTime() > latestMtime) latestMtime = s.mtime.getTime()
        } catch {}
      }
      if (latestMtime > 0) {
        lastHeartbeat = new Date(latestMtime).toISOString()
        const ageMins = (Date.now() - latestMtime) / 60000
        status = ageMins < 1440 ? 'online' : ageMins < 10080 ? 'offline' : 'unknown'
      }
    } catch {}
    }

    // Update cache with fresh status
    statusCache.set(id, { status, lastHeartbeat, timestamp: now })
  }

  // Read whatsapp number from IDENTITY.md
  let whatsapp: string | null = null
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    const waMatch = identity.match(/WhatsApp[^0-9+\n]*\+?(\d[\d\s\-]+)/i)
    if (waMatch) whatsapp = waMatch[1].trim()
  } catch {}

  // Profile mode: agent has its own ~/.openclaw-<id>/ state dir
  const isProfile = fs.existsSync(path.join(process.env.HOME || '', `.openclaw-${id}`))

  // Read communities and groups from ORG files and filter by membership
  let communities: GroupEntry[] = []
  let groups: GroupEntry[] = []

  try {
    const communitiesContent = fs.readFileSync(path.join(WORKSPACE, 'ORG', 'COMMUNITIES.md'), 'utf-8')
    const parsed = parseGroupsWithMembers(communitiesContent)
    // Filter to only include communities where this agent is a member
    communities = parsed.communities
      .filter(c => c.members.includes(id))
      .map(({ members, ...rest }) => rest) // Remove members field from result
  } catch {}

  try {
    const groupsContent = fs.readFileSync(path.join(WORKSPACE, 'ORG', 'GROUPS.md'), 'utf-8')
    const parsed = parseGroupsWithMembers(groupsContent)
    // Filter to only include groups where this agent is a member
    groups = parsed.groups
      .filter(g => g.members.includes(id))
      .map(({ members, ...rest }) => rest) // Remove members field from result
  } catch {}

  // Read tags from IDENTITY.md
  let tags: string[] = []
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    tags = parseTags(identity)
  } catch {}

  return {
    id,
    name,
    status,
    lastHeartbeat,
    whatsapp,
    isProfile,
    workspacePath: agentDir,
    communities,
    groups,
    tags,
    validationWarnings,
  }
}

/** Return the gateway config (port + auth token) for a given agent */
export function getAgentGatewayConfig(id: string): { port: number; token: string } | null {
  const HOME = process.env.HOME || ''
  const isProfile = fs.existsSync(path.join(HOME, `.openclaw-${id}`))
  const configPath = isProfile
    ? path.join(HOME, `.openclaw-${id}`, 'openclaw.json')
    : path.join(HOME, '.openclaw', 'openclaw.json')
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const port = config?.gateway?.port ?? 18889
    const token = config?.gateway?.auth?.token ?? ''
    if (!token) return null
    return { port, token }
  } catch {
    return null
  }
}

/** Return the next available agentN ID (e.g. "agent3" if agent0/agent1/agent2 exist)
 *  If cloneFrom provided, suggests {cloneFrom}N format (e.g. "engineer2" if cloning "engineer")
 */
export function getNextAgentId(cloneFrom?: string): string {
  const prefix = cloneFrom || 'agent'
  let maxN = -1

  try {
    const dirs = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
    for (const d of dirs) {
      if (!d.isDirectory()) continue

      // Match pattern: {prefix}N where N is a number
      const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`)
      const m = d.name.match(pattern)

      if (m) {
        const n = parseInt(m[1], 10)
        if (n > maxN) maxN = n
      }
    }
  } catch {}

  return `${prefix}${maxN + 1}`
}

/** Find first unused TCP port >= startPort */
export function findFreePort(startPort = 18789): Promise<number> {
  return new Promise((resolve) => {
    function tryPort(p: number) {
      const srv = net.createServer()
      srv.listen(p, '127.0.0.1', () => { srv.close(() => resolve(p)) })
      srv.on('error', () => tryPort(p + 100))
    }
    tryPort(startPort)
  })
}

export interface AgentImpact {
  todoCount: number
  communityCount: number
  groupCount: number
  whatsapp: string | null
  hasStateDir: boolean
}

/** Summarise what deleting an agent would affect (for the confirmation UI) */
export function getAgentImpact(id: string, agentDir: string): AgentImpact {
  let todoCount = 0
  try {
    const todos = fs.readFileSync(path.join(agentDir, 'TODOs.md'), 'utf-8')
    // Count bullet lines as a rough proxy
    todoCount = todos.split('\n').filter(l => /^[-*]\s+/.test(l.trim())).length
  } catch {}

  let communityCount = 0
  let groupCount = 0
  let whatsapp: string | null = null
  try {
    const info = readAgentInfo(id, agentDir)
    communityCount = info.communities.length
    groupCount = info.groups.length
    whatsapp = info.whatsapp
  } catch {}

  // profile-mode state dir: ~/.openclaw-<id>
  const hasStateDir = fs.existsSync(path.join(process.env.HOME || '', `.openclaw-${id}`))

  return { todoCount, communityCount, groupCount, whatsapp, hasStateDir }
}

/** Delete an agent's workspace dir and optionally its profile state dir.
 *  Returns { steps, errors }. */
export function deleteAgent(id: string, removeStateDir: boolean): { steps: string[]; errors: string[] } {
  const steps: string[] = []
  const errors: string[] = []

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) return { steps, errors: ['Invalid agent id'] }

  const agentDir = path.join(AGENTS_DIR, id)

  // Remove workspace AGENTS dir
  try {
    fs.rmSync(agentDir, { recursive: true, force: true })
    steps.push(`Removed workspace AGENTS/${id}/`)
  } catch (e) {
    errors.push(`Failed to remove workspace: ${e}`)
  }

  // Optionally remove profile state dir (~/.openclaw-<id>)
  if (removeStateDir) {
    const stateDir = path.join(process.env.HOME || '', `.openclaw-${id}`)
    if (fs.existsSync(stateDir)) {
      try {
        fs.rmSync(stateDir, { recursive: true, force: true })
        steps.push(`Removed state dir ~/.openclaw-${id}/`)
      } catch (e) {
        errors.push(`Failed to remove state dir: ${e}`)
      }
    } else {
      steps.push(`State dir ~/.openclaw-${id}/ not found (skipped)`)
    }
  }

  // Remove Desktop shortcut
  const desktop = path.join(process.env.HOME || '', 'Desktop', id)
  try {
    if (fs.existsSync(desktop)) { fs.unlinkSync(desktop); steps.push(`Removed ~/Desktop/${id}`) }
  } catch {}

  // Remove alias block from ~/.zshrc
  const zshrc = path.join(process.env.HOME || '', '.zshrc')
  try {
    if (fs.existsSync(zshrc)) {
      const content = fs.readFileSync(zshrc, 'utf-8')
      const cleaned = content.replace(
        new RegExp(`\\n# OpenClaw — ${id}\\n(?:alias ${id}[^\\n]*\\n)*`, 'g'),
        '\n'
      )
      if (cleaned !== content) {
        fs.writeFileSync(zshrc, cleaned, 'utf-8')
        steps.push(`Removed ${id} aliases from ~/.zshrc`)
      }
    }
  } catch {}

  // Remove agent from openclaw.json
  const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (config.agents?.list) {
        const originalLength = config.agents.list.length
        config.agents.list = config.agents.list.filter((a: any) => a.id !== id)
        if (config.agents.list.length < originalLength) {
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
          steps.push(`Removed ${id} from openclaw.json`)
        }
      }
    }
  } catch (e) {
    errors.push(`Failed to remove from openclaw.json: ${e}`)
  }

  return { steps, errors }
}

/**
 * Pre-populate a new agent workspace by copying all .md files from a source agent.
 * Creates the target directory if needed. Skips files that don't exist in the source.
 * If srcName and targetName are provided, replaces all occurrences of the source agent
 * name with the target name across all files. Also removes WhatsApp numbers from IDENTITY.md.
 * Returns the list of files that were successfully copied.
 */
export function cloneAgentFiles(
  sourceWorkspacePath: string,
  targetWorkspacePath: string,
  srcName?: string,
  targetName?: string,
): string[] {
  const copied: string[] = []
  try {
    fs.mkdirSync(targetWorkspacePath, { recursive: true })
  } catch {}

  // Get all .md files from source directory
  let filesToCopy: string[] = []
  try {
    filesToCopy = fs.readdirSync(sourceWorkspacePath)
      .filter(f => f.endsWith('.md'))
  } catch {
    return copied
  }

  // Copy each file
  for (const file of filesToCopy) {
    const src = path.join(sourceWorkspacePath, file)
    const dst = path.join(targetWorkspacePath, file)
    try {
      if (fs.existsSync(src)) {
        let content = fs.readFileSync(src, 'utf-8')

        // Replace source agent name with target agent name
        if (srcName && targetName) {
          content = content.replace(new RegExp(`\\b${srcName}\\b`, 'g'), targetName)
        }

        // For IDENTITY.md, also remove WhatsApp number
        if (file === 'IDENTITY.md') {
          content = content.replace(/^[^\n]*WhatsApp[^\n]*\n?/gim, '')
        }

        fs.writeFileSync(dst, content, 'utf-8')
        copied.push(file)
      }
    } catch {}
  }

  return copied
}
