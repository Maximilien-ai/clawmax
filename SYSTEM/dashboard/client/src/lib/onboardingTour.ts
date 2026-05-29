export const WORKSPACE_TOUR_VERSION = 1
export const GLOBAL_WORKSPACE_TOUR_DISABLE_KEY = `clawmax-workspace-tour:disable:v${WORKSPACE_TOUR_VERSION}`
const WORKSPACE_TOUR_KEY_PREFIX = 'clawmax-workspace-tour:'

export type WorkspaceTourState = 'completed' | 'dismissed'
export type WorkspaceTourStep = {
  id: string
  target: string | string[]
  title: string
  description: string
  page?: 'builder' | 'agents' | 'workflows' | 'communication' | 'organizations' | 'docs' | 'skills' | 'templates' | 'keys' | 'activity' | 'logs'
}

export const WORKSPACE_TOUR_STEPS: WorkspaceTourStep[] = [
  {
    id: 'workspace',
    target: '[data-tour="workspace-switcher"]',
    title: 'Workspaces live here',
    description: 'Create or switch workspaces here. Use separate workspaces when you want different agents, docs, and teams to stay isolated.',
  },
  {
    id: 'byok',
    target: '[data-tour="byok"]',
    title: 'Set BYOK before you build',
    description: 'Add your model keys here first. AI Builder, templates, and AI-assisted generation depend on this being configured cleanly.',
  },
  {
    id: 'notifications',
    target: '[data-tour="notifications"]',
    title: 'Watch for notifications here',
    description: 'This is where you will see alerts when agents are stuck, blocked, or anything needs your attention. Check here first when the system needs you.',
  },
  {
    id: 'builder',
    target: '[data-tour="nav-builder"]',
    title: 'Start with AI Builder',
    description: 'This is the fastest path for a new workspace. Tell Builder what you want, and it will route you toward agents, skills, workflows, or templates.',
    page: 'builder',
  },
  {
    id: 'agents',
    target: '[data-tour="nav-agents"]',
    title: 'Your agents show up here',
    description: 'Use Agents to inspect, edit, and chat with the roles you create. This is where single and teams of agents live after Builder or template setup.',
    page: 'agents',
  },
  {
    id: 'workflows',
    target: '[data-tour="nav-workflows"]',
    title: 'Workflows coordinate repeatable work',
    description: 'Use Workflows when an agent or team needs a recurring process, approvals, or handoffs instead of one-off chats.',
    page: 'workflows',
  },
  {
    id: 'communications',
    target: '[data-tour="nav-communication"]',
    title: 'Agent conversations happen here',
    description: 'Use Communications to watch agents chat and coordinate with each other. You can monitor the conversation and interject when needed.',
    page: 'communication',
  },
  {
    id: 'skills',
    target: '[data-tour="nav-skills"]',
    title: 'Skills extend what agents can do',
    description: 'Use Skills to add tools, integrations, and reusable capabilities. This is where you improve an existing agent before rebuilding from scratch.',
    page: 'skills',
  },
  {
    id: 'templates',
    target: '[data-tour="nav-templates"]',
    title: 'Templates save you from starting from scratch',
    description: 'Browse or refine templates here when you want a starter team, workspace structure, or prebuilt flow instead of building from zero.',
    page: 'templates',
  },
  {
    id: 'system',
    target: '[data-tour="nav-docs"]',
    title: 'System controls live down here',
    description: 'Use Documents for DocHub and agent/workflow files, Keys & Secrets for credentials, Activity & Budget for usage and cost tracking, and System & Logs when you need diagnostics or runtime details.',
  },
]

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
  if (state === 'dismissed') {
    window.localStorage.setItem(GLOBAL_WORKSPACE_TOUR_DISABLE_KEY, 'dismissed')
  }
}

export function clearWorkspaceTourState(workspaceKey: string) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(getWorkspaceTourStorageKey(workspaceKey))
}

export function clearAllWorkspaceTourStates() {
  if (typeof window === 'undefined') return
  const keysToRemove: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key) continue
    if (key.startsWith(WORKSPACE_TOUR_KEY_PREFIX) && key !== GLOBAL_WORKSPACE_TOUR_DISABLE_KEY) {
      keysToRemove.push(key)
    }
  }
  for (const key of keysToRemove) {
    window.localStorage.removeItem(key)
  }
}

export function clearGlobalWorkspaceTourDisabled() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(GLOBAL_WORKSPACE_TOUR_DISABLE_KEY)
}

export function resetWorkspaceTourState(workspaceKey: string) {
  if (typeof window === 'undefined') return
  clearWorkspaceTourState(workspaceKey)
  clearAllWorkspaceTourStates()
  clearGlobalWorkspaceTourDisabled()
}

export function readGlobalWorkspaceTourDisabled() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(GLOBAL_WORKSPACE_TOUR_DISABLE_KEY) === 'dismissed'
}

export function shouldShowWorkspaceTour({
  workspaceKey,
  workspaceAgentCount,
  onboardingVisible,
  storedState,
  globallyDisabled = false,
}: {
  workspaceKey?: string | null
  workspaceAgentCount?: number | null
  onboardingVisible: boolean
  storedState?: WorkspaceTourState | null
  globallyDisabled?: boolean
}) {
  if (!workspaceKey) return false
  if (!onboardingVisible) return false
  if ((workspaceAgentCount ?? 0) > 0) return false
  if (globallyDisabled) return false
  return storedState !== 'completed' && storedState !== 'dismissed'
}
