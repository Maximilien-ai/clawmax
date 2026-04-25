import fs from 'fs'
import path from 'path'
import net from 'net'
import os from 'os'
import { execFileSync } from 'child_process'
import { getWorkspaceManager } from './workspace-manager'
import { getPausedAgents } from './agent-state'

// Legacy constant for backward compatibility
export const WORKSPACE = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || '', '.openclaw', 'workspace')

/** Get the active workspace path (dynamic, supports multi-workspace) */
export function getWorkspacePath(): string {
  // Always check workspace manager first — it tracks the user's active workspace
  try {
    const manager = getWorkspaceManager()
    const activeWorkspace = manager.getActiveWorkspace()
    return activeWorkspace.path
  } catch {
    // Fallback to env var or default
    return process.env.OPENCLAW_WORKSPACE || WORKSPACE
  }
}

/** Agents live under WORKSPACE/AGENTS/maxN/ */
export function getAgentsDir(): string {
  return path.join(getWorkspacePath(), 'AGENTS')
}

export function getArchiveDir(): string {
  return path.join(getAgentsDir(), 'archive')
}

// Legacy exports for backward compatibility
export const AGENTS_DIR = path.join(WORKSPACE, 'AGENTS')
export const ARCHIVE_DIR = path.join(AGENTS_DIR, 'archive')

// Status check cache to avoid hammering lsof on every request
interface StatusCache {
  status: 'online' | 'offline' | 'unknown'
  lastHeartbeat: string | null
  timestamp: number
}
const statusCache = new Map<string, StatusCache>()
const STATUS_CACHE_TTL = 5000 // 5 seconds cache

/** Invalidate status cache for a specific agent (e.g., after sending a message) */
export function invalidateAgentStatusCache(agentId: string) {
  statusCache.delete(agentId)
}

export type DocSection = 'ORG' | 'AGENTS' | 'WORKFLOWS' | 'SYSTEM'

export interface DocEntry {
  path: string       // relative to WORKSPACE
  section: DocSection
  kind?: 'markdown' | 'asset'
  assetSource?: 'uploaded' | 'generated'
  canDelete?: boolean
  isAgentWorkspace?: boolean
  createdAt?: string
  updatedAt?: string
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.pnpm', 'AGENTS'])

function shouldSkipDocHubEntryName(name: string): boolean {
  return name === '__MACOSX' || name.startsWith('.') || name.startsWith('_') || name === 'archive'
}

/** Return all .md file paths with section classification, sorted by section then path.
 *  ORG/ → ORG, AGENTS/ → AGENTS (per-agent docs), WORKFLOWS/ → WORKFLOWS, SYSTEM/ → SYSTEM, root → SYSTEM fallback */
export function listMarkdownFiles(): DocEntry[] {
  const results: DocEntry[] = []
  const workspacePath = getWorkspacePath()
  const agentsDir = getAgentsDir()

  function sectionFor(relPath: string): DocSection {
    if (relPath.startsWith('ORG/') || relPath.startsWith('ORG\\')) return 'ORG'
    if (relPath.startsWith('AGENTS/') || relPath.startsWith('AGENTS\\')) return 'AGENTS'
    if (relPath.startsWith('WORKFLOWS/') || relPath.startsWith('WORKFLOWS\\')) return 'WORKFLOWS'
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
        if (shouldSkipDocHubEntryName(entry.name)) continue
        walk(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (shouldSkipDocHubEntryName(entry.name)) continue
        const rel = path.relative(workspacePath, full)
        results.push({ path: rel, section: sectionFor(rel) })
      }
    }
  }

  // Walk ORG, SYSTEM, and root (not AGENTS — those are scanned separately below)
  walk(workspacePath)

  // Walk AGENTS separately so we can classify correctly
  function walkAgents(dir: string) {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (shouldSkipDocHubEntryName(entry.name)) continue
        if (['node_modules', '.git', 'dist'].includes(entry.name)) continue
        walkAgents(full)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (shouldSkipDocHubEntryName(entry.name)) continue
        results.push({ path: path.relative(workspacePath, full), section: 'AGENTS' })
      }
    }
  }
  walkAgents(agentsDir)

  return results.sort((a, b) => {
    const sOrder: Record<DocSection, number> = { ORG: 0, AGENTS: 1, WORKFLOWS: 2, SYSTEM: 3 }
    const sd = sOrder[a.section] - sOrder[b.section]
    return sd !== 0 ? sd : a.path.localeCompare(b.path)
  })
}

function getRegisteredAgentDirectoryNames(): Set<string> {
  const registered = new Set<string>()
  const agentsDir = getAgentsDir()
  const home = process.env.HOME || ''
  try {
    const configPath = path.join(home, '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = Array.isArray(config?.agents?.list) ? config.agents.list : []
    for (const agent of agentList) {
      const workspace = typeof agent?.workspace === 'string' ? path.resolve(agent.workspace) : ''
      if (!workspace) continue
      const relative = path.relative(agentsDir, workspace)
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue
      const firstSegment = relative.split(path.sep)[0]
      const agentDir = firstSegment ? path.join(agentsDir, firstSegment) : ''
      if (firstSegment && isManagedAgentWorkspaceDir(agentDir)) {
        registered.add(firstSegment)
      }
    }
  } catch {}
  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'archive' || entry.name === '__MACOSX') continue
      const workspaceDir = path.join(agentsDir, entry.name)
      if (!isManagedAgentWorkspaceDir(workspaceDir)) continue
      const sharedStateDir = path.join(home, '.openclaw', 'agents', entry.name)
      const profileStateDir = path.join(home, `.openclaw-${entry.name}`)
      if (fs.existsSync(sharedStateDir) || fs.existsSync(profileStateDir)) {
        registered.add(entry.name)
      }
    }
  } catch {}
  return registered
}

const PROTECTED_AGENT_WORKSPACE_FILES = new Set([
  'AGENTS.md',
  'BOOTSTRAP.md',
  'COMMUNITIES.md',
  'GROUPS.md',
  'HEARTBEAT.md',
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'USER.md',
])

function extractIdentityField(content: string, field: string): string {
  const match = content.match(new RegExp(`\\*\\*${field}:\\*\\*[ \\t]*([^\\n]*)`, 'i'))
  return match?.[1]?.trim() || ''
}

export function isManagedAgentWorkspaceDir(agentDir: string): boolean {
  try {
    const stats = fs.statSync(agentDir)
    if (!stats.isDirectory()) return false
  } catch {
    return false
  }

  try {
    const identityPath = path.join(agentDir, 'IDENTITY.md')
    const identity = fs.readFileSync(identityPath, 'utf-8')
    const name = extractIdentityField(identity, 'Name')
    return !!name
  } catch {
    return false
  }
}

function isProtectedAgentWorkspaceFile(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/')
  if (!normalized.startsWith('AGENTS/')) return false
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length < 3) return false
  return PROTECTED_AGENT_WORKSPACE_FILES.has(segments[2])
}

function getAgentAssetSource(relPath: string): 'uploaded' | 'generated' {
  const normalized = relPath.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length >= 3 && segments[0] === 'AGENTS') {
    if (segments[2] === 'MEMORY.md') return 'generated'
    if (segments[2] === 'memory') return 'generated'
  }
  return 'uploaded'
}

export function listDocEntries(): DocEntry[] {
  const workspacePath = getWorkspacePath()
  const agentsDir = getAgentsDir()
  const registeredAgentDirs = getRegisteredAgentDirectoryNames()
  function readTimestamps(fullPath: string): { createdAt?: string; updatedAt?: string } {
    try {
      const stats = fs.statSync(fullPath)
      return {
        createdAt: stats.birthtime?.toISOString?.(),
        updatedAt: stats.mtime?.toISOString?.(),
      }
    } catch {
      return {}
    }
  }

  const results: DocEntry[] = listMarkdownFiles()
    .filter((entry) => !entry.path.startsWith('AGENTS/__MACOSX/') && entry.path !== 'AGENTS/__MACOSX')
    .map((entry) => {
      const relativeAgentPath = entry.section === 'AGENTS'
        ? entry.path.replace(/^AGENTS[\\/]/, '')
        : ''
      const topLevelAgentDir = relativeAgentPath ? relativeAgentPath.split(/[\\/]/)[0] : ''
      const isRegisteredAgentWorkspace = entry.section === 'AGENTS' && !!topLevelAgentDir && registeredAgentDirs.has(topLevelAgentDir)
      const isProtectedAgentFile = isRegisteredAgentWorkspace && isProtectedAgentWorkspaceFile(entry.path)
      const timestamps = readTimestamps(path.join(workspacePath, entry.path))
      return {
        ...entry,
        kind: isRegisteredAgentWorkspace && isProtectedAgentFile ? 'markdown' : 'asset',
        assetSource: isRegisteredAgentWorkspace && isProtectedAgentFile ? undefined : getAgentAssetSource(entry.path),
        canDelete: entry.section === 'AGENTS' ? !isProtectedAgentFile : false,
        isAgentWorkspace: isRegisteredAgentWorkspace && isProtectedAgentFile,
        createdAt: timestamps.createdAt,
        updatedAt: timestamps.updatedAt,
      }
    })

  function walkAssetDir(currentDir: string, topLevelDir: string) {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (shouldSkipDocHubEntryName(entry.name)) continue
      const full = path.join(currentDir, entry.name)
      const rel = path.relative(workspacePath, full)
      if (entry.isDirectory()) {
        walkAssetDir(full, topLevelDir)
        continue
      }
      if (!entry.isFile()) continue
      if (entry.name.endsWith('.md')) continue
      const timestamps = readTimestamps(full)
      results.push({
        path: rel,
        section: 'AGENTS',
        kind: 'asset',
        assetSource: getAgentAssetSource(rel),
        canDelete: true,
        isAgentWorkspace: false,
        createdAt: timestamps.createdAt,
        updatedAt: timestamps.updatedAt,
      })
    }
  }

  try {
    const topLevelEntries = fs.readdirSync(agentsDir, { withFileTypes: true })
    for (const entry of topLevelEntries) {
      if (shouldSkipDocHubEntryName(entry.name)) continue
      const full = path.join(agentsDir, entry.name)
      if (entry.isDirectory()) {
        if (!registeredAgentDirs.has(entry.name)) {
          walkAssetDir(full, entry.name)
        }
        continue
      }
      if (!entry.isFile()) continue
      if (entry.name.endsWith('.md')) continue
      const relPath = path.relative(workspacePath, full)
      const timestamps = readTimestamps(full)
      results.push({
        path: relPath,
        section: 'AGENTS',
        kind: 'asset',
        assetSource: getAgentAssetSource(relPath),
        canDelete: true,
        isAgentWorkspace: false,
        createdAt: timestamps.createdAt,
        updatedAt: timestamps.updatedAt,
      })
    }
  } catch {}

  return results.sort((a, b) => {
    const sOrder: Record<DocSection, number> = { ORG: 0, AGENTS: 1, WORKFLOWS: 2, SYSTEM: 3 }
    const sd = sOrder[a.section] - sOrder[b.section]
    return sd !== 0 ? sd : a.path.localeCompare(b.path)
  })
}

/** Validate a workspace path is inside the workspace root. */
function isWorkspacePathSafe(full: string, workspacePath: string): boolean {
  // Resolve symlinks to prevent traversal via symlinks
  let realFull: string
  let realWorkspace: string
  try {
    realWorkspace = fs.realpathSync(workspacePath)
    // For reads, the file must exist for realpath; for writes, check parent
    realFull = fs.existsSync(full) ? fs.realpathSync(full) : fs.realpathSync(path.dirname(full)) + path.sep + path.basename(full)
  } catch {
    // If parent dir doesn't exist, fall back to resolved path check
    realFull = full
    realWorkspace = workspacePath
  }
  return realFull.startsWith(realWorkspace + path.sep) || realFull === realWorkspace
}

/** Validate a markdown workspace path is inside the workspace and ends with .md */
function isMarkdownPathSafe(full: string, workspacePath: string): boolean {
  if (!full.endsWith('.md')) return false
  return isWorkspacePathSafe(full, workspacePath)
}

export function resolveWorkspacePath(relPath: string, workspacePath = getWorkspacePath()): string | null {
  const normalized = relPath.trim()
  if (!normalized) return null
  const full = path.resolve(workspacePath, normalized)
  return isWorkspacePathSafe(full, workspacePath) ? full : null
}

/** Read a workspace .md file by relative path. Returns null if outside workspace or not found */
export function readWorkspaceFile(relPath: string): string | null {
  const workspacePath = getWorkspacePath()
  const full = path.resolve(workspacePath, relPath)
  if (!isMarkdownPathSafe(full, workspacePath)) return null
  try {
    return fs.readFileSync(full, 'utf-8')
  } catch {
    return null
  }
}

export function readWorkspaceBinaryFile(relPath: string, workspacePath = getWorkspacePath()): Buffer | null {
  const full = resolveWorkspacePath(relPath, workspacePath)
  if (!full) return null
  try {
    return fs.readFileSync(full)
  } catch {
    return null
  }
}

/** Write a workspace .md file. Returns false if path is unsafe */
export function writeWorkspaceFile(relPath: string, content: string): boolean {
  const workspacePath = getWorkspacePath()
  const full = path.resolve(workspacePath, relPath)
  if (!isMarkdownPathSafe(full, workspacePath)) return false
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content, 'utf-8')
    return true
  } catch {
    return false
  }
}

export function writeWorkspaceBinaryFile(relPath: string, content: Buffer, workspacePath = getWorkspacePath()): boolean {
  const full = resolveWorkspacePath(relPath, workspacePath)
  if (!full) return false
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
    return true
  } catch {
    return false
  }
}

export function deleteWorkspaceAsset(relPath: string, workspacePath = getWorkspacePath()): { ok: boolean; error?: string } {
  const normalized = relPath.trim().replace(/\\/g, '/')
  if (!normalized.startsWith('AGENTS/')) {
    return { ok: false, error: 'Only AGENTS assets can be deleted from DocHub' }
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length < 2) {
    return { ok: false, error: 'Refusing to delete AGENTS root' }
  }

  const topLevel = segments[1]
  const registeredAgentDirs = getRegisteredAgentDirectoryNames()
  if (registeredAgentDirs.has(topLevel)) {
    if (segments.length === 2) {
      return { ok: false, error: 'Refusing to delete a registered agent workspace from DocHub' }
    }
    if (isProtectedAgentWorkspaceFile(normalized)) {
      return { ok: false, error: 'Refusing to delete protected agent workspace files from DocHub' }
    }
  }

  const full = resolveWorkspacePath(normalized, workspacePath)
  if (!full) {
    return { ok: false, error: 'Cannot delete outside workspace' }
  }
  if (!fs.existsSync(full)) {
    return { ok: false, error: 'Path not found' }
  }

  try {
    const stats = fs.statSync(full)
    if (stats.isDirectory()) {
      fs.rmSync(full, { recursive: true, force: false })
    } else {
      fs.unlinkSync(full)
    }
    if (segments.length === 2) {
      cleanupStaleAgentRegistration(topLevel, full)
    }
    return { ok: true }
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to delete asset' }
  }
}

function cleanupStaleAgentRegistration(agentId: string, workspaceDir: string) {
  const home = process.env.HOME || ''
  const configPath = path.join(home, '.openclaw', 'openclaw.json')
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const list = Array.isArray(config?.agents?.list) ? config.agents.list : []
    const normalizedWorkspaceDir = path.resolve(workspaceDir)
    const nextList = list.filter((agent: any) => {
      if (agent?.id === agentId) return false
      if (typeof agent?.workspace === 'string' && path.resolve(agent.workspace) === normalizedWorkspaceDir) return false
      return true
    })
    if (nextList.length !== list.length) {
      config.agents = config.agents || {}
      config.agents.list = nextList
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    }
  } catch {}

  try {
    fs.rmSync(path.join(home, '.openclaw', 'agents', agentId), { recursive: true, force: true })
  } catch {}
  try {
    fs.rmSync(path.join(home, `.openclaw-${agentId}`), { recursive: true, force: true })
  } catch {}
}

function validateZipEntryPath(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, '/').trim()
  if (!normalized) return true
  if (normalized.startsWith('/')) return false
  return !normalized.split('/').some((segment) => segment === '..')
}

function isIgnoredZipEntry(entryPath: string): boolean {
  const normalized = entryPath.replace(/\\/g, '/').trim()
  return normalized.startsWith('__MACOSX/') || normalized === '__MACOSX' || normalized.endsWith('/.DS_Store') || normalized === '.DS_Store'
}

function listZipEntries(zipPath: string): string[] {
  try {
    return execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf-8' })
      .split(/\r?\n/)
      .filter(Boolean)
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }

  return execFileSync('python3', ['-c', [
    'import sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as zf:',
    '    for name in zf.namelist():',
    '        print(name)',
  ].join('\n'), zipPath], { encoding: 'utf-8' })
    .split(/\r?\n/)
    .filter(Boolean)
}

function extractZipToDirectory(zipPath: string, targetDir: string) {
  try {
    execFileSync('unzip', ['-oq', zipPath, '-d', targetDir], { stdio: 'pipe' })
    return
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error
  }

  execFileSync('python3', ['-c', [
    'import os, sys, zipfile',
    'zip_path, target_dir = sys.argv[1], sys.argv[2]',
    'with zipfile.ZipFile(zip_path) as zf:',
    '    for member in zf.infolist():',
    '        name = member.filename',
    '        if not name or name.startswith("__MACOSX/") or name == "__MACOSX" or name.endswith("/.DS_Store") or name == ".DS_Store":',
    '            continue',
    '        zf.extract(member, target_dir)',
  ].join('\n'), zipPath, targetDir], { stdio: 'pipe' })
}

export function extractZipBufferToWorkspace(relDir: string, zipContent: Buffer, workspacePath = getWorkspacePath()): { ok: boolean; files?: string[]; error?: string } {
  const targetDir = resolveWorkspacePath(relDir, workspacePath)
  if (!targetDir) {
    return { ok: false, error: 'Cannot extract outside workspace' }
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-doc-upload-'))
  const zipPath = path.join(tempRoot, 'upload.zip')

  try {
    fs.mkdirSync(targetDir, { recursive: true })
    fs.writeFileSync(zipPath, zipContent)

    const listing = listZipEntries(zipPath)
      .filter(Boolean)
      .filter((entry) => !isIgnoredZipEntry(entry))

    for (const entry of listing) {
      if (!validateZipEntryPath(entry)) {
        return { ok: false, error: `ZIP contains an unsafe path: ${entry}` }
      }
    }

    const conflicts = listing
      .filter(Boolean)
      .map((entry) => path.resolve(targetDir, entry))
      .filter((destination) => fs.existsSync(destination))
      .map((destination) => path.relative(workspacePath, destination))

    if (conflicts.length > 0) {
      return {
        ok: false,
        error: `ZIP extraction would overwrite existing paths: ${conflicts.slice(0, 5).join(', ')}${conflicts.length > 5 ? ', …' : ''}`,
      }
    }

    extractZipToDirectory(zipPath, targetDir)

    const files = listing
      .filter((entry) => !entry.endsWith('/'))
      .map((entry) => path.posix.join(relDir.replace(/\\/g, '/'), entry))

    return { ok: true, files }
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Failed to extract ZIP archive' }
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true })
    } catch {}
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
    const workspacePath = getWorkspacePath()
    const filePath = type === 'community'
      ? path.join(workspacePath, 'ORG', 'COMMUNITIES.md')
      : path.join(workspacePath, 'ORG', 'GROUPS.md')

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

/** Update members for a community or group in its markdown file (verbose format only).
 *  Returns true on success, false if entry not found or file error */
export function updateGroupMembers(type: 'community' | 'group', name: string, newMembers: string[]): boolean {
  try {
    const workspacePath = getWorkspacePath()
    const filePath = type === 'community'
      ? path.join(workspacePath, 'ORG', 'COMMUNITIES.md')
      : path.join(workspacePath, 'ORG', 'GROUPS.md')

    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    let inTargetEntry = false
    let foundEntry = false
    let hasMembers = false
    const newLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Check if we're entering a new entry section
      if (trimmed.startsWith('###')) {
        const entryName = trimmed.replace(/^###\s+/, '').trim()
        // If we were in target entry and now hit a different entry, exit
        if (inTargetEntry && entryName !== name) {
          // Before exiting, if we didn't find a Members line, add one
          if (!hasMembers && newMembers.length > 0) {
            newLines.push(`- **Members:** ${newMembers.join(', ')}`)
          }
          inTargetEntry = false
          hasMembers = false
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
        // Before exiting, if we were in target and didn't find Members line, add one
        if (inTargetEntry && !hasMembers && newMembers.length > 0) {
          newLines.push(`- **Members:** ${newMembers.join(', ')}`)
        }
        inTargetEntry = false
        hasMembers = false
        newLines.push(line)
        continue
      }

      // If we're in the target entry and this is the Members line, replace it
      if (inTargetEntry && trimmed.match(/^-\s+\*\*Members:\*\*/i)) {
        hasMembers = true
        if (newMembers.length > 0) {
          newLines.push(`- **Members:** ${newMembers.join(', ')}`)
        }
        // If newMembers is empty, skip this line (remove Members field)
        continue
      }

      newLines.push(line)
    }

    // Handle case where we were still in the target entry at EOF
    if (inTargetEntry && !hasMembers && newMembers.length > 0) {
      newLines.push(`- **Members:** ${newMembers.join(', ')}`)
    }

    if (!foundEntry) return false

    fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8')
    return true
  } catch (err) {
    console.error(`Error updating ${type} members:`, err)
    return false
  }
}

/** Create a new community or group */
export function createGroup(
  type: 'community' | 'group',
  name: string,
  options?: {
    description?: string
    tags?: string[]
    members?: string[]
    community?: string // For groups only
    channels?: string[]
  }
): boolean {
  try {
    const workspacePath = getWorkspacePath()
    const filePath = type === 'community'
      ? path.join(workspacePath, 'ORG', 'COMMUNITIES.md')
      : path.join(workspacePath, 'ORG', 'GROUPS.md')

    // Read existing content or create default structure
    let content = ''
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8')
    } else {
      // Create file with header if it doesn't exist
      const header = type === 'community' ? '# Communities\n\n## Communities\n\n' : '# Groups\n\n## Groups\n\n'
      content = header
    }

    // Check if entry already exists
    const { communities, groups } = parseGroupsWithMembers(content)
    const existingEntries = type === 'community' ? communities : groups
    if (existingEntries.some(e => e.name === name)) {
      console.error(`${type} "${name}" already exists`)
      return false
    }

    // Find insertion point (after the ## Communities or ## Groups header)
    const lines = content.split('\n')
    const sectionHeader = type === 'community' ? /^##\s+communities/i : /^##\s+groups/i
    let insertIndex = -1

    for (let i = 0; i < lines.length; i++) {
      if (sectionHeader.test(lines[i].trim())) {
        // Insert after this line (skip blank lines)
        insertIndex = i + 1
        while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
          insertIndex++
        }
        break
      }
    }

    // If no section header found, append to end
    if (insertIndex === -1) {
      const header = type === 'community' ? '\n## Communities\n\n' : '\n## Groups\n\n'
      lines.push(header)
      insertIndex = lines.length
    }

    // Build entry in verbose format
    const entry: string[] = []
    entry.push(`### ${name}`)
    if (options?.description) {
      entry.push(`- **Description:** ${options.description}`)
    }
    if (options?.tags && options.tags.length > 0) {
      entry.push(`- **Tags:** ${options.tags.join(', ')}`)
    }
    if (type === 'group' && options?.community) {
      entry.push(`- **Community:** ${options.community}`)
    }
    if (options?.channels && options.channels.length > 0) {
      entry.push(`- **Channels:** ${options.channels.join(', ')}`)
    }
    if (options?.members && options.members.length > 0) {
      entry.push(`- **Members:** ${options.members.join(', ')}`)
    }
    entry.push('') // Blank line after entry

    // Insert entry
    lines.splice(insertIndex, 0, ...entry)

    // Write back
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
    console.log(`✓ Created ${type}: ${name}`)
    return true
  } catch (err) {
    console.error(`Error creating ${type}:`, err)
    return false
  }
}

/** Delete a community or group */
export function deleteGroup(type: 'community' | 'group', name: string): boolean {
  try {
    const workspacePath = getWorkspacePath()
    const filePath = type === 'community'
      ? path.join(workspacePath, 'ORG', 'COMMUNITIES.md')
      : path.join(workspacePath, 'ORG', 'GROUPS.md')

    if (!fs.existsSync(filePath)) {
      return false
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')

    let inTargetEntry = false
    let foundEntry = false
    const newLines: string[] = []
    let entryStartIndex = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      // Check if we're entering a new entry section.
      // Support both legacy "## Name" and current "### Name" entry headers.
      const entryHeaderMatch = trimmed.match(/^###\s+(.+)$/) || trimmed.match(/^##\s+(.+)$/)
      if (entryHeaderMatch) {
        const entryName = entryHeaderMatch[1].trim()

        // Skip top-level section headers like "## Groups" / "## Communities"
        if (/^(groups|communities)$/i.test(entryName)) {
          newLines.push(line)
          continue
        }

        // If we were in target entry, mark end
        if (inTargetEntry && entryName !== name) {
          inTargetEntry = false
          // Remove trailing blank lines from the deleted entry
          while (newLines.length > entryStartIndex && newLines[newLines.length - 1].trim() === '') {
            newLines.pop()
          }
        }

        // Check if this is the start of our target entry
        if (entryName === name) {
          inTargetEntry = true
          foundEntry = true
          entryStartIndex = newLines.length
          continue // Skip this line
        }
      }

      // Skip lines that belong to the target entry
      if (inTargetEntry) {
        continue
      }

      newLines.push(line)
    }

    // Handle case where we were still in the target entry at EOF
    if (inTargetEntry) {
      // Remove trailing blank lines
      while (newLines.length > entryStartIndex && newLines[newLines.length - 1].trim() === '') {
        newLines.pop()
      }
    }

    if (!foundEntry) {
      return false
    }

    fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8')
    console.log(`✓ Deleted ${type}: ${name}`)

    // If deleting a community, remove community references from orphaned groups
    if (type === 'community') {
      clearCommunityFromGroups(name)
    }

    return true
  } catch (err) {
    console.error(`Error deleting ${type}:`, err)
    return false
  }
}

function clearCommunityFromGroups(communityName: string): void {
  try {
    const workspacePath = getWorkspacePath()
    const groupsPath = path.join(workspacePath, 'ORG', 'GROUPS.md')

    if (!fs.existsSync(groupsPath)) {
      return
    }

    const content = fs.readFileSync(groupsPath, 'utf-8')
    const lines = content.split('\n')
    const newLines: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      // Skip lines that reference the deleted community
      if (trimmed.startsWith('- **Community:**')) {
        const communityValue = trimmed.replace(/^- \*\*Community:\*\*\s*/, '').trim()
        if (communityValue === communityName) {
          continue // Skip this line
        }
      }

      newLines.push(line)
    }

    fs.writeFileSync(groupsPath, newLines.join('\n'), 'utf-8')
    console.log(`✓ Cleared community "${communityName}" from orphaned groups`)
  } catch (err) {
    console.error('Error clearing community from groups:', err)
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
  skills?: string[] // Skills assigned from openclaw.json
  validationWarnings?: string[] // Warnings from schema validation
  archived?: boolean // Derived from tags (true if 'archived' tag present)
  archiveMetadata?: { reason?: string; timestamp?: string } // From IDENTITY.md Archive section
  paused?: boolean
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
    if (/^#\s+communities/i.test(trimmed) || /^##\s+communities/i.test(trimmed)) {
      flushEntry()
      section = 'communities'
      continue
    }
    if (/^#\s+groups/i.test(trimmed) || /^##\s+groups/i.test(trimmed)) {
      flushEntry()
      section = 'groups'
      continue
    }
    if (trimmed.startsWith('##')) {
      flushEntry()
      section = null
      continue
    }

    // Verbose format: metadata lines with or without a leading dash
    if (trimmed.includes('**')) {
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

  // Parse verbose format (##/### Name with field bullets)
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

    // Section headers
    if (/^#\s+communities/i.test(trimmed) || /^##\s+communities/i.test(trimmed)) {
      flushEntry()
      section = 'communities'
      continue
    }
    if (/^#\s+groups/i.test(trimmed) || /^##\s+groups/i.test(trimmed)) {
      flushEntry()
      section = 'groups'
      continue
    }
    // Verbose format: ##/### Name
    const entryHeaderMatch = trimmed.match(/^###\s+(.+)$/) || trimmed.match(/^##\s+(.+)$/)
    if (entryHeaderMatch) {
      const entryName = entryHeaderMatch[1].trim()
      if (/^(groups|communities)$/i.test(entryName)) {
        flushEntry()
        section = /^groups$/i.test(entryName) ? 'groups' : 'communities'
        continue
      }
      flushEntry()
      currentName = entryName
      continue
    }

    // Verbose format: metadata lines with or without a leading dash
    if (trimmed.includes('**')) {
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

  const modelMatch = content.match(/\*\*Model:\*\*\s*([^\n]+)/i)
  if (modelMatch) identity.model = modelMatch[1].trim()

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
  skills?: string[]
  liveConfig?: {
    model: string
    workspace: string
    agentDir: string
  }
}

export function getAgentActivity(agentDir: string, agentId?: string): AgentActivity {
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

  // Get live configuration from openclaw.json if agentId provided
  let liveConfig: { model: string; workspace: string; agentDir: string } | undefined
  let skills: string[] | undefined
  const identityContent = readFile('IDENTITY.md')
  const parsedIdentity = identityContent ? parseIdentity(identityContent) : {}
  if (agentId) {
    try {
      const HOME = process.env.HOME || ''
      const configPath = path.join(HOME, '.openclaw', 'openclaw.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const agentList = config?.agents?.list || []
      const liveAgent = agentList.find((a: any) => a.id === agentId)
      if (liveAgent) {
        // Get model from agent config or defaults
        const model = liveAgent.model || parsedIdentity.model || config?.agents?.defaults?.model?.primary || 'unknown'
        liveConfig = {
          model,
          workspace: liveAgent.workspace || agentDir,
          agentDir: liveAgent.agentDir || 'N/A'
        }
        // Get skills from agent config
        skills = liveAgent.skills || []
      }
    } catch {
      // If we can't read live config, just don't include it
    }
  }

  return {
    recentFiles,
    todos: readFile('TODOs.md'),
    completed: readFile('COMPLETED.md'),
    identity: identityContent,
    skills,
    liveConfig,
  }
}

export interface ActivityEntry {
  agentId: string
  file: string
  mtime: string
  ageMins: number
}

/** Aggregated timeline of file writes across agent dirs in the active workspace, newest first */
export function getWorkspaceActivity(limit = 200): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  const agentsDir = getAgentsDir()
  let dirs: fs.Dirent[]
  try {
    dirs = fs.readdirSync(agentsDir, { withFileTypes: true })
  } catch {
    return entries
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    if (d.name.startsWith('.') || d.name.startsWith('_') || d.name === 'archive') continue
    const agentDir = path.join(agentsDir, d.name)
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

/** Aggregated timeline of all file writes across all agent dirs, newest first */
export function getInstallationActivity(limit = 200): ActivityEntry[] {
  const entries: ActivityEntry[] = []
  const agentsDir = getAgentsDir()
  let dirs: fs.Dirent[]
  try {
    dirs = fs.readdirSync(agentsDir, { withFileTypes: true })
  } catch {
    return entries
  }
  for (const d of dirs) {
    if (!d.isDirectory()) continue
    if (d.name.startsWith('.') || d.name.startsWith('_')) continue
    const agentDir = path.join(agentsDir, d.name)
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
  const workspacePath = getWorkspacePath()
  // 1. Try ORG/IDENTITY.md **Name:** field (value may be on same line or next line)
  try {
    const identity = fs.readFileSync(path.join(workspacePath, 'ORG', 'IDENTITY.md'), 'utf-8')
    // Match "**Name:**" then capture value on same line OR next non-empty line
    const m = identity.match(/\*\*Name[:\*\s]*\*?\*?\s*\n?\s*([^\n_*\(].+)/m)
    if (m) {
      const name = m[1].replace(/\*+$/, '').trim()
      if (name && !name.startsWith('_') && !name.startsWith('(')) return name
    }
  } catch {}

  // 2. Fall back to MASTER_PLAN.md H1
  const candidates = [
    path.join(workspacePath, 'ORG', 'MASTER_PLAN.md'),
    path.join(workspacePath, 'MASTER_PLAN.md'),
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

/** Read the latest semver git tag from the maxclaw repository. Returns null if none. */
export function getLatestTag(): string | null {
  // Start from this file's location and walk up to find the git repo
  // This ensures we read from the dashboard/maxclaw repo, not the workspace repo
  let current = __dirname  // server/lib/
  let gitPath: string | null = null

  // Walk up max 10 levels to find .git directory
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(current, '.git'))) {
      gitPath = path.join(current, '.git')
      break
    }
    const parent = path.dirname(current)
    if (parent === current) break  // Reached filesystem root
    current = parent
  }

  if (!gitPath) return null

  const tags: string[] = []

  // Loose refs
  try {
    tags.push(...fs.readdirSync(path.join(gitPath, 'refs', 'tags')))
  } catch {}

  // Packed refs (git gc moves tags here)
  try {
    const packed = fs.readFileSync(path.join(gitPath, 'packed-refs'), 'utf-8')
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

function isUsableVersion(value: string | null | undefined): value is string {
  const normalized = (value || '').trim()
  if (!normalized) return false
  if (normalized === '0.1.0' || normalized === 'dev' || normalized === 'unknown') return false
  return true
}

function findDashboardPackageVersion(): string | null {
  let current = __dirname

  for (let i = 0; i < 8; i++) {
    const candidate = path.join(current, 'package.json')
    try {
      const raw = fs.readFileSync(candidate, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed?.name === 'clawmax-dashboard' && isUsableVersion(parsed?.version)) {
        return parsed.version.trim()
      }
    } catch {}

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}

export function getDashboardVersion(): string {
  const envVersion = process.env.CLAWMAX_VERSION?.trim()
  if (isUsableVersion(envVersion)) return envVersion

  const packageVersion = findDashboardPackageVersion()
  if (packageVersion && /(?:^|[-.])(hack|alpha|beta|rc)(?:[.-]|$)/i.test(packageVersion)) {
    return packageVersion
  }

  const gitTag = getLatestTag()
  if (isUsableVersion(gitTag)) return gitTag

  if (packageVersion) return packageVersion

  return '0.1.0'
}

export function listAgents(): AgentInfo[] {
  const agents: AgentInfo[] = []
  const agentsDir = getAgentsDir()
  const archiveDir = getArchiveDir()
  let entries: fs.Dirent[]

  try {
    entries = fs.readdirSync(agentsDir, { withFileTypes: true })
  } catch {
    return agents
  }

  // Build maps from workspace path → agent metadata from openclaw.json
  // Also validate the agents list structure
  const workspaceToIdMap = new Map<string, string>()
  const idToMetadataMap = new Map<string, any>()
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
      if (agent.id) {
        idToMetadataMap.set(agent.id, agent)
      }
    }
  } catch {}

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    // Skip hidden directories, common non-agent directories, and archive directory
    if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'archive') continue

    const agentDir = path.join(agentsDir, entry.name)
    if (!isManagedAgentWorkspaceDir(agentDir)) continue
    // Look up the registered ID from openclaw.json, fall back to directory name
    // Priority: workspace path match > agent ID match > directory name
    const registeredId = workspaceToIdMap.get(agentDir) || entry.name
    const agent = readAgentInfo(registeredId, agentDir, agentValidationWarnings.get(registeredId), false, idToMetadataMap.get(entry.name))
    agents.push(agent)
  }

  // Also scan archive directory
  try {
    const archiveEntries = fs.readdirSync(archiveDir, { withFileTypes: true })
    for (const entry of archiveEntries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue

      const agentDir = path.join(archiveDir, entry.name)
      if (!isManagedAgentWorkspaceDir(agentDir)) continue
      const registeredId = workspaceToIdMap.get(agentDir) || entry.name
      const agent = readAgentInfo(registeredId, agentDir, agentValidationWarnings.get(registeredId), true, idToMetadataMap.get(entry.name))
      agents.push(agent)
    }
  } catch {}

  const pausedSet = getPausedAgents()
  for (const agent of agents) {
    agent.paused = pausedSet.has(agent.id)
  }
  return agents.sort((a, b) => a.id.localeCompare(b.id))
}

function readAgentInfo(id: string, agentDir: string, validationWarnings?: string[], isArchived: boolean = false, metadata?: any): AgentInfo {
  // Read name from IDENTITY.md
  let name = id
  const identityPath = path.join(agentDir, 'IDENTITY.md')
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    const nameMatch = identity.match(/\*\*Name[:\*\s]+\s*(.+)/m) || identity.match(/^-\s+Name[:\s]+(.+)$/m) || identity.match(/^#\s+(.+)$/m)
    if (nameMatch) name = nameMatch[1].trim()
  } catch {}

  /**
   * Agent Status Detection
   *
   * Architecture: All agents share a single gateway (typically port 18889).
   * We cannot use port-based detection alone since all agents would appear "online"
   * whenever the gateway is running.
   *
   * Strategy:
   * 1. Check if shared gateway is running (lsof port check)
   * 2. Check agent's file modification time (workspace activity)
   * 3. Combine both signals to determine status:
   *    - online: Gateway running + recent activity (< 24h)
   *    - offline: Gateway running but stale, OR no gateway but recent activity
   *    - unknown: No gateway and very stale (> 1 week)
   *
   * This heuristic works because:
   * - Agents write files when processing messages
   * - Recent file activity = agent has been used recently
   * - No recent activity = agent is registered but inactive
   */
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
    let gatewayRunning = false

    // Check agent-specific port, or fall back to shared gateway (port 18789)
    const probePort = (gatewayConfig && gatewayConfig.port) ? gatewayConfig.port : 18789
    {
      const { execSync } = require('child_process')
      const portChecks = [
        `lsof -ti:${probePort}`,
        `bash -c 'echo > /dev/tcp/127.0.0.1/${probePort}' 2>/dev/null`,
        `curl -s -o /dev/null --connect-timeout 1 http://127.0.0.1:${probePort}/`,
      ]
      for (const cmd of portChecks) {
        try {
          execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout: 2000 })
          gatewayRunning = true
          break
        } catch {}
      }
    }

    // Check file activity to determine if agent is active
    // Check BOTH workspace directory AND agent state directory
    let latestMtime = 0

    // Check workspace files (IDENTITY.md, SOUL.md, etc.)
    try {
      const entries = fs.readdirSync(agentDir, { withFileTypes: true })
      for (const e of entries) {
        if (!e.isFile()) continue
        try {
          const s = fs.statSync(path.join(agentDir, e.name))
          if (s.mtime.getTime() > latestMtime) latestMtime = s.mtime.getTime()
        } catch {}
      }
    } catch {}

    // Check agent state directory (sessions, logs, etc.)
    // This is where agent runtime files are stored
    try {
      const HOME = process.env.HOME || ''
      const stateDir = path.join(HOME, '.openclaw', 'agents', id)
      if (fs.existsSync(stateDir)) {
        // Check sessions directory specifically (most frequently updated)
        const sessionsDir = path.join(stateDir, 'sessions')
        if (fs.existsSync(sessionsDir)) {
          try {
            const s = fs.statSync(sessionsDir)
            if (s.mtime.getTime() > latestMtime) latestMtime = s.mtime.getTime()
          } catch {}
        }
        // Also check root state directory
        try {
          const entries = fs.readdirSync(stateDir, { withFileTypes: true })
          for (const e of entries) {
            if (!e.isFile()) continue
            try {
              const s = fs.statSync(path.join(stateDir, e.name))
              if (s.mtime.getTime() > latestMtime) latestMtime = s.mtime.getTime()
            } catch {}
          }
        } catch {}
      }
    } catch {}

    if (latestMtime > 0) {
      lastHeartbeat = new Date(latestMtime).toISOString()
      const ageMins = (Date.now() - latestMtime) / 60000

      // Determine status based on gateway + file activity
      if (gatewayRunning && ageMins < 1440) {
        // Gateway running + activity in last 24h = online
        status = 'online'
      } else if (ageMins < 30) {
        // Recent activity in last 30 mins (e.g. just chatted) = online
        status = 'online'
      } else if (gatewayRunning) {
        // Gateway running but no recent activity = offline
        status = 'offline'
      } else if (ageMins < 1440) {
        // Activity in last 24h without gateway = offline (ready but idle)
        status = 'offline'
      } else {
        // No recent activity = unknown
        status = 'unknown'
      }
    } else {
      // No file activity at all — check if agent has workspace files (freshly created)
      const hasIdentity = fs.existsSync(path.join(agentDir, 'IDENTITY.md'))
      status = hasIdentity ? 'offline' : 'unknown'
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
  const workspacePath = getWorkspacePath()

  try {
    const communitiesContent = fs.readFileSync(path.join(workspacePath, 'ORG', 'COMMUNITIES.md'), 'utf-8')
    const parsed = parseGroupsWithMembers(communitiesContent)
    // Filter to only include communities where this agent is a member
    communities = parsed.communities
      .filter(c => c.members.includes(id))
      .map(({ members, ...rest }) => rest) // Remove members field from result
  } catch {}

  try {
    const groupsContent = fs.readFileSync(path.join(workspacePath, 'ORG', 'GROUPS.md'), 'utf-8')
    const parsed = parseGroupsWithMembers(groupsContent)
    // Filter to only include groups where this agent is a member
    groups = parsed.groups
      .filter(g => g.members.includes(id))
      .map(({ members, ...rest }) => rest) // Remove members field from result
  } catch {}

  // Read tags from IDENTITY.md
  let tags: string[] = []
  let archiveMetadata: { reason?: string; timestamp?: string } | undefined
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    tags = parseTags(identity)

    // Parse archive metadata if present
    const archiveMatch = identity.match(/##\s+Archive\s+Metadata\s+([\s\S]*?)(?=\n##|\n---|\Z)/i)
    if (archiveMatch) {
      const archiveSection = archiveMatch[1]
      const reasonMatch = archiveSection.match(/\*\*Reason:\*\*\s+(.+)/i)
      const timestampMatch = archiveSection.match(/\*\*Archived:\*\*\s+(.+)/i)

      archiveMetadata = {}
      if (reasonMatch) archiveMetadata.reason = reasonMatch[1].trim()
      if (timestampMatch) archiveMetadata.timestamp = timestampMatch[1].trim()
    }
  } catch {}

  // Read skills from openclaw.json
  let skills: string[] | undefined
  try {
    const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list || []
    const agentConfig = agentList.find((a: any) => a.id === id)
    if (agentConfig && agentConfig.skills) {
      skills = agentConfig.skills
    }
  } catch {}

  // Validate TOOLS.md
  const warnings = validationWarnings ? [...validationWarnings] : []
  try {
    const toolsPath = path.join(agentDir, 'TOOLS.md')
    if (fs.existsSync(toolsPath)) {
      const toolsContent = fs.readFileSync(toolsPath, 'utf-8')
      const { validateTools } = require('./validator')
      const validation = validateTools(toolsContent)
      if (!validation.valid) {
        warnings.push(...validation.errors.map((e: any) => `TOOLS.md: ${e.message}`))
      }
    }
  } catch {}

  // Validate SOUL.md
  try {
    const soulPath = path.join(agentDir, 'SOUL.md')
    if (fs.existsSync(soulPath)) {
      const soulContent = fs.readFileSync(soulPath, 'utf-8')
      const { validateSoul } = require('./validator')
      const validation = validateSoul(soulContent)
      if (!validation.valid) {
        warnings.push(...validation.errors.map((e: any) => `SOUL.md: ${e.message}`))
      }
    }
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
    skills: skills || [],
    validationWarnings: warnings.length > 0 ? warnings : undefined,
    archived: isArchived,
    archiveMetadata: isArchived ? archiveMetadata : undefined,
  }
}

/** Return the gateway config (port + auth token) for a given agent
 *
 * Port detection: reads from openclaw.json first, then probes both
 * common ports (18789 = OpenClaw default, 18889 = common override)
 */
export function getAgentGatewayConfig(id: string): { port: number; token: string } | null {
  const HOME = process.env.HOME || ''
  const isProfile = fs.existsSync(path.join(HOME, `.openclaw-${id}`))
  const configPath = isProfile
    ? path.join(HOME, `.openclaw-${id}`, 'openclaw.json')
    : path.join(HOME, '.openclaw', 'openclaw.json')
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const configPort = config?.gateway?.port
    const token = config?.gateway?.auth?.token ?? ''
    if (!token) return null

    // If port is explicitly set in config, use it
    if (configPort) {
      return { port: configPort, token }
    }

    // No port in config — probe both common ports
    const { execSync } = require('child_process')
    for (const port of [18789, 18889] as const) {
      try {
        // port is a hardcoded numeric constant — safe for interpolation
        execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: 'pipe', timeout: 1000 })
        return { port, token }
      } catch {}
    }

    // Neither port listening — return 18789 as default
    return { port: 18789, token }
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
  const agentsDir = getAgentsDir()

  try {
    const dirs = fs.readdirSync(agentsDir, { withFileTypes: true })
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

/** Find first unused TCP port >= startPort
 *
 * IMPORTANT: Default must match OpenClaw gateway port (18889 common, 18789 OpenClaw default)
 */
export function findFreePort(startPort = 18889): Promise<number> {
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
  tags: string[]
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
  let tags: string[] = []
  try {
    const info = readAgentInfo(id, agentDir)
    communityCount = info.communities.length
    groupCount = info.groups.length
    whatsapp = info.whatsapp
    tags = info.tags || []
  } catch {}

  // profile-mode state dir: ~/.openclaw-<id>
  const hasStateDir = fs.existsSync(path.join(process.env.HOME || '', `.openclaw-${id}`))

  return { todoCount, communityCount, groupCount, whatsapp, hasStateDir, tags }
}

/** Delete an agent's workspace dir and optionally its profile state dir.
 *  Returns { steps, errors }. */
export function deleteAgent(id: string, removeStateDir: boolean, archived: boolean = false): { steps: string[]; errors: string[] } {
  const steps: string[] = []
  const errors: string[] = []

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) return { steps, errors: ['Invalid agent id'] }

  const agentsDir = getAgentsDir()
  const archiveDir = getArchiveDir()
  const agentDir = archived ? path.join(archiveDir, id) : path.join(agentsDir, id)
  const sharedHomeAgentDir = path.join(process.env.HOME || '', '.openclaw', 'agents', id)
  const activeWorkspaceAgentDir = path.join(getWorkspacePath(), 'AGENTS', id)
  const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
  let hasRemainingWorkspaceCopies = false

  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      if (Array.isArray(config.agents?.list)) {
        const originalLength = config.agents.list.length
        config.agents.list = config.agents.list.filter((agent: any) => {
          if (agent?.id !== id) return true
          const workspacePath = typeof agent?.workspace === 'string' ? path.resolve(agent.workspace) : ''
          return workspacePath !== path.resolve(activeWorkspaceAgentDir)
        })
        hasRemainingWorkspaceCopies = config.agents.list.some((agent: any) => agent?.id === id)
        if (config.agents.list.length < originalLength) {
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
          steps.push(`Removed ${id} from openclaw.json for active workspace`)
        } else {
          steps.push(`No active-workspace openclaw.json entry found for ${id} (skipped)`)
        }
      }
    }
  } catch (e) {
    errors.push(`Failed to remove from openclaw.json: ${e}`)
  }

  // Remove workspace AGENTS dir (or archive dir)
  try {
    fs.rmSync(agentDir, { recursive: true, force: true })
    steps.push(`Removed workspace ${archived ? 'AGENTS/archive/' : 'AGENTS/'}${id}/`)
  } catch (e) {
    errors.push(`Failed to remove workspace: ${e}`)
  }

  // Remove shared home agent dir (~/.openclaw/agents/<id>)
  try {
    if (hasRemainingWorkspaceCopies) {
      steps.push(`Preserved shared agent dir ~/.openclaw/agents/${id}/ because another workspace still references it`)
    } else if (fs.existsSync(sharedHomeAgentDir)) {
      fs.rmSync(sharedHomeAgentDir, { recursive: true, force: true })
      steps.push(`Removed shared agent dir ~/.openclaw/agents/${id}/`)
    } else {
      steps.push(`Shared agent dir ~/.openclaw/agents/${id}/ not found (skipped)`)
    }
  } catch (e) {
    errors.push(`Failed to remove shared agent dir: ${e}`)
  }

  // Optionally remove profile state dir (~/.openclaw-<id>)
  if (removeStateDir) {
    const stateDir = path.join(process.env.HOME || '', `.openclaw-${id}`)
    if (hasRemainingWorkspaceCopies) {
      steps.push(`Preserved state dir ~/.openclaw-${id}/ because another workspace still references ${id}`)
    } else if (fs.existsSync(stateDir)) {
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

  // Remove agent from COMMUNITIES.md and GROUPS.md member lists
  const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
  const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')

  // Remove from communities
  if (fs.existsSync(communitiesPath)) {
    try {
      let communitiesContent = fs.readFileSync(communitiesPath, 'utf-8')
      const lines = communitiesContent.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Match Members line (with or without leading dash)
        if (line.match(/^\s*-?\s*\*\*Members:\*\*/i)) {
          const membersMatch = line.match(/^(\s*-?\s*\*\*Members:\*\*\s*)(.*)/)
          if (membersMatch) {
            const prefix = membersMatch[1]
            const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)
            lines[i] = prefix + membersList.join(', ')
          }
        }
      }

      fs.writeFileSync(communitiesPath, lines.join('\n'), 'utf-8')
      steps.push(`Removed ${id} from COMMUNITIES.md member lists`)
    } catch (e) {
      errors.push(`Failed to remove from COMMUNITIES.md: ${e}`)
    }
  }

  // Remove from groups
  if (fs.existsSync(groupsPath)) {
    try {
      let groupsContent = fs.readFileSync(groupsPath, 'utf-8')
      const lines = groupsContent.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        // Match Members line (with or without leading dash)
        if (line.match(/^\s*-?\s*\*\*Members:\*\*/i)) {
          const membersMatch = line.match(/^(\s*-?\s*\*\*Members:\*\*\s*)(.*)/)
          if (membersMatch) {
            const prefix = membersMatch[1]
            const membersList = membersMatch[2].split(',').map(m => m.trim()).filter(m => m && m !== id)
            lines[i] = prefix + membersList.join(', ')
          }
        }
      }

      fs.writeFileSync(groupsPath, lines.join('\n'), 'utf-8')
      steps.push(`Removed ${id} from GROUPS.md member lists`)
    } catch (e) {
      errors.push(`Failed to remove from GROUPS.md: ${e}`)
    }
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
