export const CHAT_OUTPUT_TRUNCATION_MARKER = '\n\n… [output truncated] …\n\n'

export function appendBoundedOutput(buffer: string, chunk: string, limit: number): string {
  if (limit <= 0) return ''
  const next = buffer + chunk
  if (next.length <= limit) return next
  if (limit <= CHAT_OUTPUT_TRUNCATION_MARKER.length) return next.slice(-limit)
  const available = limit - CHAT_OUTPUT_TRUNCATION_MARKER.length
  const keepHead = Math.floor(available / 2)
  const keepTail = available - keepHead
  return `${next.slice(0, keepHead)}${CHAT_OUTPUT_TRUNCATION_MARKER}${next.slice(-keepTail)}`
}
