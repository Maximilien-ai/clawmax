export function getAgentWorkspaceLoadKey(workspaceId?: string | null): string {
  return (workspaceId || '').trim() || 'default'
}

export function shouldFetchAgentsForWorkspace(input: {
  isActive: boolean
  workspaceKey: string
  lastLoadedWorkspaceKey: string | null
  lastFetchStartedAtMs: number
  nowMs: number
  cooldownMs?: number
}): boolean {
  if (!input.isActive) return false
  if (input.lastLoadedWorkspaceKey !== input.workspaceKey) return true
  const cooldownMs = input.cooldownMs ?? 5000
  return input.nowMs - input.lastFetchStartedAtMs >= cooldownMs
}
