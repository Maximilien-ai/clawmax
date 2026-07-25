import crypto from 'crypto'
import type {
  MailOAuthProviderAdapter,
  MailOAuthRefreshResult,
  MailOAuthTokens,
} from './mail-oauth'
import { MailProviderId } from './mail-capabilities'

type FetchLike = typeof fetch

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const GOOGLE_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile'
const MICROSOFT_GRAPH_ME_URL = 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName'

const GOOGLE_SCOPE_MAP: Record<string, string> = {
  'mail.list': 'https://www.googleapis.com/auth/gmail.metadata',
  'mail.search': 'https://www.googleapis.com/auth/gmail.metadata',
  'mail.read.metadata': 'https://www.googleapis.com/auth/gmail.metadata',
  'mail.read.body': 'https://www.googleapis.com/auth/gmail.readonly',
  'mail.draft.create': 'https://www.googleapis.com/auth/gmail.compose',
}

const MICROSOFT_SCOPE_MAP: Record<string, string> = {
  'mail.list': 'Mail.Read',
  'mail.search': 'Mail.Read',
  'mail.read.metadata': 'Mail.Read',
  'mail.read.body': 'Mail.Read',
  'mail.draft.create': 'Mail.ReadWrite',
}

interface OAuthTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
}

function required(value: string | undefined, label: string): string {
  const normalized = `${value || ''}`.trim()
  if (!normalized) throw new Error(`${label} is not configured`)
  return normalized
}

function expiresAt(expiresIn: unknown, now = Date.now()): string | undefined {
  const seconds = Number(expiresIn)
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return new Date(now + seconds * 1000).toISOString()
}

function opaqueAccountId(provider: MailProviderId, stableId: string): string {
  return `${provider}:${crypto.createHash('sha256').update(stableId.toLowerCase()).digest('hex').slice(0, 24)}`
}

function mappedScopes(requested: string[], mapping: Record<string, string>, defaults: string[]): string[] {
  const scopes = requested.map((scope) => {
    const mapped = mapping[scope]
    if (!mapped) throw new Error(`Unsupported mail capability '${scope}'`)
    return mapped
  })
  return Array.from(new Set(scopes.length > 0 ? scopes : defaults)).sort()
}

function isSafeRedirectUri(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ||
      (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
  } catch {
    return false
  }
}

async function requestJson<T>(
  fetchFn: FetchLike,
  url: string,
  init: RequestInit,
  label: string,
): Promise<T> {
  let response: Response
  try {
    response = await fetchFn(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error(`${label} request failed`)
  }
  let body: any = {}
  try {
    body = await response.json()
  } catch {
    body = {}
  }
  if (!response.ok) {
    const providerCode = typeof body?.error === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(body.error)
      ? ` (${body.error})`
      : ''
    throw new Error(`${label} returned HTTP ${response.status}${providerCode}`)
  }
  return body as T
}

async function postForm<T>(
  fetchFn: FetchLike,
  url: string,
  values: Record<string, string | undefined>,
  label: string,
): Promise<T> {
  const body = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value) body.set(key, value)
  }
  return requestJson<T>(fetchFn, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, label)
}

function validateTokenResponse(body: OAuthTokenResponse, label: string): string {
  if (!body.access_token) throw new Error(`${label} returned an incomplete token response`)
  return body.access_token
}

export interface GoogleMailOAuthConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class GoogleMailOAuthProvider implements MailOAuthProviderAdapter {
  readonly provider = 'gmail' as const
  readonly redirectUri: string
  readonly configured: boolean
  readonly unavailableReason?: string
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly fetchFn: FetchLike

  constructor(config: GoogleMailOAuthConfig, fetchFn: FetchLike = fetch) {
    this.clientId = `${config.clientId || ''}`.trim()
    this.clientSecret = `${config.clientSecret || ''}`.trim()
    this.redirectUri = `${config.redirectUri || ''}`.trim()
    this.fetchFn = fetchFn
    this.configured = !!(this.clientId && this.clientSecret && this.redirectUri && isSafeRedirectUri(this.redirectUri))
    if (!this.configured) {
      this.unavailableReason = 'Gmail OAuth requires GMAIL_OAUTH_CLIENT_ID, GMAIL_OAUTH_CLIENT_SECRET, and an HTTPS (or localhost) GMAIL_OAUTH_REDIRECT_URI'
    }
  }

  getAuthorizationUrl(input: { state: string; codeChallenge: string; scopes: string[] }): string {
    if (!this.configured) throw new Error(this.unavailableReason)
    const query = new URLSearchParams({
      client_id: required(this.clientId, 'Gmail OAuth client ID'),
      redirect_uri: required(this.redirectUri, 'Gmail OAuth redirect URI'),
      response_type: 'code',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      scope: mappedScopes(input.scopes, GOOGLE_SCOPE_MAP, [GOOGLE_SCOPE_MAP['mail.read.metadata']]).join(' '),
    })
    return `${GOOGLE_AUTH_URL}?${query}`
  }

  async exchangeCode(input: {
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<MailOAuthTokens> {
    const token = await postForm<OAuthTokenResponse>(this.fetchFn, GOOGLE_TOKEN_URL, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    }, 'Gmail OAuth token exchange')
    const accessToken = validateTokenResponse(token, 'Gmail OAuth')
    const profile = await requestJson<{ emailAddress?: string }>(this.fetchFn, GOOGLE_PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, 'Gmail account profile')
    const email = required(profile.emailAddress, 'Gmail account email')
    return {
      accountId: opaqueAccountId('gmail', email),
      accountEmail: email,
      scopes: `${token.scope || ''}`.split(/\s+/).filter(Boolean),
      accessToken,
      refreshToken: token.refresh_token,
      expiresAt: expiresAt(token.expires_in),
    }
  }

  async refresh(input: { refreshToken: string; scopes: string[] }): Promise<MailOAuthRefreshResult> {
    const token = await postForm<OAuthTokenResponse>(this.fetchFn, GOOGLE_TOKEN_URL, {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
    }, 'Gmail OAuth token refresh')
    return {
      accessToken: validateTokenResponse(token, 'Gmail OAuth'),
      refreshToken: token.refresh_token,
      scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : undefined,
      expiresAt: expiresAt(token.expires_in),
    }
  }

  async revoke(tokens: { accessToken: string; refreshToken?: string }): Promise<void> {
    await postForm<Record<string, never>>(this.fetchFn, GOOGLE_REVOKE_URL, {
      token: tokens.refreshToken || tokens.accessToken,
    }, 'Gmail OAuth revocation')
  }
}

export interface MicrosoftMailOAuthConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  tenant?: string
}

export class MicrosoftMailOAuthProvider implements MailOAuthProviderAdapter {
  readonly provider = 'microsoft365' as const
  readonly redirectUri: string
  readonly configured: boolean
  readonly unavailableReason?: string
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly tenant: string
  private readonly fetchFn: FetchLike

  constructor(config: MicrosoftMailOAuthConfig, fetchFn: FetchLike = fetch) {
    this.clientId = `${config.clientId || ''}`.trim()
    this.clientSecret = `${config.clientSecret || ''}`.trim()
    this.redirectUri = `${config.redirectUri || ''}`.trim()
    this.tenant = `${config.tenant || 'common'}`.trim()
    this.fetchFn = fetchFn
    if (!/^[A-Za-z0-9.-]{1,128}$/.test(this.tenant)) throw new Error('Invalid Microsoft OAuth tenant')
    this.configured = !!(this.clientId && this.clientSecret && this.redirectUri && isSafeRedirectUri(this.redirectUri))
    if (!this.configured) {
      this.unavailableReason = 'Microsoft 365 OAuth requires MICROSOFT365_OAUTH_CLIENT_ID, MICROSOFT365_OAUTH_CLIENT_SECRET, and an HTTPS (or localhost) MICROSOFT365_OAUTH_REDIRECT_URI'
    }
  }

  private endpoint(kind: 'authorize' | 'token'): string {
    return `https://login.microsoftonline.com/${encodeURIComponent(this.tenant)}/oauth2/v2.0/${kind}`
  }

  private scopes(requested: string[]): string[] {
    return mappedScopes(requested, MICROSOFT_SCOPE_MAP, ['Mail.Read'])
      .concat(['User.Read', 'offline_access'])
      .filter((scope, index, all) => all.indexOf(scope) === index)
      .sort()
  }

  getAuthorizationUrl(input: { state: string; codeChallenge: string; scopes: string[] }): string {
    if (!this.configured) throw new Error(this.unavailableReason)
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      response_mode: 'query',
      prompt: 'select_account',
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: 'S256',
      scope: this.scopes(input.scopes).join(' '),
    })
    return `${this.endpoint('authorize')}?${query}`
  }

  async exchangeCode(input: {
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<MailOAuthTokens> {
    const token = await postForm<OAuthTokenResponse>(this.fetchFn, this.endpoint('token'), {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    }, 'Microsoft OAuth token exchange')
    const accessToken = validateTokenResponse(token, 'Microsoft OAuth')
    const profile = await requestJson<{ id?: string; mail?: string; userPrincipalName?: string }>(
      this.fetchFn,
      MICROSOFT_GRAPH_ME_URL,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      'Microsoft account profile',
    )
    const accountId = required(profile.id, 'Microsoft account ID')
    return {
      accountId: opaqueAccountId('microsoft365', accountId),
      accountEmail: profile.mail || profile.userPrincipalName,
      scopes: `${token.scope || ''}`.split(/\s+/).filter(Boolean),
      accessToken,
      refreshToken: token.refresh_token,
      expiresAt: expiresAt(token.expires_in),
    }
  }

  async refresh(input: { refreshToken: string; scopes: string[] }): Promise<MailOAuthRefreshResult> {
    const token = await postForm<OAuthTokenResponse>(this.fetchFn, this.endpoint('token'), {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: 'refresh_token',
      scope: input.scopes.join(' '),
    }, 'Microsoft OAuth token refresh')
    return {
      accessToken: validateTokenResponse(token, 'Microsoft OAuth'),
      refreshToken: token.refresh_token,
      scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : undefined,
      expiresAt: expiresAt(token.expires_in),
    }
  }

  async revoke(): Promise<void> {
    // Microsoft provides user/admin revocation controls rather than an OAuth token
    // revocation endpoint. Local disconnect removes the encrypted refresh token.
  }
}

export function createProductionMailOAuthProviders(
  env: NodeJS.ProcessEnv = process.env,
  fetchFn: FetchLike = fetch,
): Record<MailProviderId, MailOAuthProviderAdapter> {
  return {
    gmail: new GoogleMailOAuthProvider({
      clientId: env.GMAIL_OAUTH_CLIENT_ID,
      clientSecret: env.GMAIL_OAUTH_CLIENT_SECRET,
      redirectUri: env.GMAIL_OAUTH_REDIRECT_URI,
    }, fetchFn),
    microsoft365: new MicrosoftMailOAuthProvider({
      clientId: env.MICROSOFT365_OAUTH_CLIENT_ID,
      clientSecret: env.MICROSOFT365_OAUTH_CLIENT_SECRET,
      redirectUri: env.MICROSOFT365_OAUTH_REDIRECT_URI,
      tenant: env.MICROSOFT365_OAUTH_TENANT,
    }, fetchFn),
  }
}

export const __test = {
  GOOGLE_AUTH_URL,
  GOOGLE_PROFILE_URL,
  GOOGLE_REVOKE_URL,
  GOOGLE_TOKEN_URL,
  MICROSOFT_GRAPH_ME_URL,
  expiresAt,
  mappedScopes,
  opaqueAccountId,
  isSafeRedirectUri,
}
