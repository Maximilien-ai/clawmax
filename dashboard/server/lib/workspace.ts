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

export interface AgentInfo {
  id: string
  name: string
  status: 'online' | 'offline' | 'unknown'
  lastHeartbeat: string | null
  whatsapp: string | null
  workspacePath: string
}

/** Discover all maxN/ directories and return agent info */
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
      status = ageMins < 30 ? 'online' : ageMins < 240 ? 'offline' : 'unknown'
    }
  } catch {}

  // Read whatsapp number from IDENTITY.md
  let whatsapp: string | null = null
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    const waMatch = identity.match(/WhatsApp[:\s]+\+?(\d[\d\s\-]+)/i)
    if (waMatch) whatsapp = waMatch[1].trim()
  } catch {}

  return {
    id,
    name,
    status,
    lastHeartbeat,
    whatsapp,
    workspacePath: agentDir,
  }
}
