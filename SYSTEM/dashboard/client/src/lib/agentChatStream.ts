export const INCOMPLETE_AGENT_CHAT_MESSAGE = 'The connection to the agent ended before it finished replying. The text above may be incomplete — send the message again to retry.'

/**
 * The reply bubble after one `delta` event. Live Gateway output appends, but may also resend the
 * whole reply (`replace: true`) when the runtime rewrites text it already streamed.
 */
export function applyAgentChatDelta(current: string, delta: { text?: unknown; replace?: unknown } | null | undefined): string {
  const text = typeof delta?.text === 'string' ? delta.text : ''
  return delta?.replace === true ? text : current + text
}

export function markIncompleteAgentReply(content: string, message = INCOMPLETE_AGENT_CHAT_MESSAGE): string {
  const partial = content.trim()
  return partial ? `${partial}\n\n_${message}_` : message
}
