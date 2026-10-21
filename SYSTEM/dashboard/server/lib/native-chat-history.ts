import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

type TranscriptEventRow = { event_json: string | null; event_zstd?: Uint8Array | null }

// @types/node 20 predates zlib's zstd API; the Node 22.15+/24 runtimes this ships on provide it.
const zstdDecompressSync = (zlib as typeof zlib & { zstdDecompressSync?: (input: Buffer, options?: { maxOutputLength?: number }) => Buffer }).zstdDecompressSync
// The runtime compresses only events of at most 4 MiB; anything larger is not a frame it wrote.
const MAX_DECODED_EVENT_BYTES = 8 * 1024 * 1024

/**
 * Agent schema 23 keeps each transcript event in exactly one representation: `event_json` TEXT, or a
 * checksummed zstd frame in `event_zstd` for events of 1 KiB or more. Long assistant replies are the
 * rows that get compressed, so selecting `event_json` alone kept the user's turns and silently
 * dropped every substantial reply. Like the runtime itself, refuse to guess when a row cannot be
 * decoded rather than returning a history with holes in it.
 */
function decodeTranscriptEvent(row: TranscriptEventRow): string {
  if (typeof row.event_json === 'string') return row.event_json
  if (!row.event_zstd) throw new Error('Chat history event has no stored body; the runtime store may be damaged')
  if (typeof zstdDecompressSync !== 'function') {
    throw new Error('Chat history contains compressed events that this Node.js runtime cannot decode (zstd requires Node.js 22.15 or newer)')
  }
  try {
    return zstdDecompressSync(Buffer.from(row.event_zstd), { maxOutputLength: MAX_DECODED_EVENT_BYTES }).toString('utf8')
  } catch (err) {
    throw new Error(`Chat history event could not be decoded: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function databasePath(agentId: string, home: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) throw new Error('Invalid agent id')
  return path.join(home, '.openclaw', 'agents', agentId, 'agent', 'openclaw-agent.sqlite')
}

export function hasNativeChatStore(agentId: string, home: string): boolean {
  return fs.existsSync(databasePath(agentId, home))
}

function readNative<T>(agentId: string, home: string, read: (db: any) => T): T | undefined {
  const filename = databasePath(agentId, home)
  if (!fs.existsSync(filename)) return undefined
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(filename, { readOnly: true })
  try {
    // A consistent snapshot prevents mixing a session rollover with another
    // window's transcript. Never initialize or repair the runtime-owned store.
    db.exec('BEGIN')
    if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'session_nodes'").get()) return undefined
    return read(db)
  } finally {
    db.close()
  }
}

export function resolveNativeChatSession(agentId: string, sessionKey: string, home: string): string | undefined {
  return readNative(agentId, home, db => {
    const row = db.prepare('SELECT current_session_id FROM session_nodes WHERE session_key = ?').get(sessionKey)
    return row?.current_session_id as string | undefined
  })
}

/** Whether the agent store holds a session (any window, current or not) with this id. */
export function hasNativeChatSession(agentId: string, sessionId: string, home: string): boolean {
  return readNative(agentId, home, db => {
    const hasTable = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name))
    if (hasTable('session_windows')) return Boolean(db.prepare('SELECT 1 FROM session_windows WHERE session_id = ?').get(sessionId))
    return hasTable('transcript_events') && Boolean(db.prepare('SELECT 1 FROM transcript_events WHERE session_id = ? LIMIT 1').get(sessionId))
  }) ?? false
}

export function readNativeChatTranscript(agentId: string, sessionId: string, home: string): string | undefined {
  return readNative(agentId, home, db => {
    const hasTable = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name))
    if (!hasTable('transcript_events')) return undefined
    if (hasTable('session_windows') && !db.prepare('SELECT 1 FROM session_windows WHERE session_id = ?').get(sessionId)) return undefined
    const hasIndex = hasTable('session_transcript_index_state')
    const hasActiveBranch = hasTable('session_transcript_active_events')
    // Stores before agent schema 23 have no compressed column.
    const hasCompressedBodies = Boolean(db.prepare("SELECT 1 FROM pragma_table_info('transcript_events') WHERE name = 'event_zstd'").get())
    // Older stores have no branch-index tables. Only that schema may read the
    // linear transcript; a partially migrated or rebuilding modern index must
    // never fall back to events from inactive branches.
    if (!hasIndex && !hasActiveBranch) {
      const rows: TranscriptEventRow[] = db.prepare(`SELECT event_json${hasCompressedBodies ? ', event_zstd' : ''} FROM transcript_events WHERE session_id = ? ORDER BY seq`).all(sessionId)
      return rows.length ? rows.map(decodeTranscriptEvent).join('\n') : undefined
    }
    if (!hasIndex || !hasActiveBranch) throw new Error('Chat history index is not ready; retry after the runtime finishes updating it')
    const index = db.prepare('SELECT needs_rebuild FROM session_transcript_index_state WHERE session_id = ?').get(sessionId)
    if (!index || index.needs_rebuild !== 0) {
      throw new Error('Chat history index is not ready; retry after the runtime finishes updating it')
    }
    // Use the runtime's active branch, not every historical event: rewind and
    // branch changes leave inactive events in transcript_events.
    const rows: TranscriptEventRow[] = db.prepare(`
      SELECT e.event_json${hasCompressedBodies ? ', e.event_zstd' : ''} FROM session_transcript_active_events a
      JOIN transcript_events e ON e.session_id = a.session_id AND e.seq = a.event_seq
      WHERE a.session_id = ? ORDER BY a.active_position
    `).all(sessionId)
    return rows.map(decodeTranscriptEvent).join('\n')
  })
}

/**
 * A session's persisted transcript as JSONL text: the native agent store when it holds the session
 * (OpenClaw 2 records `--session-id` turns there and writes no JSONL), otherwise the legacy
 * `sessions/<id>.jsonl` file. Undefined when neither exists; throws when the store cannot be read.
 */
export function readPersistedChatTranscript(agentId: string, sessionId: string, home: string): string | undefined {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('Invalid session id')
  const nativeTranscript = readNativeChatTranscript(agentId, sessionId, home)
  if (nativeTranscript !== undefined) return nativeTranscript
  const jsonlPath = path.join(home, '.openclaw', 'agents', agentId, 'sessions', `${sessionId}.jsonl`)
  return fs.existsSync(jsonlPath) ? fs.readFileSync(jsonlPath, 'utf-8') : undefined
}
