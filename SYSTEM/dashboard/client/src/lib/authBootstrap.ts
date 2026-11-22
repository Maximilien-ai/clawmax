const retryable = (status: number) => status === 429 || (status >= 502 && status <= 504)

export function waitForAuthRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

/** Temporary API startup failures get a bounded retry window; auth denial never does. */
export async function loadAuthBootstrap(signal: AbortSignal, request: typeof fetch = fetch, wait = waitForAuthRetry) {
  for (let attempt = 0; attempt < 6; attempt++) {
    signal.throwIfAborted()
    try {
      const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)])
      const [config, me] = await Promise.all([
        request('/api/auth/config', { credentials: 'include', cache: 'no-store', signal: requestSignal }),
        request('/api/auth/me', { credentials: 'include', cache: 'no-store', signal: requestSignal }),
      ])
      if (!retryable(config.status) && !retryable(me.status)) {
        if (!config.ok || (!me.ok && me.status !== 401 && me.status !== 403)) throw new Error('Session service unavailable')
        return { config, me }
      }
    } catch (error) {
      signal.throwIfAborted()
      // Only network failures and timeouts recover automatically. Other HTTP errors are final.
      if (!(error instanceof TypeError) && !(error instanceof DOMException && error.name === 'TimeoutError')) throw error
    }
    if (attempt < 5) await wait(Math.min(5000, (attempt + 1) * 1000), signal)
  }
  throw new Error('Session service unavailable after retrying')
}

export function shouldTriggerSessionExpired(input: RequestInfo | URL, response: Response, origin: string, requestSession: object | null, currentSession: object | null): boolean {
  if (!requestSession || requestSession !== currentSession || response.status !== 401) return false

  let urlString = ''
  if (typeof input === 'string') urlString = input
  else if (input instanceof URL) urlString = input.toString()
  else if (typeof Request !== 'undefined' && input instanceof Request) urlString = input.url

  const resolved = urlString
    ? new URL(urlString, origin)
    : null

  if (!resolved) return false
  if (resolved.origin !== origin) return false
  if (!resolved.pathname.startsWith('/api/')) return false
  if (resolved.pathname.startsWith('/api/auth/')) return false

  return true
}
