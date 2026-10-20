import fs from 'fs'
import path from 'path'

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

export function readNativeChatTranscript(agentId: string, sessionId: string, home: string): string | undefined {
  return readNative(agentId, home, db => {
    const hasTable = (name: string) => Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(name))
    if (!hasTable('transcript_events')) return undefined
    if (hasTable('session_windows') && !db.prepare('SELECT 1 FROM session_windows WHERE session_id = ?').get(sessionId)) return undefined
    const hasIndex = hasTable('session_transcript_index_state')
    const hasActiveBranch = hasTable('session_transcript_active_events')
    // Older stores have no branch-index tables. Only that schema may read the
    // linear transcript; a partially migrated or rebuilding modern index must
    // never fall back to events from inactive branches.
    if (!hasIndex && !hasActiveBranch) {
      const rows = db.prepare('SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY seq').all(sessionId)
      return rows.length ? rows.map((row: { event_json: string }) => row.event_json).join('\n') : undefined
    }
    if (!hasIndex || !hasActiveBranch) throw new Error('Chat history index is not ready; retry after the runtime finishes updating it')
    const index = db.prepare('SELECT needs_rebuild FROM session_transcript_index_state WHERE session_id = ?').get(sessionId)
    if (!index || index.needs_rebuild !== 0) {
      throw new Error('Chat history index is not ready; retry after the runtime finishes updating it')
    }
    // Use the runtime's active branch, not every historical event: rewind and
    // branch changes leave inactive events in transcript_events.
    const rows = db.prepare(`
      SELECT e.event_json FROM session_transcript_active_events a
      JOIN transcript_events e ON e.session_id = a.session_id AND e.seq = a.event_seq
      WHERE a.session_id = ? ORDER BY a.active_position
    `).all(sessionId)
    return rows.map((row: { event_json: string }) => row.event_json).join('\n')
  })
}
