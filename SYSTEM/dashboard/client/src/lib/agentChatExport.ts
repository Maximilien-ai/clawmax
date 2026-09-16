export interface ExportChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number | string
}

// Best-effort credential redaction, not a guarantee that text is safe to share.
function redactCredentials(text: string): string {
  return text
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [REDACTED]')
    .replace(/\b(api[_-]?key|token|password|secret)\b(\s*[:=]\s*)([^\s,;]+)/gi, '$1$2[REDACTED]')
    .replace(/\b(sk|ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{12,}\b/g, '[REDACTED]')
}

export function buildAgentChatMarkdown(agentName: string, messages: ExportChatMessage[], now = new Date()) {
  const rows = messages.filter(message => message.content.trim())
  if (!rows.length) throw new Error('There are no messages to download.')
  const name = redactCredentials(agentName).replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]<>#])/g, '\\$1')
  const filenameName = agentName.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'agent'
  const body = rows.map(message => {
    const date = message.timestamp === undefined ? null : new Date(message.timestamp)
    const timestamp = date && Number.isFinite(date.getTime()) ? ` — ${date.toISOString()}` : ''
    return `## ${message.role === 'user' ? 'You' : name}${timestamp}\n\n${redactCredentials(message.content)}`
  }).join('\n\n---\n\n')
  return {
    filename: `${filenameName}-chat-${now.toISOString().slice(0, 10)}.md`,
    markdown: `# Conversation with ${name}\n\n> Local export of the currently loaded conversation. Common credential patterns are redacted; review before sharing.\n\n${body}\n`,
  }
}
