/**
 * Agent turn registry test suite
 *
 * This module is the only kill switch for a turn that has no deadline (see agent-turns.ts's
 * module doc). Every assertion below is written against the actual finding it repairs, not
 * against implementation detail -- a test here that would also pass against the pre-fix code is
 * a failure of the test.
 *
 * Run with: npx ts-node --transpileOnly server/lib/agent-turns.test.ts
 */
import assert from 'assert'
import {
  activeTurnCount,
  cancelTurn,
  cancelTurnsForAgent,
  listActiveTurns,
  registerTurn,
  releaseTurn,
  touchTurn,
  withRegisteredTurn,
} from './agent-turns'

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

async function testAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

console.log(`\n${YELLOW}=== Agent Turn Registry Test Suite ===${RESET}\n`)

// ── register / release lifecycle ──

test('registerTurn adds an entry that releaseTurn removes, and nothing else', () => {
  const before = activeTurnCount()
  const turn = registerTurn('lifecycle-agent')
  assert.strictEqual(activeTurnCount(), before + 1)
  assert.strictEqual(turn.agentId, 'lifecycle-agent')
  assert.strictEqual(turn.controller.signal.aborted, false)
  assert.ok(listActiveTurns().some((t) => t.turnId === turn.turnId))

  releaseTurn(turn.turnId)
  assert.strictEqual(activeTurnCount(), before)
  assert.ok(!listActiveTurns().some((t) => t.turnId === turn.turnId))
})

test('releaseTurn on an id that was never registered, or already released, is a silent no-op', () => {
  const before = activeTurnCount()
  releaseTurn('never-registered:1')
  assert.strictEqual(activeTurnCount(), before)

  const turn = registerTurn('double-release-agent')
  releaseTurn(turn.turnId)
  releaseTurn(turn.turnId) // second release of the same id must not throw or go negative
  assert.strictEqual(activeTurnCount(), before)
})

// ── the leak this module exists to prevent: openclaw's success path forgot releaseTurn ──

async function run(): Promise<void> {
  await testAsync('withRegisteredTurn releases on the success path', async () => {
    const before = activeTurnCount()
    const result = await withRegisteredTurn('wrapper-agent', async (turn) => {
      assert.ok(turn.turnId.startsWith('wrapper-agent:'))
      assert.strictEqual(activeTurnCount(), before + 1)
      return 'done'
    })
    assert.strictEqual(result, 'done')
    // This is the exact shape of the openclaw bug: a turn that finishes cleanly (no cancel, no
    // error) still has to disappear from the registry, or every successful turn leaks forever.
    assert.strictEqual(activeTurnCount(), before)
  })

  await testAsync('withRegisteredTurn releases when fn rejects, and the rejection still propagates', async () => {
    const before = activeTurnCount()
    await assert.rejects(
      withRegisteredTurn('wrapper-agent-reject', async () => {
        throw new Error('boom')
      }),
      /boom/,
    )
    assert.strictEqual(activeTurnCount(), before)
  })

  await testAsync('withRegisteredTurn releases even when fn throws synchronously before awaiting anything', async () => {
    const before = activeTurnCount()
    await assert.rejects(
      // fn is typed async, but nothing stops a caller's callback body from throwing before its
      // first await -- the finally must still fire.
      withRegisteredTurn('wrapper-agent-sync-throw', async (): Promise<never> => {
        throw new Error('sync boom')
      }),
      /sync boom/,
    )
    assert.strictEqual(activeTurnCount(), before)
  })

  await testAsync('a leaked registration is impossible through the wrapper across many concurrent turns', async () => {
    const before = activeTurnCount()
    const outcomes = await Promise.allSettled([
      withRegisteredTurn('concurrent-agent', async () => 'ok'),
      withRegisteredTurn('concurrent-agent', async () => { throw new Error('fail-1') }),
      withRegisteredTurn('concurrent-agent', async (turn) => { await sleep(10); return turn.turnId }),
      withRegisteredTurn('concurrent-agent', async () => { throw new Error('fail-2') }),
    ])
    assert.strictEqual(outcomes.filter((o) => o.status === 'fulfilled').length, 2)
    assert.strictEqual(outcomes.filter((o) => o.status === 'rejected').length, 2)
    // Every one of the four registered its own turn; every one must have released it, success or not.
    assert.strictEqual(activeTurnCount(), before)
  })

  await testAsync('withRegisteredTurn hands out a signal that a concurrent cancelTurn actually aborts', async () => {
    // This is the wiring channels.ts/workflows.ts/agents.ts need instead of `new
    // AbortController().signal` (a controller nothing can ever reach): the signal handed to fn
    // must be the same one cancelTurn(turnId) can flip from outside while fn is still running.
    let capturedTurnId = ''
    let sawAbort = false
    const run = withRegisteredTurn('cancel-wired-agent', async (turn) => {
      capturedTurnId = turn.turnId
      await new Promise<void>((resolve) => {
        turn.signal.addEventListener('abort', () => {
          sawAbort = true
          resolve()
        })
      })
    })
    await sleep(10)
    assert.ok(capturedTurnId, 'fn must have started before we try to cancel it')
    const cancelled = cancelTurn(capturedTurnId)
    assert.strictEqual(cancelled, true)
    await run
    assert.strictEqual(sawAbort, true)
  })

  // ── the confirmed bug: cancel must be turn-scoped, not agent-scoped ──

  await testAsync('cancelTurn(turnId) stops only that turn -- a second concurrent turn for the same agent is untouched', async () => {
    // Reproduces the finding exactly: two tabs open on the same agent each register their own
    // turn (nothing in registerTurn or runExclusiveAgentExecution prevents this -- the lock only
    // orders execution, it does not block a second registration). Tab A clicking Cancel must not
    // abort Tab B's turn.
    const tabA = registerTurn('shared-agent')
    const tabB = registerTurn('shared-agent')
    try {
      assert.strictEqual(tabA.controller.signal.aborted, false)
      assert.strictEqual(tabB.controller.signal.aborted, false)

      const result = cancelTurn(tabA.turnId)

      assert.strictEqual(result, true)
      assert.strictEqual(tabA.controller.signal.aborted, true, 'the turn that was cancelled must be aborted')
      assert.strictEqual(tabB.controller.signal.aborted, false, 'a different tab\'s turn for the same agent must survive')
    } finally {
      releaseTurn(tabA.turnId)
      releaseTurn(tabB.turnId)
    }
  })

  await testAsync('cancelTurnsForAgent(agentId) is the bulk "stop this agent" path: it aborts every turn for that agent', async () => {
    const tabA = registerTurn('bulk-stop-agent')
    const tabB = registerTurn('bulk-stop-agent')
    const otherAgent = registerTurn('unrelated-agent')
    try {
      const count = cancelTurnsForAgent('bulk-stop-agent')
      assert.strictEqual(count, 2)
      assert.strictEqual(tabA.controller.signal.aborted, true)
      assert.strictEqual(tabB.controller.signal.aborted, true)
      assert.strictEqual(otherAgent.controller.signal.aborted, false, 'a different agent\'s turn must never be touched')
    } finally {
      releaseTurn(tabA.turnId)
      releaseTurn(tabB.turnId)
      releaseTurn(otherAgent.turnId)
    }
  })

  await testAsync('cancelling a non-existent turn id returns false and touches nothing', async () => {
    const before = activeTurnCount()
    assert.strictEqual(cancelTurn('no-such-turn:999'), false)
    assert.strictEqual(activeTurnCount(), before)
  })

  await testAsync('cancelTurn on an id that already finished (released) returns false, not a stale true', async () => {
    const turn = registerTurn('finished-agent')
    releaseTurn(turn.turnId)
    assert.strictEqual(cancelTurn(turn.turnId), false)
  })

  await testAsync('cancelTurnsForAgent on an agent with no turns returns 0', async () => {
    assert.strictEqual(cancelTurnsForAgent('agent-with-no-turns-at-all'), 0)
  })

  // ── listActiveTurns: elapsed grows unconditionally, idle resets on touch ──

  await testAsync('listActiveTurns reports elapsedMs growing regardless of activity, and idleMs reset by touchTurn', async () => {
    const turn = registerTurn('idle-agent')
    try {
      await sleep(50)
      const first = listActiveTurns().find((t) => t.turnId === turn.turnId)
      assert.ok(first, 'the registered turn must be listed')
      assert.ok(first!.elapsedMs >= 45, `expected elapsedMs to have advanced, got ${first!.elapsedMs}`)
      assert.ok(first!.idleMs >= 45, `with no activity, idleMs must track elapsedMs, got ${first!.idleMs}`)

      touchTurn(turn.turnId)
      const second = listActiveTurns().find((t) => t.turnId === turn.turnId)
      assert.ok(second!.idleMs < first!.idleMs, 'touchTurn must reset idle time')
      assert.ok(second!.elapsedMs >= first!.elapsedMs, 'elapsed must never go backwards')
      assert.strictEqual(second!.startedAt, first!.startedAt, 'touchTurn must not change when the turn started')
    } finally {
      releaseTurn(turn.turnId)
    }
  })

  await testAsync('touchTurn on an unknown turn id is a silent no-op (no throw, no phantom entry)', async () => {
    const before = activeTurnCount()
    touchTurn('phantom-turn:1')
    assert.strictEqual(activeTurnCount(), before)
    assert.ok(!listActiveTurns().some((t) => t.turnId === 'phantom-turn:1'))
  })
}

run().then(() => {
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
})
