import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { hasNativeChatStore, resolveNativeChatSession, readNativeChatTranscript } from './native-chat-history'

const { DatabaseSync } = require('node:sqlite')
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'native-chat-test-'))
try {
  assert.equal(hasNativeChatStore('alpha', home), false)
  assert.equal(resolveNativeChatSession('alpha', 'agent:alpha:dashboard-chat', home), undefined)
  const dir = path.join(home, '.openclaw/agents/alpha/agent')
  fs.mkdirSync(dir, { recursive: true })
  const filename = path.join(dir, 'openclaw-agent.sqlite')
  const db = new DatabaseSync(filename)
  db.exec(`
    CREATE TABLE session_nodes (session_key TEXT PRIMARY KEY, current_session_id TEXT);
    CREATE TABLE session_windows (session_id TEXT PRIMARY KEY);
    CREATE TABLE transcript_events (session_id TEXT, seq INTEGER, event_json TEXT);
    CREATE TABLE session_transcript_index_state (session_id TEXT, needs_rebuild INTEGER);
    CREATE TABLE session_transcript_active_events (session_id TEXT, event_seq INTEGER, active_position INTEGER);
    INSERT INTO session_nodes VALUES ('agent:alpha:dashboard-chat', 'chat-window');
    INSERT INTO session_nodes VALUES ('agent:alpha:cron', 'cron-window');
    INSERT INTO session_windows VALUES ('chat-window'), ('unindexed-window');
    INSERT INTO session_transcript_index_state VALUES ('chat-window', 0);
    INSERT INTO session_transcript_active_events VALUES ('chat-window', 3, 1), ('chat-window', 1, 0);
  `)
  const insert = db.prepare('INSERT INTO transcript_events VALUES (?, ?, ?)')
  const message = (text: string) => JSON.stringify({ type: 'message', message: { role: 'assistant', content: text } })
  insert.run('chat-window', 1, message('first'))
  insert.run('chat-window', 2, message('inactive branch'))
  insert.run('chat-window', 3, message('last'))
  insert.run('cron-window', 1, message('unrelated scheduled session'))
  db.close()
  const before = fs.readFileSync(filename)
  assert.equal(resolveNativeChatSession('alpha', 'agent:alpha:dashboard-chat', home), 'chat-window')
  assert.equal(resolveNativeChatSession('alpha', 'missing', home), undefined)
  const expected = [message('first'), message('last')].join('\n')
  assert.equal(readNativeChatTranscript('alpha', 'chat-window', home), expected)
  assert.equal(readNativeChatTranscript('alpha', 'chat-window', home), expected, 'reopening must retain history')
  assert.deepEqual(fs.readFileSync(filename), before, 'reads must not modify runtime state')
  assert.equal(readNativeChatTranscript('alpha', 'non-openclaw-window', home), undefined)
  assert.throws(() => readNativeChatTranscript('alpha', 'unindexed-window', home), /index is not ready/)
  const update = new DatabaseSync(filename)
  update.exec('UPDATE session_transcript_index_state SET needs_rebuild = 1')
  update.close()
  assert.throws(() => readNativeChatTranscript('alpha', 'chat-window', home), /index is not ready/)
  assert.throws(() => hasNativeChatStore('../alpha', home), /Invalid agent/)
  console.log('PASS: native session mapping, active branch, reopen, isolation, read-only, stale index')
} finally {
  fs.rmSync(home, { recursive: true, force: true })
}
