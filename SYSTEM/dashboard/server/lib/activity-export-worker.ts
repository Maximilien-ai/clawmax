import { flushActivityExportOutbox, listActivityExportPurges, listAllActivityExportOutbox, recordActivityExportPurgeResult, setActivityExportQueueListener, type ActivityExportFlushResult } from './activity-export'
import { getResolvedWorkspaceIntegrationConfig, readWorkspaceIntegrationSecrets } from './workspace-integrations'
import { AGENTFORGE_DESTINATION_ID, agentForgeActivityEndpoint, getAgentForgeRuntimeConfig, revokeAgentForgeConsent } from './agentforge-activity-export'

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
let timer: ReturnType<typeof setInterval> | null = null
let running = false
let startedAt: string | undefined
let lastAttemptAt: string | undefined
let lastResult: ActivityExportFlushResult | null = null
let lastError: string | undefined
let lastPurgeResult: { attempted: number; completed: number; remaining: number; error?: string } | null = null

async function flushAgentForgePurgeQueue(): Promise<typeof lastPurgeResult> {
  const config = getAgentForgeRuntimeConfig()
  const pending = listActivityExportPurges(AGENTFORGE_DESTINATION_ID).filter((entry) => !entry.completedAt).slice(0, 20)
  if (!config || pending.length === 0) return null
  let completed = 0
  let error: string | undefined
  for (const entry of pending) {
    try {
      await revokeAgentForgeConsent(entry.receiptId, { config })
      recordActivityExportPurgeResult(entry.receiptId, entry.destinationId, { completed: true })
      completed += 1
    } catch (cause: any) {
      error = cause?.message || String(cause)
      recordActivityExportPurgeResult(entry.receiptId, entry.destinationId, { completed: false, error })
    }
  }
  return {
    attempted: pending.length,
    completed,
    remaining: listActivityExportPurges(AGENTFORGE_DESTINATION_ID).filter((entry) => !entry.completedAt).length,
    error,
  }
}

function intervalMs(): number {
  const configured = Number.parseInt(process.env.CLAWMAX_ACTIVITY_EXPORT_INTERVAL_MS || '', 10)
  return Number.isFinite(configured) && configured >= 1000 ? configured : DEFAULT_INTERVAL_MS
}

export async function flushActivityExportWorker(): Promise<ActivityExportFlushResult | null> {
  if (running) return null
  running = true
  lastAttemptAt = new Date().toISOString()
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
    lastPurgeResult = await flushAgentForgePurgeQueue()
    if (lastPurgeResult?.error) {
      combined = combined
        ? { ...combined, error: combined.error || lastPurgeResult.error }
        : { attempted: 0, delivered: 0, remaining: listAllActivityExportOutbox().length, error: lastPurgeResult.error }
    }
    lastResult = combined
    lastError = combined?.error
    return combined
  } catch (error: any) {
    lastError = error?.message || String(error)
    throw error
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
  if (destinationId === AGENTFORGE_DESTINATION_ID) {
    const config = getAgentForgeRuntimeConfig()
    const endpoint = agentForgeActivityEndpoint(config)
    return config && endpoint ? { endpoint, token: config.apiKey } : null
  }
  return null
}

export function startActivityExportWorker(log: (message: string) => void = console.log): void {
  if (timer) return
  if (!hasConfiguredDestination()) {
    log('[Activity Export] worker disabled: no destination credentials are configured in this dashboard process')
    return
  }
  startedAt = new Date().toISOString()
  setActivityExportQueueListener(() => { runFlush(log) })
  log(`[Activity Export] worker started (interval=${intervalMs()}ms; clawmax-ai=${Boolean(process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT?.trim() && process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN?.trim())}; digo=${Boolean(destinationCredentials('digo'))}; agentforge=${Boolean(destinationCredentials(AGENTFORGE_DESTINATION_ID))})`)
  timer = setInterval(() => runFlush(log), intervalMs())
  timer.unref?.()
  runFlush(log)
}

function runFlush(log: (message: string) => void): void {
  void flushActivityExportWorker().then((result) => {
    if (!result || result.attempted === 0) return
    if (result.error) log(`[Activity Export] delivery delayed: ${result.error}`)
    else log(`[Activity Export] delivered ${result.delivered} event(s); ${result.remaining} remaining`)
  }).catch((error: any) => log(`[Activity Export] worker failed: ${error?.message || String(error)}`))
}

function hasConfiguredDestination(): boolean {
  return Boolean(
    (process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT?.trim() && process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN?.trim()) ||
    destinationCredentials('digo') ||
    destinationCredentials(AGENTFORGE_DESTINATION_ID),
  )
}

export function stopActivityExportWorker(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
  setActivityExportQueueListener(null)
}

export function getActivityExportWorkerStatus(): {
  running: boolean
  startedAt?: string
  lastAttemptAt?: string
  lastResult: ActivityExportFlushResult | null
  lastError?: string
  intervalMs: number
  configured: { clawmaxAi: boolean; digo: boolean; agentforge: boolean }
  purge: { attempted: number; completed: number; remaining: number; error?: string } | null
} {
  return {
    running: Boolean(timer),
    startedAt,
    lastAttemptAt,
    lastResult,
    lastError,
    intervalMs: intervalMs(),
    configured: {
      clawmaxAi: Boolean(process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT?.trim() && process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN?.trim()),
      digo: Boolean(destinationCredentials('digo')),
      agentforge: Boolean(destinationCredentials(AGENTFORGE_DESTINATION_ID)),
    },
    purge: lastPurgeResult,
  }
}
