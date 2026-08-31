import {
  parseDiscordIds,
  parseSlackIds,
  parseTelegramOwnerIds,
  validateDiscordIds,
  validateSlackChannelIds,
  validateSlackUserIds,
  validateTelegramOwnerIds,
} from './agentChannels'

export type WizardChannelProvider = 'whatsapp' | 'telegram' | 'discord' | 'slack'

export type WizardChannelDraft = {
  selected: WizardChannelProvider[]
  whatsapp: string
  telegram: { token: string; ownerIds: string }
  discord: {
    token: string
    applicationId: string
    userIds: string
    guildId: string
    channelIds: string
    requireMention: boolean
  }
  slack: {
    botToken: string
    appToken: string
    userIds: string
    channelIds: string
    requireMention: boolean
  }
}

export type WizardChannelRequest = {
  provider: Exclude<WizardChannelProvider, 'whatsapp'>
  label: string
  body: Record<string, unknown>
}

export function createEmptyWizardChannelDraft(): WizardChannelDraft {
  return {
    selected: [],
    whatsapp: '',
    telegram: { token: '', ownerIds: '' },
    discord: { token: '', applicationId: '', userIds: '', guildId: '', channelIds: '', requireMention: true },
    slack: { botToken: '', appToken: '', userIds: '', channelIds: '', requireMention: true },
  }
}

export function validateWizardChannelDraft(draft: WizardChannelDraft): string[] {
  const errors: string[] = []
  if (draft.selected.includes('whatsapp') && !/^\+?\d{6,20}$/.test(draft.whatsapp.trim())) {
    errors.push('Enter a WhatsApp number in international format, using 6–20 digits.')
  }
  if (draft.selected.includes('telegram')) {
    if (!draft.telegram.token.trim()) errors.push('Enter the Telegram BotFather token.')
    const ownerError = validateTelegramOwnerIds(draft.telegram.ownerIds)
    if (ownerError) errors.push(ownerError)
  }
  if (draft.selected.includes('discord')) {
    if (!draft.discord.token.trim()) errors.push('Enter the Discord bot token.')
    const idErrors = [
      validateDiscordIds(draft.discord.applicationId, 'Discord application ID'),
      validateDiscordIds(draft.discord.userIds, 'Discord user ID'),
      validateDiscordIds(draft.discord.guildId, 'Discord server ID'),
      validateDiscordIds(draft.discord.channelIds, 'Discord channel ID'),
    ].filter((error): error is string => Boolean(error))
    errors.push(...idErrors)
    if (parseDiscordIds(draft.discord.channelIds).length > 0 && !draft.discord.guildId.trim()) {
      errors.push('Choose a Discord server before adding channel IDs.')
    }
  }
  if (draft.selected.includes('slack')) {
    if (!draft.slack.botToken.trim()) errors.push('Enter the Slack bot token.')
    if (!draft.slack.appToken.trim()) errors.push('Enter the Slack Socket Mode app token.')
    const userError = validateSlackUserIds(draft.slack.userIds)
    const channelError = validateSlackChannelIds(draft.slack.channelIds)
    if (userError) errors.push(userError)
    if (channelError) errors.push(channelError)
  }
  return errors
}

export function buildWizardChannelRequests(draft: WizardChannelDraft): WizardChannelRequest[] {
  const requests: WizardChannelRequest[] = []
  if (draft.selected.includes('telegram')) {
    requests.push({
      provider: 'telegram',
      label: 'Telegram',
      body: { token: draft.telegram.token.trim(), allowFrom: parseTelegramOwnerIds(draft.telegram.ownerIds) },
    })
  }
  if (draft.selected.includes('discord')) {
    requests.push({
      provider: 'discord',
      label: 'Discord',
      body: {
        token: draft.discord.token.trim(),
        applicationId: draft.discord.applicationId.trim() || null,
        userIds: parseDiscordIds(draft.discord.userIds),
        guildId: draft.discord.guildId.trim() || null,
        channelIds: parseDiscordIds(draft.discord.channelIds),
        requireMention: draft.discord.requireMention,
      },
    })
  }
  if (draft.selected.includes('slack')) {
    requests.push({
      provider: 'slack',
      label: 'Slack',
      body: {
        botToken: draft.slack.botToken.trim(),
        appToken: draft.slack.appToken.trim(),
        userIds: parseSlackIds(draft.slack.userIds),
        channelIds: parseSlackIds(draft.slack.channelIds),
        requireMention: draft.slack.requireMention,
      },
    })
  }
  return requests
}

