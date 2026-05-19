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
    ends_at?: string
    message?: string
    operator_note?: string
  }
}

type CloudMaintenanceResolution = {
  resolved: boolean
  banner: MaintenanceBannerConfig | null
}

const CACHE_TTL_MS = 5_000
const STATUS_PATH = '/api/runtime/cloud-maintenance-status'

let cachedBanner: MaintenanceBannerConfig | null | undefined
let cachedAt = 0
let inflight: Promise<MaintenanceBannerConfig | null> | null = null

function extractHostnameLabel(hostname: string): string {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized || normalized === 'localhost' || normalized === '127.0.0.1') return ''
  return normalized.split('.')[0] || normalized
}

function extractHostnameFromRequestHost(requestHost?: string): string {
  const raw = (requestHost || '').trim()
  if (!raw) return ''

  const firstHost = raw.split(',')[0]?.trim() || ''
  if (!firstHost) return ''

  if (firstHost.startsWith('[')) {
    const closingBracket = firstHost.indexOf(']')
    if (closingBracket > 0) return firstHost.slice(1, closingBracket)
  }

  return firstHost.replace(/:\d+$/, '')
}

function extractHostnameFromUrl(candidate: string): string {
  try {
    return new URL(candidate).hostname.trim().toLowerCase()
  } catch {
    return ''
  }
}

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

function deriveInstanceKey(requestHost?: string): string {
  const explicit = (
    process.env.CLAWMAX_INSTANCE_KEY ||
    process.env.DASHBOARD_INSTANCE_KEY ||
    process.env.INSTANCE_KEY ||
    ''
  ).trim()
  if (explicit) return explicit

  const requestLabel = extractHostnameLabel(extractHostnameFromRequestHost(requestHost))
  if (requestLabel) return requestLabel

  const candidates = [
    (process.env.DASHBOARD_PUBLIC_URL || '').trim(),
    (process.env.DASHBOARD_APP_URL || '').trim(),
  ].filter(Boolean)

  for (const candidate of candidates) {
    const label = extractHostnameLabel(extractHostnameFromUrl(candidate))
    if (label) return label
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

function resolveCloudMaintenanceState(
  maintenance: CloudMaintenancePayload['maintenance'],
  nowMs: number = Date.now(),
): CloudMaintenanceState {
  const startAt = parseMaintenanceIsoWindow(maintenance?.starts_at)
  const endAt = parseMaintenanceIsoWindow(maintenance?.ends_at)
  const startMs = startAt ? Date.parse(startAt) : NaN
  const endMs = endAt ? Date.parse(endAt) : NaN
  const reportedState = normalizeState(maintenance?.state, maintenance?.active)

  if (maintenance?.active) {
    if (Number.isFinite(startMs) && nowMs < startMs && reportedState !== 'in_progress') return 'scheduled'
    return 'in_progress'
  }

  if (Number.isFinite(endMs) && nowMs > endMs) return 'none'
  if (Number.isFinite(startMs) && nowMs < startMs) return 'scheduled'
  return 'none'
}

function normalizeBannerBodyPart(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildBannerFromPayload(payload: CloudMaintenancePayload): MaintenanceBannerConfig | null {
  const maintenance = payload?.maintenance
  const state = resolveCloudMaintenanceState(maintenance)
  if (state === 'none') return null

  const message = typeof maintenance?.message === 'string' ? maintenance.message.trim() : ''
  const operatorNote = typeof maintenance?.operator_note === 'string' ? maintenance.operator_note.trim() : ''
  const seen = new Set<string>()
  const text = [message, operatorNote]
    .filter(Boolean)
    .filter((part) => {
      const normalized = normalizeBannerBodyPart(part)
      if (!normalized || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    .join('\n\n')
    .trim()
  if (!text) return null

  return {
    enabled: true,
    text,
    level: mapStateToLevel(state),
    startAt: parseMaintenanceIsoWindow(maintenance?.starts_at),
    endAt: parseMaintenanceIsoWindow(maintenance?.ends_at),
    link: resolveMaintenanceBannerLink(),
    dismissible: resolveMaintenanceBannerDismissible(),
  }
}

async function fetchCloudMaintenanceBanner(requestHost?: string): Promise<CloudMaintenanceResolution> {
  const statusUrl = getStatusBaseUrl()
  const token = (process.env.TEMPLATE_FEEDBACK_TOKEN || '').trim()
  const instanceKey = deriveInstanceKey(requestHost)
  if (!statusUrl || !token || !instanceKey) return { resolved: false, banner: null }

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
  return {
    resolved: true,
    banner: buildBannerFromPayload(data as CloudMaintenancePayload),
  }
}

export async function getResolvedMaintenanceBanner(
  rawEnv: Record<string, string>,
  requestHost?: string,
): Promise<MaintenanceBannerConfig | null> {
  const now = Date.now()
  if (typeof cachedBanner !== 'undefined' && now - cachedAt < CACHE_TTL_MS) {
    return cachedBanner
  }

  if (!inflight) {
    inflight = (async () => {
      try {
        const cloudResolution = await fetchCloudMaintenanceBanner(requestHost)
        if (cloudResolution.resolved) return cloudResolution.banner
        return getMaintenanceBanner(rawEnv)
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
