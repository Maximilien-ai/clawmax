export type MailOAuthProvider = 'gmail' | 'microsoft365'

export type MailOAuthConnection = {
  provider: MailOAuthProvider
  accountId: string
  accountEmail?: string
  scopes: string[]
  capabilities: MailCapability[]
  connectedAt: string
  updatedAt: string
  expiresAt?: string
  status: 'connected' | 'expired'
  reconnectRequired: boolean
}

export type MailOAuthProviderStatus = {
  provider: MailOAuthProvider
  configured: boolean
  unavailableReason?: string
  connections: MailOAuthConnection[]
}

export type MailOAuthStatus = {
  storageConfigured: boolean
  providers: MailOAuthProviderStatus[]
}

export type MailCapability = 'mail.list' | 'mail.search' | 'mail.read.metadata' | 'mail.read.body' | 'mail.draft.create'

export type MailCapabilityGrant = {
  id: string
  agentId: string
  provider: MailOAuthProvider
  accountId: string
  capabilities: MailCapability[]
  createdAt?: string
  expiresAt?: string
  revokedAt?: string
}

export type MailGrantAgent = {
  id: string
  name: string
  skills: string[]
}

export type MailGrantStatus = {
  grants: MailCapabilityGrant[]
  agents: MailGrantAgent[]
}

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Mail connection request failed with HTTP ${res.status}`)
  return data
}

export async function loadMailOAuthStatus(): Promise<MailOAuthStatus> {
  const res = await fetch('/api/mail/oauth/status')
  return readJson(res)
}

export async function loadMailGrantStatus(): Promise<MailGrantStatus> {
  const res = await fetch('/api/mail/oauth/grants')
  return readJson(res)
}

export async function createMailGrant(input: {
  agentId: string
  provider: MailOAuthProvider
  accountId: string
  capabilities: MailCapability[]
}) {
  const res = await fetch('/api/mail/oauth/grants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return readJson(res)
}

export async function revokeMailGrant(grantId: string) {
  const res = await fetch(`/api/mail/oauth/grants/${encodeURIComponent(grantId)}`, { method: 'DELETE' })
  return readJson(res)
}

export async function beginMailOAuthConnection(
  provider: MailOAuthProvider,
  capabilities: string[],
): Promise<string> {
  const res = await fetch(`/api/mail/oauth/${provider}/begin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capabilities }),
  })
  const data = await readJson(res)
  if (typeof data.authorizationUrl !== 'string' || !data.authorizationUrl) {
    throw new Error('Mail provider did not return an authorization URL')
  }
  return data.authorizationUrl
}

export async function refreshMailOAuthConnection(provider: MailOAuthProvider, accountId: string) {
  const res = await fetch(`/api/mail/oauth/${provider}/connections/${encodeURIComponent(accountId)}/refresh`, {
    method: 'POST',
  })
  return readJson(res)
}

export async function disconnectMailOAuthConnection(provider: MailOAuthProvider, accountId: string) {
  const res = await fetch(`/api/mail/oauth/${provider}/connections/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
  })
  return readJson(res)
}

export function isMailOAuthProvider(value: string): value is MailOAuthProvider {
  return value === 'gmail' || value === 'microsoft365'
}
