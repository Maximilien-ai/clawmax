export type TenantResourceKind = 'workspaces' | 'agents' | 'workflows'

export type TenantResourceLimits = Record<TenantResourceKind, number | null>

export type TenantResourceLimitConfig = {
  messageTemplate: string | null
  upgradeUrl: string | null
}

const ENV_KEYS: Record<TenantResourceKind, string> = {
  workspaces: 'CLAWMAX_MAX_WORKSPACES',
  agents: 'CLAWMAX_MAX_AGENTS_PER_WORKSPACE',
  workflows: 'CLAWMAX_MAX_WORKFLOWS_PER_WORKSPACE',
}

const LIMIT_MESSAGE_KEY = 'CLAWMAX_RESOURCE_LIMIT_UPGRADE_MESSAGE'
const LIMIT_URL_KEY = 'CLAWMAX_RESOURCE_LIMIT_UPGRADE_URL'

function parseLimit(value: unknown, key: string): number | null | undefined {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  if (!/^\d+$/.test(text)) throw new Error(`${key} must be a non-negative integer`)
  const parsed = Number(text)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${key} must be a safe integer`)
  return parsed
}

export function getTenantResourceLimits(env: Record<string, string | undefined> = process.env): TenantResourceLimits {
  const limits = {} as TenantResourceLimits
  for (const kind of Object.keys(ENV_KEYS) as TenantResourceKind[]) {
    const explicit = parseLimit(env[ENV_KEYS[kind]], ENV_KEYS[kind])
    limits[kind] = explicit === undefined ? null : explicit
  }
  return limits
}

export function getTenantResourceLimitConfig(
  env: Record<string, string | undefined> = process.env,
): TenantResourceLimitConfig {
  const messageTemplate = String(env[LIMIT_MESSAGE_KEY] || '').trim().slice(0, 1000) || null
  const rawUrl = String(env[LIMIT_URL_KEY] || '').trim()
  let upgradeUrl: string | null = null
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') upgradeUrl = parsed.toString()
    } catch {}
  }
  return { messageTemplate, upgradeUrl }
}

function renderLimitMessage(
  template: string | null,
  resource: TenantResourceKind,
  current: number,
  limit: number,
): string | null {
  if (!template) return null
  return template
    .replaceAll('{resource}', resource)
    .replaceAll('{current}', String(current))
    .replaceAll('{limit}', String(limit))
}

export class TenantResourceLimitError extends Error {
  readonly code = 'TENANT_RESOURCE_LIMIT_REACHED'
  readonly statusCode = 409
  readonly upgradeMessage: string | null
  readonly upgradeUrl: string | null

  constructor(
    readonly resource: TenantResourceKind,
    readonly limit: number,
    readonly current: number,
    env: Record<string, string | undefined> = process.env,
  ) {
    const config = getTenantResourceLimitConfig(env)
    const upgradeMessage = renderLimitMessage(config.messageTemplate, resource, current, limit)
    super(upgradeMessage || `Tenant ${resource} limit reached (${current}/${limit}). Delete an existing ${resource.slice(0, -1)} or increase ${ENV_KEYS[resource]}.`)
    this.upgradeMessage = upgradeMessage
    this.upgradeUrl = config.upgradeUrl
  }
}

export function assertTenantResourceCapacity(
  resource: TenantResourceKind,
  current: number,
  env: Record<string, string | undefined> = process.env,
  addition = 1,
): void {
  const limit = getTenantResourceLimits(env)[resource]
  if (!Number.isSafeInteger(addition) || addition < 0) throw new Error('Tenant resource addition must be a non-negative integer')
  if (limit !== null && current + addition > limit) {
    throw new TenantResourceLimitError(resource, limit, current, env)
  }
}

export function tenantResourceLimitResponse(error: unknown): {
  statusCode: number
  body: { error: string; code: string; resource: TenantResourceKind; limit: number; current: number; upgradeMessage?: string; upgradeUrl?: string }
} | null {
  if (!(error instanceof TenantResourceLimitError)) return null
  return {
    statusCode: error.statusCode,
    body: {
      error: error.message,
      code: error.code,
      resource: error.resource,
      limit: error.limit,
      current: error.current,
      ...(error.upgradeMessage ? { upgradeMessage: error.upgradeMessage } : {}),
      ...(error.upgradeUrl ? { upgradeUrl: error.upgradeUrl } : {}),
    },
  }
}
