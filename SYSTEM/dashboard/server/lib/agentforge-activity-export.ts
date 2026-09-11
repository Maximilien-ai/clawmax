import { getResolvedWorkspaceIntegrationConfig, readWorkspaceIntegrationSecrets } from './workspace-integrations'

export const AGENTFORGE_DESTINATION_ID = 'agentforge'
export const AGENTFORGE_CONSENT_VERSION = 'activity-export-consent/v1'
export const AGENTFORGE_PURPOSE = 'Provide event-scoped learning support, progress evidence, prompt coaching, and improvement of hackathon tutorials.'
export const AGENTFORGE_SUPPORTED_SCOPES = ['agent-chat', 'workflow', 'builder'] as const
export const AGENTFORGE_RETENTION_DAYS = 30

export interface AgentForgeRuntimeConfig {
  apiUrl: string
  apiKey: string
  privacyUrl: string
}

function validApiUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname))
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
  const response = await (options.fetchImpl || fetch)(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...(init.headers || {}),
    },
  })
  const payload: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error || `AgentForge rejected the request (${response.status}).`)
  return payload
}

export async function exchangeAgentForgeEnrollment(input: {
  connectionCode: string
  workspaceId: string
  userId: string
}, options: { config?: AgentForgeRuntimeConfig; fetchImpl?: typeof fetch } = {}): Promise<{ enrollmentId: string; status: string }> {
  return agentForgeRequest('/api/v1/clawmax/enrollments/exchange', {
    method: 'POST',
    body: JSON.stringify({ ...input, destinationId: AGENTFORGE_DESTINATION_ID }),
  }, options)
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
  return agentForgeRequest('/api/v1/clawmax/consent-receipts', {
    method: 'POST',
    headers: { 'Idempotency-Key': input.receiptId },
    body: JSON.stringify({ ...input, destinationId: AGENTFORGE_DESTINATION_ID, consentVersion: AGENTFORGE_CONSENT_VERSION }),
  }, options)
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
