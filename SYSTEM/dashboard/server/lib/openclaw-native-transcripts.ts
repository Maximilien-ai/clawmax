/**
 * Read-only bridge into OpenClaw 2's native SQLite session store.
 *
 * OpenClaw 2026.8.2+ stores agent chat transcripts in
 * ~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite instead of writing the legacy
 * ~/.openclaw/agents/<agentId>/sessions/sessions.json index and <sessionId>.jsonl transcript
 * files the rest of the dashboard reads. Fresh OpenClaw 2 agents never get sessions.json or a
 * .jsonl at all, so the dashboard chat history routes need this as a fallback read path.
 *
 * This module never writes to the database (the OpenClaw runtime owns it), always closes the
 * handle it opens, and never throws into a caller — a missing file, missing table, or malformed
 * row degrades to an empty result rather than a 500.
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

/**
 * Raw transcript lines for one session, oldest first (ordered by `seq`). Each returned string is
 * exactly one legacy-format JSONL line — callers parse them the same way they parse a `.jsonl`
 * file's lines (e.g. `parseVisibleChatMessages`).
 */
export function readNativeTranscriptLines(agentId: string, sessionId: string, homeDir: string = process.env.HOME || ''): string[] {
  if (!sessionId) return []
  const database = openNativeStoreReadOnly(nativeAgentStorePath(agentId, homeDir))
  if (!database) return []

  try {
    if (!tableExists(database, 'transcript_events')) return []

    // Some runtimes additionally track which transcript rows belong to the session's active
    // branch (a rewind or branch change leaves earlier rows in transcript_events but marks them
    // inactive). When that index is present and populated, prefer it; otherwise fall back to every
    // row in seq order — this table pair is optional, so its absence is not an error condition.
    if (tableExists(database, 'session_transcript_active_events')) {
      const activeRows = database.prepare(`
        SELECT e.event_json FROM session_transcript_active_events a
        JOIN transcript_events e ON e.session_id = a.session_id AND e.seq = a.event_seq
        WHERE a.session_id = ? ORDER BY a.active_position ASC
      `).all(sessionId) as Array<{ event_json: string | null }>
      if (activeRows.length > 0) {
        return activeRows
          .map((row) => row.event_json)
          .filter((line): line is string => typeof line === 'string' && line.length > 0)
      }
    }

    const rows = database.prepare(
      'SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY seq ASC'
    ).all(sessionId) as Array<{ event_json: string | null }>
    return rows
      .map((row) => row.event_json)
      .filter((line): line is string => typeof line === 'string' && line.length > 0)
  } catch {
    return []
  } finally {
    closeQuietly(database)
  }
}

/** Cheap existence check for one session's transcript, without reading its rows. */
export function hasNativeTranscript(agentId: string, sessionId: string, homeDir: string = process.env.HOME || ''): boolean {
  if (!sessionId) return false
  const database = openNativeStoreReadOnly(nativeAgentStorePath(agentId, homeDir))
  if (!database) return false

  try {
    if (!tableExists(database, 'transcript_events')) return false
    return Boolean(database.prepare(
      'SELECT 1 FROM transcript_events WHERE session_id = ? LIMIT 1'
    ).get(sessionId))
  } catch {
    return false
  } finally {
    closeQuietly(database)
  }
}
