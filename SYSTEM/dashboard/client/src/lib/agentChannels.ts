export type AgentChannelView = {
  id: 'telegram' | 'discord' | 'slack'
  label: string
  available: boolean
  releaseState: 'available' | 'planned'
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

export function parseTelegramOwnerIds(value: string): string[] {
  return Array.from(new Set(value.split(/[\s,]+/).map(entry => entry.trim()).filter(Boolean)))
}

export function validateTelegramOwnerIds(value: string): string | null {
  const invalid = parseTelegramOwnerIds(value).find(entry => !/^\d{1,20}$/.test(entry))
  return invalid ? `Telegram user ID “${invalid}” must contain digits only.` : null
}

export function parseDiscordIds(value: string): string[] {
  return Array.from(new Set(value.split(/[\s,]+/).map(entry => entry.trim()).filter(Boolean)))
}

export function validateDiscordIds(value: string, label: string): string | null {
  const invalid = parseDiscordIds(value).find(entry => !/^\d{17,20}$/.test(entry))
  return invalid ? `${label} “${invalid}” must contain 17–20 digits.` : null
}

export function agentChannelStatusLabel(channel: Pick<AgentChannelView, 'configured' | 'enabled' | 'bound'>): string {
  if (!channel.configured && channel.bound) return 'Binding exists, account missing'
  if (!channel.configured) return 'Not connected'
  if (!channel.enabled) return 'Configured, disabled'
  if (!channel.bound) return 'Connected, not bound'
  return 'Connected and bound'
}
