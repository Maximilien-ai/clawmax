import fs from 'fs'
import os from 'os'
import path from 'path'
import { getWorkspaceManager, type Workspace } from './workspace-manager'
import { sanitizeWorkspaceExportName, type WorkspaceExportManifest } from './workspace-export'
import { extractZipSecurely } from './archive-security'
import { hasGitDirSegment } from './workspace'
import { resolvePathWithin } from './path-segment'

export function resolveWorkspaceImportTarget(requested: string | undefined, slug: string): string {
  const home = os.homedir()
  const defaultRoot = path.join(home, '.openclaw', 'workspaces')
  if (!requested?.trim()) return resolvePathWithin(defaultRoot, slug)
  // A browser request cannot grant access to an arbitrary server directory.
  // Operators can explicitly allow additional roots in deployment environment.
  const roots = [home, ...(process.env.CLAWMAX_WORKSPACE_IMPORT_ROOTS || '').split(path.delimiter).filter(Boolean)]
  const target = path.resolve(requested.trim())
  for (const root of roots) {
    const base = path.resolve(root)
    if (target.startsWith(`${base}${path.sep}`)) return resolvePathWithin(base, path.relative(base, target))
  }
  throw new Error('Import destination must be inside your home or an operator-configured CLAWMAX_WORKSPACE_IMPORT_ROOTS directory')
}

function resolveSingleExtractedRoot(extractDir: string): string {
  const entries = fs.readdirSync(extractDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))

  if (entries.length !== 1) {
    throw new Error('Expected workspace archive to contain a single root directory')
  }

  return path.join(extractDir, entries[0].name)
}

function loadManifestFromExtractedRoot(rootDir: string): WorkspaceExportManifest {
  const manifestPath = path.join(rootDir, 'SYSTEM', 'export-manifest.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Workspace export manifest not found in archive')
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as WorkspaceExportManifest
}

function ensureWorkspaceMissing(targetPath: string) {
  if (fs.existsSync(targetPath)) {
    throw new Error(`Workspace path already exists: ${targetPath}`)
  }
}

function copyDirectoryContents(sourceDir: string, targetDir: string) {
  fs.mkdirSync(targetDir, { recursive: true })
  // An export never contains .git (WORKSPACE_EXPORT_SECRET_GLOBS); an imported one would let the archive's
  // .git/config run commands when the dashboard next commits a document (see hasGitDirSegment).
  fs.cpSync(sourceDir, targetDir, { recursive: true, filter: (source) => !hasGitDirSegment(path.relative(sourceDir, source)) })
}

function registerImportedWorkspace(name: string, workspacePath: string, options?: { color?: string; tags?: string[]; activate?: boolean }): Workspace {
  const workspaceManager = getWorkspaceManager()
  const registry = workspaceManager.loadRegistry()

  if (registry.workspaces.some((workspace) => workspace.path === workspacePath)) {
    throw new Error(`Workspace path already exists: ${workspacePath}`)
  }

  let baseId = sanitizeWorkspaceExportName(name)
  let id = baseId
  let counter = 1
  while (registry.workspaces.some((workspace) => workspace.id === id)) {
    id = `${baseId}-${counter}`
    counter += 1
  }

  const now = new Date().toISOString()
  const workspace: Workspace = {
    id,
    name,
    path: workspacePath,
    createdAt: now,
    lastAccessedAt: now,
    color: options?.color,
    tags: options?.tags,
  }

  registry.workspaces.push(workspace)
  if (options?.activate) {
    registry.activeWorkspaceId = id
  }
  workspaceManager.saveRegistry()
  return workspace
}

export function importWorkspaceFromZipArchive(zipPath: string, options?: {
  targetName?: string
  targetPath?: string
  activate?: boolean
}): { workspace: Workspace; manifest: WorkspaceExportManifest; importedPath: string } {
  const resolvedZip = path.resolve(zipPath)
  if (!fs.existsSync(resolvedZip)) {
    throw new Error(`ZIP file not found: ${resolvedZip}`)
  }

  const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workspace-zip-'))
  extractZipSecurely(resolvedZip, extractDir, {
    maxEntries: 25_000,
    maxEntryBytes: 200 * 1024 * 1024,
    maxTotalBytes: 1024 * 1024 * 1024,
  })

  const extractedRoot = resolveSingleExtractedRoot(extractDir)
  const manifest = loadManifestFromExtractedRoot(extractedRoot)
  const workspaceName = options?.targetName?.trim() || manifest.workspace.name || manifest.workspace.id || 'Imported Workspace'
  const slug = sanitizeWorkspaceExportName(workspaceName)
  const targetPath = resolveWorkspaceImportTarget(options?.targetPath, slug)

  ensureWorkspaceMissing(targetPath)
  copyDirectoryContents(extractedRoot, targetPath)

  const workspace = registerImportedWorkspace(workspaceName, targetPath, {
    color: manifest.workspace.color,
    tags: manifest.workspace.tags,
    activate: options?.activate !== false,
  })

  return { workspace, manifest, importedPath: targetPath }
}
