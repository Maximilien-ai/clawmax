export type BuilderMentionMatch = {
  start: number
  end: number
  query: string
}

export function findActiveBuilderMention(text: string, cursorPosition: number): BuilderMentionMatch | null {
  const safeCursor = Math.max(0, Math.min(cursorPosition, text.length))
  const beforeCursor = text.slice(0, safeCursor)
  const atIndex = beforeCursor.lastIndexOf('@')
  if (atIndex === -1) return null

  const prefix = beforeCursor.slice(0, atIndex)
  if (prefix && !/[\s([{/,-]$/.test(prefix)) return null

  const query = beforeCursor.slice(atIndex + 1)
  if (/\s/.test(query) || query.includes('\n')) return null

  return {
    start: atIndex,
    end: safeCursor,
    query,
  }
}

export function insertBuilderMention(text: string, mention: BuilderMentionMatch, agentLabel: string): string {
  const normalized = agentLabel.trim().replace(/^@+/, '')
  const suffix = text.slice(mention.end)
  const separator = suffix.startsWith(' ') || suffix.length === 0 ? '' : ' '
  return `${text.slice(0, mention.start)}@${normalized}${separator}${suffix}`
}
