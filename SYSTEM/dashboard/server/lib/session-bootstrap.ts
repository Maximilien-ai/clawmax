import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export const SESSION_BOOTSTRAP_CONTRACT_VERSION = 'v0.1'
export const SESSION_BOOTSTRAP_AUDIENCE = 'clawmax-dashboard-session'
const MAX_BOOTSTRAP_LIFETIME_MS = 5 * 60 * 1000
const CLOCK_SKEW_MS = 30 * 1000
const BOOTSTRAP_ID_PATTERN = /^sbs_[A-Za-z0-9_-]{16,128}$/
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const REQUIRED_FIELDS = [
  'contract_version',
  'bootstrap_id',
  'actor_id',
  'membership_id',
  'tenant_id',
  'workspace_id',
  'runtime_id',
  'policy_version',
  'entry_origin',
  'audience',
  'issued_at',
  'expires_at',
] as const

export interface SessionBootstrapClaims {
  contract_version: 'v0.1'
  bootstrap_id: string
  actor_id: string
  membership_id: string
  tenant_id: string
  workspace_id: string
  runtime_id: string
  policy_version: string
  entry_origin: string
  audience: 'clawmax-dashboard-session'
  issued_at: string
  expires_at: string
}

export interface SessionBootstrapConfig {
  enabled: boolean
  valid: boolean
  secret: string
  tenantId: string
  workspaceId: string
  runtimeId: string
  policyVersion: string
  entryOrigins: string[]
  sessionTtlSeconds: number
  error?: string
}

type ReplayLedger = {
  version: 1
  entries: Array<{ idHash: string; expiresAt: number }>
}

export class SessionBootstrapError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'SessionBootstrapError'
  }
}

function exactOrigin(value: string): string | null {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null
    if (parsed.pathname !== '/' || parsed.search || parsed.hash) return null
    return parsed.origin === value ? value : null
  } catch {
    return null
  }
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  return String(env[key] || '').trim()
}

export function getSessionBootstrapConfig(env: NodeJS.ProcessEnv = process.env): SessionBootstrapConfig {
  const secret = requiredEnv(env, 'CLAWMAX_SESSION_BOOTSTRAP_SECRET')
  const tenantId = requiredEnv(env, 'CLAWMAX_TENANT_ID')
  const workspaceId = requiredEnv(env, 'CLAWMAX_WORKSPACE_ID')
  const runtimeId = requiredEnv(env, 'CLAWMAX_RUNTIME_ID')
  const policyVersion = requiredEnv(env, 'CLAWMAX_POLICY_VERSION')
  const rawOrigins = requiredEnv(env, 'CLAWMAX_SESSION_BOOTSTRAP_ORIGINS')
  const configured = [secret, tenantId, workspaceId, runtimeId, policyVersion, rawOrigins].some(Boolean)
  const entryOrigins = rawOrigins.split(',').map((value) => value.trim()).filter(Boolean)
  const rawTtl = requiredEnv(env, 'CLAWMAX_ENTERPRISE_SESSION_TTL_SECONDS') || '900'
  const sessionTtlSeconds = Number(rawTtl)

  let error: string | undefined
  if (configured) {
    if (secret.length < 32) error = 'CLAWMAX_SESSION_BOOTSTRAP_SECRET must contain at least 32 characters'
    else if (!tenantId || !workspaceId || !runtimeId || !policyVersion) error = 'session bootstrap runtime bindings are incomplete'
    else if (entryOrigins.length === 0 || entryOrigins.some((origin) => !exactOrigin(origin))) error = 'CLAWMAX_SESSION_BOOTSTRAP_ORIGINS must contain exact HTTPS origins'
    else if (!Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds < 60 || sessionTtlSeconds > 3600) error = 'CLAWMAX_ENTERPRISE_SESSION_TTL_SECONDS must be between 60 and 3600'
  }

  return {
    enabled: configured,
    valid: configured && !error,
    secret,
    tenantId,
    workspaceId,
    runtimeId,
    policyVersion,
    entryOrigins,
    sessionTtlSeconds,
    error,
  }
}

function requireBoundedString(input: Record<string, unknown>, field: string): string {
  const value = input[field]
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 256) {
    throw new SessionBootstrapError('invalid_claims', `invalid ${field}`)
  }
  return value
}

export function validateSessionBootstrapClaims(
  input: unknown,
  config: SessionBootstrapConfig,
  nowMs = Date.now(),
): SessionBootstrapClaims {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SessionBootstrapError('invalid_claims', 'session bootstrap claims must be an object')
  }
  const value = input as Record<string, unknown>
  const keys = Object.keys(value)
  if (keys.length !== REQUIRED_FIELDS.length || keys.some((key) => !(REQUIRED_FIELDS as readonly string[]).includes(key))) {
    throw new SessionBootstrapError('invalid_claims', 'session bootstrap claims contain missing or unknown fields')
  }

  const contractVersion = requireBoundedString(value, 'contract_version')
  const bootstrapId = requireBoundedString(value, 'bootstrap_id')
  const actorId = requireBoundedString(value, 'actor_id')
  const membershipId = requireBoundedString(value, 'membership_id')
  const tenantId = requireBoundedString(value, 'tenant_id')
  const workspaceId = requireBoundedString(value, 'workspace_id')
  const runtimeId = requireBoundedString(value, 'runtime_id')
  const policyVersion = requireBoundedString(value, 'policy_version')
  const entryOrigin = requireBoundedString(value, 'entry_origin')
  const audience = requireBoundedString(value, 'audience')
  const issuedAt = requireBoundedString(value, 'issued_at')
  const expiresAt = requireBoundedString(value, 'expires_at')

  if (contractVersion !== SESSION_BOOTSTRAP_CONTRACT_VERSION || audience !== SESSION_BOOTSTRAP_AUDIENCE || !BOOTSTRAP_ID_PATTERN.test(bootstrapId)) {
    throw new SessionBootstrapError('invalid_claims', 'unsupported session bootstrap claims')
  }
  if (!exactOrigin(entryOrigin)) {
    throw new SessionBootstrapError('invalid_claims', 'entry_origin must be an exact HTTPS origin')
  }

  const issuedMs = Date.parse(issuedAt)
  const expiresMs = Date.parse(expiresAt)
  if (!RFC3339_PATTERN.test(issuedAt) || !RFC3339_PATTERN.test(expiresAt) || !Number.isFinite(issuedMs) || !Number.isFinite(expiresMs) || expiresMs <= issuedMs || expiresMs - issuedMs > MAX_BOOTSTRAP_LIFETIME_MS) {
    throw new SessionBootstrapError('invalid_claims', 'session bootstrap lifetime must be positive and at most five minutes')
  }
  if (issuedMs > nowMs + CLOCK_SKEW_MS || expiresMs <= nowMs - CLOCK_SKEW_MS) {
    throw new SessionBootstrapError('expired', 'session bootstrap is expired or not yet valid')
  }
  if (tenantId !== config.tenantId || workspaceId !== config.workspaceId || runtimeId !== config.runtimeId || policyVersion !== config.policyVersion || !config.entryOrigins.includes(entryOrigin)) {
    throw new SessionBootstrapError('binding_mismatch', 'session bootstrap does not match this runtime')
  }

  return {
    contract_version: 'v0.1',
    bootstrap_id: bootstrapId,
    actor_id: actorId,
    membership_id: membershipId,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    runtime_id: runtimeId,
    policy_version: policyVersion,
    entry_origin: entryOrigin,
    audience: 'clawmax-dashboard-session',
    issued_at: issuedAt,
    expires_at: expiresAt,
  }
}

export function authorizeSessionBootstrap(header: string | undefined, secret: string): boolean {
  const match = /^Bearer ([^\s]+)$/.exec(header || '')
  if (!match || !secret) return false
  const actual = Buffer.from(match[1])
  const expected = Buffer.from(secret)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

export function verifySignedSessionBootstrap(
  token: string,
  config: SessionBootstrapConfig,
  nowMs = Date.now(),
): SessionBootstrapClaims {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1] || !config.valid) {
    throw new SessionBootstrapError('invalid_signature', 'invalid signed session bootstrap')
  }
  let supplied: Buffer
  try {
    supplied = Buffer.from(parts[1], 'base64url')
  } catch {
    throw new SessionBootstrapError('invalid_signature', 'invalid signed session bootstrap')
  }
  const expected = crypto.createHmac('sha256', config.secret).update(parts[0]).digest()
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new SessionBootstrapError('invalid_signature', 'invalid signed session bootstrap')
  }
  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  } catch {
    throw new SessionBootstrapError('invalid_claims', 'invalid signed session bootstrap')
  }
  return validateSessionBootstrapClaims(claims, config, nowMs)
}

export class SessionBootstrapReplayStore {
  constructor(private readonly filePath: string) {}

  consume(bootstrapId: string, expiresAt: string, nowMs = Date.now()): boolean {
    const idHash = crypto.createHash('sha256').update(bootstrapId).digest('hex')
    const ledger = this.load()
    const entries = ledger.entries.filter((entry) => entry.expiresAt > nowMs - CLOCK_SKEW_MS)
    if (entries.some((entry) => entry.idHash === idHash)) return false
    entries.push({ idHash, expiresAt: Date.parse(expiresAt) })
    this.save({ version: 1, entries })
    return true
  }

  private load(): ReplayLedger {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'))
      if (parsed?.version === 1 && Array.isArray(parsed.entries) && parsed.entries.every((entry: any) =>
        typeof entry?.idHash === 'string' && /^[a-f0-9]{64}$/.test(entry.idHash) && Number.isFinite(entry.expiresAt)
      )) return parsed as ReplayLedger
      throw new Error('invalid replay ledger')
    } catch (error: any) {
      if (error?.code === 'ENOENT') return { version: 1, entries: [] }
      throw new SessionBootstrapError('replay_store_unavailable', 'session bootstrap replay ledger is unavailable')
    }
  }

  private save(ledger: ReplayLedger): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const tempPath = `${this.filePath}.${process.pid}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(ledger), { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(tempPath, this.filePath)
  }
}
