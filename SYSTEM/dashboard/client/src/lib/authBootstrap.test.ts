import assert from 'node:assert/strict'
import { loadAuthBootstrap, waitForAuthRetry } from './authBootstrap'

async function main() {
  for (const status of [429, 502, 503, 504]) {
    let calls = 0
    const waits: number[] = []
    const result = await loadAuthBootstrap(new AbortController().signal, (async () => new Response('{}', { status: ++calls <= 2 ? status : 200 })) as typeof fetch, async ms => { waits.push(ms) })
    assert.equal(result.config.status, 200)
    assert.equal(calls, 4)
    assert.deepEqual(waits, [1000])
  }
  let calls = 0
  const waits: number[] = []
  await assert.rejects(loadAuthBootstrap(new AbortController().signal, (async () => { calls++; return new Response('{}', { status: 503 }) }) as typeof fetch, async ms => { waits.push(ms) }), /after retrying/)
  assert.equal(calls, 12)
  assert.deepEqual(waits, [1000, 2000, 3000, 4000, 5000])
  const anonymous = await loadAuthBootstrap(new AbortController().signal, (async url => new Response('{}', { status: String(url).endsWith('/me') ? 401 : 200 })) as typeof fetch)
  assert.equal(anonymous.me.status, 401)
  calls = 0
  await loadAuthBootstrap(new AbortController().signal, (async () => { if (++calls <= 2) throw new TypeError('network'); return new Response('{}') }) as typeof fetch, async () => {})
  assert.equal(calls, 4)
  const abort = new AbortController()
  calls = 0
  await assert.rejects(loadAuthBootstrap(abort.signal, (async () => { calls++; return new Response('{}', { status: 504 }) }) as typeof fetch, async () => { abort.abort() }), /abort/i)
  assert.equal(calls, 2, 'Unmount prevents any new requests')
  const pending = new AbortController()
  const waiting = waitForAuthRetry(60000, pending.signal)
  pending.abort()
  await assert.rejects(waiting, /abort/i)
  calls = 0
  await assert.rejects(loadAuthBootstrap(new AbortController().signal, (async () => { calls++; return new Response('{}', {status:500}) }) as typeof fetch), /unavailable/)
  assert.equal(calls, 2)
  console.log('authBootstrap.test.ts: passed (recovery, retry bound, denial, network failures and cancellation)')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
