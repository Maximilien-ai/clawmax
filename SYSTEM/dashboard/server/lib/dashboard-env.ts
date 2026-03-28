import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

export interface ProviderKeys {
  openai?: string
  anthropic?: string
}

export const DASHBOARD_ENV_PATH = path.resolve(__dirname, '..', '..', '.env')

function readDashboardEnvFile(): Record<string, string> {
  try {
    if (!fs.existsSync(DASHBOARD_ENV_PATH)) return {}
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

export function resolveSystemExecutionProviderKeys(rawEnv: Record<string, string> = dashboardEnv): ProviderKeys {
  const systemKeys = getSystemProviderKeys(rawEnv)
  if (hasAnyProviderKey(systemKeys)) {
    return systemKeys
  }
  return getUserDefaultProviderKeys(rawEnv)
}
