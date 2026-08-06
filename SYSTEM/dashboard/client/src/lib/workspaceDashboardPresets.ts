export type DashboardSection = 'overview' | 'costs' | 'agents' | 'notifications' | 'workflows' | 'kickoff' | 'results' | 'groupChats' | 'interactions'

export interface WorkspaceDashboardPreset {
  title: string
  description: string
  sections: Record<DashboardSection, boolean>
  order: DashboardSection[]
}

const all = (overrides: Partial<Record<DashboardSection, boolean>> = {}): Record<DashboardSection, boolean> => ({
  overview: true, costs: true, agents: true, notifications: true, workflows: true, kickoff: true, results: true, groupChats: true, interactions: false, ...overrides,
})

export const WORKSPACE_DASHBOARD_PRESETS: Record<'operations' | 'costs' | 'communications', WorkspaceDashboardPreset> = {
  operations: { title: 'Operations Pulse', description: 'Agents, workflows, alerts, and recent results.', sections: all({ costs: false, kickoff: false, groupChats: false, interactions: true }), order: ['overview', 'agents', 'notifications', 'workflows', 'results', 'interactions', 'costs', 'kickoff', 'groupChats'] },
  costs: { title: 'Cost & Reliability', description: 'Budget, model activity, workflow execution, and alerts.', sections: all({ kickoff: false, groupChats: false }), order: ['overview', 'costs', 'agents', 'workflows', 'notifications', 'results', 'kickoff', 'groupChats', 'interactions'] },
  communications: { title: 'Communication Desk', description: 'Agent status, shared group activity, and direct interaction.', sections: all({ costs: false, workflows: false, kickoff: false, results: false, interactions: true }), order: ['overview', 'agents', 'groupChats', 'interactions', 'notifications', 'costs', 'workflows', 'kickoff', 'results'] },
}
