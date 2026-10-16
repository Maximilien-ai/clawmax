import { normalizeChatMessage } from '../../../server/lib/chat-normalization'

export interface AgentChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  id: string
  /** Sent or received by this tab and not yet confirmed by the persisted transcript. */
  pending?: boolean
  /** For a pending user message: the text the agent received, when it differs from what is shown. */
  sentContent?: string
  /** A reply bubble this tab filled with a failure summary instead of the agent's text. */
  failed?: boolean
}

/**
 * Validate a `GET /chat/messages` body. Throws on an error body instead of reading it as an empty
 * history: an unreadable transcript must never look like a conversation that does not exist.
 */
export function parseAgentChatHistory(data: unknown): AgentChatMessage[] {
  const record = data && typeof data === 'object' ? data as { messages?: unknown; error?: unknown } : null
  if (!record || !Array.isArray(record.messages)) {
    throw new Error(typeof record?.error === 'string' && record.error ? record.error : 'The server returned an unexpected chat history response')
  }
  return record.messages.flatMap((entry, index) => {
    const message = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {}
    if ((message.role !== 'user' && message.role !== 'assistant') || typeof message.content !== 'string') return []
    // Transcript events without a message timestamp fall back to the event's ISO timestamp.
    const timestamp = typeof message.timestamp === 'number'
      ? message.timestamp
      : typeof message.timestamp === 'string' ? Date.parse(message.timestamp) || 0 : 0
    // Transcript event ids are stable. Runtime transcripts have none; their history only ever grows
    // at the end, so position plus time is stable as well.
    const id = typeof message.id === 'string' && message.id ? message.id : `history-${index}-${timestamp}`
    return [{ id, role: message.role, content: message.content, timestamp }]
  })
}

/** Whether a transcript user message is the copy of this sent one. Exact text, never a substring:
 *  "ok" must not claim "okay, thanks" sent from another tab. */
function isRecordedCopy(saved: AgentChatMessage, sent: AgentChatMessage): boolean {
  if (saved.role !== 'user') return false
  const raw = (sent.sentContent ?? sent.content).trim()
  const text = saved.content.trim()
  // OpenClaw history is normalized on read; claude/droid runtime transcripts keep the raw prompt.
  return text === raw || text === normalizeChatMessage(raw).trim()
}

/**
 * Merge a history poll into what the panel shows.
 *
 * The persisted transcript is the record: every message it returns is shown as returned and in its
 * order, so the panel converges on exactly what a refresh or reopen will show. Messages this tab sent
 * that the transcript does not contain stay where they happened -- a slow write or a failed turn
 * must never make a just-sent message vanish or move -- while one it does contain is shown once, as
 * the transcript's copy.
 */
export function reconcileAgentChatHistory(local: AgentChatMessage[], server: AgentChatMessage[]): AgentChatMessage[] {
  const indexById = new Map(server.map((message, index) => [message.id, index] as const))

  // A pending message was recorded, if at all, after every transcript message this tab already
  // shows. Otherwise re-sending an identical prompt would match the earlier copy.
  let floor = 0
  for (const message of local) {
    const at = message.pending ? undefined : indexById.get(message.id)
    if (at !== undefined) floor = Math.max(floor, at + 1)
  }
  // Newest first: a transcript only grows at its end, so the latest send owns the latest copy.
  // Matching oldest-first let a failed, never-recorded attempt claim its resend's copy.
  const recordedAt = new Map<AgentChatMessage, number>()
  let ceiling = server.length
  for (let index = local.length - 1; index >= 0; index--) {
    const message = local[index]
    if (!message.pending || message.role !== 'user') continue
    for (let at = ceiling - 1; at >= floor; at--) {
      if (isRecordedCopy(server[at], message)) {
        recordedAt.set(message, at)
        ceiling = at
        break
      }
    }
  }

  // Anything still pending stays after the last message that preceded it locally and is in the
  // transcript, so a failed turn keeps its place instead of sinking below later ones.
  const keptAfter = new Map<number, AgentChatMessage[]>()
  let anchor = -1
  let question = -1 // transcript index of the recorded question the next local reply answers
  for (const message of local) {
    const at = message.pending ? recordedAt.get(message) : indexById.get(message.id)
    if (at !== undefined) {
      anchor = at
      question = message.pending ? at : -1
      continue
    }
    if (!message.pending) continue // dropped from the transcript (cleared elsewhere)
    if (message.role === 'assistant' && question >= 0) {
      // A local reply (streamed text or an error) gives way once the transcript records a reply to
      // its question; until then it stays directly after that question.
      const nextQuestion = server.findIndex((saved, index) => index > question && saved.role === 'user')
      const answered = server.slice(question + 1, nextQuestion < 0 ? undefined : nextQuestion).some((saved) => saved.role === 'assistant')
      if (answered) continue
    }
    question = -1
    keptAfter.set(anchor, [...(keptAfter.get(anchor) ?? []), message])
  }

  const merged = [...(keptAfter.get(-1) ?? []), ...server.flatMap((message, index) => [message, ...(keptAfter.get(index) ?? [])])]
  // Most polls change nothing. Returning the same array lets React skip the render, so nothing keyed
  // on the message list (scroll following among it) reacts to a poll that brought nothing new.
  // (Key order is fixed by parseAgentChatHistory and the send path, so equal conversations compare equal.)
  return JSON.stringify(merged) === JSON.stringify(local) ? local : merged
}
