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

function isSuppressibleStructuredPayload(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 0) return false

  const searchMetadataKeys = ['results', 'provider', 'model', 'citations', 'mode']
  const sessionMetadataKeys = ['count', 'sessions']

  const matchesKeySet = (allowedKeys: string[]) => keys.every((key) => allowedKeys.includes(key))

  if (matchesKeySet(searchMetadataKeys) && Array.isArray(record.results)) {
    return true
  }

  if (matchesKeySet(sessionMetadataKeys) && Array.isArray(record.sessions)) {
    return true
  }

  return false
}

function extractStructuredText(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed) return null
  if (!((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}')))) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed)
    const payloadText = extractPayloadText(parsed)
    if (payloadText !== null) return payloadText
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      if (typeof record.status === 'string' && typeof record.message === 'string') {
        return record.message
      }
      if (typeof record.status === 'string' && typeof record.action === 'string') {
        return `Performed action: ${record.action}`
      }
    }
    if (isSuppressibleStructuredPayload(parsed)) return ''
    return null
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

function isBenignPluginRuntimeWarningLine(trimmed: string): boolean {
  if (trimmed === 'plugin runtime config.loadConfig() is deprecated (runtime-config-load-write); use config.current().') return true
  if (/\bplugins\.(?:allow|deny):\s*plugin not found:/i.test(trimmed)) return true
  if (/\bplugin not found:\s*[^\s)]+/i.test(trimmed) && /(?:stale config entry|remove it from plugins config)/i.test(trimmed)) return true
  if (/\b(?:plugin|runtime)\s+(?:config|load|startup)\s+(?:warning|error)\b/i.test(trimmed)) return true
  if (/^\s*[|│].*(?:plugins\.(?:allow|deny)|plugin not found|stale config entry|deprecated).*[|│]\s*$/i.test(trimmed)) return true
  if (/^\s*[|│].*ignored;\s*remove it from plugins config\)?.*[|│]\s*$/i.test(trimmed)) return true
  if (/^\[provider-transport-fetch\]\s+\[model-fetch\]\s+(start|response)\s+provider=/i.test(trimmed)) return true
  if (/\[plugins\]\s+plugins\.allow is empty; discovered non-bundled plugins may auto-load:/i.test(trimmed)) return true
  if (/discovered non-bundled plugins may auto-load:/i.test(trimmed)) return true
  if (/to trust them explicitly, set plugins\.allow/i.test(trimmed)) return true
  if (/run 'openclaw plugins list --enabled --verbose'/i.test(trimmed)) return true
  return false
}

function isDoctorWarningLine(trimmed: string): boolean {
  if (!trimmed) return false
  if (/doctor warnings/i.test(trimmed)) return true
  if (/config warnings/i.test(trimmed)) return true
  if (/plugins\.allow:\s*plugin not found:/i.test(trimmed)) return true
  if (/stale config entry ignored; remove it from plugins config/i.test(trimmed)) return true
  if (/^\s*[|│].*ignored;\s*remove it from plugins config\)?.*[|│]\s*$/i.test(trimmed)) return true
  if (/clawmax_no_non_bundled_plugins/i.test(trimmed)) return true
  if (/left legacy config health state in place because/i.test(trimmed)) return true
  if (/left migrated task registry sidecar in place because/i.test(trimmed)) return true
  if (/left legacy update-check state in place because/i.test(trimmed)) return true
  if (/config-health\.json/i.test(trimmed)) return true
  if (/runs\.sqlite\.migrated/i.test(trimmed)) return true
  if (/update-check\.json/i.test(trimmed)) return true
  if (/legacy state migration warnings:/i.test(trimmed)) return true
  if (/shared sqlite state/i.test(trimmed)) return true
  if (/^[\s|│┌┐└┘├┤┬┴┼─━═╭╮╰╯]+$/.test(trimmed)) return true
  return false
}

export function stripBenignChatRuntimeWarnings(content: string): string {
  if (!content) return content
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !isBenignPluginRuntimeWarningLine(trimmed) && !isDoctorWarningLine(trimmed)
    })
    .join('\n')
}

/**
 * Line-buffered warning filter for a live stream.
 *
 * `stripBenignChatRuntimeWarnings` matches whole lines, but a stream arrives in arbitrary chunks: a
 * boxed CLI warning routinely lands split across two of them, and neither half matches the line
 * patterns, so both are forwarded. Observed in chat as a bare
 * `│ ignored; remove it from plugins config) │` rendered as the agent's entire reply -- the real
 * answer had been filtered out of the final text, so the client fell back to the streamed fragments.
 *
 * So: only ever hand complete lines to the filter, and hold the incomplete tail until its newline
 * arrives. Newlines are preserved by slicing rather than split/join, because a filter that drops a
 * separator silently joins a paragraph to the table that followed it.
 *
 * Every incomplete line is held, not just ones that look like a warning. An earlier version buffered
 * only lines starting with a box-drawing character, on the theory that prose should never be
 * delayed -- but that let every non-boxed warning through the moment it was split
 * (`plugin runtime config.loadConfig() is deprecated`, `[provider-transport-fetch] ...`), which is
 * the same bug in a narrower form. Correctness first: this is line-oriented CLI output, so the wait
 * is bounded by the next newline.
 */
const MAX_HELD_LINE_CHARS = 8192

export function createStreamingWarningFilter(): {
  push: (chunk: string) => string
  flush: () => string
} {
  let carry = ''
  return {
    push(chunk: string): string {
      carry += chunk
      const lastNewline = carry.lastIndexOf('\n')
      if (lastNewline < 0) {
        // No complete line yet. Release an absurdly long unterminated line rather than growing the
        // buffer without bound: re-scanning it on every chunk is quadratic, and no benign warning
        // is anywhere near this length, so holding it buys nothing.
        if (carry.length > MAX_HELD_LINE_CHARS) {
          const released = carry
          carry = ''
          return released
        }
        return ''
      }
      const complete = carry.slice(0, lastNewline + 1)
      carry = carry.slice(lastNewline + 1)
      return stripBenignChatRuntimeWarnings(complete)
    },
    /**
     * Emit whatever is still held, filtered. Must be called when the stream ends: a runtime that
     * does not terminate its final line would otherwise have that line dropped entirely.
     */
    flush(): string {
      if (!carry) return ''
      const remaining = stripBenignChatRuntimeWarnings(carry)
      carry = ''
      return remaining
    },
  }
}

export function normalizeChatMessage(content: string): string {
  if (!content) return content

  const withoutAnsi = stripBenignChatRuntimeWarnings(stripAnsi(content))
  const structured = extractStructuredText(withoutAnsi)
  if (structured !== null) return structured.trim()

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
      isBenignPluginRuntimeWarningLine(trimmed) ||
      isDoctorWarningLine(trimmed) ||
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
  // If the runtime emitted only diagnostics, return empty so the route can
  // recover the real assistant reply from the persisted session. Re-emitting
  // the raw input here turns filtered warnings back into chat content.
  return normalized
}
