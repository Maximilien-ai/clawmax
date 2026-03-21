export interface OrderedWorkspace {
  id: string
}

export function applyWorkspaceOrder<T extends OrderedWorkspace>(workspaces: T[], savedOrder: string[]): T[] {
  if (savedOrder.length === 0) {
    return workspaces
  }

  const orderMap = new Map(savedOrder.map((id, index) => [id, index]))

  return [...workspaces].sort((a, b) => {
    const aIndex = orderMap.get(a.id)
    const bIndex = orderMap.get(b.id)

    if (aIndex === undefined && bIndex === undefined) return 0
    if (aIndex === undefined) return 1
    if (bIndex === undefined) return -1
    return aIndex - bIndex
  })
}

export function reorderWorkspaceList<T>(workspaces: T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= workspaces.length ||
    toIndex >= workspaces.length ||
    fromIndex === toIndex
  ) {
    return workspaces
  }

  const next = [...workspaces]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function serializeWorkspaceOrder<T extends OrderedWorkspace>(workspaces: T[]): string[] {
  return workspaces.map(workspace => workspace.id)
}
