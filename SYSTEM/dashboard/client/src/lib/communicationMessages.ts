type ComparableMessage = {
  id: string
  from: string
  content: string
  timestamp: number
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
