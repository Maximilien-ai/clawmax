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
}

export function parseTelegramOwnerIds(value: string): string[] {
  return Array.from(new Set(value.split(/[\s,]+/).map(entry => entry.trim()).filter(Boolean)))
}

export function validateTelegramOwnerIds(value: string): string | null {
  const invalid = parseTelegramOwnerIds(value).find(entry => !/^\d{1,20}$/.test(entry))
  return invalid ? `Telegram user ID “${invalid}” must contain digits only.` : null
}

export function agentChannelStatusLabel(channel: Pick<AgentChannelView, 'configured' | 'enabled' | 'bound'>): string {
  if (!channel.configured && channel.bound) return 'Binding exists, account missing'
  if (!channel.configured) return 'Not connected'
  if (!channel.enabled) return 'Configured, disabled'
  if (!channel.bound) return 'Connected, not bound'
  return 'Connected and bound'
}
