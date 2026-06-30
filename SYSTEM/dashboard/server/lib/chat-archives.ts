import fs from 'fs'

export function isArchiveSessionFile(filename: string): boolean {
  return filename.endsWith('.jsonl') && !filename.endsWith('.trajectory.jsonl') && filename !== 'sessions.json'
}

export function parseArchiveTimestamp(filename: string, fullPath: string): number {
  const suffixMatch = filename.match(/_(\d+)\.jsonl$/)
  if (suffixMatch) {
    const parsed = Number.parseInt(suffixMatch[1], 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  const prefixMatch = filename.match(/^(\d+)-.+\.jsonl$/)
  if (prefixMatch) {
    const parsed = Number.parseInt(prefixMatch[1], 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }

  try {
    const statTime = fs.statSync(fullPath).mtimeMs
    if (Number.isFinite(statTime) && statTime > 0) return statTime
  } catch {
    // fall through to Date.now()
  }

  return Date.now()
}

export function stripArchiveTitleNoise(text: string): string {
  return text
    .replace(/^Conversation context for this single-turn execution:\s*/i, '')
    .replace(/^Assigned skills for this turn:\s*/i, '')
    .replace(/^Latest user request:\s*/i, '')
    .replace(/^User:\s*/i, '')
    .replace(/^Assistant:\s*/i, '')
    .trim()
}

export function isMeaningfulArchiveTitleTurn(message: { role: 'user' | 'assistant'; content: string }): boolean {
  const content = message.content.trim()
  if (!content) return false
  if (/^Conversation context for this single-turn execution:/i.test(content)) return false
  if (/^Assigned skills for this turn:/i.test(content)) return false
  if (/^Latest user request:/i.test(content)) return false
  return true
}

export function getArchiveTitleMessages(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Array<{ role: 'user' | 'assistant'; content: string }> {
  const meaningful = messages
    .filter(isMeaningfulArchiveTitleTurn)
    .map((message) => ({
      role: message.role,
      content: stripArchiveTitleNoise(message.content),
    }))
    .filter((message) => message.content)

  return meaningful.length > 0 ? meaningful : messages
}

export function isUsableArchiveTitle(title: string | undefined): title is string {
  if (typeof title !== 'string') return false
  const normalized = stripArchiveTitleNoise(title)
  if (!normalized) return false
  if (/^empty conversation$/i.test(normalized)) return false
  return normalized === title.trim() || normalized.length > 0
}
