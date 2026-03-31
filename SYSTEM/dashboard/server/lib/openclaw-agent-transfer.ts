import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { getAgentsDir, getWorkspacePath, listAgents, updateGroupMembers, parseGroupsWithMembers } from './workspace'
import { getAgentSkills } from './skills'

interface TransferGroupEntry {
  name: string
  description: string | null
  tags: string[]
  channels: string[]
  community?: string | null
}

interface TransferMetadata {
  version: 1
  exportedAt: string
  sourceWorkspacePath: string
  agentId: string
  skills: string[]
  communities: TransferGroupEntry[]
  groups: TransferGroupEntry[]
}

function buildTransferMetadata(agentId: string): TransferMetadata {
  const skills = getAgentSkills(agentId)
  const membership = getWorkspaceMembership(agentId)
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    sourceWorkspacePath: getWorkspacePath(),
    agentId,
    skills,
    communities: membership.communities,
    groups: membership.groups,
  }
}

function getOpenClawRoot(): string {
  return path.join(os.homedir(), '.openclaw')
}

function getOpenClawAgentsDir(): string {
  return path.join(getOpenClawRoot(), 'agents')
}

function getOpenClawAgentRoot(agentId: string): string {
  return path.join(getOpenClawAgentsDir(), agentId)
}

function getOpenClawAgentDir(agentId: string): string {
  return path.join(getOpenClawAgentRoot(agentId), 'agent')
}

function getTransferMetadataPath(agentId: string): string {
  return path.join(getOpenClawAgentRoot(agentId), 'clawmax-export.json')
}

function copyMarkdownFiles(srcDir: string, destDir: string): string[] {
  fs.mkdirSync(destDir, { recursive: true })
  const copied: string[] = []
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const src = path.join(srcDir, entry.name)
    const dest = path.join(destDir, entry.name)
    fs.copyFileSync(src, dest)
    copied.push(entry.name)
  }
  return copied
}

function loadOpenClawConfig(): any {
  const configPath = path.join(getOpenClawRoot(), 'openclaw.json')
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return { agents: { list: [] } }
  }
}

function saveOpenClawConfig(config: any): void {
  const configPath = path.join(getOpenClawRoot(), 'openclaw.json')
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  const now = new Date().toISOString()
  config.meta = {
    ...(config.meta || {}),
    lastTouchedVersion: 'dashboard-0.1.0',
    lastTouchedAt: now,
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

function upsertOpenClawAgentConfig(agentId: string, workspacePath: string, agentDir: string, skills: string[]) {
  const config = loadOpenClawConfig()
  if (!config.agents) config.agents = {}
  if (!Array.isArray(config.agents.list)) config.agents.list = []
  const existingIndex = config.agents.list.findIndex((agent: any) => agent.id === agentId)
  const next = {
    ...(existingIndex >= 0 ? config.agents.list[existingIndex] : {}),
    id: agentId,
    name: agentId,
    workspace: workspacePath,
    agentDir,
    skills,
  }

  if (existingIndex >= 0) config.agents.list[existingIndex] = next
  else config.agents.list.push(next)

  saveOpenClawConfig(config)
}

function loadTransferMetadata(agentId: string): TransferMetadata | null {
  const filePath = getTransferMetadataPath(agentId)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TransferMetadata
  } catch {
    return null
  }
}

function saveTransferMetadata(agentId: string, metadata: TransferMetadata): void {
  const filePath = getTransferMetadataPath(agentId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf-8')
}

function resolveBundleDir(sourcePath: string): string {
  const resolved = path.resolve(sourcePath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Bundle path not found: ${resolved}`)
  }

  const stat = fs.statSync(resolved)
  if (stat.isFile()) {
    throw new Error(`Expected a directory, got file: ${resolved}`)
  }

  if (fs.existsSync(path.join(resolved, 'IDENTITY.md'))) {
    return resolved
  }

  const childDirs = fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => path.join(resolved, entry.name))

  for (const childDir of childDirs) {
    if (fs.existsSync(path.join(childDir, 'IDENTITY.md'))) {
      return childDir
    }
  }

  throw new Error(`Could not find an agent bundle with IDENTITY.md under: ${resolved}`)
}

function loadBundleMetadata(bundleDir: string): TransferMetadata | null {
  const candidates = [
    path.join(bundleDir, 'clawmax-export.json'),
    path.join(path.dirname(bundleDir), 'clawmax-export.json'),
  ]
  for (const candidate of candidates) {
    try {
      return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as TransferMetadata
    } catch {}
  }
  return null
}

function getWorkspaceMembership(agentId: string): { communities: TransferGroupEntry[]; groups: TransferGroupEntry[] } {
  const agent = listAgents().find((entry) => entry.id === agentId)
  return {
    communities: (agent?.communities || []).map((community) => ({
      name: community.name,
      description: community.description,
      tags: community.tags || [],
      channels: community.channels || [],
      community: null,
    })),
    groups: (agent?.groups || []).map((group) => ({
      name: group.name,
      description: group.description,
      tags: group.tags || [],
      channels: group.channels || [],
      community: group.community || null,
    })),
  }
}

function ensureMembership(type: 'community' | 'group', entry: TransferGroupEntry, agentId: string): string | null {
  const filePath = path.join(getWorkspacePath(), 'ORG', type === 'community' ? 'COMMUNITIES.md' : 'GROUPS.md')
  const content = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf-8')
    : type === 'community'
      ? '# Communities\n\n## Communities\n\n'
      : '# Groups\n\n## Groups\n\n'
  const parsed = parseGroupsWithMembers(content)
  const existing = (type === 'community' ? parsed.communities : parsed.groups).find((item) => item.name === entry.name)

  if (!existing) {
    return `${type === 'community' ? 'Community' : 'Group'} "${entry.name}" does not exist in this workspace`
  }

  const members = new Set(existing.members)
  members.add(agentId)
  updateGroupMembers(type, entry.name, Array.from(members))
  return null
}

export function listImportableOpenClawAgents(): Array<{ id: string; hasMetadata: boolean; files: string[] }> {
  const agentsDir = getOpenClawAgentsDir()
  if (!fs.existsSync(agentsDir)) return []

  return fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => {
      const agentDir = getOpenClawAgentDir(entry.name)
      const files = fs.existsSync(agentDir)
        ? fs.readdirSync(agentDir).filter((name) => name.endsWith('.md'))
        : []
      return {
        id: entry.name,
        hasMetadata: fs.existsSync(getTransferMetadataPath(entry.name)),
        files,
      }
    })
    .filter((entry) => entry.files.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function exportAgentToOpenClaw(
  agentId: string,
  targetId?: string,
  options?: { includeSkills?: boolean; includeMemberships?: boolean }
): { exportedId: string; files: string[] } {
  const sourceDir = path.join(getAgentsDir(), agentId)
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Agent not found: ${agentId}`)
  }

  const exportedId = targetId || agentId
  const targetDir = getOpenClawAgentDir(exportedId)
  const files = copyMarkdownFiles(sourceDir, targetDir)
  const includeSkills = options?.includeSkills !== false
  const includeMemberships = options?.includeMemberships !== false
  const metadata = buildTransferMetadata(agentId)
  const skills = includeSkills ? metadata.skills : []
  const metadataToSave: TransferMetadata = {
    ...metadata,
    skills,
    communities: includeMemberships ? metadata.communities : [],
    groups: includeMemberships ? metadata.groups : [],
  }

  upsertOpenClawAgentConfig(exportedId, path.join(getWorkspacePath(), 'AGENTS', agentId), targetDir, skills)
  saveTransferMetadata(exportedId, metadataToSave)

  return { exportedId, files }
}

export function getAgentTransferMetadata(agentId: string, options?: { includeSkills?: boolean; includeMemberships?: boolean }): TransferMetadata {
  const metadata = buildTransferMetadata(agentId)
  return {
    ...metadata,
    skills: options?.includeSkills === false ? [] : metadata.skills,
    communities: options?.includeMemberships === false ? [] : metadata.communities,
    groups: options?.includeMemberships === false ? [] : metadata.groups,
  }
}

export function importAgentFromBundleDirectory(sourcePath: string, targetId?: string): { importedId: string; files: string[]; metadataRestored: boolean; warnings: string[] } {
  const bundleDir = resolveBundleDir(sourcePath)
  const inferredId = path.basename(bundleDir)
  const sourceId = targetId ? inferredId : inferredId
  const importedId = targetId || inferredId
  const targetDir = path.join(getAgentsDir(), importedId)

  if (fs.existsSync(targetDir)) {
    throw new Error(`Agent already exists in workspace: ${importedId}`)
  }

  const files = copyMarkdownFiles(bundleDir, targetDir)
  if (files.length === 0) {
    throw new Error(`No markdown files found in bundle: ${bundleDir}`)
  }

  const metadata = loadBundleMetadata(bundleDir)
  const skills = Array.isArray(metadata?.skills) ? metadata.skills : []
  const warnings: string[] = []

  if (metadata?.agentId && metadata.agentId !== importedId) {
    warnings.push(`Bundle metadata was exported for agent "${metadata.agentId}" and imported as "${importedId}"`)
  }

  if (skills.length > 0) {
    upsertOpenClawAgentConfig(importedId, targetDir, getOpenClawAgentDir(importedId), skills)
  } else {
    upsertOpenClawAgentConfig(importedId, targetDir, getOpenClawAgentDir(importedId), [])
    warnings.push('No skill metadata found in bundle; imported agent files were restored without skills')
  }

  for (const community of metadata?.communities || []) {
    const warning = ensureMembership('community', community, importedId)
    if (warning) warnings.push(`${warning}; imported agent was not re-added to it`)
  }

  for (const group of metadata?.groups || []) {
    const warning = ensureMembership('group', group, importedId)
    if (warning) warnings.push(`${warning}; imported agent was not re-added to it`)
  }

  return { importedId, files, metadataRestored: !!metadata, warnings }
}

export function importAgentFromZipArchive(zipPath: string, targetId?: string): { importedId: string; files: string[]; metadataRestored: boolean; warnings: string[] } {
  const resolvedZip = path.resolve(zipPath)
  if (!fs.existsSync(resolvedZip)) {
    throw new Error(`ZIP file not found: ${resolvedZip}`)
  }

  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-agent-zip-'))
  execFileSync('unzip', ['-oq', resolvedZip, '-d', extractDir])
  return importAgentFromBundleDirectory(extractDir, targetId)
}

export function importAgentFromOpenClaw(sourceId: string, targetId?: string): { importedId: string; files: string[]; metadataRestored: boolean; warnings: string[] } {
  const sourceDir = getOpenClawAgentDir(sourceId)
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`OpenClaw agent not found: ${sourceId}`)
  }

  const importedId = targetId || sourceId
  const targetDir = path.join(getAgentsDir(), importedId)
  if (fs.existsSync(targetDir)) {
    throw new Error(`Agent already exists in workspace: ${importedId}`)
  }

  const files = copyMarkdownFiles(sourceDir, targetDir)
  if (files.length === 0) {
    throw new Error(`No markdown files found for OpenClaw agent: ${sourceId}`)
  }

  if (importedId !== sourceId) {
    copyMarkdownFiles(sourceDir, getOpenClawAgentDir(importedId))
  }

  const metadata = loadTransferMetadata(sourceId)
  const skills = metadata?.skills || loadOpenClawConfig().agents?.list?.find((agent: any) => agent.id === sourceId)?.skills || []
  upsertOpenClawAgentConfig(importedId, targetDir, getOpenClawAgentDir(importedId), Array.isArray(skills) ? skills : [])
  const warnings: string[] = []

  for (const community of metadata?.communities || []) {
    const warning = ensureMembership('community', community, importedId)
    if (warning) warnings.push(`${warning}; imported agent was not re-added to it`)
  }

  for (const group of metadata?.groups || []) {
    const warning = ensureMembership('group', group, importedId)
    if (warning) warnings.push(`${warning}; imported agent was not re-added to it`)
  }

  return { importedId, files, metadataRestored: !!metadata, warnings }
}
