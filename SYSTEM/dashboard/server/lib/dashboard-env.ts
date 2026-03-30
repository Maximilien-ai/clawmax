import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

export interface ProviderKeys {
  openai?: string
  anthropic?: string
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
  return !!(keys.openai || keys.anthropic)
}

export function getDashboardEnvRaw(): Record<string, string> {
  return { ...dashboardEnv }
}

export function getSystemProviderKeys(rawEnv: Record<string, string> = dashboardEnv): ProviderKeys {
  const allowProcessFallback = rawEnv === dashboardEnv && isContainerMode
  const lookup = allowProcessFallback
    ? (key: string) => firstNonEmpty(rawEnv, key) || (process.env[key]?.trim() || undefined)
    : (key: string) => firstNonEmpty(rawEnv, key)
  return {
    openai: lookup('SYSTEM_OPENAI_API_KEY') || lookup('OPENAI_API_KEY'),
    anthropic: lookup('SYSTEM_ANTHROPIC_API_KEY') || lookup('ANTHROPIC_API_KEY'),
  }
}

export function getUserDefaultProviderKeys(rawEnv: Record<string, string> = dashboardEnv): ProviderKeys {
  return {
    openai: firstNonEmpty(rawEnv, 'USER_OPENAI_API_KEY'),
    anthropic: firstNonEmpty(rawEnv, 'USER_ANTHROPIC_API_KEY'),
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
    }
  }

  const userDefaults = getUserDefaultProviderKeys(rawEnv)
  if (hasAnyProviderKey(userDefaults)) {
    return userDefaults
  }

  return allowSystemKeysForUserExecution(rawEnv) ? getSystemProviderKeys(rawEnv) : {}
}

/**
 * Get the best available model based on configured API keys.
 * Prefers Anthropic (better for coding/reasoning) when both available.
 */
export function getBestAvailableModel(rawEnv: Record<string, string> = dashboardEnv): string {
  const keys = resolveSystemExecutionProviderKeys(rawEnv)
  if (keys.anthropic) return 'anthropic/claude-opus-4-6'
  if (keys.openai) return 'openai/gpt-5'
  return 'anthropic/claude-sonnet-4-20250514' // fallback — may fail without keys
}

/**
 * Get a cost-efficient model for bulk/test operations.
 */
export function getCostEfficientModel(rawEnv: Record<string, string> = dashboardEnv): string {
  const keys = resolveSystemExecutionProviderKeys(rawEnv)
  if (keys.openai) return 'openai/gpt-4o-mini'
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
