import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'
import { MAIL_CAPABILITIES, MailProviderId } from './mail-capabilities'
import { createProductionMailOAuthProviders } from './mail-oauth-providers'

const STORE_VERSION = 1
const FLOW_TTL_MS = 10 * 60 * 1000

interface EncryptedStore {
  version: 1
  algorithm: 'aes-256-gcm'
  iv: string
  authTag: string
  ciphertext: string
  updatedAt: string
}

interface PendingAuthorization {
  stateHash: string
  provider: MailProviderId
  workspaceId: string
  actorId: string
  verifier: string
  redirectUri: string
  capabilities: string[]
  createdAt: string
  expiresAt: string
}

interface StoredConnection {
  provider: MailProviderId
  accountId: string
  accountEmail?: string
  scopes: string[]
  capabilities?: string[]
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  connectedAt: string
  updatedAt: string
}

interface MailOAuthStore {
  version: 1
  pending: PendingAuthorization[]
  connections: StoredConnection[]
}

export interface MailOAuthTokens {
  accountId: string
  accountEmail?: string
  scopes: string[]
  accessToken: string
  refreshToken?: string
  expiresAt?: string
}

export interface MailOAuthRefreshResult {
  accessToken: string
  refreshToken?: string
  scopes?: string[]
  expiresAt?: string
}

export interface MailOAuthProviderAdapter {
  readonly provider: MailProviderId
  readonly redirectUri: string
  readonly configured: boolean
  readonly unavailableReason?: string
  getAuthorizationUrl(input: {
    state: string
    codeChallenge: string
    scopes: string[]
  }): string
  exchangeCode(input: {
    code: string
    codeVerifier: string
    redirectUri: string
  }): Promise<MailOAuthTokens>
  refresh?(input: {
    refreshToken: string
    scopes: string[]
  }): Promise<MailOAuthRefreshResult>
  revoke?(tokens: Pick<StoredConnection, 'accessToken' | 'refreshToken'>): Promise<void>
}

export interface MailOAuthConnectionSummary {
  provider: MailProviderId
  accountId: string
  accountEmail?: string
  scopes: string[]
  capabilities: string[]
  connectedAt: string
  updatedAt: string
  expiresAt?: string
  status: 'connected' | 'expired'
  reconnectRequired: boolean
}

function workspaceId(workspacePath = getWorkspacePath()): string {
  return path.basename(path.resolve(workspacePath))
}

function storePath(workspacePath = getWorkspacePath()): string {
  return path.join(workspacePath, 'SYSTEM', '.clawmax', 'mail-oauth.enc.json')
}

function auditPath(workspacePath = getWorkspacePath()): string {
  return path.join(workspacePath, 'SYSTEM', '.clawmax', 'mail-oauth-audit.jsonl')
}

function requireMasterKey(raw = process.env.CLAWMAX_SECRET_MASTER_KEY): Buffer {
  const value = `${raw || ''}`.trim()
  if (value.length < 32) {
    throw new Error('Mail OAuth requires CLAWMAX_SECRET_MASTER_KEY with at least 32 characters')
  }
  return crypto.createHash('sha256').update(value).digest()
}

export function isMailOAuthStorageConfigured(): boolean {
  try {
    requireMasterKey()
    return true
  } catch {
    return false
  }
}

function emptyStore(): MailOAuthStore {
  return { version: STORE_VERSION, pending: [], connections: [] }
}

function encryptStore(value: MailOAuthStore, masterKey = requireMasterKey()): EncryptedStore {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return {
    version: STORE_VERSION,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    updatedAt: new Date().toISOString(),
  }
}

function decryptStore(value: EncryptedStore, masterKey = requireMasterKey()): MailOAuthStore {
  if (value.version !== STORE_VERSION || value.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported mail OAuth store format')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(value.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(value.authTag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  const parsed = JSON.parse(plaintext)
  if (parsed?.version !== STORE_VERSION || !Array.isArray(parsed.pending) || !Array.isArray(parsed.connections)) {
    throw new Error('Invalid mail OAuth store')
  }
  return parsed
}

function readStore(workspacePath = getWorkspacePath()): MailOAuthStore {
  requireMasterKey()
  const filePath = storePath(workspacePath)
  if (!fs.existsSync(filePath)) return emptyStore()
  return decryptStore(JSON.parse(fs.readFileSync(filePath, 'utf8')))
}

function writeStore(value: MailOAuthStore, workspacePath = getWorkspacePath()): void {
  const filePath = storePath(workspacePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.writeFileSync(filePath, JSON.stringify(encryptStore(value), null, 2), { encoding: 'utf8', mode: 0o600 })
}

function appendAudit(event: Record<string, unknown>, workspacePath = getWorkspacePath()): void {
  const filePath = auditPath(workspacePath)
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  fs.appendFileSync(filePath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, { encoding: 'utf8', mode: 0o600 })
}

function hashState(state: string): string {
  return crypto.createHash('sha256').update(state).digest('hex')
}

function base64Url(value: Buffer): string {
  return value.toString('base64url')
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(crypto.randomBytes(48))
  return {
    verifier,
    challenge: base64Url(crypto.createHash('sha256').update(verifier).digest()),
  }
}

function normalizeScopes(scopes: string[]): string[] {
  return Array.from(new Set(scopes.map((scope) => `${scope}`.trim()).filter(Boolean))).sort()
}

function inferCapabilities(provider: MailProviderId, scopes: string[]): string[] {
  const normalized = new Set(scopes.map((scope) => scope.toLowerCase()))
  const capabilities = new Set<string>()
  if (provider === 'gmail') {
    if ([...normalized].some((scope) => scope.includes('/gmail.metadata') || scope.includes('/gmail.readonly'))) {
      capabilities.add('mail.list')
      capabilities.add('mail.search')
      capabilities.add('mail.read.metadata')
    }
    if ([...normalized].some((scope) => scope.includes('/gmail.readonly'))) capabilities.add('mail.read.body')
    if ([...normalized].some((scope) => scope.includes('/gmail.compose'))) capabilities.add('mail.draft.create')
  } else {
    if (normalized.has('mail.read') || normalized.has('mail.readwrite')) {
      capabilities.add('mail.list')
      capabilities.add('mail.search')
      capabilities.add('mail.read.metadata')
      capabilities.add('mail.read.body')
    }
    if (normalized.has('mail.readwrite')) capabilities.add('mail.draft.create')
  }
  return Array.from(capabilities).sort()
}

function assertProvider(provider: string): asserts provider is MailProviderId {
  if (provider !== 'gmail' && provider !== 'microsoft365') throw new Error('Unsupported mail OAuth provider')
}

export function getMailOAuthStatus(
  adapters: Partial<Record<MailProviderId, MailOAuthProviderAdapter>>,
  workspacePath = getWorkspacePath(),
  now = Date.now(),
) {
  const connections = isMailOAuthStorageConfigured() ? listMailOAuthConnections(workspacePath, now) : []
  return {
    storageConfigured: isMailOAuthStorageConfigured(),
    providers: (['gmail', 'microsoft365'] as MailProviderId[]).map((provider) => ({
      provider,
      configured: !!adapters[provider]?.configured,
      unavailableReason: adapters[provider]?.configured ? undefined : adapters[provider]?.unavailableReason || 'OAuth provider is not configured',
      connections: connections.filter((connection) => connection.provider === provider),
    })),
  }
}

export function listMailOAuthConnections(
  workspacePath = getWorkspacePath(),
  now = Date.now(),
): MailOAuthConnectionSummary[] {
  return readStore(workspacePath).connections.map((connection) => {
    const expired = !!connection.expiresAt && Date.parse(connection.expiresAt) <= now
    return {
      provider: connection.provider,
      accountId: connection.accountId,
      accountEmail: connection.accountEmail,
      scopes: [...connection.scopes],
      capabilities: normalizeScopes(connection.capabilities || inferCapabilities(connection.provider, connection.scopes)),
      connectedAt: connection.connectedAt,
      updatedAt: connection.updatedAt,
      expiresAt: connection.expiresAt,
      status: expired ? 'expired' as const : 'connected' as const,
      reconnectRequired: expired,
    }
  }).sort((a, b) => `${a.provider}:${a.accountId}`.localeCompare(`${b.provider}:${b.accountId}`))
}

export function beginMailOAuth(input: {
  provider: string
  actorId: string
  scopes: string[]
  adapter: MailOAuthProviderAdapter
  workspacePath?: string
  now?: number
}): { authorizationUrl: string; expiresAt: string } {
  assertProvider(input.provider)
  if (input.adapter.provider !== input.provider) throw new Error('Mail OAuth adapter provider mismatch')
  if (!input.adapter.configured) throw new Error(input.adapter.unavailableReason || 'Mail OAuth provider is not configured')
  const actorId = `${input.actorId || ''}`.trim()
  if (!actorId) throw new Error('Authenticated actor is required')
  const capabilities = normalizeScopes(input.scopes)
  const unsupported = capabilities.find((capability) => !MAIL_CAPABILITIES.includes(capability as any))
  if (unsupported) throw new Error(`Unsupported mail capability '${unsupported}'`)
  const workspacePath = input.workspacePath || getWorkspacePath()
  const now = input.now ?? Date.now()
  const state = base64Url(crypto.randomBytes(32))
  const pkce = createPkcePair()
  const expiresAt = new Date(now + FLOW_TTL_MS).toISOString()
  const store = readStore(workspacePath)
  store.pending = store.pending
    .filter((entry) => Date.parse(entry.expiresAt) > now)
    .concat({
      stateHash: hashState(state),
      provider: input.provider,
      workspaceId: workspaceId(workspacePath),
      actorId,
      verifier: pkce.verifier,
      redirectUri: input.adapter.redirectUri,
      capabilities,
      createdAt: new Date(now).toISOString(),
      expiresAt,
    })
  writeStore(store, workspacePath)
  appendAudit({ event: 'mail.oauth.started', provider: input.provider, actorId, status: 'pending' }, workspacePath)
  return {
    authorizationUrl: input.adapter.getAuthorizationUrl({
      state,
      codeChallenge: pkce.challenge,
      scopes: capabilities,
    }),
    expiresAt,
  }
}

export async function completeMailOAuth(input: {
  provider: string
  actorId: string
  state: string
  code: string
  adapter: MailOAuthProviderAdapter
  workspacePath?: string
  now?: number
}): Promise<MailOAuthConnectionSummary> {
  assertProvider(input.provider)
  if (input.adapter.provider !== input.provider) throw new Error('Mail OAuth adapter provider mismatch')
  const workspacePath = input.workspacePath || getWorkspacePath()
  const now = input.now ?? Date.now()
  const store = readStore(workspacePath)
  const stateHash = hashState(`${input.state || ''}`)
  const index = store.pending.findIndex((entry) => entry.stateHash === stateHash)
  if (index < 0) throw new Error('Mail OAuth state is invalid or has already been used')
  const pending = store.pending[index]
  store.pending.splice(index, 1)
  writeStore(store, workspacePath)

  if (pending.expiresAt && Date.parse(pending.expiresAt) <= now) throw new Error('Mail OAuth state has expired')
  if (pending.provider !== input.provider) throw new Error('Mail OAuth state provider mismatch')
  if (pending.workspaceId !== workspaceId(workspacePath)) throw new Error('Mail OAuth state workspace mismatch')
  if (pending.actorId !== `${input.actorId || ''}`.trim()) throw new Error('Mail OAuth state actor mismatch')
  if (pending.redirectUri !== input.adapter.redirectUri) throw new Error('Mail OAuth redirect URI changed during authorization')
  const code = `${input.code || ''}`.trim()
  if (!code) throw new Error('Mail OAuth authorization code is required')

  try {
    const tokens = await input.adapter.exchangeCode({
      code,
      codeVerifier: pending.verifier,
      redirectUri: pending.redirectUri,
    })
    if (!tokens.accessToken || !tokens.accountId) throw new Error('Mail OAuth provider returned an incomplete connection')
    const timestamp = new Date(now).toISOString()
    const current = readStore(workspacePath)
    const prior = current.connections.find((entry) =>
      entry.provider === input.provider && entry.accountId === tokens.accountId)
    current.connections = current.connections
      .filter((entry) => !(entry.provider === input.provider && entry.accountId === tokens.accountId))
      .concat({
        provider: input.provider,
        accountId: tokens.accountId,
        accountEmail: tokens.accountEmail,
        scopes: normalizeScopes(tokens.scopes),
        capabilities: normalizeScopes(pending.capabilities || []),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        connectedAt: prior?.connectedAt || timestamp,
        updatedAt: timestamp,
      })
    writeStore(current, workspacePath)
    appendAudit({
      event: 'mail.oauth.connected',
      provider: input.provider,
      actorId: input.actorId,
      accountId: tokens.accountId,
      scopes: normalizeScopes(tokens.scopes),
      status: 'success',
    }, workspacePath)
    return listMailOAuthConnections(workspacePath, now)
      .find((entry) => entry.provider === input.provider && entry.accountId === tokens.accountId)!
  } catch (error) {
    appendAudit({ event: 'mail.oauth.failed', provider: input.provider, actorId: input.actorId, status: 'failed' }, workspacePath)
    throw error
  }
}

export async function disconnectMailOAuth(input: {
  provider: string
  accountId: string
  actorId: string
  adapter: MailOAuthProviderAdapter
  workspacePath?: string
}): Promise<void> {
  assertProvider(input.provider)
  const workspacePath = input.workspacePath || getWorkspacePath()
  const store = readStore(workspacePath)
  const connection = store.connections.find((entry) =>
    entry.provider === input.provider && entry.accountId === input.accountId)
  if (!connection) throw new Error('Mail OAuth connection not found')
  if (input.adapter.revoke) {
    await input.adapter.revoke({
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
    })
  }
  store.connections = store.connections.filter((entry) => entry !== connection)
  writeStore(store, workspacePath)
  appendAudit({
    event: 'mail.oauth.disconnected',
    provider: input.provider,
    actorId: input.actorId,
    accountId: input.accountId,
    status: 'success',
  }, workspacePath)
}

export async function refreshMailOAuth(input: {
  provider: string
  accountId: string
  actorId: string
  adapter: MailOAuthProviderAdapter
  workspacePath?: string
  now?: number
}): Promise<MailOAuthConnectionSummary> {
  assertProvider(input.provider)
  if (input.adapter.provider !== input.provider) throw new Error('Mail OAuth adapter provider mismatch')
  if (!input.adapter.refresh) throw new Error('Mail OAuth provider does not support token refresh')
  const workspacePath = input.workspacePath || getWorkspacePath()
  const store = readStore(workspacePath)
  const connection = store.connections.find((entry) =>
    entry.provider === input.provider && entry.accountId === input.accountId)
  if (!connection) throw new Error('Mail OAuth connection not found')
  if (!connection.refreshToken) throw new Error('Mail OAuth connection requires reconnection')
  try {
    const refreshed = await input.adapter.refresh({
      refreshToken: connection.refreshToken,
      scopes: [...connection.scopes],
    })
    if (!refreshed.accessToken) throw new Error('Mail OAuth provider returned an incomplete refresh response')
    const now = input.now ?? Date.now()
    connection.accessToken = refreshed.accessToken
    connection.refreshToken = refreshed.refreshToken || connection.refreshToken
    connection.scopes = normalizeScopes(refreshed.scopes || connection.scopes)
    connection.expiresAt = refreshed.expiresAt
    connection.updatedAt = new Date(now).toISOString()
    writeStore(store, workspacePath)
    appendAudit({
      event: 'mail.oauth.refreshed',
      provider: input.provider,
      actorId: input.actorId,
      accountId: input.accountId,
      status: 'success',
    }, workspacePath)
    return listMailOAuthConnections(workspacePath, now)
      .find((entry) => entry.provider === input.provider && entry.accountId === input.accountId)!
  } catch (error) {
    appendAudit({
      event: 'mail.oauth.refresh-failed',
      provider: input.provider,
      actorId: input.actorId,
      accountId: input.accountId,
      status: 'failed',
    }, workspacePath)
    throw error
  }
}

export async function getMailOAuthAccessToken(input: {
  provider: string
  accountId: string
  actorId: string
  adapter: MailOAuthProviderAdapter
  workspacePath?: string
  now?: number
}): Promise<string> {
  assertProvider(input.provider)
  const workspacePath = input.workspacePath || getWorkspacePath()
  const now = input.now ?? Date.now()
  let connection = readStore(workspacePath).connections.find((entry) =>
    entry.provider === input.provider && entry.accountId === input.accountId)
  if (!connection) throw new Error('Mail OAuth connection not found')
  if (connection.expiresAt && Date.parse(connection.expiresAt) <= now + 60_000) {
    if (!connection.refreshToken || !input.adapter.refresh) throw new Error('Mail OAuth connection requires reconnection')
    await refreshMailOAuth({ ...input, provider: input.provider, workspacePath, now })
    connection = readStore(workspacePath).connections.find((entry) =>
      entry.provider === input.provider && entry.accountId === input.accountId)
  }
  if (!connection?.accessToken) throw new Error('Mail OAuth connection requires reconnection')
  return connection.accessToken
}

export function createFakeMailOAuthProvider(provider: MailProviderId, options: {
  redirectUri?: string
  accountId?: string
  accountEmail?: string
  expiresAt?: string
} = {}): MailOAuthProviderAdapter & { revokedTokens: string[]; refreshedTokens: string[] } {
  const revokedTokens: string[] = []
  const refreshedTokens: string[] = []
  return {
    provider,
    redirectUri: options.redirectUri || `http://localhost/api/mail/oauth/${provider}/callback`,
    configured: true,
    revokedTokens,
    refreshedTokens,
    getAuthorizationUrl(input) {
      const query = new URLSearchParams({
        state: input.state,
        code_challenge: input.codeChallenge,
        code_challenge_method: 'S256',
        scope: input.scopes.join(' '),
        redirect_uri: this.redirectUri,
      })
      return `https://oauth.test/${provider}/authorize?${query}`
    },
    async exchangeCode(input) {
      if (!input.code || input.codeVerifier.length < 43) throw new Error('Fake OAuth exchange rejected invalid credentials')
      return {
        accountId: options.accountId || `${provider}-account`,
        accountEmail: options.accountEmail || `tester@${provider}.test`,
        scopes: ['mail.read.metadata', 'mail.draft.create'],
        accessToken: `${provider}-access-token-${input.code}`,
        refreshToken: `${provider}-refresh-token`,
        expiresAt: options.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }
    },
    async refresh(input) {
      refreshedTokens.push(input.refreshToken)
      return {
        accessToken: `${provider}-refreshed-access-token`,
        refreshToken: input.refreshToken,
        scopes: input.scopes,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }
    },
    async revoke(tokens) {
      revokedTokens.push(tokens.refreshToken || tokens.accessToken)
    },
  }
}

export function createDefaultMailOAuthProviders(): Record<MailProviderId, MailOAuthProviderAdapter> {
  if (`${process.env.CLAWMAX_MAIL_OAUTH_FAKE || ''}`.toLowerCase() === 'true') {
    return {
      gmail: createFakeMailOAuthProvider('gmail'),
      microsoft365: createFakeMailOAuthProvider('microsoft365'),
    }
  }
  return createProductionMailOAuthProviders()
}

export const __test = {
  auditPath,
  decryptStore,
  encryptStore,
  hashState,
  readStore,
  storePath,
}
