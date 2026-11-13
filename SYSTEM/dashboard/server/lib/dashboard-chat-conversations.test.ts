import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { defaultDashboardChatSeed, readDashboardChatConversations, rememberDashboardConversationSession, startNewDashboardConversation, resumeDashboardConversation, forgetEndedDashboardConversation } from './dashboard-chat-conversations'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-conversation-record-'))
const previous = process.env.CLAWMAX_TEST_WORKSPACE
process.env.CLAWMAX_TEST_WORKSPACE = path.join(root, 'one')
fs.mkdirSync(process.env.CLAWMAX_TEST_WORKSPACE)
const file = path.join(process.env.CLAWMAX_TEST_WORKSPACE, 'SYSTEM/dashboard-chat/agent.json')
let passed = 0
function test(name: string, run: () => void) { run(); passed++; console.log(`✓ ${name}`) }
try {
  test('record paths reject separators, encodings and trailing line breaks', () => {
    for (const id of ['../outside', 'agent/other', 'agent\\other', '%2e%2e', 'agent\n', 'agent\r', '.']) {
      assert.throws(() => startNewDashboardConversation(id), /Invalid agent id/)
    }
    assert(!fs.existsSync(path.join(root, 'outside.json')))
  })
  test('recovery metadata survives rereads and preserves ended conversations', () => {
    const current = startNewDashboardConversation('agent', { sessionId: 'older', seed: 'older-seed' })
    rememberDashboardConversationSession('agent', current, 'recovered-session', 'ollama/llama3')
    const reread = readDashboardChatConversations('agent')
    assert.equal(reread.activeSeed, current.activeSeed)
    assert.equal(reread.activeSessionId, 'recovered-session')
    assert.equal(reread.activeSessionModel, 'ollama/llama3')
    assert.deepEqual(reread.ended.map(entry => entry.sessionId), ['older'])
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700)
  })
  test('a stale completion cannot overwrite a newer conversation', () => {
    const captured = readDashboardChatConversations('agent')
    startNewDashboardConversation('agent')
    const before = fs.readFileSync(file)
    assert.throws(() => rememberDashboardConversationSession('agent', captured, 'stale-session', 'ollama/llama3'), /conversation changed/)
    assert.deepEqual(fs.readFileSync(file), before)
  })
  test('failed atomic replacement retains the previous record and removes its temporary file', () => {
    const before = fs.readFileSync(file), rename = fs.renameSync
    fs.renameSync = ((source, destination) => {
      if (String(destination) === file) throw new Error('synthetic storage failure')
      return rename(source, destination)
    }) as typeof fs.renameSync
    try { assert.throws(() => startNewDashboardConversation('agent'), /storage failure/) }
    finally { fs.renameSync = rename }
    assert.deepEqual(fs.readFileSync(file), before)
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['agent.json'])
  })
  test('corrupt recovery metadata fails closed', () => {
    const before = fs.readFileSync(file)
    try {
      fs.writeFileSync(file, '{bad json')
      assert.throws(() => readDashboardChatConversations('agent'), /could not be read/)
      fs.writeFileSync(file, JSON.stringify({ activeSeed: 'seed', activeSessionModel: 'model', ended: [] }))
      assert.throws(() => readDashboardChatConversations('agent'), /malformed/)
    } finally { fs.writeFileSync(file, before) }
  })
  test('the same agent id in another workspace cannot read this record', () => {
    const original = process.env.CLAWMAX_TEST_WORKSPACE
    process.env.CLAWMAX_TEST_WORKSPACE = path.join(root, 'two')
    fs.mkdirSync(process.env.CLAWMAX_TEST_WORKSPACE)
    try { assert.deepEqual(readDashboardChatConversations('agent'), { activeSeed: defaultDashboardChatSeed('agent'), ended: [] }) }
    finally { process.env.CLAWMAX_TEST_WORKSPACE = original }
  })
  test('Continue pins its exact context and removing History never replaces the current context', () => {
    startNewDashboardConversation('agent', { sessionId: 'resumable-session', seed: 'original-seed' })
    const resumed = resumeDashboardConversation('agent', 'resumable-session')!
    assert.equal(resumed.activeSessionId, 'resumable-session')
    assert.equal(resumed.activeSessionModel, undefined, 'Explicit Continue remains independent of model changes')
    assert.equal(forgetEndedDashboardConversation('agent', 'resumable-session'), false)
    assert.equal(readDashboardChatConversations('agent').activeSessionId, 'resumable-session')
    assert.throws(() => rememberDashboardConversationSession('agent', resumed, '../outside', 'model'), /Invalid/)
  })
  console.log(`dashboard-chat-conversations.test.ts: ${passed} tests passed`)
} finally {
  if (previous === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = previous
  fs.rmSync(root, { recursive: true, force: true })
}
