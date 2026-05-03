export interface AgentLabelOption {
  id: string
  name?: string
}

export function formatAgentOptionLabel(agent: AgentLabelOption): string {
  const displayName = `${agent.name || ''}`.trim()
  if (!displayName || displayName === agent.id) {
    return agent.id
  }
  return `${displayName} (${agent.id})`
}

