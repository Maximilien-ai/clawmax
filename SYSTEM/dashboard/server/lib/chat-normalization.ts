const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[A-Za-z]/g
const BRACKET_ANSI_RE = /\[[0-9;]*m/g

function stripAnsi(content: string): string {
  return content.replace(ANSI_ESCAPE_RE, '').replace(BRACKET_ANSI_RE, '')
}

function extractPayloadText(value: unknown): string | null {
  if (!value) return null

  if (Array.isArray(value)) {
    const payloadText = value
      .map(item => extractPayloadText(item))
      .filter((item): item is string => !!item && item.trim().length > 0)
      .join('\n\n')
      .trim()
    return payloadText || null
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>

    if (typeof record.content === 'string' && typeof record.from === 'string') {
      return record.content
    }

    if (Array.isArray(record.payloads)) {
      const payloadText = record.payloads
        .map((payload) => {
          if (typeof payload === 'string') return payload
          if (payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).text === 'string') {
            return (payload as Record<string, unknown>).text as string
          }
          return ''
        })
        .filter(Boolean)
        .join('\n\n')
        .trim()
      if (payloadText) return payloadText
    }

    if (record.result) {
      return extractPayloadText(record.result)
    }
  }

  return null
}

function extractStructuredText(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed) return null
  if (!((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}')))) {
    return null
  }

  try {
    return extractPayloadText(JSON.parse(trimmed))
  } catch {
    return null
  }
}

function isRuntimeStatusLine(trimmed: string): boolean {
  return /^(🕒|🧠|🔑|🧮|📚|🧹|🧵|⚙️|🪢)\s/.test(trimmed)
}

function isToolArtifactLine(trimmed: string): boolean {
  return (
    trimmed === '(processing...)' ||
    trimmed === 'Files:' ||
    /^total\s+\d+/.test(trimmed) ||
    /^[drwx-]{10}\s/.test(trimmed) ||
    /^-rw[rx-]{7}\s/.test(trimmed) ||
    /^[A-Za-z0-9_.-]+\.(md|txt|json|csv|pdf|html|yml|yaml)$/.test(trimmed) ||
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ||
    trimmed === 'No notes yet.'
  )
}

export function normalizeChatMessage(content: string): string {
  if (!content) return content

  const withoutAnsi = stripAnsi(content)
  const structured = extractStructuredText(withoutAnsi)
  if (structured) return structured.trim()

  const lines = withoutAnsi.split('\n')
  const cleanedLines: string[] = []
  let braceDepth = 0
  let bracketDepth = 0
  let skippingArtifactBlock = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (braceDepth > 0 || bracketDepth > 0) {
      for (const ch of trimmed) {
        if (ch === '{') braceDepth++
        else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1)
        else if (ch === '[') bracketDepth++
        else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)
      }
      continue
    }

    if (trimmed === '{' || trimmed.startsWith('{') || trimmed.startsWith('[')) {
      braceDepth += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length
      bracketDepth += (trimmed.match(/\[/g) || []).length - (trimmed.match(/\]/g) || []).length
      continue
    }

    if (!trimmed) {
      skippingArtifactBlock = false
      cleanedLines.push('')
      continue
    }

    if (
      isRuntimeStatusLine(trimmed) ||
      trimmed.startsWith('🦞 OpenClaw') ||
      /^(Usage|Options|Commands|Examples|Docs|Available fields|Unknown JSON|GraphQL|\(Command exited|Command still|Process exited|Successfully wrote|store:)/.test(trimmed) ||
      /\{"type"\s*:\s*"/.test(trimmed) ||
      /^\d{1,2}:\d{2}:\d{2}\s*(AM|PM)?\s*$/.test(trimmed) ||
      /^[}\]],?\s*$/.test(trimmed)
    ) {
      continue
    }

    if (isToolArtifactLine(trimmed)) {
      skippingArtifactBlock = true
      continue
    }

    if (skippingArtifactBlock) {
      continue
    }

    cleanedLines.push(line)
  }

  const normalized = cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return normalized || withoutAnsi.trim() || content.trim()
}
