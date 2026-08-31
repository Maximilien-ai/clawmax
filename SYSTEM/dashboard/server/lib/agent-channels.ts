import fs from 'fs'
import path from 'path'

export const AGENT_CHANNEL_PROVIDERS = ['telegram', 'discord', 'slack'] as const
export type AgentChannelProvider = typeof AGENT_CHANNEL_PROVIDERS[number]

export type AgentChannelCatalogEntry = {
  id: AgentChannelProvider
  label: string
  credentialLabels: string[]
  available: boolean
  releaseState: 'available' | 'planned'
}

export type AgentChannelState = {
  provider: AgentChannelProvider
  accountId: string
  displayName: string | null
  configured: boolean
  enabled: boolean
  bound: boolean
  status: 'not-configured' | 'connected' | 'bound'
  dmPolicy: string | null
  allowFrom: string[]
}

export const AGENT_CHANNEL_CATALOG: readonly AgentChannelCatalogEntry[] = [
  {
    id: 'telegram',
    label: 'Telegram',
    credentialLabels: ['Bot token'],
    available: true,
    releaseState: 'available',
  },
  {
    id: 'discord',
    label: 'Discord',
    credentialLabels: ['Bot token'],
    available: false,
    releaseState: 'planned',
  },
  {
    id: 'slack',
    label: 'Slack',
    credentialLabels: ['Bot token', 'App token'],
    available: false,
    releaseState: 'planned',
  },
] as const

export function normalizeAgentChannelProvider(value: unknown): AgentChannelProvider | null {
  const normalized = String(value || '').trim().toLowerCase()
  return AGENT_CHANNEL_PROVIDERS.includes(normalized as AgentChannelProvider)
    ? normalized as AgentChannelProvider
    : null
}

export function getAgentOpenClawStateDir(homeDir: string, agentId: string, isProfile: boolean): string {
  return path.join(homeDir, isProfile ? `.openclaw-${agentId}` : '.openclaw')
}

export function getAgentOpenClawConfigPath(homeDir: string, agentId: string, isProfile: boolean): string {
  return path.join(getAgentOpenClawStateDir(homeDir, agentId, isProfile), 'openclaw.json')
}

export function getAgentChannelSecretsPath(homeDir: string, agentId: string, isProfile: boolean): string {
  return path.join(getAgentOpenClawStateDir(homeDir, agentId, isProfile), 'credentials', 'clawmax-channel-secrets.json')
}

export function getAgentChannelSecretKey(provider: AgentChannelProvider, agentId: string): string {
  return `${provider}-${agentId}`
}

export function getAgentOpenClawProfileArgs(agentId: string, isProfile: boolean): string[] {
  return isProfile ? ['--profile', agentId] : []
}

export type OpenClawConfigSnapshot = {
  configPath: string
  existed: boolean
  content: string | null
  mode: number | null
}

function snapshotFile(filePath: string): OpenClawConfigSnapshot {
  try {
    const stat = fs.statSync(filePath)
    return {
      configPath: filePath,
      existed: true,
      content: fs.readFileSync(filePath, 'utf-8'),
      mode: stat.mode & 0o777,
    }
  } catch {
    return { configPath: filePath, existed: false, content: null, mode: null }
  }
}

export function snapshotAgentOpenClawConfig(params: {
  homeDir: string
  agentId: string
  isProfile: boolean
}): OpenClawConfigSnapshot {
  const configPath = getAgentOpenClawConfigPath(params.homeDir, params.agentId, params.isProfile)
  return snapshotFile(configPath)
}

export function snapshotAgentChannelSecrets(params: {
  homeDir: string
  agentId: string
  isProfile: boolean
}): OpenClawConfigSnapshot {
  return snapshotFile(getAgentChannelSecretsPath(params.homeDir, params.agentId, params.isProfile))
}

export function restoreAgentOpenClawConfig(snapshot: OpenClawConfigSnapshot): void {
  if (!snapshot.existed) {
    try { fs.unlinkSync(snapshot.configPath) } catch {}
    return
  }
  fs.mkdirSync(path.dirname(snapshot.configPath), { recursive: true })
  fs.writeFileSync(snapshot.configPath, snapshot.content || '', {
    encoding: 'utf-8',
    mode: snapshot.mode || 0o600,
  })
}

function readSecretStore(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Credential store must be a JSON object.')
    const entries = Object.entries(parsed)
    if (entries.some(([, value]) => typeof value !== 'string')) throw new Error('Credential store values must be strings.')
    return Object.fromEntries(entries) as Record<string, string>
  } catch (error) {
    throw new Error(`Could not read the existing channel credential store: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function writeSecretStore(filePath: string, values: Record<string, string>): void {
  const directory = path.dirname(filePath)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(values, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(tempPath, filePath)
    fs.chmodSync(filePath, 0o600)
  } finally {
    try { fs.unlinkSync(tempPath) } catch {}
  }
}

export function writeAgentChannelSecret(params: {
  homeDir: string
  agentId: string
  isProfile: boolean
  provider: AgentChannelProvider
  secret: string
}): { filePath: string; key: string; jsonPointer: string } {
  const filePath = getAgentChannelSecretsPath(params.homeDir, params.agentId, params.isProfile)
  const key = getAgentChannelSecretKey(params.provider, params.agentId)
  writeSecretStore(filePath, { ...readSecretStore(filePath), [key]: params.secret })
  return { filePath, key, jsonPointer: `/${key}` }
}

export function removeAgentChannelSecret(params: {
  homeDir: string
  agentId: string
  isProfile: boolean
  provider: AgentChannelProvider
}): void {
  const filePath = getAgentChannelSecretsPath(params.homeDir, params.agentId, params.isProfile)
  if (!fs.existsSync(filePath)) return
  const values = readSecretStore(filePath)
  delete values[getAgentChannelSecretKey(params.provider, params.agentId)]
  writeSecretStore(filePath, values)
}

function readConfig(configPath: string): Record<string, any> {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function hasConfiguredCredential(provider: AgentChannelProvider, account: Record<string, any>): boolean {
  if (provider === 'telegram') return Boolean(account.botToken || account.token)
  if (provider === 'discord') return Boolean(account.token || account.botToken)
  return Boolean(account.botToken && account.appToken)
}

function normalizeAllowFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => String(entry || '').trim()).filter(Boolean)
}

export function readAgentChannelState(params: {
  homeDir: string
  agentId: string
  isProfile: boolean
  provider: AgentChannelProvider
}): AgentChannelState {
  const { homeDir, agentId, isProfile, provider } = params
  const config = readConfig(getAgentOpenClawConfigPath(homeDir, agentId, isProfile))
  const providerConfig = config?.channels?.[provider]
  const account = providerConfig?.accounts?.[agentId]
  const configured = Boolean(account && typeof account === 'object' && hasConfiguredCredential(provider, account))
  const enabled = configured && providerConfig?.enabled !== false && account?.enabled !== false
  const bound = Boolean((Array.isArray(config?.bindings) ? config.bindings : []).some((binding: any) => (
    binding?.agentId === agentId
    && binding?.match?.channel === provider
    && binding?.match?.accountId === agentId
  )))

  return {
    provider,
    accountId: agentId,
    displayName: typeof account?.name === 'string' && account.name.trim() ? account.name.trim() : null,
    configured,
    enabled,
    bound,
    status: configured ? (bound ? 'bound' : 'connected') : 'not-configured',
    dmPolicy: typeof account?.dmPolicy === 'string' ? account.dmPolicy : null,
    allowFrom: normalizeAllowFrom(account?.allowFrom),
  }
}

export function readAgentChannelStates(params: {
  homeDir: string
  agentId: string
  isProfile: boolean
}): AgentChannelState[] {
  return AGENT_CHANNEL_PROVIDERS.map((provider) => readAgentChannelState({ ...params, provider }))
}

export function validateTelegramConnectionInput(input: unknown): {
  ok: true
  value: { token: string; allowFrom: string[] }
} | {
  ok: false
  error: string
} {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const token = String(body.token || '').trim()
  if (!/^\d{5,20}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    return { ok: false, error: 'Telegram bot token must use the BotFather format.' }
  }

  const rawAllowFrom = body.allowFrom == null ? [] : body.allowFrom
  if (!Array.isArray(rawAllowFrom)) {
    return { ok: false, error: 'Telegram owner allowlist must be an array of numeric user IDs.' }
  }
  const allowFrom = Array.from(new Set(rawAllowFrom.map((entry) => String(entry || '').trim()).filter(Boolean)))
  if (allowFrom.some((entry) => !/^\d{1,20}$/.test(entry))) {
    return { ok: false, error: 'Telegram owner allowlist entries must be numeric user IDs.' }
  }

  return { ok: true, value: { token, allowFrom } }
}

export function redactChannelError(error: unknown, secrets: string[] = []): string {
  let message = error instanceof Error ? error.message : String(error || 'OpenClaw channel operation failed')
  for (const secret of secrets.filter(Boolean)) message = message.split(secret).join('[redacted]')
  message = message.replace(/\b\d{5,20}:[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
  return message.slice(0, 500)
}
