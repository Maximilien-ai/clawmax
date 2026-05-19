export interface AgentListEntry {
  id: string
}

export function mergeAgentToFront<T extends AgentListEntry>(existing: T[], created: T): T[] {
  return [created, ...existing.filter(agent => agent.id !== created.id)]
}
