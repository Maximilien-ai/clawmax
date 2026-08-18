import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { once } from 'events'
import { appendBoundedOutput, CHAT_OUTPUT_TRUNCATION_MARKER } from './stream-bounds'
import { signalProcessTree, terminateProcessTree } from './process-tree'

assert.strictEqual(appendBoundedOutput('hello', ' world', 20), 'hello world')
const bounded = appendBoundedOutput('abcdefghij', 'klmnopqrst', 16)
assert.strictEqual(bounded.length, 16, 'Bounded output must not exceed its configured limit')
assert(!bounded.includes(CHAT_OUTPUT_TRUNCATION_MARKER), 'Tiny limits may retain only the newest output')
assert(bounded.endsWith('qrst'), 'Tiny limits must retain the newest output tail')
const largerBounded = appendBoundedOutput('a'.repeat(80), 'z'.repeat(80), 100)
assert(largerBounded.includes(CHAT_OUTPUT_TRUNCATION_MARKER), 'Truncated output must carry a visible marker')
assert(largerBounded.startsWith('a'), 'Truncated output must retain its head')
assert(largerBounded.endsWith('z'), 'Truncated output must retain its tail')

const childSignals: string[] = []
const child = {
  pid: 12345,
  exitCode: null,
  signalCode: null,
  kill(signal: NodeJS.Signals) {
    childSignals.push(signal)
    return true
  },
} as any
const groupSignals: string[] = []
assert.strictEqual(
  signalProcessTree(child, 'SIGTERM', (_pid, signal) => { groupSignals.push(signal) }),
  process.platform === 'win32' ? 'child' : 'group',
)
if (process.platform === 'win32') {
  assert.deepStrictEqual(childSignals, ['SIGTERM'])
} else {
  assert.deepStrictEqual(groupSignals, ['SIGTERM'])
  assert.deepStrictEqual(childSignals, [])
}
assert.strictEqual(
  signalProcessTree(child, 'SIGKILL', () => { throw new Error('missing group') }),
  'child',
  'A missing process group must fall back to signalling the direct child',
)
assert(childSignals.includes('SIGKILL'))

const routeSource = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chat.ts'), 'utf8')
assert(routeSource.includes("detached: process.platform !== 'win32'"), 'Chat CLI must lead a signalable process group')
// Intent preserved, spelling changed: a forced stop still kills the whole process group, but now
// through cancelProcessTree, which also settles the caller. terminateProcessTree relied on 'close'
// to settle, and a runaway producer is precisely when a grandchild has escaped the group and is
// holding stdout open -- so 'close' never fired and the promise wedged behind the per-agent lock.
assert(/cancelProcessTree\(spawned|terminateProcessTree\(spawned/.test(routeSource),
  'Forced chat stops must terminate the process tree')
assert(routeSource.includes('cancelProcessTree(spawned'),
  'A forced stop must settle the caller, not wait on a close that an escaped grandchild can hold open')
// The idle TIMEOUT is gone -- turns have no deadline -- but the liveness signal it fed is still
// required: with no clock, elapsed/idle in GET /turns/active is the only way a wedged turn is
// visible to a human. bumpAttemptIdle now touches the turn registry instead of rearming a timer.
assert(routeSource.includes('bumpAttemptIdle()'), 'Chat output must keep reporting liveness')
assert(routeSource.includes('MAX_TOTAL_CHAT_OUTPUT'), 'Chat output must enforce a hard runaway ceiling')

async function verifyRealProcessGroupTermination() {
  if (process.platform === 'win32') return
  const spawned = spawn('/bin/sh', ['-c', 'trap "" TERM; (trap "" TERM; sleep 30) & echo $!; wait'], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  try {
    const [chunk] = await once(spawned.stdout!, 'data')
    const descendantPid = Number(String(chunk).trim())
    assert(Number.isInteger(descendantPid) && descendantPid > 0, 'Expected the fixture to report its descendant pid')
    terminateProcessTree(spawned, 25)
    await Promise.race([
      once(spawned, 'close'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Process tree did not terminate')), 2000)),
    ])
    await new Promise((resolve) => setTimeout(resolve, 25))
    let descendantAlive = true
    try { process.kill(descendantPid, 0) } catch { descendantAlive = false }
    assert(!descendantAlive, 'Expected SIGKILL escalation to remove a SIGTERM-ignoring descendant')
  } finally {
    if (spawned.exitCode === null && spawned.signalCode === null) signalProcessTree(spawned, 'SIGKILL')
  }
}

verifyRealProcessGroupTermination()
  .then(() => console.log(`chat-process-safety.test.ts: ${process.platform === 'win32' ? 15 : 17} assertions passed`))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
