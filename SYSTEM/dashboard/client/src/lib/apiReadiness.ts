/** Delays between readiness probes while the Dashboard API starts; the last one repeats. */
export const API_READINESS_DELAYS_MS = [250, 500, 1000, 2000, 3000]
/** How long the page waits for the API before offering a manual retry. */
export const API_READINESS_TIMEOUT_MS = 120_000

/** True once the API answers its public liveness route. In development Vite's proxy answers 502
 * until the API listens, and the API only listens after startup recovery has finished. */
export async function isApiLive(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl('/api/health/live', { cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) return false
    const body = await response.json().catch(() => null) as { alive?: unknown } | null
    return body?.alive === true
  } catch {
    return false
  }
}

export interface WaitForApiOptions {
  probe?: () => Promise<boolean>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  timeoutMs?: number
  delaysMs?: number[]
  /** Called after each failed probe, before waiting for the next one. */
  onRetry?: (attempt: number) => void
  signal?: AbortSignal
}

/** Probes until the API is live or the deadline passes; resolves whether it became live. */
export async function waitForApi(options: WaitForApiOptions = {}): Promise<boolean> {
  const {
    probe = () => isApiLive(),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = () => Date.now(),
    timeoutMs = API_READINESS_TIMEOUT_MS,
    delaysMs = API_READINESS_DELAYS_MS,
    onRetry,
    signal,
  } = options
  const deadline = now() + timeoutMs
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) return false
    if (await probe()) return true
    const delay = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)]
    if (now() + delay > deadline) return false
    onRetry?.(attempt)
    await sleep(delay)
  }
}
