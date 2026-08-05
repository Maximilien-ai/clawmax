import { flushActivityExportOutbox, type ActivityExportFlushResult } from './activity-export'

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000
let timer: ReturnType<typeof setInterval> | null = null
let running = false

function intervalMs(): number {
  const configured = Number.parseInt(process.env.CLAWMAX_ACTIVITY_EXPORT_INTERVAL_MS || '', 10)
  return Number.isFinite(configured) && configured >= 1000 ? configured : DEFAULT_INTERVAL_MS
}

export async function flushActivityExportWorker(): Promise<ActivityExportFlushResult | null> {
  if (!process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT?.trim() || !process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN?.trim()) return null
  if (running) return null
  running = true
  try {
    return await flushActivityExportOutbox()
  } finally {
    running = false
  }
}

export function startActivityExportWorker(log: (message: string) => void = console.log): void {
  if (timer || !process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT?.trim() || !process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN?.trim()) return
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

export function stopActivityExportWorker(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

