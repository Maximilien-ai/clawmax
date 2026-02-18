import fs from 'fs'
import path from 'path'

export const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || '', '.openclaw', 'workspace')

/** Return all .md file paths relative to WORKSPACE, sorted alphabetically */
export function listMarkdownFiles(): string[] {
  const results: string[] = []

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
        // Skip node_modules, .git, dist
        if (['node_modules', '.git', 'dist', '.pnpm'].includes(entry.name)) continue
        walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(path.relative(WORKSPACE, full))
      }
    }
  }

  walk(WORKSPACE)
  return results.sort()
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
    dirs = fs.readdirSync(WORKSPACE, { withFileTypes: true })
  } catch {
    return entries
  }
  for (const d of dirs) {
    if (!d.isDirectory() || !/^max\d+$/.test(d.name)) continue
    const agentDir = path.join(WORKSPACE, d.name)
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

export function listAgents(): AgentInfo[] {
  const agents: AgentInfo[] = []
  let entries: fs.Dirent[]

  try {
    entries = fs.readdirSync(WORKSPACE, { withFileTypes: true })
  } catch {
    return agents
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (!/^max\d+$/.test(entry.name)) continue

    const agentDir = path.join(WORKSPACE, entry.name)
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
