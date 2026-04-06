import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { getWorkspaceManager, type Workspace } from './workspace-manager'
import { sanitizeWorkspaceExportName, type WorkspaceExportManifest } from './workspace-export'

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
  fs.cpSync(sourceDir, targetDir, { recursive: true })
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
  execFileSync('unzip', ['-oq', resolvedZip, '-d', extractDir])

  const extractedRoot = resolveSingleExtractedRoot(extractDir)
  const manifest = loadManifestFromExtractedRoot(extractedRoot)
  const workspaceName = options?.targetName?.trim() || manifest.workspace.name || manifest.workspace.id || 'Imported Workspace'
  const defaultRoot = path.join(os.homedir(), '.openclaw', 'workspaces')
  const slug = sanitizeWorkspaceExportName(workspaceName)
  const targetPath = path.resolve(options?.targetPath?.trim() || path.join(defaultRoot, slug))

  ensureWorkspaceMissing(targetPath)
  copyDirectoryContents(extractedRoot, targetPath)

  const workspace = registerImportedWorkspace(workspaceName, targetPath, {
    color: manifest.workspace.color,
    tags: manifest.workspace.tags,
    activate: options?.activate !== false,
  })

  return { workspace, manifest, importedPath: targetPath }
}
