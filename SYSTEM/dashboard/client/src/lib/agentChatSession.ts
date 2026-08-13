export function buildPersistentDashboardChatSessionId(agentId: string): string {
  return `agent:${agentId}:dashboard-chat`
}

export function resolveDashboardChatSessionId(
  currentSessionId: string,
  event: { type?: string; data?: { resumeSessionId?: unknown } } | null | undefined,
): string {
  const nextSessionId = event?.type === 'start' ? event.data?.resumeSessionId : undefined
  return typeof nextSessionId === 'string' && nextSessionId.trim()
    ? nextSessionId.trim()
    : currentSessionId
}
