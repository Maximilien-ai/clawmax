import {
  type MaintenanceBannerConfig,
  getMaintenanceBanner,
  normalizeMaintenanceBannerLevel,
  parseMaintenanceIsoWindow,
  resolveMaintenanceBannerDismissible,
  resolveMaintenanceBannerLink,
} from './dashboard-env'

type CloudMaintenanceState = 'none' | 'scheduled' | 'pending' | 'in_progress'

type CloudMaintenancePayload = {
  maintenance?: {
    active?: boolean
    state?: CloudMaintenanceState | string
    starts_at?: string
    message?: string
    operator_note?: string
  }
}

const CACHE_TTL_MS = 15_000
const STATUS_PATH = '/api/runtime/cloud-maintenance-status'

let cachedBanner: MaintenanceBannerConfig | null | undefined
let cachedAt = 0
let inflight: Promise<MaintenanceBannerConfig | null> | null = null

function getStatusBaseUrl(): string {
  const explicit = (process.env.CLOUD_MAINTENANCE_STATUS_URL || '').trim()
  if (explicit) return explicit

  const summaryUrl = (process.env.TEMPLATE_FEEDBACK_SUMMARY_URL || '').trim()
  if (summaryUrl) {
    try {
      return new URL(STATUS_PATH, summaryUrl).toString()
    } catch {}
  }

  const remoteUrl = (process.env.TEMPLATE_FEEDBACK_REMOTE_URL || '').trim()
  if (remoteUrl) {
    try {
      return new URL(STATUS_PATH, remoteUrl).toString()
    } catch {}
  }

  return ''
}

function deriveInstanceKey(): string {
  const explicit = (
    process.env.CLAWMAX_INSTANCE_KEY ||
    process.env.DASHBOARD_INSTANCE_KEY ||
    process.env.INSTANCE_KEY ||
    ''
  ).trim()
  if (explicit) return explicit

  const candidates = [
    (process.env.DASHBOARD_PUBLIC_URL || '').trim(),
    (process.env.DASHBOARD_APP_URL || '').trim(),
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      const hostname = new URL(candidate).hostname.trim().toLowerCase()
      if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') continue
      return hostname.split('.')[0] || hostname
    } catch {}
  }

  return ''
}

function normalizeState(value?: string, active?: boolean): CloudMaintenanceState {
  const normalized = (value || '').trim().toLowerCase()
  if (normalized === 'scheduled' || normalized === 'pending' || normalized === 'in_progress' || normalized === 'none') {
    return normalized
  }
  return active ? 'in_progress' : 'none'
}

function mapStateToLevel(state: CloudMaintenanceState): MaintenanceBannerConfig['level'] {
  if (state === 'in_progress') return 'critical'
  if (state === 'pending' || state === 'scheduled') return 'warning'
  return normalizeMaintenanceBannerLevel(undefined)
}

function buildBannerFromPayload(payload: CloudMaintenancePayload): MaintenanceBannerConfig | null {
  const maintenance = payload?.maintenance
  const state = normalizeState(maintenance?.state, maintenance?.active)
  if (state === 'none') return null

  const message = typeof maintenance?.message === 'string' ? maintenance.message.trim() : ''
  const operatorNote = typeof maintenance?.operator_note === 'string' ? maintenance.operator_note.trim() : ''
  const text = [message, operatorNote].filter(Boolean).join('\n\n').trim()
  if (!text) return null

  return {
    enabled: true,
    text,
    level: mapStateToLevel(state),
    startAt: parseMaintenanceIsoWindow(maintenance?.starts_at),
    link: resolveMaintenanceBannerLink(),
    dismissible: resolveMaintenanceBannerDismissible(),
  }
}

async function fetchCloudMaintenanceBanner(): Promise<MaintenanceBannerConfig | null> {
  const statusUrl = getStatusBaseUrl()
  const token = (process.env.TEMPLATE_FEEDBACK_TOKEN || '').trim()
  const instanceKey = deriveInstanceKey()
  if (!statusUrl || !token || !instanceKey) return null

  const url = new URL(statusUrl)
  url.searchParams.set('instance_key', instanceKey)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Cloud maintenance status request failed (${response.status})`)
  }

  const data = await response.json().catch(() => ({} as CloudMaintenancePayload))
  return buildBannerFromPayload(data as CloudMaintenancePayload)
}

export async function getResolvedMaintenanceBanner(rawEnv: Record<string, string>): Promise<MaintenanceBannerConfig | null> {
  const now = Date.now()
  if (typeof cachedBanner !== 'undefined' && now - cachedAt < CACHE_TTL_MS) {
    return cachedBanner
  }

  if (!inflight) {
    inflight = (async () => {
      try {
        const cloudBanner = await fetchCloudMaintenanceBanner()
        return cloudBanner || getMaintenanceBanner(rawEnv)
      } catch {
        return getMaintenanceBanner(rawEnv)
      }
    })()
      .then((banner) => {
        cachedBanner = banner
        cachedAt = Date.now()
        return banner
      })
      .finally(() => {
        inflight = null
      })
  }

  return inflight
}

export function resetResolvedMaintenanceBannerCache() {
  cachedBanner = undefined
  cachedAt = 0
  inflight = null
}
