/**
 * Runtime transcript store test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/runtime-transcripts.test.ts
 */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  appendRuntimeTranscriptExchange,
  appendRuntimeTranscriptTurn,
  clearRuntimeTranscript,
  getLatestRuntimeTranscriptSessionId,
  hasRuntimeTranscripts,
  readRuntimeTranscript,
  readRuntimeTranscriptAsArchiveLines,
} from './runtime-transcripts'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function withTempDir<T>(prefix: string, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const originals = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    originals.set(key, process.env[key])
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of originals.entries()) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
  }
}

function withWorkspace<T>(fn: (dir: string) => T): T {
  return withTempDir('clawmax-runtime-transcripts-workspace-', (dir) => (
    withEnv({ CLAWMAX_TEST_WORKSPACE: dir, OPENCLAW_WORKSPACE: dir, HOME: dir }, () => fn(dir))
  ))
}

console.log(`\n${YELLOW}=== Runtime Transcript Store Test Suite ===${RESET}\n`)

test('readRuntimeTranscript returns empty array before anything is appended', () => {
  withWorkspace(() => {
    assert.deepStrictEqual(readRuntimeTranscript('agent1', 'sess1'), [])
  })
})

test('appendRuntimeTranscriptTurn then readRuntimeTranscript round-trips role/content, oldest first', () => {
  withWorkspace(() => {
    appendRuntimeTranscriptTurn('agent1', 'sess1', 'user', 'hello droid')
    appendRuntimeTranscriptTurn('agent1', 'sess1', 'assistant', 'hello human')
    const turns = readRuntimeTranscript('agent1', 'sess1')
    assert.strictEqual(turns.length, 2)
    assert.strictEqual(turns[0].role, 'user')
    assert.strictEqual(turns[0].content, 'hello droid')
    assert.strictEqual(turns[1].role, 'assistant')
    assert.strictEqual(turns[1].content, 'hello human')
    assert(turns[0].ts > 0 && turns[1].ts >= turns[0].ts, 'Expected monotonic timestamps')
  })
})

test('appendRuntimeTranscriptExchange appends both turns in append order', () => {
  withWorkspace(() => {
    appendRuntimeTranscriptExchange('agent1', 'sess1', 'what is 2+2', '4')
    const turns = readRuntimeTranscript('agent1', 'sess1')
    assert.deepStrictEqual(turns.map((t) => [t.role, t.content]), [
      ['user', 'what is 2+2'],
      ['assistant', '4'],
    ])
  })
})

test('appendRuntimeTranscriptExchange with no assistant text appends only the user turn', () => {
  withWorkspace(() => {
    appendRuntimeTranscriptExchange('agent1', 'sess1', 'a question that errored')
    const turns = readRuntimeTranscript('agent1', 'sess1')
    assert.strictEqual(turns.length, 1)
    assert.strictEqual(turns[0].role, 'user')
  })
})

test('appendRuntimeTranscriptTurn ignores blank/whitespace-only content', () => {
  withWorkspace(() => {
    appendRuntimeTranscriptTurn('agent1', 'sess1', 'user', '   ')
    appendRuntimeTranscriptTurn('agent1', 'sess1', 'assistant', '')
    assert.deepStrictEqual(readRuntimeTranscript('agent1', 'sess1'), [])
  })
})

test('transcript identity is scoped by agentId + scopedSessionId', () => {
  withWorkspace(() => {
    appendRuntimeTranscriptTurn('agent1', 'sess1', 'user', 'agent1 sess1 message')
    assert.deepStrictEqual(readRuntimeTranscript('agent2', 'sess1'), [])
    assert.deepStrictEqual(readRuntimeTranscript('agent1', 'sess2'), [])
    assert.strictEqual(readRuntimeTranscript('agent1', 'sess1').length, 1)
  })
})

test('hasRuntimeTranscripts is false before any append and true after', () => {
  withWorkspace(() => {
    assert.strictEqual(hasRuntimeTranscripts('agent1'), false)
    appendRuntimeTranscriptTurn('agent1', 'sess1', 'user', 'hi')
    assert.strictEqual(hasRuntimeTranscripts('agent1'), true)
    assert.strictEqual(hasRuntimeTranscripts('agent2'), false, 'Expected hasRuntimeTranscripts to stay scoped per agent')
  })
})

test('clearRuntimeTranscript deletes only the targeted session file', () => {
  withWorkspace(() => {
    appendRuntimeTranscriptTurn('agent1', 'sess1', 'user', 'keep-me-out')
    appendRuntimeTranscriptTurn('agent1', 'sess2', 'user', 'keep-me-in')
    clearRuntimeTranscript('agent1', 'sess1')
    assert.deepStrictEqual(readRuntimeTranscript('agent1', 'sess1'), [])
    assert.strictEqual(readRuntimeTranscript('agent1', 'sess2').length, 1)
  })
})

test('clearRuntimeTranscript on a missing session is a no-op (does not throw)', () => {
  withWorkspace(() => {
    assert.doesNotThrow(() => clearRuntimeTranscript('agent1', 'never-existed'))
  })
})

test('missing workspace/agent dir is tolerated as empty (no throw)', () => {
  withWorkspace(() => {
    assert.doesNotThrow(() => readRuntimeTranscript('missing-agent', 'sess1'))
    assert.strictEqual(hasRuntimeTranscripts('missing-agent'), false)
  })
})

test('corrupt transcript line (invalid JSON) is skipped, valid lines around it still parse', () => {
  withWorkspace((dir) => {
    const filePath = path.join(dir, 'SYSTEM', 'runtime-transcripts', 'agent1', 'sess1.jsonl')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, [
      JSON.stringify({ role: 'user', content: 'before corruption', ts: 1 }),
      '{not valid json',
      JSON.stringify({ role: 'assistant', content: 'after corruption', ts: 2 }),
    ].join('\n'), 'utf-8')

    const turns = readRuntimeTranscript('agent1', 'sess1')
    assert.deepStrictEqual(turns.map((t) => t.content), ['before corruption', 'after corruption'])
  })
})

test('appends are atomic writes (fs.appendFileSync) with no leftover tmp files', () => {
  withWorkspace((dir) => {
    appendRuntimeTranscriptExchange('agent1', 'sess1', 'hi', 'hello')
    const agentDir = path.join(dir, 'SYSTEM', 'runtime-transcripts', 'agent1')
    const entries = fs.readdirSync(agentDir)
    assert.deepStrictEqual(entries, ['sess1.jsonl'])
  })
})

test('sanitizes scoped session ids that contain path-unsafe characters into a single file', () => {
  withWorkspace((dir) => {
    appendRuntimeTranscriptTurn('agent1', '../../etc/passwd', 'user', 'attempted traversal')
    const agentDir = path.join(dir, 'SYSTEM', 'runtime-transcripts', 'agent1')
    assert(fs.existsSync(agentDir), 'Expected transcript dir to exist')
    for (const name of fs.readdirSync(agentDir)) {
      assert(!name.includes('/'), `Expected sanitized filename with no path separators, got: ${name}`)
    }
    assert.strictEqual(fs.existsSync(path.join(dir, 'SYSTEM', 'runtime-transcripts', 'etc', 'passwd.jsonl')), false)
  })
})

test('FIFO cap: file count per agent never grows past 500, oldest session evicted first', () => {
  withWorkspace((dir) => {
    for (let i = 0; i < 505; i++) {
      appendRuntimeTranscriptTurn('agent1', `sess-${i}`, 'user', `message ${i}`)
    }
    const agentDir = path.join(dir, 'SYSTEM', 'runtime-transcripts', 'agent1')
    const files = fs.readdirSync(agentDir).filter((name) => name.endsWith('.jsonl'))
    assert.ok(files.length <= 500, `Expected capped file count, got ${files.length}`)
    // Oldest sessions (sess-0..sess-4) should have been evicted; most recent should still exist.
    assert.deepStrictEqual(readRuntimeTranscript('agent1', 'sess-0'), [])
    assert.strictEqual(readRuntimeTranscript('agent1', 'sess-504').length, 1)
  })
})

test('getLatestRuntimeTranscriptSessionId returns the most recently written session, null when none', () => {
  withWorkspace((dir) => {
    assert.strictEqual(getLatestRuntimeTranscriptSessionId('agent1'), null)
    appendRuntimeTranscriptTurn('agent1', 'older-session', 'user', 'first')
    // mtime granularity can be coarse; force distinct mtimes rather than sleeping.
    const olderPath = path.join(dir, 'SYSTEM', 'runtime-transcripts', 'agent1', 'older-session.jsonl')
    fs.utimesSync(olderPath, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))
    appendRuntimeTranscriptTurn('agent1', 'newer-session', 'user', 'second')
    assert.strictEqual(getLatestRuntimeTranscriptSessionId('agent1'), 'newer-session')
    // Live-verification regression (2026-07-09): claude/droid chats never write openclaw's
    // sessions.json, so history routes resolve the active session from this pointer — it must
    // reflect transcript writes alone, with no openclaw session store present at all.
    assert.strictEqual(getLatestRuntimeTranscriptSessionId('agent-without-transcripts'), null)
  })
})

test('readRuntimeTranscriptAsArchiveLines renders OpenClaw archive-format JSONL the archive parser accepts', () => {
  withWorkspace(() => {
    assert.strictEqual(readRuntimeTranscriptAsArchiveLines('agent1', 'sess1'), '', 'empty when no transcript')
    appendRuntimeTranscriptExchange('agent1', 'sess1', 'hello there', 'general kenobi')
    const lines = readRuntimeTranscriptAsArchiveLines('agent1', 'sess1').trim().split('\n')
    assert.strictEqual(lines.length, 2)
    const first = JSON.parse(lines[0])
    // Shape must match what the archives list/detail parser reads: {type:'message', message:{role,content,timestamp}}.
    assert.strictEqual(first.type, 'message')
    assert.strictEqual(first.message.role, 'user')
    assert.strictEqual(first.message.content, 'hello there')
    assert.strictEqual(typeof first.message.timestamp, 'number')
    assert.strictEqual(JSON.parse(lines[1]).message.role, 'assistant')
  })
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  console.log(`${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}All tests passed${RESET}`)
}
