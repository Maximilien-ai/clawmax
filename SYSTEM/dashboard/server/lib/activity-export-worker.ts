import { flushActivityExportOutbox, listAllActivityExportOutbox, type ActivityExportFlushResult } from './activity-export'
import { getResolvedWorkspaceIntegrationConfig, readWorkspaceIntegrationSecrets } from './workspace-integrations'

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
let timer: ReturnType<typeof setInterval> | null = null
let running = false

function intervalMs(): number {
  const configured = Number.parseInt(process.env.CLAWMAX_ACTIVITY_EXPORT_INTERVAL_MS || '', 10)
  return Number.isFinite(configured) && configured >= 1000 ? configured : DEFAULT_INTERVAL_MS
}

export async function flushActivityExportWorker(): Promise<ActivityExportFlushResult | null> {
  if (running) return null
  running = true
  try {
    const destinations = new Set(listAllActivityExportOutbox().map((event) => event.destinationId))
    let combined: ActivityExportFlushResult | null = null
    for (const destinationId of destinations) {
      const delivery = destinationCredentials(destinationId)
      if (!delivery) continue
      const result = await flushActivityExportOutbox({ destinationId, endpoint: delivery.endpoint, token: delivery.token })
      combined = combined ? {
        attempted: combined.attempted + result.attempted,
        delivered: combined.delivered + result.delivered,
        remaining: result.remaining,
        error: combined.error || result.error,
      } : result
    }
    return combined
  } finally {
    running = false
  }
}

function destinationCredentials(destinationId: string): { endpoint: string; token: string } | null {
  if (destinationId === 'clawmax-ai') {
    const endpoint = process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT?.trim()
    const token = process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN?.trim()
    return endpoint && token ? { endpoint, token } : null
  }
  if (destinationId === 'digo') {
    const config = getResolvedWorkspaceIntegrationConfig()
    const endpoint = config.partners?.digo?.apiUrl
    const token = readWorkspaceIntegrationSecrets().partners?.digo?.apiKey
    return typeof endpoint === 'string' && /^https:\/\//i.test(endpoint) && typeof token === 'string' && token.trim()
      ? { endpoint, token: token.trim() }
      : null
  }
  return null
}

export function startActivityExportWorker(log: (message: string) => void = console.log): void {
  if (timer || !hasConfiguredDestination()) return
  const run = () => {
    void flushActivityExportWorker().then((result) => {
      if (!result || result.attempted === 0) return
      if (result.error) log(`[Activity Export] delivery delayed: ${result.error}`)
      else log(`[Activity Export] delivered ${result.delivered} event(s); ${result.remaining} remaining`)
    }).catch((error: any) => log(`[Activity Export] worker failed: ${error?.message || String(error)}`))
  }
  timer = setInterval(run, intervalMs())
  timer.unref?.()
  run()
}

function hasConfiguredDestination(): boolean {
  return Boolean(
    (process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT?.trim() && process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN?.trim()) ||
    destinationCredentials('digo'),
  )
}

export function stopActivityExportWorker(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
