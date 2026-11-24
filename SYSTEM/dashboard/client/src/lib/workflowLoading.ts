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

export function workflowCollectionState(workflows: Array<{ id: string; status?: string }>) {
  const running = new Set<string>()
  const statuses: Record<string, 'running' | 'completed' | 'paused' | 'failed'> = {}
  for (const { id, status } of workflows) {
    if (status === 'running') running.add(id)
    if (status === 'running' || status === 'completed' || status === 'paused' || status === 'failed') statuses[id] = status
  }
  return { statuses, running }
}
