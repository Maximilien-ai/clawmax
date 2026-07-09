/**
 * Runtime session store test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/runtime-sessions.test.ts
 */
import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { clearRuntimeSessions, hasRuntimeSession, markRuntimeSession } from './runtime-sessions'

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
  return withTempDir('clawmax-runtime-sessions-workspace-', (dir) => (
    withEnv({ CLAWMAX_TEST_WORKSPACE: dir, OPENCLAW_WORKSPACE: dir, HOME: dir }, () => fn(dir))
  ))
}

console.log(`\n${YELLOW}=== Runtime Session Store Test Suite ===${RESET}\n`)

test('hasRuntimeSession is false before any session is marked', () => {
  withWorkspace(() => {
    assert.strictEqual(hasRuntimeSession('claude', 'agent1', 'sess1'), false)
  })
})

test('markRuntimeSession then hasRuntimeSession round-trips true', () => {
  withWorkspace(() => {
    markRuntimeSession('claude', 'agent1', 'sess1')
    assert.strictEqual(hasRuntimeSession('claude', 'agent1', 'sess1'), true)
  })
})

test('session identity is scoped by runtime + agentId + scopedSessionId', () => {
  withWorkspace(() => {
    markRuntimeSession('claude', 'agent1', 'sess1')
    assert.strictEqual(hasRuntimeSession('droid', 'agent1', 'sess1'), false)
    assert.strictEqual(hasRuntimeSession('claude', 'agent2', 'sess1'), false)
    assert.strictEqual(hasRuntimeSession('claude', 'agent1', 'sess2'), false)
  })
})

test('marking the same session twice does not create a duplicate entry', () => {
  withWorkspace((dir) => {
    markRuntimeSession('claude', 'agent1', 'sess1')
    markRuntimeSession('claude', 'agent1', 'sess1')
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'SYSTEM', 'runtime-sessions.json'), 'utf-8'))
    const matches = raw.filter((e: any) => e.runtime === 'claude' && e.agentId === 'agent1' && e.scopedSessionId === 'sess1')
    assert.strictEqual(matches.length, 1)
  })
})

test('clearRuntimeSessions removes only entries for the given agentId', () => {
  withWorkspace(() => {
    markRuntimeSession('claude', 'agent1', 'sess1')
    markRuntimeSession('claude', 'agent2', 'sess1')
    clearRuntimeSessions('agent1')
    assert.strictEqual(hasRuntimeSession('claude', 'agent1', 'sess1'), false)
    assert.strictEqual(hasRuntimeSession('claude', 'agent2', 'sess1'), true)
  })
})

test('missing store file is tolerated as empty (no throw)', () => {
  withWorkspace(() => {
    assert.doesNotThrow(() => hasRuntimeSession('claude', 'agent1', 'sess1'))
    assert.strictEqual(hasRuntimeSession('claude', 'agent1', 'sess1'), false)
  })
})

test('corrupt store file (invalid JSON) is tolerated as empty (no throw)', () => {
  withWorkspace((dir) => {
    fs.mkdirSync(path.join(dir, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'SYSTEM', 'runtime-sessions.json'), '{not valid json', 'utf-8')
    assert.doesNotThrow(() => hasRuntimeSession('claude', 'agent1', 'sess1'))
    assert.strictEqual(hasRuntimeSession('claude', 'agent1', 'sess1'), false)
  })
})

test('corrupt store file (valid JSON but not an array) is tolerated as empty', () => {
  withWorkspace((dir) => {
    fs.mkdirSync(path.join(dir, 'SYSTEM'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'SYSTEM', 'runtime-sessions.json'), '{"unexpected":"shape"}', 'utf-8')
    assert.strictEqual(hasRuntimeSession('claude', 'agent1', 'sess1'), false)
    // Writing after a corrupt read should still succeed (treat corrupt as empty, then append).
    markRuntimeSession('claude', 'agent1', 'sess1')
    assert.strictEqual(hasRuntimeSession('claude', 'agent1', 'sess1'), true)
  })
})

test('store write is atomic (tmp file is renamed into place, no leftover .tmp files)', () => {
  withWorkspace((dir) => {
    markRuntimeSession('claude', 'agent1', 'sess1')
    const systemDir = path.join(dir, 'SYSTEM')
    const entries = fs.readdirSync(systemDir)
    assert.ok(entries.includes('runtime-sessions.json'))
    assert.ok(entries.every((name) => !name.endsWith('.tmp')), `Expected no leftover .tmp files, found: ${entries.join(', ')}`)
  })
})

test('FIFO cap: store never grows past ~2000 entries, oldest evicted first', () => {
  withWorkspace((dir) => {
    for (let i = 0; i < 2005; i++) {
      markRuntimeSession('claude', `agent-${i}`, 'sess1')
    }
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'SYSTEM', 'runtime-sessions.json'), 'utf-8'))
    assert.ok(raw.length <= 2000, `Expected capped store, got ${raw.length} entries`)
    // Oldest (agent-0..agent-4) should have been evicted; most recent should still be present.
    assert.strictEqual(hasRuntimeSession('claude', 'agent-0', 'sess1'), false)
    assert.strictEqual(hasRuntimeSession('claude', 'agent-2004', 'sess1'), true)
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
