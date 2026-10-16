import { getResolvedWorkspaceIntegrationConfig, readWorkspaceIntegrationSecrets } from './workspace-integrations'
import { createHmac } from 'crypto'
import { getWorkspacePath } from './workspace'

export const AGENTFORGE_DESTINATION_ID = 'agentforge'
export const AGENTFORGE_CONSENT_VERSION = 'activity-export-consent/v1'
export const AGENTFORGE_PURPOSE = 'Provide event-scoped learning support, progress evidence, prompt coaching, and improvement of hackathon tutorials.'
export const AGENTFORGE_SUPPORTED_SCOPES = ['agent-chat', 'workflow', 'builder'] as const
export const AGENTFORGE_RETENTION_DAYS = 30

export function agentForgePurgeCompleted(value: unknown, receiptId: string): boolean {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return result.receiptId === receiptId && result.status === 'revoked' && result.purgeStatus === 'completed'
}

export interface AgentForgeRuntimeConfig {
  apiUrl: string
  apiKey: string
  privacyUrl: string
}

/** Opaque binding; rotating a tenant credential requires fresh enrollment and consent. */
export function agentForgeReceiverBinding(config: AgentForgeRuntimeConfig): string {
  return createHmac('sha256', config.apiKey).update(JSON.stringify([
    AGENTFORGE_DESTINATION_ID, config.apiUrl, config.privacyUrl, AGENTFORGE_PURPOSE,
    AGENTFORGE_CONSENT_VERSION, AGENTFORGE_SUPPORTED_SCOPES, 'opaque-workspace-user/v1',
  ])).digest('hex')
}

export function currentAgentForgeReceiverBinding(workspaceId: string): string | null {
  if (getWorkspacePath() !== workspaceId) return null
  const config = getAgentForgeRuntimeConfig()
  return config ? agentForgeReceiverBinding(config) : null
}

function validApiUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
      (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))
  } catch {
    return false
  }
}

export function getAgentForgeRuntimeConfig(): AgentForgeRuntimeConfig | null {
  const partner = getResolvedWorkspaceIntegrationConfig().partners?.agentforge || {}
  const apiUrl = typeof partner.apiUrl === 'string' ? partner.apiUrl.trim().replace(/\/+$/, '') : ''
  const privacyUrl = typeof partner.privacyUrl === 'string' && partner.privacyUrl.trim()
    ? partner.privacyUrl.trim()
    : `${apiUrl}/privacy`
  const apiKey = readWorkspaceIntegrationSecrets().partners?.agentforge?.apiKey?.trim() || ''
  return apiUrl && apiKey && validApiUrl(apiUrl) && validApiUrl(privacyUrl) ? { apiUrl, apiKey, privacyUrl } : null
}

async function agentForgeRequest(
  path: string,
  init: RequestInit,
  options: { config?: AgentForgeRuntimeConfig; fetchImpl?: typeof fetch } = {},
): Promise<any> {
  const config = options.config || getAgentForgeRuntimeConfig()
  if (!config) throw new Error('AgentForge API URL, privacy URL, and Partner API key must be configured by the operator.')
  if (!validApiUrl(config.apiUrl)) throw new Error('Invalid AgentForge API URL.')
  const response = await (options.fetchImpl || fetch)(`${config.apiUrl}${path}`, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(init.headers || {}),
    },
  })
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`AgentForge rejected the request (${response.status}).`)
  return payload
}

export async function exchangeAgentForgeEnrollment(input: {
  connectionCode: string
  workspaceId: string
  userId: string
}, options: { config?: AgentForgeRuntimeConfig; fetchImpl?: typeof fetch } = {}): Promise<{ enrollmentId: string; status: string }> {
  const result = await agentForgeRequest('/api/v1/clawmax/enrollments/exchange', {
    method: 'POST',
    body: JSON.stringify({ ...input, destinationId: AGENTFORGE_DESTINATION_ID }),
  }, options)
  if (typeof result?.enrollmentId !== 'string' || !result.enrollmentId.trim() || result.enrollmentId.length > 256 || result.status !== 'active') {
    throw new Error('AgentForge returned an invalid enrollment acknowledgment.')
  }
  return { enrollmentId: result.enrollmentId, status: result.status }
}

export async function registerAgentForgeConsent(input: {
  receiptId: string
  enrollmentId: string
  workspaceId: string
  userId: string
  scopes: string[]
  consentedAt: string
  expiresAt: string
}, options: { config?: AgentForgeRuntimeConfig; fetchImpl?: typeof fetch } = {}): Promise<{ receiptId: string; status: string; scopes: string[] }> {
  const result = await agentForgeRequest('/api/v1/clawmax/consent-receipts', {
    method: 'POST',
    headers: { 'Idempotency-Key': input.receiptId },
    body: JSON.stringify({ ...input, destinationId: AGENTFORGE_DESTINATION_ID, consentVersion: AGENTFORGE_CONSENT_VERSION }),
  }, options)
  if (result?.receiptId !== input.receiptId || result.status !== 'active' || !Array.isArray(result.scopes) ||
      result.scopes.length !== input.scopes.length || new Set(result.scopes).size !== result.scopes.length ||
      !result.scopes.every((scope: unknown) => typeof scope === 'string' && input.scopes.includes(scope))) {
    throw new Error('AgentForge returned an invalid consent acknowledgment.')
  }
  return { receiptId: result.receiptId, status: result.status, scopes: result.scopes }
}

export async function revokeAgentForgeConsent(receiptId: string, options: { config?: AgentForgeRuntimeConfig; fetchImpl?: typeof fetch } = {}): Promise<{ receiptId: string; status: string; purgeStatus: string }> {
  return agentForgeRequest('/api/v1/clawmax/consent-receipts', {
    method: 'DELETE',
    headers: { 'Idempotency-Key': `${receiptId}:revoke` },
    body: JSON.stringify({ receiptId }),
  }, options)
}

export function agentForgeActivityEndpoint(config = getAgentForgeRuntimeConfig()): string | null {
  return config ? `${config.apiUrl}/api/v1/clawmax/activity-events` : null
}
