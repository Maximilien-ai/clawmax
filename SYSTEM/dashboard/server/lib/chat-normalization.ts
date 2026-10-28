const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*[A-Za-z]/g
// SGR codes whose ESC byte was lost upstream (`[33m`). Digits are required: a bare `[m` is far more
// often code (`items[m]`) than a reset.
const BRACKET_ANSI_RE = /\[\d+(?:;\d+)*m/g
const FENCE_RE = /^\s*(`{3,}|~{3,})(.*)$/
const BARE_FILE_NAME_RE = /^[A-Za-z0-9_.-]+\.(md|txt|json|csv|pdf|html|yml|yaml)$/
const MAX_JSON_BLOCK_LINES = 500

/**
 * Tracks Markdown fenced code blocks, one line at a time, returning true for a fence delimiter or a
 * line inside a fence. Fenced text is the agent's own content -- JSON examples, diagrams, logs it
 * was asked to show -- so no runtime-noise filter may touch it. Every filter below once did: a
 * fenced JSON example lost every line, and an ASCII diagram lost every `|`.
 */
export function createFenceTracker(): (line: string) => boolean {
  let openFence: string | null = null
  return (line) => {
    const match = FENCE_RE.exec(line)
    if (openFence) {
      if (match && match[1][0] === openFence[0] && match[1].length >= openFence.length && !match[2].trim()) openFence = null
      return true
    }
    // A backtick fence's info string cannot contain a backtick: ```js``` on one line is inline code.
    if (match && !(match[1][0] === '`' && match[2].includes('`'))) {
      openFence = match[1]
      return true
    }
    return false
  }
}

function stripAnsi(content: string): string {
  const isFenced = createFenceTracker()
  return content
    .replace(ANSI_ESCAPE_RE, '')
    .split('\n')
    // Inline code (odd split parts) is content too: `matrix[1m]` must survive.
    .map((line) => (isFenced(line) ? line : line.split(/(`[^`]*`)/).map((part, index) => (index % 2 ? part : part.replace(BRACKET_ANSI_RE, ''))).join('')))
    .join('\n')
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

/**
 * Starts a block of echoed tool output (a directory listing, a memory lookup) that runs to the next
 * blank line. A bare file name alone is not one: an agent naming the files it created writes exactly
 * that. It is dropped only inside a block, e.g. under a `Files:` heading that lists bare names.
 */
function isToolArtifactLine(trimmed: string, nextNonEmptyLine: string | undefined): boolean {
  return (
    trimmed === '(processing...)' ||
    (trimmed === 'Files:' && BARE_FILE_NAME_RE.test(nextNonEmptyLine?.trim() || '')) ||
    /^total\s+\d+/.test(trimmed) ||
    /^[drwx-]{10}\s/.test(trimmed) ||
    /^-rw[rx-]{7}\s/.test(trimmed) ||
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ||
    trimmed === 'No notes yet.'
  )
}

// Lines the OpenClaw CLI or an echoed tool writes, matched by their exact shape: a bare word such as
// "Usage" or "Examples" also opens ordinary prose and Markdown labels.
function isCliOutputLine(trimmed: string): boolean {
  return /^(Usage: openclaw\b|Docs: https?:\/\/docs\.openclaw\.ai|Available fields:|Unknown JSON field|GraphQL: |\(Command exited|Command still|Process exited|Successfully wrote|store:)/.test(trimmed)
}

// Transcript content-block and tool-call types (OpenClaw, OpenAI, Anthropic spellings).
const RUNTIME_BLOCK_TYPES = new Set([
  'function', 'function_call', 'tool_call', 'toolCall', 'tool_use', 'toolUse',
  'tool_result', 'toolResult', 'text', 'thinking', 'redacted_thinking',
])

/**
 * A runtime structure printed as text: a tool call from a model without native tool calling
 * (`{"name": "read", "arguments": {}}`), or a transcript content block (or array of blocks).
 */
function isRuntimeBlockPayload(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0 && value.every(isRuntimeBlockPayload)
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  if (typeof record.type === 'string' && RUNTIME_BLOCK_TYPES.has(record.type)) return true
  return typeof record.name === 'string'
    && ('arguments' in record || 'parameters' in record)
    && Object.keys(record).every((key) => ['id', 'type', 'name', 'arguments', 'parameters'].includes(key))
}

/**
 * Runtime JSON is dropped only when it parses and has a known runtime shape. Anything else that
 * merely looks like JSON -- a request body the user asked for, a Markdown link or task list opening
 * with `[` -- is the agent's content and stays.
 */
function isRuntimeJsonBlock(text: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return false
  }
  return isSuppressibleStructuredPayload(parsed) || isRuntimeBlockPayload(parsed)
}

/** Index of the line that balances the `{`/`[` opened at `start`, or -1 if it does not balance. */
function findBalancedBlockEnd(lines: string[], start: number): number {
  let depth = 0
  const last = Math.min(lines.length, start + MAX_JSON_BLOCK_LINES) - 1
  for (let index = start; index <= last; index++) {
    const line = lines[index]
    // Pretty-printed JSON has no blank lines and no fences; stopping there keeps a stray bracket in
    // prose from swallowing what follows.
    if (index > start && (!line.trim() || FENCE_RE.test(line))) return -1
    let inString = false
    let escaped = false
    for (const ch of line) {
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
      } else if (ch === '"') {
        inString = true
      } else if (ch === '{' || ch === '[') {
        depth++
      } else if ((ch === '}' || ch === ']') && --depth === 0) {
        return index
      }
    }
  }
  return -1
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
  if (/doctor (?:warnings|changes|notices)/i.test(trimmed)) return true
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
  if (/requires legacy credential migration; run openclaw doctor --fix/i.test(trimmed)) return true
  if (/migrated auth profile json for/i.test(trimmed)) return true
  if (/into sqlite \(archive:/i.test(trimmed)) return true
  if (/skipped historical transcript directive migration/i.test(trimmed)) return true
  if (/shared sqlite state/i.test(trimmed)) return true
  if (/^[\s|│┌┐└┘├┤┬┴┼─━═╭╮╰╯]+$/.test(trimmed)) return true
  return false
}

/**
 * A line of OpenClaw's console logger as plain `openclaw agent` prints it to stdout next to the reply
 * (only `--json` moves it to stderr): an optional time stamp, then `[subsystem]` wrapped in a colour
 * escape. Only the coloured form is matched -- the CLI never colours the reply, so a reply line such
 * as `[todo] Write tests` can never be mistaken for one. (Without a TERM the logger prints no colour,
 * and its lines stay in the live text until the persisted transcript replaces it.)
 */
const CONSOLE_LOG_LINE_RE = /^(?:\x1b\[[0-9;]*m[^\x1b]*\x1b\[[0-9;]*m\s+)?\x1b\[[0-9;]*m\[[a-z][a-z0-9_-]+(?:\/[a-z0-9][a-z0-9_-]*)*\]\x1b\[[0-9;]*m\s/

function filterWarningLines(content: string, isFenced: (line: string) => boolean, dropConsoleLogs = false): string {
  return content
    .split('\n')
    .filter((line) => {
      if (isFenced(line)) return true
      if (dropConsoleLogs && CONSOLE_LOG_LINE_RE.test(line.trimStart())) return false
      // Raw CLI output is coloured: match the text, not the escape codes in front of it.
      const trimmed = line.replace(ANSI_ESCAPE_RE, '').trim()
      return !isBenignPluginRuntimeWarningLine(trimmed) && !isDoctorWarningLine(trimmed)
    })
    .join('\n')
}

export function stripBenignChatRuntimeWarnings(content: string): string {
  if (!content) return content
  return filterWarningLines(content, createFenceTracker())
}

/**
 * Line-buffered warning filter for a CLI's live stdout, which also drops OpenClaw's console log lines.
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
 *
 * Fence state carries across chunks, so a fenced diagram's `│` lines survive however they are split.
 */
const MAX_HELD_LINE_CHARS = 8192

export function createStreamingWarningFilter(): {
  push: (chunk: string) => string
  flush: () => string
} {
  const isFenced = createFenceTracker()
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
      return filterWarningLines(complete, isFenced, true)
    },
    /**
     * Emit whatever is still held, filtered. Must be called when the stream ends: a runtime that
     * does not terminate its final line would otherwise have that line dropped entirely.
     */
    flush(): string {
      if (!carry) return ''
      const remaining = filterWarningLines(carry, isFenced, true)
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
  const isFenced = createFenceTracker()
  const cleanedLines: string[] = []
  let skippingArtifactBlock = false
  // Collapses the gaps removed lines leave behind. Only outside fences: blank lines inside code
  // (two between Python functions) are content.
  let previousLineBlank = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (isFenced(line)) {
      skippingArtifactBlock = false
      previousLineBlank = false
      cleanedLines.push(line)
      continue
    }

    const trimmed = line.trim()

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const end = findBalancedBlockEnd(lines, index)
      if (end >= 0) {
        if (!isRuntimeJsonBlock(lines.slice(index, end + 1).join('\n'))) {
          cleanedLines.push(...lines.slice(index, end + 1))
          previousLineBlank = false
        }
        index = end
        continue
      }
    }

    if (!trimmed) {
      skippingArtifactBlock = false
      if (!previousLineBlank) cleanedLines.push('')
      previousLineBlank = true
      continue
    }

    if (
      isRuntimeStatusLine(trimmed) ||
      isBenignPluginRuntimeWarningLine(trimmed) ||
      isDoctorWarningLine(trimmed) ||
      trimmed.startsWith('🦞 OpenClaw') ||
      isCliOutputLine(trimmed) ||
      /\{"type"\s*:\s*"/.test(trimmed.replace(/`[^`]*`/g, '')) ||
      /^\d{1,2}:\d{2}:\d{2}\s*(AM|PM)?\s*$/.test(trimmed)
    ) {
      continue
    }

    // Lookahead only for the one rule that needs it; per line it would make long replies quadratic.
    if (isToolArtifactLine(trimmed, trimmed === 'Files:' ? lines.slice(index + 1).find((next) => next.trim()) : undefined)) {
      skippingArtifactBlock = true
      continue
    }

    if (skippingArtifactBlock) {
      continue
    }

    previousLineBlank = false
    cleanedLines.push(line)
  }

  const normalized = cleanedLines.join('\n').trim()
  // If the runtime emitted only diagnostics, return empty so the route can
  // recover the real assistant reply from the persisted session. Re-emitting
  // the raw input here turns filtered warnings back into chat content.
  return normalized
}
