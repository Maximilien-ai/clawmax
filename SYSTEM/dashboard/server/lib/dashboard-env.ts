import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

export interface ProviderKeys {
  openai?: string
  anthropic?: string
  nebius?: string
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
  // Check .env file first, then fall back to process.env (container env vars)
  for (const key of keys) {
    const value = rawEnv[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

function hasAnyProviderKey(keys: ProviderKeys): boolean {
  return !!(keys.openai || keys.anthropic || keys.nebius)
}

export function getDashboardEnvRaw(): Record<string, string> {
  return { ...dashboardEnv }
}

export function getSystemProviderKeys(rawEnv: Record<string, string> = dashboardEnv): ProviderKeys {
  return {
    openai: firstNonEmpty(rawEnv, 'SYSTEM_OPENAI_API_KEY', 'OPENAI_API_KEY'),
    anthropic: firstNonEmpty(rawEnv, 'SYSTEM_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'),
    nebius: firstNonEmpty(rawEnv, 'SYSTEM_NEBIUS_API_KEY', 'NEBIUS_API_KEY'),
  }
}

export function getUserDefaultProviderKeys(rawEnv: Record<string, string> = dashboardEnv): ProviderKeys {
  return {
    openai: firstNonEmpty(rawEnv, 'USER_OPENAI_API_KEY'),
    anthropic: firstNonEmpty(rawEnv, 'USER_ANTHROPIC_API_KEY'),
    nebius: firstNonEmpty(rawEnv, 'USER_NEBIUS_API_KEY'),
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
      nebius: byokOverrides?.nebius?.trim() || undefined,
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
