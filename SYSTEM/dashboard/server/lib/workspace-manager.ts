import fs from 'fs'
import path from 'path'
import { AsyncLocalStorage } from 'async_hooks'

export interface Workspace {
  id: string
  name: string
  path: string
  createdAt: string
  lastAccessedAt: string
  agentCount?: number
  color?: string
  tags?: string[]
}

export interface WorkspaceRegistry {
  version: string
  activeWorkspaceId: string
  workspaces: Workspace[]
}

export interface WorkspacePathConflict {
  path: string
  registeredWorkspace: Workspace | null
  reusableScaffold: boolean
  canAdopt: boolean
  canOverwrite: boolean
}

const workspaceContext = new AsyncLocalStorage<{ workspaceId: string }>()

function extractIdentityField(content: string, field: string): string {
  const match = content.match(new RegExp(`\\*\\*${field}:\\*\\*[ \\t]*([^\\n]*)`, 'i'))
  return match?.[1]?.trim() || ''
}

function isManagedAgentWorkspaceDir(agentDir: string): boolean {
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

export class WorkspaceManager {
  private registryPath: string
  private registry: WorkspaceRegistry | null = null

  constructor(registryPath?: string) {
    const HOME = process.env.HOME || ''
    this.registryPath = registryPath || path.join(HOME, '.openclaw', 'dashboard-workspaces.json')
  }

  /** Load registry from disk, creating default if it doesn't exist */
  loadRegistry(): WorkspaceRegistry {
    if (this.registry) return this.registry

    try {
      const content = fs.readFileSync(this.registryPath, 'utf-8')
      this.registry = JSON.parse(content)
      this.reconcileRegistryWithRuntimeWorkspace()
      return this.registry!
    } catch (err) {
      // Registry doesn't exist, create default with current workspace
      console.log('Creating default workspace registry...')
      const HOME = process.env.HOME || ''
      const defaultWorkspacePath = process.env.OPENCLAW_WORKSPACE || path.join(HOME, '.openclaw', 'workspace')

      this.registry = {
        version: '1.0.0',
        activeWorkspaceId: 'default',
        workspaces: [
          {
            id: 'default',
            name: 'Personal',
            path: defaultWorkspacePath,
            createdAt: new Date().toISOString(),
            lastAccessedAt: new Date().toISOString(),
            color: '#3B82F6',
            tags: ['personal']
          }
        ]
      }

      this.saveRegistry()
      return this.registry!
    }
  }

  private reconcileRegistryWithRuntimeWorkspace(): void {
    if (!this.registry) return

    const configuredWorkspacePath = process.env.OPENCLAW_WORKSPACE
      ? path.resolve(process.env.OPENCLAW_WORKSPACE)
      : ''
    if (!configuredWorkspacePath) return

    const registry = this.registry
    const matchingWorkspace = registry.workspaces.find((workspace) => path.resolve(workspace.path) === configuredWorkspacePath)
    if (matchingWorkspace) {
      if (registry.activeWorkspaceId !== matchingWorkspace.id) {
        registry.activeWorkspaceId = matchingWorkspace.id
        this.saveRegistry()
      }
      return
    }

    const defaultWorkspace = registry.workspaces.find((workspace) => workspace.id === 'default')
    if (!defaultWorkspace) return

    defaultWorkspace.path = configuredWorkspacePath
    defaultWorkspace.lastAccessedAt = new Date().toISOString()
    registry.activeWorkspaceId = defaultWorkspace.id
    this.initializeWorkspaceStructure(configuredWorkspacePath)
    this.saveRegistry()
  }

  /** Save registry to disk */
  saveRegistry(): void {
    if (!this.registry) {
      throw new Error('No registry loaded')
    }

    try {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(this.registryPath), { recursive: true })

      // Write registry
      fs.writeFileSync(this.registryPath, JSON.stringify(this.registry, null, 2), 'utf-8')
      console.log(`✓ Workspace registry saved to ${this.registryPath}`)
    } catch (err) {
      console.error('Failed to save workspace registry:', err)
      throw err
    }
  }

  /** List all workspaces with live agent counts */
  listWorkspaces(): Workspace[] {
    const registry = this.loadRegistry()
    // Dynamically count agents from each workspace's AGENTS directory
    for (const workspace of registry.workspaces) {
      try {
        const agentsDir = path.join(workspace.path, 'AGENTS')
        if (fs.existsSync(agentsDir)) {
          const entries = fs.readdirSync(agentsDir, { withFileTypes: true })
          workspace.agentCount = entries.filter(e =>
            e.isDirectory()
            && !e.name.startsWith('.')
            && !e.name.startsWith('_')
            && e.name !== 'archive'
            && isManagedAgentWorkspaceDir(path.join(agentsDir, e.name))
          ).length
        } else {
          workspace.agentCount = 0
        }
      } catch {
        // Keep existing count if scan fails
      }
    }
    return registry.workspaces
  }

  /** Get workspace by ID */
  getWorkspace(id: string): Workspace | null {
    const registry = this.loadRegistry()
    return registry.workspaces.find(w => w.id === id) || null
  }

  getWorkspaceByPath(workspacePath: string): Workspace | null {
    const registry = this.loadRegistry()
    return registry.workspaces.find((w) => w.path === workspacePath) || null
  }

  inspectWorkspacePathConflict(workspacePath: string): WorkspacePathConflict {
    const registeredWorkspace = this.getWorkspaceByPath(workspacePath)
    const reusableScaffold = fs.existsSync(workspacePath)
      ? this.isReusableWorkspaceScaffold(workspacePath)
      : false

    return {
      path: workspacePath,
      registeredWorkspace,
      reusableScaffold,
      canAdopt: fs.existsSync(workspacePath) && !reusableScaffold && !registeredWorkspace,
      canOverwrite: fs.existsSync(workspacePath) && !reusableScaffold && !registeredWorkspace,
    }
  }

  /** Create a new workspace */
  createWorkspace(
    name: string,
    workspacePath: string,
    options?: { color?: string; tags?: string[]; mode?: 'create' | 'adopt' | 'overwrite' }
  ): Workspace {
    const registry = this.loadRegistry()
    const mode = options?.mode || 'create'

    // Validate path doesn't already exist
    const registeredWorkspace = registry.workspaces.find(w => w.path === workspacePath) || null
    if (registeredWorkspace) {
      throw new Error(`Workspace path already exists: ${workspacePath}`)
    }

    if (fs.existsSync(workspacePath)) {
      const stats = fs.statSync(workspacePath)
      if (!stats.isDirectory()) {
        throw new Error(`Workspace path is not a directory: ${workspacePath}`)
      }

      const reusableScaffold = this.isReusableWorkspaceScaffold(workspacePath)
      if (!reusableScaffold) {
        if (mode === 'overwrite') {
          fs.rmSync(workspacePath, { recursive: true, force: true })
        } else if (mode !== 'adopt') {
          throw new Error(`Workspace path is not empty: ${workspacePath}`)
        }
      }
    }

    // Generate ID from name (lowercase, remove spaces, ensure uniqueness)
    let baseId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-')
    let id = baseId
    let counter = 1
    while (registry.workspaces.some(w => w.id === id)) {
      id = `${baseId}-${counter}`
      counter++
    }

    // Create workspace directories unless we are adopting an existing workspace as-is.
    if (mode !== 'adopt') {
      this.initializeWorkspaceStructure(workspacePath)
    }

    const workspace: Workspace = {
      id,
      name,
      path: workspacePath,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
      agentCount: 0,
      color: options?.color,
      tags: options?.tags
    }

    registry.workspaces.push(workspace)
    this.saveRegistry()

    console.log(`✓ Created workspace "${name}" at ${workspacePath}`)
    return workspace
  }

  /** Delete a workspace */
  deleteWorkspace(id: string): void {
    const registry = this.loadRegistry()

    // Prevent deleting active workspace
    if (registry.activeWorkspaceId === id) {
      throw new Error('Cannot delete active workspace. Switch to another workspace first.')
    }

    // Prevent deleting default workspace
    if (id === 'default') {
      throw new Error('Cannot delete default workspace')
    }

    const workspaceIndex = registry.workspaces.findIndex(w => w.id === id)
    if (workspaceIndex === -1) {
      throw new Error(`Workspace not found: ${id}`)
    }

    registry.workspaces.splice(workspaceIndex, 1)
    this.saveRegistry()

    console.log(`✓ Deleted workspace: ${id}`)
  }

  /** Get active workspace */
  getActiveWorkspace(): Workspace {
    const registry = this.loadRegistry()
    const context = workspaceContext.getStore()
    if (context?.workspaceId) {
      const contextualWorkspace = registry.workspaces.find(w => w.id === context.workspaceId)
      if (contextualWorkspace) {
        return contextualWorkspace
      }
    }
    const workspace = registry.workspaces.find(w => w.id === registry.activeWorkspaceId)

    if (!workspace) {
      // Fallback to first workspace if active not found
      console.warn(`Active workspace ${registry.activeWorkspaceId} not found, falling back to first workspace`)
      return registry.workspaces[0]
    }

    return workspace
  }

  /** Get active workspace ID */
  getActiveWorkspaceId(): string {
    return this.getActiveWorkspace().id
  }

  /** Set active workspace */
  setActiveWorkspace(id: string): void {
    const registry = this.loadRegistry()

    const workspace = registry.workspaces.find(w => w.id === id)
    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`)
    }

    registry.activeWorkspaceId = id
    workspace.lastAccessedAt = new Date().toISOString()
    this.saveRegistry()

    console.log(`✓ Switched to workspace: ${workspace.name}`)
  }

  /** Resolve workspace path by ID */
  resolveWorkspacePath(workspaceId: string): string {
    const workspace = this.getWorkspace(workspaceId)
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }
    return workspace.path
  }

  /** Validate workspace path exists and is a directory */
  validateWorkspacePath(workspacePath: string): boolean {
    try {
      const stats = fs.statSync(workspacePath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Run a function in the context of a specific workspace without persisting
   * an active-workspace switch to disk.
   */
  async withWorkspace<T>(id: string, fn: () => T | Promise<T>): Promise<T> {
    const registry = this.loadRegistry()
    const workspace = registry.workspaces.find(w => w.id === id)
    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`)
    }
    return await workspaceContext.run({ workspaceId: id }, fn)
  }

  /** Initialize workspace directory structure (AGENTS/, ORG/, SYSTEM/) */
  initializeWorkspaceStructure(workspacePath: string): void {
    try {
      // Create main workspace directory
      fs.mkdirSync(workspacePath, { recursive: true })

      // Create subdirectories
      fs.mkdirSync(path.join(workspacePath, 'AGENTS'), { recursive: true })
      fs.mkdirSync(path.join(workspacePath, 'AGENTS', 'archive'), { recursive: true })
      fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
      fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })

      // Create basic ORG files
      const communitiesPath = path.join(workspacePath, 'ORG', 'COMMUNITIES.md')
      if (!fs.existsSync(communitiesPath)) {
        fs.writeFileSync(communitiesPath, '# Communities\n\n## Communities\n\n', 'utf-8')
      }

      const groupsPath = path.join(workspacePath, 'ORG', 'GROUPS.md')
      if (!fs.existsSync(groupsPath)) {
        fs.writeFileSync(groupsPath, '# Groups\n\n## Groups\n\n', 'utf-8')
      }

      console.log(`✓ Initialized workspace structure at ${workspacePath}`)
    } catch (err) {
      console.error('Failed to initialize workspace structure:', err)
      throw err
    }
  }

  /** Allow reusing an existing directory only when it is just the default empty workspace scaffold. */
  private isReusableWorkspaceScaffold(workspacePath: string): boolean {
    const entries = fs.readdirSync(workspacePath).filter((entry) => entry !== '.DS_Store')
    if (entries.length === 0) return true

    const allowedTopLevel = new Set(['AGENTS', 'ORG', 'SYSTEM'])
    if (!entries.every((entry) => allowedTopLevel.has(entry))) return false

    const agentsDir = path.join(workspacePath, 'AGENTS')
    if (fs.existsSync(agentsDir)) {
      const agentEntries = fs.readdirSync(agentsDir).filter((entry) => entry !== '.DS_Store')
      if (agentEntries.some((entry) => entry !== 'archive')) return false

      const archiveDir = path.join(agentsDir, 'archive')
      if (fs.existsSync(archiveDir)) {
        const archiveEntries = fs.readdirSync(archiveDir).filter((entry) => entry !== '.DS_Store')
        if (archiveEntries.length > 0) return false
      }
    }

    const orgDir = path.join(workspacePath, 'ORG')
    if (fs.existsSync(orgDir)) {
      const orgEntries = fs.readdirSync(orgDir).filter((entry) => entry !== '.DS_Store')
      const allowedOrgEntries = new Set(['COMMUNITIES.md', 'GROUPS.md'])
      if (!orgEntries.every((entry) => allowedOrgEntries.has(entry))) return false

      const communitiesPath = path.join(orgDir, 'COMMUNITIES.md')
      if (fs.existsSync(communitiesPath)) {
        const content = fs.readFileSync(communitiesPath, 'utf-8').trim()
        if (content !== '# Communities\n\n## Communities' && content !== '# Communities\n\n## Communities\n') return false
      }

      const groupsPath = path.join(orgDir, 'GROUPS.md')
      if (fs.existsSync(groupsPath)) {
        const content = fs.readFileSync(groupsPath, 'utf-8').trim()
        if (content !== '# Groups\n\n## Groups' && content !== '# Groups\n\n## Groups\n') return false
      }
    }

    const systemDir = path.join(workspacePath, 'SYSTEM')
    if (fs.existsSync(systemDir)) {
      const systemEntries = fs.readdirSync(systemDir).filter((entry) => entry !== '.DS_Store')
      if (systemEntries.length > 0) return false
    }

    return true
  }

  /** Update workspace metadata (name, agent count, last accessed, color, tags, etc.) */
  updateWorkspaceMetadata(id: string, updates: Partial<Pick<Workspace, 'name' | 'agentCount' | 'lastAccessedAt' | 'color' | 'tags'>>): void {
    const registry = this.loadRegistry()
    const workspace = registry.workspaces.find(w => w.id === id)

    if (!workspace) {
      throw new Error(`Workspace not found: ${id}`)
    }

    console.log('updateWorkspaceMetadata - Before update:', { id, currentName: workspace.name, updates })
    Object.assign(workspace, updates)
    console.log('updateWorkspaceMetadata - After update:', { id, newName: workspace.name })
    this.saveRegistry()
    console.log('updateWorkspaceMetadata - Registry saved')
  }
}

// Singleton instance
let workspaceManagerInstance: WorkspaceManager | null = null

export function getWorkspaceManager(): WorkspaceManager {
  if (!workspaceManagerInstance) {
    workspaceManagerInstance = new WorkspaceManager()
  }
  return workspaceManagerInstance
}

export function resetWorkspaceManagerForTests() {
  workspaceManagerInstance = null
}
