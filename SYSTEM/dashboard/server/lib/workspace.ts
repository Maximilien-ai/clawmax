import fs from 'fs'
import path from 'path'
import net from 'net'

export const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || '', '.openclaw', 'workspace')

/** Agents live under WORKSPACE/AGENTS/maxN/ */
export const AGENTS_DIR = path.join(WORKSPACE, 'AGENTS')

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
}

export interface AgentInfo {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
  lastHeartbeat: string | null
  whatsapp: string | null
  workspacePath: string
  communities: GroupEntry[]
  groups: GroupEntry[]
}

/** Parse GROUPS.md into communities + groups arrays with optional descriptions.
 *  Format: `- Name: Description` or `- Name` (no description) */
export function parseGroups(content: string): { communities: GroupEntry[]; groups: GroupEntry[] } {
  const communities: GroupEntry[] = []
  const groups: GroupEntry[] = []
  let section: 'communities' | 'groups' | null = null
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (/^##\s+communities/i.test(trimmed)) { section = 'communities'; continue }
    if (/^##\s+groups/i.test(trimmed)) { section = 'groups'; continue }
    if (trimmed.startsWith('##')) { section = null; continue }
    const bullet = trimmed.match(/^[-*]\s+(.+)/)
    if (bullet) {
      const raw = bullet[1].trim()
      const colonIdx = raw.indexOf(':')
      const entry: GroupEntry = colonIdx >= 0
        ? { name: raw.slice(0, colonIdx).trim(), description: raw.slice(colonIdx + 1).trim() || null }
        : { name: raw, description: null }
      if (section === 'communities') communities.push(entry)
      else if (section === 'groups') groups.push(entry)
    }
  }
  return { communities, groups }
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
    if (!d.isDirectory() || !/^max\d+$/.test(d.name)) continue
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

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!/^max\d+$/.test(entry.name)) continue

    const agentDir = path.join(AGENTS_DIR, entry.name)
    const agent = readAgentInfo(entry.name, agentDir)
    agents.push(agent)
  }

  return agents.sort((a, b) => a.id.localeCompare(b.id))
}

function readAgentInfo(id: string, agentDir: string): AgentInfo {
  // Read name from IDENTITY.md
  let name = id
  const identityPath = path.join(agentDir, 'IDENTITY.md')
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    const nameMatch = identity.match(/\*\*Name[:\*\s]+\s*(.+)/m) || identity.match(/^-\s+Name[:\s]+(.+)$/m) || identity.match(/^#\s+(.+)$/m)
    if (nameMatch) name = nameMatch[1].trim()
  } catch {}

  // Heartbeat: use the most recently modified file in the agent dir
  // This way any file write (TODOs, COMPLETED, HEARTBEAT, etc.) counts as activity
  let lastHeartbeat: string | null = null
  let status: AgentInfo['status'] = 'unknown'
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
      // online = active today (< 24h), offline = active this week, unknown = stale
      status = ageMins < 1440 ? 'online' : ageMins < 10080 ? 'offline' : 'unknown'
    }
  } catch {}

  // Read whatsapp number from IDENTITY.md
  let whatsapp: string | null = null
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    const waMatch = identity.match(/WhatsApp[:\s]+\+?(\d[\d\s\-]+)/i)
    if (waMatch) whatsapp = waMatch[1].trim()
  } catch {}

  // Read groups from GROUPS.md
  let communities: GroupEntry[] = []
  let groups: GroupEntry[] = []
  try {
    const groupsContent = fs.readFileSync(path.join(agentDir, 'GROUPS.md'), 'utf-8')
    const parsed = parseGroups(groupsContent)
    communities = parsed.communities
    groups = parsed.groups
  } catch {}

  return {
    id,
    name,
    status,
    lastHeartbeat,
    whatsapp,
    workspacePath: agentDir,
    communities,
    groups,
  }
}

/** Return the next available maxN agent ID (e.g. "max3" if max0/max1/max2 exist) */
export function getNextAgentId(): string {
  let maxN = -1
  try {
    const dirs = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      const m = d.name.match(/^max(\d+)$/)
      if (m) {
        const n = parseInt(m[1], 10)
        if (n > maxN) maxN = n
      }
    }
  } catch {}
  return `max${maxN + 1}`
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

  return { steps, errors }
}

/** Files to copy when cloning an agent — behaviour/persona docs only, no runtime state */
const CLONE_FILES = ['SOUL.md', 'IDENTITY.md', 'TOOLS.md', 'USER.md', 'AGENTS.md', 'BOOTSTRAP.md']

/**
 * Pre-populate a new agent workspace by copying template files from a source agent.
 * Creates the target directory if needed. Skips files that don't exist in the source.
 * Returns the list of files that were successfully copied.
 */
export function cloneAgentFiles(sourceWorkspacePath: string, targetWorkspacePath: string): string[] {
  const copied: string[] = []
  try {
    fs.mkdirSync(targetWorkspacePath, { recursive: true })
  } catch {}
  for (const file of CLONE_FILES) {
    const src = path.join(sourceWorkspacePath, file)
    const dst = path.join(targetWorkspacePath, file)
    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dst)
        copied.push(file)
      }
    } catch {}
  }
  return copied
}
