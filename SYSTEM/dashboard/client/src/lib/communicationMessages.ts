type ComparableMessage = {
  id: string
  from: string
  content: string
  timestamp: number
}

type ComparableMember = {
  id: string
  name: string
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
  previousMessageCount: number,
  channelMembers: ComparableMember[] = []
): Set<string> {
  if (pendingReplyAgents.size === 0 || newMessages.length <= previousMessageCount) {
    return pendingReplyAgents
  }

  const nextPending = new Set(pendingReplyAgents)
  const latestMessages = newMessages.slice(previousMessageCount)
  for (const message of latestMessages) {
    if (message.from && message.from !== 'User') {
      const normalizedFrom = message.from.trim().toLowerCase()
      const matchingMember = channelMembers.find((member) =>
        member.id.trim().toLowerCase() === normalizedFrom
        || member.name.trim().toLowerCase() === normalizedFrom
      )
      if (matchingMember) {
        nextPending.delete(matchingMember.id)
      } else {
        nextPending.delete(message.from)
      }
    }
  }
  return nextPending
}

export function buildCommunicationCacheKey(type: 'community' | 'group', name: string): string {
  return `${type}:${name}`
}

export function resolveCommunicationDocPath(
  target: string,
  docEntries: Array<{ path: string }>
): string {
  if (!target || target.includes('/')) return target

  const exact = docEntries.find((entry) => entry.path === target)
  if (exact) return exact.path

  const matches = docEntries.filter((entry) => entry.path.endsWith(`/${target}`) || entry.path === target)
  if (matches.length === 1) return matches[0].path

  const preferred = matches.find((entry) => entry.path.startsWith('AGENTS/'))
    || matches.find((entry) => entry.path.startsWith('WORKFLOWS/'))
    || matches.find((entry) => entry.path.startsWith('ORG/'))
    || matches[0]

  return preferred?.path || target
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
