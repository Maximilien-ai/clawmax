/** Delays between readiness probes; the last delay repeats. */
export const API_READINESS_DELAYS_MS = [250, 500, 1000, 2000, 3000]
export const API_READINESS_TIMEOUT_MS = 120_000

// Bound headers and body reads, including proxies that ignore cancellation.
function bounded(operation: (signal: AbortSignal) => Promise<boolean>, ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted || ms <= 0) return Promise.resolve(false)
  return new Promise(resolve => {
    const controller = new AbortController()
    let settled = false
    const abort = () => finish(false)
    const timer = setTimeout(abort, ms)
    function finish(value: boolean) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      controller.abort()
      resolve(value)
    }
    signal?.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(() => operation(controller.signal)).then(finish, () => finish(false))
  })
}

export function isApiLive(fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<boolean> {
  return bounded(async requestSignal => {
    const response = await fetchImpl('/api/health/live', { cache: 'no-store', credentials: 'same-origin', signal: requestSignal })
    if (!response.ok) return false
    const body = await response.json() as { alive?: unknown } | null
    return body?.alive === true
  }, 5000, signal)
}

export interface WaitForApiOptions {
  probe?: (signal: AbortSignal) => Promise<boolean>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  timeoutMs?: number
  delaysMs?: number[]
  onRetry?: (attempt: number) => void
  signal?: AbortSignal
}

/** Wait for startup with bounded requests/backoff; unmount cancels both immediately. */
export async function waitForApi(options: WaitForApiOptions = {}): Promise<boolean> {
  const { probe = signal => isApiLive(fetch, signal), sleep, now = Date.now,
    timeoutMs = API_READINESS_TIMEOUT_MS, delaysMs = API_READINESS_DELAYS_MS, onRetry, signal } = options
  const deadline = now() + timeoutMs
  const schedule = delaysMs.length ? delaysMs : API_READINESS_DELAYS_MS
  for (let attempt = 1; ; attempt++) {
    const remaining = deadline - now()
    if (signal?.aborted || remaining <= 0) return false
    if (await bounded(probe, Math.min(5000, remaining), signal)) return !signal?.aborted
    if (signal?.aborted) return false
    const delay = Math.max(1, schedule[Math.min(attempt - 1, schedule.length - 1)])
    if (now() + delay > deadline) return false
    onRetry?.(attempt)
    if (!await bounded(async waitSignal => {
      if (sleep) await sleep(delay)
      else await new Promise<void>(resolve => {
        const timer = setTimeout(done, delay)
        function done() { clearTimeout(timer); waitSignal.removeEventListener('abort', done); resolve() }
        waitSignal.addEventListener('abort', done, { once: true })
      })
      return true
    }, Math.max(1, deadline - now()), signal)) return false
  }
}
