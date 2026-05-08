type ComparableMessage = {
  id: string
  from: string
  content: string
  timestamp: number
}

export function mergeTypingAgents(
  pendingReplyAgents: Set<string>,
  activeWorkflowAgents: Set<string>
): Set<string> {
  return new Set([...pendingReplyAgents, ...activeWorkflowAgents])
}

export function removeRespondedAgentsFromPending(
  pendingReplyAgents: Set<string>,
  newMessages: ComparableMessage[],
  previousMessageCount: number
): Set<string> {
  if (pendingReplyAgents.size === 0 || newMessages.length <= previousMessageCount) {
    return pendingReplyAgents
  }

  const nextPending = new Set(pendingReplyAgents)
  const latestMessages = newMessages.slice(previousMessageCount)
  for (const message of latestMessages) {
    if (message.from && message.from !== 'User') {
      nextPending.delete(message.from)
    }
  }
  return nextPending
}

export function buildCommunicationCacheKey(type: 'community' | 'group', name: string): string {
  return `${type}:${name}`
}

export function shouldUpdateChannelMessages(
  previousMessages: ComparableMessage[],
  nextMessages: ComparableMessage[]
): boolean {
  if (previousMessages.length !== nextMessages.length) {
    return true
  }

  for (let index = 0; index < previousMessages.length; index += 1) {
    const previous = previousMessages[index]
    const next = nextMessages[index]
    if (
      previous.id !== next.id ||
      previous.from !== next.from ||
      previous.content !== next.content ||
      previous.timestamp !== next.timestamp
    ) {
      return true
    }
  }

  return false
}
