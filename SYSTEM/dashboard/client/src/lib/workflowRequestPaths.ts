import { buildWorkspaceScopedPath } from './workspaceScope'

export function buildWorkflowsCollectionPath(workspaceId?: string | null): string {
  return buildWorkspaceScopedPath('/api/workflows', workspaceId || '')
}

export function buildWorkflowDocsIndexPath(workspaceId?: string | null): string {
  return buildWorkspaceScopedPath('/api/docs', workspaceId || '')
}
