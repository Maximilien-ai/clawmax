/**
 * The page waits for a Dashboard API that starts after the frontend, with bounded retries.
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/apiReadiness.test.ts
 */
import assert from 'assert'
import http from 'http'
import type { AddressInfo } from 'net'
import { API_READINESS_TIMEOUT_MS, isApiLive, waitForApi } from './apiReadiness'

/** Answers like Vite's dev proxy: 502 text/plain until the API listens, then the API itself. */
async function startFrontend(apiStartsAfterMs: number) {
  const startedAt = Date.now()
  const requests: number[] = []
  const server = http.createServer((req, res) => {
    requests.push(Date.now() - startedAt)
    if (Date.now() - startedAt < apiStartsAfterMs) {
      res.writeHead(502, { 'Content-Type': 'text/plain' }).end()
    } else if (req.url === '/api/health/live') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ alive: true }))
    } else {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const fetchFrom: typeof fetch = (input, init) => fetch(`${base}${input}`, init)
  return { fetchFrom, requests, close: () => new Promise<void>(resolve => server.close(() => resolve())) }
}

async function main() {
  // Delayed backend start: the page keeps retrying through the 502s and recovers on its own.
  const frontend = await startFrontend(1200)
  try {
    const retries: number[] = []
    const startedAt = Date.now()
    const live = await waitForApi({ probe: () => isApiLive(frontend.fetchFrom), onRetry: attempt => retries.push(attempt) })
    assert.equal(live, true, 'recovers once the API listens')
    assert(Date.now() - startedAt >= 1200, 'did not report ready while the proxy still answered 502')
    assert(retries.length >= 3, `retried through the startup window (${retries.length} retries)`)
    assert(frontend.requests.length <= 8, `bounded probing, not a busy loop (${frontend.requests.length} requests)`)
  } finally {
    await frontend.close()
  }

  // Nothing listening at all (ECONNREFUSED): bounded, then gives up instead of loading forever.
  const closed = http.createServer()
  await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
  const closedPort = (closed.address() as AddressInfo).port
  await new Promise<void>(resolve => closed.close(() => resolve()))
  const refused: typeof fetch = (input, init) => fetch(`http://127.0.0.1:${closedPort}${input}`, init)
  assert.equal(await isApiLive(refused), false, 'a refused connection is not live')
  let probes = 0
  const startedAt = Date.now()
  assert.equal(await waitForApi({ probe: () => { probes++; return isApiLive(refused) }, timeoutMs: 900 }), false)
  assert(Date.now() - startedAt < 2000 && probes >= 2, `gave up within the deadline after ${probes} probes`)

  // Only the API's own answer counts: an HTML fallback page or a proxy error is not "live".
  for (const [status, contentType, body] of [
    [200, 'text/html', '<!doctype html><div id="root"></div>'],
    [200, 'application/json', '{"alive":false}'],
    [502, 'text/plain', ''],
    [503, 'application/json', '{"alive":true}'],
  ] as const) {
    const stub: typeof fetch = async () => new Response(body, { status, headers: { 'Content-Type': contentType } })
    assert.equal(await isApiLive(stub), false, `${status} ${contentType} ${body} is not live`)
  }

  // The default deadline is bounded, and the schedule backs off to a fixed ceiling.
  let clock = 0
  const sleeps: number[] = []
  const neverLive = await waitForApi({
    probe: async () => false,
    now: () => clock,
    sleep: async ms => { sleeps.push(ms); clock += ms },
  })
  assert.equal(neverLive, false)
  assert(clock <= API_READINESS_TIMEOUT_MS, `stopped within ${API_READINESS_TIMEOUT_MS}ms (${clock})`)
  assert.deepEqual(sleeps.slice(0, 6), [250, 500, 1000, 2000, 3000, 3000])
  assert(sleeps.length < 50, `bounded retries (${sleeps.length})`)

  // A live API mounts the app immediately, and an unmounted page stops probing.
  let retried = false
  assert.equal(await waitForApi({ probe: async () => true, onRetry: () => { retried = true } }), true)
  assert.equal(retried, false, 'no connecting state when the API is already up')
  const controller = new AbortController()
  controller.abort()
  assert.equal(await waitForApi({ probe: async () => true, signal: controller.signal }), false)

  const hungStart = Date.now()
  let requestSignal: AbortSignal | undefined
  assert.equal(await waitForApi({ timeoutMs: 35, probe: signal => {
    requestSignal = signal
    return new Promise(() => {})
  } }), false)
  assert(Date.now() - hungStart < 500, 'hung probe respects the overall deadline')
  assert(requestSignal?.aborted, 'timed-out probe is cancelled')
  for (const bodyStalls of [false, true]) {
    const cancel = new AbortController()
    let fetchSignal: AbortSignal | null | undefined
    const stalled: typeof fetch = async (_input, init) => {
      fetchSignal = init?.signal
      if (!bodyStalls) return new Promise(() => {})
      return { ok: true, json: () => new Promise(() => {}) } as Response
    }
    const result = isApiLive(stalled, cancel.signal)
    setTimeout(() => cancel.abort(), 20)
    assert.equal(await result, false, 'unmount cancels stalled headers and body')
    assert(fetchSignal?.aborted)
  }
  const cancelSleep = new AbortController()
  const sleepStart = Date.now()
  const sleeping = waitForApi({ probe: async () => false, delaysMs: [10000], signal: cancelSleep.signal,
    onRetry: () => setTimeout(() => cancelSleep.abort(), 20) })
  assert.equal(await sleeping, false)
  assert(Date.now() - sleepStart < 500, 'unmount cancels backoff promptly')

  console.log('API readiness tests passed')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
