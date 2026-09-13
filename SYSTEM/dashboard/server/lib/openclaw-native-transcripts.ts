/**
 * Read-only bridge into OpenClaw 2's native SQLite session store.
 *
 * OpenClaw 2026.8.2+ stores agent chat transcripts in
 * ~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite instead of writing the legacy
 * ~/.openclaw/agents/<agentId>/sessions/sessions.json index and <sessionId>.jsonl transcript
 * files the rest of the dashboard reads. Fresh OpenClaw 2 agents never get sessions.json or a
 * .jsonl at all, so the dashboard chat history routes need this as a fallback read path.
 *
 * This module never writes to the database's own tables — the OpenClaw runtime owns them — and
 * never throws into a caller: a missing file, missing table, or malformed row degrades to an
 * empty result rather than a 500. One caveat: opening a WAL-mode database read-only (the mode
 * OpenClaw's Gateway uses) can create/touch companion `-wal`/`-shm` index files next to it, which
 * a read-only close does not remove — this is standard SQLite WAL-reader behavior, not specific to
 * this module (`hasReadyOpenClawNativeAgentStore` in agent-execution.ts already does the same
 * read-only open on every chat turn today), and those files hold none of our data. Opening with
 * `?immutable=1` avoids creating them, but was measured to silently read stale/missing data
 * whenever the Gateway has written to the WAL without checkpointing yet — exactly the case that
 * matters most for an actively-chatting agent — so it is deliberately not used here.
 *
 * Clearing a native-only chat cannot delete the runtime's rows (same reason), so this module also
 * owns a small dashboard-side watermark sidecar (sessions/native-clear-watermarks.json, next to the
 * sessions.json index the legacy store already keeps there) recording the highest `seq` archived
 * per session id. Reads below the watermark are treated as already cleared.
 *
 * Tables (as written by OpenClaw 2's Gateway process):
 *  - session_nodes(session_key, current_session_id, entry_json, updated_at, ...)
 *      entry_json: {"sessionId":..., "updatedAt":..., "sessionStartedAt":..., "lastInteractionAt":...}
 *  - session_windows(session_id, session_key, updated_at, transcript_updated_at, ...) — fallback
 *      source when session_nodes is absent.
 *  - transcript_events(session_id, seq, event_json, created_at) — event_json is exactly one line
 *      of the legacy JSONL transcript format (`{"type":"message",...}`, etc.), ordered by seq.
 *  - session_transcript_active_events(session_id, event_seq, active_position) — optional, present
 *      on runtimes that track branch rewinds. When populated for a session, only the rows it
 *      references are that session's active branch; transcript_events otherwise keeps rows a
 *      rewind or branch change left behind. Absent entirely on runtimes that don't track this —
 *      that is not an error, it just means every transcript_events row for the session is used.
 */
import fs from 'fs'
import path from 'path'

export interface NativeSessionSummary {
  sessionId: string
  sessionKey: string
  updatedAt: number
}

export function nativeAgentStorePath(agentId: string, homeDir: string = process.env.HOME || ''): string {
  return path.join(homeDir, '.openclaw', 'agents', agentId, 'agent', 'openclaw-agent.sqlite')
}

/** Opens the store read-only, or returns null for a missing file / unavailable sqlite module. */
function openNativeStoreReadOnly(databasePath: string): any | null {
  if (!databasePath || !fs.existsSync(databasePath)) return null
  try {
    const { DatabaseSync } = require('node:sqlite')
    return new DatabaseSync(databasePath, { readOnly: true })
  } catch {
    return null
  }
}

/** Never let a close-time failure on an already-corrupt handle escape into a route. */
function closeQuietly(database: any): void {
  try {
    database?.close()
  } catch {
    // ignore — the store is read-only and this process never wrote to it
  }
}

function tableExists(database: any, tableName: string): boolean {
  try {
    return Boolean(database.prepare(
      "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?"
    ).get(tableName))
  } catch {
    return false
  }
}

function parseEntryJsonField(entryJson: string | null | undefined, field: 'sessionId' | 'updatedAt' | 'lastInteractionAt' | 'sessionStartedAt'): unknown {
  if (!entryJson) return undefined
  try {
    return JSON.parse(entryJson)?.[field]
  } catch {
    return undefined
  }
}

/**
 * All sessions recorded for this agent, newest first. Reads `session_nodes` when present, falling
 * back to `session_windows`. Returns [] for a missing/unreadable store or one with neither table.
 * Not watermark-aware — this answers "what sessions exist", not "what's left to show".
 */
export function listNativeSessionIds(agentId: string, homeDir: string = process.env.HOME || ''): NativeSessionSummary[] {
  const database = openNativeStoreReadOnly(nativeAgentStorePath(agentId, homeDir))
  if (!database) return []

  try {
    if (tableExists(database, 'session_nodes')) {
      const rows = database.prepare(
        'SELECT session_key, current_session_id, entry_json, updated_at FROM session_nodes'
      ).all() as Array<{ session_key: string; current_session_id: string | null; entry_json: string | null; updated_at: number | null }>

      const summaries: NativeSessionSummary[] = []
      for (const row of rows) {
        const sessionId = row.current_session_id || parseEntryJsonField(row.entry_json, 'sessionId')
        if (typeof sessionId !== 'string' || !sessionId) continue
        const updatedAt = row.updated_at
          || parseEntryJsonField(row.entry_json, 'updatedAt')
          || parseEntryJsonField(row.entry_json, 'lastInteractionAt')
          || parseEntryJsonField(row.entry_json, 'sessionStartedAt')
          || 0
        summaries.push({
          sessionId,
          sessionKey: row.session_key,
          updatedAt: typeof updatedAt === 'number' ? updatedAt : 0,
        })
      }
      return summaries.sort((a, b) => b.updatedAt - a.updatedAt)
    }

    if (tableExists(database, 'session_windows')) {
      const rows = database.prepare(
        'SELECT session_id, session_key, updated_at FROM session_windows'
      ).all() as Array<{ session_id: string | null; session_key: string | null; updated_at: number | null }>

      return rows
        .filter((row): row is { session_id: string; session_key: string | null; updated_at: number | null } => typeof row.session_id === 'string' && !!row.session_id)
        .map((row) => ({ sessionId: row.session_id, sessionKey: row.session_key || '', updatedAt: row.updated_at || 0 }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    }

    return []
  } catch {
    return []
  } finally {
    closeQuietly(database)
  }
}

// --- Dashboard-owned "cleared" watermark -----------------------------------------------------
// Clear can't delete the runtime's rows, so it records how far it archived instead. Lives next to
// sessions.json in the same directory — dashboard bookkeeping, never touches the SQLite file.

interface NativeClearWatermarks {
  [sessionId: string]: { seq: number; clearedAt: number }
}

function getNativeClearWatermarksPath(agentId: string, homeDir: string): string {
  return path.join(homeDir, '.openclaw', 'agents', agentId, 'sessions', 'native-clear-watermarks.json')
}

function readNativeClearWatermarkSeq(agentId: string, sessionId: string, homeDir: string): number {
  try {
    const watermarks = JSON.parse(fs.readFileSync(getNativeClearWatermarksPath(agentId, homeDir), 'utf-8')) as NativeClearWatermarks
    const seq = watermarks?.[sessionId]?.seq
    return typeof seq === 'number' ? seq : -1
  } catch {
    return -1
  }
}

/**
 * Advance the "cleared through" watermark for one session to its current highest `seq`. Called by
 * Clear after archiving whatever native content it just read. A later call to
 * `readNativeTranscriptLines`/`hasNativeTranscript` for this session then only sees events with a
 * higher `seq` — i.e. turns that happened after this Clear — without ever touching the runtime's
 * database. A session with nothing recorded (or an unreadable store) is a no-op.
 */
export function markNativeTranscriptCleared(agentId: string, sessionId: string, homeDir: string = process.env.HOME || ''): void {
  if (!sessionId) return
  const database = openNativeStoreReadOnly(nativeAgentStorePath(agentId, homeDir))
  if (!database) return

  let maxSeq: number | null = null
  try {
    if (tableExists(database, 'transcript_events')) {
      const row = database.prepare(
        'SELECT MAX(seq) AS maxSeq FROM transcript_events WHERE session_id = ?'
      ).get(sessionId) as { maxSeq: number | null } | undefined
      maxSeq = typeof row?.maxSeq === 'number' ? row.maxSeq : null
    }
  } catch {
    maxSeq = null
  } finally {
    closeQuietly(database)
  }
  if (maxSeq === null) return

  const watermarksPath = getNativeClearWatermarksPath(agentId, homeDir)
  let watermarks: NativeClearWatermarks = {}
  try {
    watermarks = JSON.parse(fs.readFileSync(watermarksPath, 'utf-8'))
  } catch {
    // no existing sidecar (or unreadable) — start fresh
  }
  watermarks[sessionId] = { seq: maxSeq, clearedAt: Date.now() }
  try {
    fs.mkdirSync(path.dirname(watermarksPath), { recursive: true })
    fs.writeFileSync(watermarksPath, JSON.stringify(watermarks, null, 2))
  } catch {
    // best-effort — a failed watermark write just means Clear didn't fully hide the old content
  }
}

/**
 * Raw transcript lines for one session, oldest first, excluding anything at or below that
 * session's clear watermark (see `markNativeTranscriptCleared`) and, when the runtime records an
 * active transcript branch for this session (see `session_transcript_active_events` above),
 * limited to that branch. Each returned string is exactly one legacy-format JSONL line — callers
 * parse them the same way they parse a `.jsonl` file's lines (e.g. `parseVisibleChatMessages`).
 */
export function readNativeTranscriptLines(agentId: string, sessionId: string, homeDir: string = process.env.HOME || ''): string[] {
  if (!sessionId) return []
  const database = openNativeStoreReadOnly(nativeAgentStorePath(agentId, homeDir))
  if (!database) return []

  try {
    if (!tableExists(database, 'transcript_events')) return []
    const watermarkSeq = readNativeClearWatermarkSeq(agentId, sessionId, homeDir)

    // Some runtimes additionally track which transcript rows belong to the session's active
    // branch (a rewind or branch change leaves earlier rows in transcript_events but marks them
    // inactive). Only trust that index when it actually has rows for this session — its own
    // absence, or no rows recorded yet for this session, means "not applicable", not "cleared",
    // so that case falls through to the plain seq-ordered read below rather than returning [].
    if (tableExists(database, 'session_transcript_active_events')) {
      const hasActiveBranchRows = database.prepare(
        'SELECT 1 FROM session_transcript_active_events WHERE session_id = ? LIMIT 1'
      ).get(sessionId)
      if (hasActiveBranchRows) {
        const activeRows = database.prepare(`
          SELECT e.event_json FROM session_transcript_active_events a
          JOIN transcript_events e ON e.session_id = a.session_id AND e.seq = a.event_seq
          WHERE a.session_id = ? AND e.seq > ? ORDER BY a.active_position ASC
        `).all(sessionId, watermarkSeq) as Array<{ event_json: string | null }>
        return activeRows
          .map((row) => row.event_json)
          .filter((line): line is string => typeof line === 'string' && line.length > 0)
      }
    }

    const rows = database.prepare(
      'SELECT event_json FROM transcript_events WHERE session_id = ? AND seq > ? ORDER BY seq ASC'
    ).all(sessionId, watermarkSeq) as Array<{ event_json: string | null }>
    return rows
      .map((row) => row.event_json)
      .filter((line): line is string => typeof line === 'string' && line.length > 0)
  } catch {
    return []
  } finally {
    closeQuietly(database)
  }
}

/**
 * Cheap existence check for one session's transcript, without reading its rows. Watermark-aware
 * like `readNativeTranscriptLines` — a fully cleared session with nothing since reports false,
 * mirroring the legacy store (Clear deletes the `.jsonl`, so `hasSessionFile` goes false too).
 */
export function hasNativeTranscript(agentId: string, sessionId: string, homeDir: string = process.env.HOME || ''): boolean {
  if (!sessionId) return false
  const database = openNativeStoreReadOnly(nativeAgentStorePath(agentId, homeDir))
  if (!database) return false

  try {
    if (!tableExists(database, 'transcript_events')) return false
    const watermarkSeq = readNativeClearWatermarkSeq(agentId, sessionId, homeDir)
    return Boolean(database.prepare(
      'SELECT 1 FROM transcript_events WHERE session_id = ? AND seq > ? LIMIT 1'
    ).get(sessionId, watermarkSeq))
  } catch {
    return false
  } finally {
    closeQuietly(database)
  }
}
