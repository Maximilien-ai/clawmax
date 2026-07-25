export type MailOAuthProvider = 'gmail' | 'microsoft365'

export type MailOAuthConnection = {
  provider: MailOAuthProvider
  accountId: string
  accountEmail?: string
  scopes: string[]
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

async function readJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Mail connection request failed with HTTP ${res.status}`)
  return data
}

export async function loadMailOAuthStatus(): Promise<MailOAuthStatus> {
  const res = await fetch('/api/mail/oauth/status')
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
