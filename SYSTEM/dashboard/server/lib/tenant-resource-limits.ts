export type TenantResourceKind = 'workspaces' | 'agents' | 'workflows'

export type TenantResourceLimits = Record<TenantResourceKind, number | null>

const CLOUD_DEFAULTS: TenantResourceLimits = {
  workspaces: 1,
  agents: 10,
  workflows: 10,
}

const ENV_KEYS: Record<TenantResourceKind, string> = {
  workspaces: 'CLAWMAX_MAX_WORKSPACES',
  agents: 'CLAWMAX_MAX_AGENTS_PER_WORKSPACE',
  workflows: 'CLAWMAX_MAX_WORKFLOWS_PER_WORKSPACE',
}

function parseLimit(value: unknown, key: string): number | null | undefined {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  if (!/^\d+$/.test(text)) throw new Error(`${key} must be a non-negative integer`)
  const parsed = Number(text)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${key} must be a safe integer`)
  return parsed
}

export function getTenantResourceLimits(env: Record<string, string | undefined> = process.env): TenantResourceLimits {
  const cloudDefaults = String(env.DASHBOARD_DEPLOYMENT_KIND || env.CLAWMAX_DEPLOYMENT_KIND || '').trim().toLowerCase() === 'cloud'
  const limits = {} as TenantResourceLimits
  for (const kind of Object.keys(ENV_KEYS) as TenantResourceKind[]) {
    const explicit = parseLimit(env[ENV_KEYS[kind]], ENV_KEYS[kind])
    limits[kind] = explicit === undefined ? (cloudDefaults ? CLOUD_DEFAULTS[kind] : null) : explicit
  }
  return limits
}

export class TenantResourceLimitError extends Error {
  readonly code = 'TENANT_RESOURCE_LIMIT_REACHED'
  readonly statusCode = 409

  constructor(
    readonly resource: TenantResourceKind,
    readonly limit: number,
    readonly current: number,
  ) {
    super(`Tenant ${resource} limit reached (${current}/${limit}). Delete an existing ${resource.slice(0, -1)} or increase ${ENV_KEYS[resource]}.`)
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
    throw new TenantResourceLimitError(resource, limit, current)
  }
}

export function tenantResourceLimitResponse(error: unknown): {
  statusCode: number
  body: { error: string; code: string; resource: TenantResourceKind; limit: number; current: number }
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
    },
  }
}
