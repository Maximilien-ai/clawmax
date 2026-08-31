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
  applicationId: string | null
  guilds: Array<{
    id: string
    requireMention: boolean
    users: string[]
    channels: string[]
  }>
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
    available: true,
    releaseState: 'available',
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

export function getOpenClawExternalChannelPluginPath(homeDir: string, provider: 'discord' | 'slack'): string {
  return path.join(homeDir, '.openclaw', 'npm', 'node_modules', '@openclaw', provider)
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

function normalizeDiscordGuilds(value: unknown): AgentChannelState['guilds'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).map(([id, rawGuild]) => {
    const guild = rawGuild && typeof rawGuild === 'object' && !Array.isArray(rawGuild)
      ? rawGuild as Record<string, unknown>
      : {}
    const channels = guild.channels && typeof guild.channels === 'object' && !Array.isArray(guild.channels)
      ? Object.keys(guild.channels as Record<string, unknown>)
      : []
    return {
      id,
      requireMention: guild.requireMention !== false,
      users: normalizeAllowFrom(guild.users),
      channels,
    }
  })
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
    applicationId: typeof account?.applicationId === 'string' && account.applicationId.trim()
      ? account.applicationId.trim()
      : null,
    guilds: provider === 'discord' ? normalizeDiscordGuilds(account?.guilds) : [],
  }
}

export function readAgentChannelStates(params: {
  homeDir: string
  agentId: string
  isProfile: boolean
}): AgentChannelState[] {
  return AGENT_CHANNEL_PROVIDERS.map((provider) => readAgentChannelState({ ...params, provider }))
}

export function readAgentOpenClawPluginPaths(params: {
  homeDir: string
  agentId: string
  isProfile: boolean
}): string[] {
  const config = readConfig(getAgentOpenClawConfigPath(params.homeDir, params.agentId, params.isProfile))
  const paths = config?.plugins?.load?.paths
  return Array.isArray(paths)
    ? paths.map((entry: unknown) => String(entry || '').trim()).filter(Boolean)
    : []
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

export type DiscordConnectionInput = {
  token: string
  applicationId: string | null
  userIds: string[]
  guildId: string | null
  channelIds: string[]
  requireMention: boolean
}

export type AgentChannelProbeResult = {
  ok: boolean
  status: number | null
  category: 'healthy' | 'authentication' | 'intent' | 'permission' | 'connection' | 'unknown'
  message: string
}

export function parseOpenClawChannelProbeOutput(
  provider: AgentChannelProvider,
  accountId: string,
  output: string,
): AgentChannelProbeResult {
  let parsed: any
  try {
    parsed = JSON.parse(output)
  } catch {
    return { ok: false, status: null, category: 'unknown', message: 'OpenClaw returned an unreadable channel probe result.' }
  }
  const entries = Array.isArray(parsed?.channels) ? parsed.channels : []
  const entry = entries.find((candidate: any) => candidate?.channel === provider && candidate?.accountId === accountId)
  if (!entry) {
    return { ok: false, status: null, category: 'connection', message: `OpenClaw did not report the ${provider} account ${accountId}.` }
  }
  const probe = entry.probe && typeof entry.probe === 'object' ? entry.probe : {}
  if (probe.ok === true) {
    return { ok: true, status: typeof probe.status === 'number' ? probe.status : 200, category: 'healthy', message: 'Credential and channel capability probe passed.' }
  }
  const status = typeof probe.status === 'number' ? probe.status : null
  const rawError = typeof probe.error === 'string' && probe.error.trim() ? probe.error.trim() : 'Channel probe failed.'
  const normalized = rawError.toLowerCase()
  const category = status === 401 || /unauth|token|credential/.test(normalized)
    ? 'authentication'
    : /intent/.test(normalized)
      ? 'intent'
      : status === 403 || /permission|missing access/.test(normalized)
        ? 'permission'
        : /timeout|connect|gateway|network/.test(normalized)
          ? 'connection'
          : 'unknown'
  return { ok: false, status, category, message: rawError.slice(0, 300) }
}

function normalizeDiscordSnowflakes(value: unknown, label: string): {
  ok: true
  value: string[]
} | {
  ok: false
  error: string
} {
  if (value == null) return { ok: true, value: [] }
  if (!Array.isArray(value)) return { ok: false, error: `${label} must be an array of numeric Discord IDs.` }
  const ids = Array.from(new Set(value.map(entry => String(entry || '').trim()).filter(Boolean)))
  if (ids.some(id => !/^\d{17,20}$/.test(id))) {
    return { ok: false, error: `${label} entries must be 17–20 digit Discord IDs.` }
  }
  return { ok: true, value: ids }
}

export function validateDiscordConnectionInput(input: unknown): {
  ok: true
  value: DiscordConnectionInput
} | {
  ok: false
  error: string
} {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const token = String(body.token || '').trim()
  if (token.length < 32 || token.length > 200 || /\s/.test(token)) {
    return { ok: false, error: 'Discord bot token must be a 32–200 character token without whitespace.' }
  }

  const applicationId = String(body.applicationId || '').trim() || null
  if (applicationId && !/^\d{17,20}$/.test(applicationId)) {
    return { ok: false, error: 'Discord application ID must contain 17–20 digits.' }
  }
  const guildId = String(body.guildId || '').trim() || null
  if (guildId && !/^\d{17,20}$/.test(guildId)) {
    return { ok: false, error: 'Discord server ID must contain 17–20 digits.' }
  }
  const users = normalizeDiscordSnowflakes(body.userIds, 'Discord user allowlist')
  if (!users.ok) return users
  const channels = normalizeDiscordSnowflakes(body.channelIds, 'Discord channel allowlist')
  if (!channels.ok) return channels
  if (channels.value.length > 0 && !guildId) {
    return { ok: false, error: 'Choose a Discord server before adding channel IDs.' }
  }
  if (body.requireMention != null && typeof body.requireMention !== 'boolean') {
    return { ok: false, error: 'Discord require-mention must be a boolean.' }
  }

  return {
    ok: true,
    value: {
      token,
      applicationId,
      userIds: users.value,
      guildId,
      channelIds: channels.value,
      requireMention: body.requireMention !== false,
    },
  }
}

export function redactChannelError(error: unknown, secrets: string[] = []): string {
  let message = error instanceof Error ? error.message : String(error || 'OpenClaw channel operation failed')
  for (const secret of secrets.filter(Boolean)) message = message.split(secret).join('[redacted]')
  message = message.replace(/\b\d{5,20}:[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
  message = message.replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
  return message.slice(0, 500)
}
