export function buildPersistentDashboardChatSessionId(agentId: string): string {
  return `agent:${agentId}:dashboard-chat`
}
