export const INCOMPLETE_AGENT_CHAT_MESSAGE = 'The connection to the agent ended before it finished replying. The text above may be incomplete — send the message again to retry.'

export function markIncompleteAgentReply(content: string, message = INCOMPLETE_AGENT_CHAT_MESSAGE): string {
  const partial = content.trim()
  return partial ? `${partial}\n\n_${message}_` : message
}
