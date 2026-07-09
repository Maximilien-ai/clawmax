/**
 * Dashboard-readable transcript store for non-openclaw runtime chats (claude / droid).
 *
 * OpenClaw's own CLI writes its own JSONL session files under ~/.openclaw/agents/<id>/sessions,
 * which the dashboard chat history route reads directly. Claude Code and Factory Droid have no
 * equivalent dashboard-visible transcript — their session state lives in their own CLI-private
 * stores (~/.claude, Factory's own servers) that this dashboard process can't read. This module
 * is the runtime-neutral substitute: both non-openclaw chat call sites (routes/chat.ts's SSE
 * branch and routes/agents.ts's POST /:id/chat/messages branch) append each user+assistant turn
 * here so refresh / archive / clear-history flows have something dashboard-local to read.
 *
 * Storage: <workspace>/SYSTEM/runtime-transcripts/<agentId>/<scopedSessionId>.jsonl
 * One line per turn: {"role":"user"|"assistant","content":string,"ts":number}
 */
import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'

export interface RuntimeTranscriptTurn {
  role: 'user' | 'assistant'
  content: string
  ts: number
}

// FIFO cap on the number of *session files* kept per agent — not messages per file. A workspace
// that flips runtime/model on an agent repeatedly accumulates one file per distinct scoped
// session id; this bounds that growth the same way runtime-sessions.ts bounds its own store.
const MAX_SESSION_FILES_PER_AGENT = 500

function sanitizeSessionIdForFilename(scopedSessionId: string): string {
  // scopedSessionId already comes from scopeSessionIdToModel() (character-scrubbed), but this
  // module doesn't control every future caller, so defensively strip anything that isn't a safe
  // filename character before it's used as one.
  return scopedSessionId.replace(/[^a-zA-Z0-9._-]/g, '_') || 'session'
}

function getRuntimeTranscriptsDir(agentId: string): string {
  return path.join(getWorkspacePath(), 'SYSTEM', 'runtime-transcripts', agentId)
}

function getRuntimeTranscriptPath(agentId: string, scopedSessionId: string): string {
  return path.join(getRuntimeTranscriptsDir(agentId), `${sanitizeSessionIdForFilename(scopedSessionId)}.jsonl`)
}

/** FIFO-evict the oldest (by mtime) transcript files once an agent has more than the cap. */
function enforceFileCap(agentId: string): void {
  try {
    const dir = getRuntimeTranscriptsDir(agentId)
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.jsonl'))
    if (files.length <= MAX_SESSION_FILES_PER_AGENT) return

    const withStats = files
      .map((name) => {
        const fullPath = path.join(dir, name)
        try {
          return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs }
        } catch {
          return null
        }
      })
      .filter((entry): entry is { fullPath: string; mtimeMs: number } => !!entry)
      .sort((a, b) => a.mtimeMs - b.mtimeMs)

    const overflow = withStats.length - MAX_SESSION_FILES_PER_AGENT
    for (let i = 0; i < overflow; i++) {
      try { fs.unlinkSync(withStats[i].fullPath) } catch {}
    }
  } catch {
    // Missing/unreadable dir — nothing to cap.
  }
}

/** Append one turn to the transcript. Tolerates missing dirs (creates them) and never throws. */
export function appendRuntimeTranscriptTurn(
  agentId: string,
  scopedSessionId: string,
  role: 'user' | 'assistant',
  content: string
): void {
  const text = String(content || '').trim()
  if (!text) return
  try {
    const dir = getRuntimeTranscriptsDir(agentId)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = getRuntimeTranscriptPath(agentId, scopedSessionId)
    const isNewFile = !fs.existsSync(filePath)
    const line: RuntimeTranscriptTurn = { role, content: text, ts: Date.now() }
    fs.appendFileSync(filePath, `${JSON.stringify(line)}\n`, 'utf-8')
    if (isNewFile) enforceFileCap(agentId)
  } catch (err) {
    console.warn(`[runtime-transcripts] Failed to append turn for ${agentId}:`, err)
  }
}

/** Append a full user/assistant exchange in one call — the common case at both chat call sites. */
export function appendRuntimeTranscriptExchange(
  agentId: string,
  scopedSessionId: string,
  userMessage: string,
  assistantText?: string
): void {
  appendRuntimeTranscriptTurn(agentId, scopedSessionId, 'user', userMessage)
  if (assistantText) appendRuntimeTranscriptTurn(agentId, scopedSessionId, 'assistant', assistantText)
}

/** Read all turns for one agent+session, oldest first (append order is chronological order). */
export function readRuntimeTranscript(agentId: string, scopedSessionId: string): RuntimeTranscriptTurn[] {
  try {
    const filePath = getRuntimeTranscriptPath(agentId, scopedSessionId)
    if (!fs.existsSync(filePath)) return []
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((line) => line.trim())
    const turns: RuntimeTranscriptTurn[] = []
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line)
        if (parsed && (parsed.role === 'user' || parsed.role === 'assistant') && typeof parsed.content === 'string') {
          turns.push({ role: parsed.role, content: parsed.content, ts: typeof parsed.ts === 'number' ? parsed.ts : 0 })
        }
      } catch {
        // skip corrupt line, keep reading the rest of the file
      }
    }
    return turns
  } catch {
    return []
  }
}

/** True if this agent has any non-openclaw runtime transcript on disk (cheap existence check). */
export function hasRuntimeTranscripts(agentId: string): boolean {
  try {
    const dir = getRuntimeTranscriptsDir(agentId)
    return fs.existsSync(dir) && fs.readdirSync(dir).some((name) => name.endsWith('.jsonl'))
  } catch {
    return false
  }
}

/**
 * Session id of the most recently written transcript for an agent (by file mtime), or null.
 * This is the non-openclaw counterpart of openclaw's sessions.json "current session" pointer:
 * claude/droid chats never write that index, so history routes resolve the active session from
 * the transcript store itself. Filenames are the sanitized scoped session id; scoped ids only
 * contain filename-safe characters, so the round-trip is lossless in practice.
 */
export function getLatestRuntimeTranscriptSessionId(agentId: string): string | null {
  try {
    const dir = getRuntimeTranscriptsDir(agentId)
    const newest = fs.readdirSync(dir)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => {
        try {
          return { name, mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs }
        } catch {
          return null
        }
      })
      .filter((entry): entry is { name: string; mtimeMs: number } => !!entry)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
    return newest ? newest.name.replace(/\.jsonl$/, '') : null
  } catch {
    return null
  }
}

/**
 * Runtime transcript turns rendered as OpenClaw archive-format JSONL lines
 * (`{type:'message', message:{role, content, timestamp}}`), so clear-history can fold claude/droid
 * turns into the same archive file the archives list/detail routes already parse. Returns '' when
 * the agent+session has no transcript. Does not delete anything — the caller clears after archiving.
 */
export function readRuntimeTranscriptAsArchiveLines(agentId: string, scopedSessionId: string): string {
  const turns = readRuntimeTranscript(agentId, scopedSessionId)
  if (turns.length === 0) return ''
  return turns
    .map((turn) => JSON.stringify({
      type: 'message',
      message: { role: turn.role, content: turn.content, timestamp: turn.ts },
    }))
    .join('\n') + '\n'
}

/** Delete the transcript file for one agent+session (used by clear-history). Tolerates a missing file. */
export function clearRuntimeTranscript(agentId: string, scopedSessionId: string): void {
  try {
    const filePath = getRuntimeTranscriptPath(agentId, scopedSessionId)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore
  }
}
