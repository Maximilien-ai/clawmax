import path from 'path'
import { getWorkspaceManager, type Workspace } from './workspace-manager'
import { listWorkspaceDashboards } from './workspace-dashboards'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'

export interface WorkspaceExportManifest {
  version: string
  exportedAt: string
  workspace: {
    id: string
    name: string
    path: string
    createdAt: string
    lastAccessedAt: string
    color?: string
    tags?: string[]
  }
  includes: string[]
  dashboards: {
    count: number
  }
  integrations: {
    preferredModel?: string
    githubDefaultRepo?: string
    sensoContextLabel?: string
    ollamaBaseUrl?: string
    ollamaDefaultModel?: string
    opikWorkspace?: string
    opikProject?: string
    updatedAt?: string
  }
  notes: string[]
}

export function sanitizeWorkspaceExportName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'workspace'
}

export async function buildWorkspaceExportManifest(workspaceId: string): Promise<WorkspaceExportManifest> {
  const workspaceManager = getWorkspaceManager()
  const workspace = workspaceManager.getWorkspace(workspaceId)
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`)
  }

  return workspaceManager.withWorkspace(workspaceId, async () => {
    const integrations = readWorkspaceIntegrationConfig()
    const dashboards = listWorkspaceDashboards(workspaceId)

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      workspace: {
        id: workspace.id,
        name: workspace.name,
        path: workspace.path,
        createdAt: workspace.createdAt,
        lastAccessedAt: workspace.lastAccessedAt,
        color: workspace.color,
        tags: workspace.tags,
      },
      includes: [
        'workspace directory contents',
        'workspace dashboards',
        'workspace integration defaults (non-secret)',
        'export manifest',
      ],
      dashboards: {
        count: dashboards.length,
      },
      integrations,
      notes: [
        'Browser-local secrets are not included in workspace exports.',
        'Server .env secrets are not included in workspace exports.',
        'Import/restore is not implemented yet; keep this archive for manual recovery until import is added.',
      ],
    }
  })
}

export function getWorkspaceExportFileName(workspace: Workspace): string {
  const slug = sanitizeWorkspaceExportName(workspace.name || workspace.id)
  const date = new Date().toISOString().slice(0, 10)
  return `${slug}-${date}.zip`
}

export function getWorkspaceExportRootName(workspace: Workspace): string {
  return sanitizeWorkspaceExportName(workspace.name || workspace.id)
}
