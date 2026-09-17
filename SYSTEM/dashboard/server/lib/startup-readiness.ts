export type StartupReadinessCheck = {
  name: string
  read: () => unknown[] | Record<string, unknown> | null | undefined
}

export type StartupReadiness = {
  ready: true
  checkedAt: string
  stores: Record<string, number>
}

function countResult(result: unknown): number {
  if (Array.isArray(result)) return result.length
  if (result && typeof result === 'object') return Object.keys(result).length
  return 0
}

export function verifyCorePersistentStateReadable(checks: StartupReadinessCheck[]): StartupReadiness {
  const stores: Record<string, number> = {}
  for (const check of checks) {
    try {
      stores[check.name] = countResult(check.read())
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Required persistent store "${check.name}" is unreadable: ${detail}`)
    }
  }
  return { ready: true, checkedAt: new Date().toISOString(), stores }
}

/** Coalesce public health checks without exposing gateway errors or credentials. */
export function createGatewayReadinessCheck(
  probe: () => Promise<{ running: boolean }>,
  now: () => number = Date.now,
) {
  let pending: Promise<boolean> | undefined
  let cached: { ready: boolean; expires: number } | undefined
  return (): Promise<boolean> => {
    if (cached && now() < cached.expires) return Promise.resolve(cached.ready)
    if (pending) return pending
    pending = Promise.resolve().then(probe)
      .then(result => result.running === true, () => false)
      .then(ready => {
        cached = { ready, expires: now() + 1000 }
        pending = undefined
        return ready
      })
    return pending
  }
}

export function createHealthHandler(options: {
  getStartupReadiness: () => StartupReadiness | null
  workspace: string
  gatewayRequired: () => boolean
  gatewayReady: () => Promise<boolean>
}) {
  return async (_req: unknown, res: {
    status: (code: number) => unknown
    json: (body: unknown) => unknown
  }): Promise<void> => {
    const readiness = options.getStartupReadiness()
    if (!readiness) {
      res.status(503)
      res.json({ ok: false, error: 'Required persistent stores are not ready.' })
      return
    }
    const required = options.gatewayRequired()
    let gatewayReady = !required
    if (required) {
      try { gatewayReady = await options.gatewayReady() } catch { gatewayReady = false }
    }
    res.status(gatewayReady ? 200 : 503)
    res.json({
      ok: gatewayReady,
      workspace: options.workspace,
      readiness: {
        ...readiness,
        ready: gatewayReady,
        gateway: { required, ready: required ? gatewayReady : null },
      },
      ...(!gatewayReady ? { error: 'Required gateway is not ready.' } : {}),
      time: new Date().toISOString(),
    })
  }
}
