export function getWorkflowWorkspaceLoadKey(workspaceId?: string | null): string {
  return (workspaceId || '').trim() || 'default'
}

export function shouldFetchWorkflowsForWorkspace(input: {
  isActive: boolean
  workspaceKey: string
  lastLoadedWorkspaceKey: string | null
  rateLimitedUntilMs: number
  nowMs: number
}): boolean {
  if (!input.isActive) return false
  if (input.nowMs < input.rateLimitedUntilMs) return false
  return input.lastLoadedWorkspaceKey !== input.workspaceKey
}

export function shouldRunInitialWorkflowPoll(input: {
  isActive: boolean
  workspaceKey: string
  lastLoadedWorkspaceKey: string | null
  lastFetchStartedAtMs: number
  rateLimitedUntilMs: number
  nowMs: number
  cooldownMs?: number
}): boolean {
  if (!input.isActive) return false
  if (input.nowMs < input.rateLimitedUntilMs) return false
  if (input.lastLoadedWorkspaceKey !== input.workspaceKey) return true
  const cooldownMs = input.cooldownMs ?? 5000
  return input.nowMs - input.lastFetchStartedAtMs >= cooldownMs
}
