export function filterWorkspaces<T extends { id: string; name: string }>(workspaces: T[], query: string): T[] {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return workspaces
  return workspaces.filter(workspace => `${workspace.name} ${workspace.id}`.toLocaleLowerCase().includes(term))
}
