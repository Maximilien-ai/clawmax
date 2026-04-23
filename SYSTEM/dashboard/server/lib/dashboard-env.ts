import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

export interface ProviderKeys {
  openai?: string
  anthropic?: string
  gemini?: string
}

export interface MaintenanceBannerConfig {
  enabled: boolean
  text: string
  level: 'info' | 'warning' | 'critical'
  startAt?: string
  endAt?: string
  link?: string
  dismissible: boolean
}

// Try multiple paths to find .env — handles different working directories
function findEnvPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', '.env'),           // from server/lib/
    path.resolve(process.cwd(), '.env'),                    // from SYSTEM/dashboard/
    path.resolve(process.cwd(), 'SYSTEM', 'dashboard', '.env'), // from repo root
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return candidates[0] // fallback
}

export const DASHBOARD_ENV_PATH = findEnvPath()

function readDashboardEnvFile(): Record<string, string> {
  try {
    if (!fs.existsSync(DASHBOARD_ENV_PATH)) {
      console.warn(`Dashboard .env not found at ${DASHBOARD_ENV_PATH}`)
      return {}
    }
    console.log(`Loading .env from: ${DASHBOARD_ENV_PATH}`)
    return dotenv.parse(fs.readFileSync(DASHBOARD_ENV_PATH, 'utf-8'))
  } catch (err) {
    console.warn('Failed to parse dashboard .env file:', err)
    return {}
  }
}

const dashboardEnv = readDashboardEnvFile()

// Load dashboard-local env into process.env and explicitly override shell exports.
dotenv.config({ path: DASHBOARD_ENV_PATH, override: true })

function firstNonEmpty(rawEnv: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = rawEnv[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

// In container mode (no .env file), fall back to process.env for provider keys
const isContainerMode = Object.keys(dashboardEnv).length === 0

function hasAnyProviderKey(keys: ProviderKeys): boolean {
  return !!(keys.openai || keys.anthropic || keys.gemini)
}

function parseBooleanFlag(value?: string): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function normalizeMaintenanceLevel(value?: string): 'info' | 'warning' | 'critical' {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'critical') return 'critical'
  if (normalized === 'warning') return 'warning'
  return 'info'
}

export function parseMaintenanceBooleanFlag(value?: string): boolean {
  return parseBooleanFlag(value)
}

export function resolveMaintenanceBannerLink(rawEnv: Record<string, string> = dashboardEnv): string | undefined {
  return (firstNonEmpty(rawEnv, 'MAINTENANCE_BANNER_LINK') || process.env.MAINTENANCE_BANNER_LINK || '').trim() || undefined
}

export function resolveMaintenanceBannerDismissible(rawEnv: Record<string, string> = dashboardEnv): boolean {
  return parseBooleanFlag(firstNonEmpty(rawEnv, 'MAINTENANCE_BANNER_DISMISSIBLE') || process.env.MAINTENANCE_BANNER_DISMISSIBLE)
}

export function normalizeMaintenanceBannerLevel(value?: string): 'info' | 'warning' | 'critical' {
  return normalizeMaintenanceLevel(value)
}

export function parseMaintenanceIsoWindow(value?: string): string | undefined {
  return parseIsoWindow(value)
}

function parseIsoWindow(value?: string): string | undefined {
  if (!value?.trim()) return undefined
  const parsed = new Date(value.trim())
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed.toISOString()
}

export function getDashboardEnvRaw(): Record<string, string> {
  return { ...dashboardEnv }
}

export function isManagedRuntime(rawEnv: Record<string, string> = dashboardEnv): boolean {
  return Object.keys(rawEnv).length === 0
}

export function getMaintenanceBanner(rawEnv: Record<string, string> = dashboardEnv): MaintenanceBannerConfig | null {
  const fallbackState = (firstNonEmpty(rawEnv, 'MAINTENANCE_STATE') || process.env.MAINTENANCE_STATE || '').trim().toLowerCase()
  const fallbackMessage = (firstNonEmpty(rawEnv, 'MAINTENANCE_MESSAGE') || process.env.MAINTENANCE_MESSAGE || '').trim()
  if (fallbackState && fallbackState !== 'none' && fallbackMessage) {
    return {
      enabled: true,
      text: fallbackMessage,
      level: fallbackState === 'in_progress' ? 'critical' : 'warning',
      startAt: parseIsoWindow(firstNonEmpty(rawEnv, 'MAINTENANCE_STARTS_AT') || process.env.MAINTENANCE_STARTS_AT),
      link: resolveMaintenanceBannerLink(rawEnv),
      dismissible: resolveMaintenanceBannerDismissible(rawEnv),
    }
  }

  const enabled = parseBooleanFlag(firstNonEmpty(rawEnv, 'MAINTENANCE_BANNER_ENABLED') || process.env.MAINTENANCE_BANNER_ENABLED)
  const text = (firstNonEmpty(rawEnv, 'MAINTENANCE_BANNER_TEXT') || process.env.MAINTENANCE_BANNER_TEXT || '').trim()
  if (!enabled || !text) return null

  const startAt = parseIsoWindow(firstNonEmpty(rawEnv, 'MAINTENANCE_BANNER_START_AT') || process.env.MAINTENANCE_BANNER_START_AT)
  const endAt = parseIsoWindow(firstNonEmpty(rawEnv, 'MAINTENANCE_BANNER_END_AT') || process.env.MAINTENANCE_BANNER_END_AT)
  const now = Date.now()
  if (endAt && now > Date.parse(endAt)) return null

  return {
    enabled: true,
    text,
    level: normalizeMaintenanceLevel(firstNonEmpty(rawEnv, 'MAINTENANCE_BANNER_LEVEL') || process.env.MAINTENANCE_BANNER_LEVEL),
    startAt,
    endAt,
    link: resolveMaintenanceBannerLink(rawEnv),
    dismissible: resolveMaintenanceBannerDismissible(rawEnv),
  }
}

export function isOllamaUiEnabled(rawEnv: Record<string, string> = dashboardEnv): boolean {
  const explicit = firstNonEmpty(rawEnv, 'DASHBOARD_ENABLE_OLLAMA') || process.env.DASHBOARD_ENABLE_OLLAMA?.trim()
  if (explicit === 'true') return true
  if (explicit === 'false') return false
  return !isManagedRuntime(rawEnv)
}

export function getDefaultOllamaBaseUrl(rawEnv: Record<string, string> = dashboardEnv): string {
  const explicit = firstNonEmpty(rawEnv, 'OLLAMA_BASE_URL') || process.env.OLLAMA_BASE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/+$/, '')
  }
  return isManagedRuntime(rawEnv) ? '' : 'http://localhost:11434'
}

export function getSystemProviderKeys(rawEnv: Record<string, string> = dashboardEnv): ProviderKeys {
  const allowProcessFallback = rawEnv === dashboardEnv && isContainerMode
  const lookup = allowProcessFallback
    ? (key: string) => firstNonEmpty(rawEnv, key) || (process.env[key]?.trim() || undefined)
    : (key: string) => firstNonEmpty(rawEnv, key)
  return {
    openai: lookup('SYSTEM_OPENAI_API_KEY') || lookup('OPENAI_API_KEY'),
    anthropic: lookup('SYSTEM_ANTHROPIC_API_KEY') || lookup('ANTHROPIC_API_KEY'),
    gemini: lookup('SYSTEM_GEMINI_API_KEY') || lookup('GEMINI_API_KEY'),
  }
}

export function getUserDefaultProviderKeys(rawEnv: Record<string, string> = dashboardEnv): ProviderKeys {
  return {
    openai: firstNonEmpty(rawEnv, 'USER_OPENAI_API_KEY'),
    anthropic: firstNonEmpty(rawEnv, 'USER_ANTHROPIC_API_KEY'),
    gemini: firstNonEmpty(rawEnv, 'USER_GEMINI_API_KEY'),
  }
}

export function allowSystemKeysForUserExecution(rawEnv: Record<string, string> = dashboardEnv): boolean {
  return firstNonEmpty(rawEnv, 'ALLOW_SYSTEM_KEYS_FOR_USER_EXECUTION') === 'true'
}

export function resolveUserExecutionProviderKeys(
  rawEnv: Record<string, string> = dashboardEnv,
  byokOverrides?: ProviderKeys
): ProviderKeys {
  if (hasAnyProviderKey(byokOverrides || {})) {
    return {
      openai: byokOverrides?.openai?.trim() || undefined,
      anthropic: byokOverrides?.anthropic?.trim() || undefined,
      gemini: byokOverrides?.gemini?.trim() || undefined,
    }
  }

  const userDefaults = getUserDefaultProviderKeys(rawEnv)
  if (hasAnyProviderKey(userDefaults)) {
    return userDefaults
  }

  return allowSystemKeysForUserExecution(rawEnv) ? getSystemProviderKeys(rawEnv) : {}
}

/**
 * Get the best available hosted model based on configured API keys.
 * Workspace-level Ollama preference is handled in integrations/template apply UI paths.
 * Provider order: OpenAI → Gemini → Anthropic.
 */
export function getBestAvailableModel(rawEnv: Record<string, string> = dashboardEnv): string {
  const keys = resolveSystemExecutionProviderKeys(rawEnv)
  if (keys.openai) return 'openai/gpt-5'
  if (keys.gemini) return 'gemini/gemini-2.5-pro'
  if (keys.anthropic) return 'anthropic/claude-sonnet-4-20250514'
  return 'openai/gpt-4o-mini' // fallback — may fail without keys
}

/**
 * Get a cost-efficient hosted model for bulk/test operations.
 * Provider order: OpenAI → Gemini → Anthropic.
 */
export function getCostEfficientModel(rawEnv: Record<string, string> = dashboardEnv): string {
  const keys = resolveSystemExecutionProviderKeys(rawEnv)
  if (keys.openai) return 'openai/gpt-4o-mini'
  if (keys.gemini) return 'gemini/gemini-2.5-flash'
  if (keys.anthropic) return 'anthropic/claude-sonnet-4-20250514'
  return 'openai/gpt-4o-mini'
}

export function resolveSystemExecutionProviderKeys(rawEnv: Record<string, string> = dashboardEnv): ProviderKeys {
  const systemKeys = getSystemProviderKeys(rawEnv)
  if (hasAnyProviderKey(systemKeys)) {
    return systemKeys
  }
  return getUserDefaultProviderKeys(rawEnv)
}
