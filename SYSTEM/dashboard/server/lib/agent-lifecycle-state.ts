const deletingAgents = new Set<string>()

export function beginAgentDeletion(agentId: string): boolean {
  if (deletingAgents.has(agentId)) return false
  deletingAgents.add(agentId)
  return true
}

export function finishAgentDeletion(agentId: string): void {
  deletingAgents.delete(agentId)
}

export function isAgentDeletionInProgress(agentId: string): boolean {
  return deletingAgents.has(agentId)
}
