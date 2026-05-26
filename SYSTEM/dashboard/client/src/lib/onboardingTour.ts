export const WORKSPACE_TOUR_VERSION = 1

export type WorkspaceTourState = 'completed' | 'dismissed'

export function getWorkspaceTourStorageKey(workspaceKey: string) {
  return `clawmax-workspace-tour:${workspaceKey}:v${WORKSPACE_TOUR_VERSION}`
}

export function readWorkspaceTourState(workspaceKey: string): WorkspaceTourState | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(getWorkspaceTourStorageKey(workspaceKey))
  if (value === 'completed' || value === 'dismissed') return value
  return null
}

export function writeWorkspaceTourState(workspaceKey: string, state: WorkspaceTourState) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(getWorkspaceTourStorageKey(workspaceKey), state)
}

export function shouldShowWorkspaceTour({
  workspaceKey,
  workspaceAgentCount,
  onboardingVisible,
  storedState,
}: {
  workspaceKey?: string | null
  workspaceAgentCount?: number | null
  onboardingVisible: boolean
  storedState?: WorkspaceTourState | null
}) {
  if (!workspaceKey) return false
  if (!onboardingVisible) return false
  if ((workspaceAgentCount ?? 0) > 0) return false
  return storedState !== 'completed' && storedState !== 'dismissed'
}
