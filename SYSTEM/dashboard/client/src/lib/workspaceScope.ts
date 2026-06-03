export function buildWorkspaceScopedPath(path: string, workspaceId?: string | null): string {
  if (!workspaceId) {
    return path
  }

  const url = new URL(path, 'http://localhost')
  url.searchParams.set('workspaceId', workspaceId)
  return `${url.pathname}${url.search}${url.hash}`
}
