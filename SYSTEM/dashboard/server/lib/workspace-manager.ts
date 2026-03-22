import fs from 'fs'
import path from 'path'

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

  /** List all workspaces */
  listWorkspaces(): Workspace[] {
    const registry = this.loadRegistry()
    return registry.workspaces
  }

  /** Get workspace by ID */
  getWorkspace(id: string): Workspace | null {
    const registry = this.loadRegistry()
    return registry.workspaces.find(w => w.id === id) || null
  }

  /** Create a new workspace */
  createWorkspace(name: string, workspacePath: string, options?: { color?: string; tags?: string[] }): Workspace {
    const registry = this.loadRegistry()

    // Validate path doesn't already exist
    if (registry.workspaces.some(w => w.path === workspacePath)) {
      throw new Error(`Workspace path already exists: ${workspacePath}`)
    }

    // Generate ID from name (lowercase, remove spaces, ensure uniqueness)
    let baseId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/--+/g, '-')
    let id = baseId
    let counter = 1
    while (registry.workspaces.some(w => w.id === id)) {
      id = `${baseId}-${counter}`
      counter++
    }

    // Create workspace directories
    this.initializeWorkspaceStructure(workspacePath)

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
    const workspace = registry.workspaces.find(w => w.id === registry.activeWorkspaceId)

    if (!workspace) {
      // Fallback to first workspace if active not found
      console.warn(`Active workspace ${registry.activeWorkspaceId} not found, falling back to first workspace`)
      return registry.workspaces[0]
    }

    return workspace
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

export function resetWorkspaceManagerForTests(): void {
  workspaceManagerInstance = null
}
