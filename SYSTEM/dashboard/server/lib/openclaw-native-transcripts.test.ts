import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { hasNativeTranscript, listNativeSessionIds, nativeAgentStorePath, readNativeTranscriptLines } from './openclaw-native-transcripts'

const { DatabaseSync } = require('node:sqlite')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-native-transcripts-test-'))

try {
  // No database file at all for this agent yet.
  assert.deepEqual(listNativeSessionIds('alpha', home), [])
  assert.deepEqual(readNativeTranscriptLines('alpha', 'chat-window', home), [])
  assert.equal(hasNativeTranscript('alpha', 'chat-window', home), false)

  const dbPath = nativeAgentStorePath('alpha', home)
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE session_nodes (session_key TEXT PRIMARY KEY, current_session_id TEXT, entry_json TEXT, updated_at INTEGER);
    CREATE TABLE transcript_events (session_id TEXT, seq INTEGER, event_json TEXT, created_at INTEGER);
    INSERT INTO session_nodes VALUES ('agent:alpha:dashboard-chat', 'chat-window', NULL, 100);
  `)
  const insert = db.prepare('INSERT INTO transcript_events VALUES (?, ?, ?, ?)')
  const message = (text: string) => JSON.stringify({ type: 'message', message: { role: 'assistant', content: text } })
  insert.run('chat-window', 1, message('first'), 1)
  insert.run('chat-window', 2, message('inactive branch'), 2)
  insert.run('chat-window', 3, message('last'), 3)
  db.close()

  // No active-branch index tables at all — every row for the session comes back in seq order.
  // This is the common case (and is what previously threw when a stricter reader assumed those
  // tables always exist alongside session_nodes/transcript_events).
  assert.deepEqual(
    readNativeTranscriptLines('alpha', 'chat-window', home),
    [message('first'), message('inactive branch'), message('last')]
  )
  assert.equal(hasNativeTranscript('alpha', 'chat-window', home), true)
  assert.deepEqual(listNativeSessionIds('alpha', home).map((s) => s.sessionId), ['chat-window'])

  // Add the optional active-branch tables and mark seq 2 as a rewound/inactive event: only seq 1
  // and 3 should come back, in active_position order.
  const withActiveEvents = new DatabaseSync(dbPath)
  withActiveEvents.exec(`
    CREATE TABLE session_transcript_active_events (session_id TEXT, event_seq INTEGER, active_position INTEGER);
    INSERT INTO session_transcript_active_events VALUES ('chat-window', 3, 1), ('chat-window', 1, 0);
  `)
  withActiveEvents.close()

  const before = fs.readFileSync(dbPath)
  assert.deepEqual(
    readNativeTranscriptLines('alpha', 'chat-window', home),
    [message('first'), message('last')],
    'Expected only the active branch rows, in active_position order'
  )
  assert.deepEqual(fs.readFileSync(dbPath), before, 'Reads must never modify the runtime-owned store')

  // A session with no rows in the (now-present) active-events table falls back to the full
  // seq-ordered set rather than returning nothing.
  const otherSessionInsert = new DatabaseSync(dbPath)
  otherSessionInsert.prepare('INSERT INTO transcript_events VALUES (?, ?, ?, ?)').run('other-window', 1, message('unfiltered'), 1)
  otherSessionInsert.close()
  assert.deepEqual(readNativeTranscriptLines('alpha', 'other-window', home), [message('unfiltered')])

  console.log('PASS: native transcript active-branch filtering, graceful degrade without it, read-only isolation')
} finally {
  fs.rmSync(home, { recursive: true, force: true })
}
