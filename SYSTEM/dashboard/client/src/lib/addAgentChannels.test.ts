import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { buildWizardChannelRequests, createEmptyWizardChannelDraft, validateWizardChannelDraft } from './addAgentChannels'

const empty = createEmptyWizardChannelDraft()
assert.deepStrictEqual(validateWizardChannelDraft(empty), [], 'Channels must remain optional')
assert.deepStrictEqual(buildWizardChannelRequests(empty), [], 'An empty selection must make no connection requests')

const invalid = createEmptyWizardChannelDraft()
invalid.selected = ['whatsapp', 'telegram', 'discord', 'slack']
invalid.discord.channelIds = '123456789012345678'
const errors = validateWizardChannelDraft(invalid)
assert(errors.some(error => error.includes('WhatsApp')), 'Selected WhatsApp must require a valid number')
assert(errors.some(error => error.includes('BotFather')), 'Selected Telegram must require its token')
assert(errors.some(error => error.includes('Discord bot token')), 'Selected Discord must require its token')
assert(errors.some(error => error.includes('Discord server')), 'Discord channels must require a server')
assert(errors.some(error => error.includes('Slack bot token')), 'Selected Slack must require its bot token')
assert(errors.some(error => error.includes('Socket Mode')), 'Selected Slack must require its app token')

const configured = createEmptyWizardChannelDraft()
configured.selected = ['whatsapp', 'telegram', 'discord', 'slack']
configured.whatsapp = '+14155550123'
configured.telegram = { token: 'telegram-secret', ownerIds: '123, 456' }
configured.discord = {
  token: 'discord-secret',
  applicationId: '123456789012345678',
  userIds: '234567890123456789',
  guildId: '345678901234567890',
  channelIds: '456789012345678901',
  requireMention: false,
}
configured.slack = {
  botToken: 'xoxb-secret',
  appToken: 'xapp-secret',
  userIds: 'u012abcdef',
  channelIds: 'c012abcdef',
  requireMention: true,
}
assert.deepStrictEqual(validateWizardChannelDraft(configured), [])
const requests = buildWizardChannelRequests(configured)
assert.deepStrictEqual(requests.map(request => request.provider), ['telegram', 'discord', 'slack'])
assert.deepStrictEqual(requests[0].body.allowFrom, ['123', '456'])
assert.deepStrictEqual(requests[1].body.channelIds, ['456789012345678901'])
assert.strictEqual(requests[1].body.requireMention, false)
assert.deepStrictEqual(requests[2].body.userIds, ['U012ABCDEF'])
assert.deepStrictEqual(requests[2].body.channelIds, ['C012ABCDEF'])
assert(!requests.some(request => JSON.stringify(request.body).includes(configured.whatsapp)), 'WhatsApp must stay on the provision request')

const wizardSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'AddAgentWizard.tsx'), 'utf-8')
assert(wizardSource.includes('Continue to Channels') && !wizardSource.includes('createAgentNowFromAI'), 'AI Create Agent must pass through the shared Channels step')
assert(['WhatsApp', 'Telegram', 'Discord', 'Slack'].every(label => wizardSource.includes(`'${label}'`)), 'The wizard must expose every released channel')
assert(wizardSource.includes('/channels/${request.provider}') && wizardSource.includes('Channel setup results'), 'Selected channels must connect after provisioning with visible results')
const aiGenerationSource = wizardSource.slice(wizardSource.indexOf('async function generateWithAI'), wizardSource.indexOf('async function provision'))
assert(!aiGenerationSource.includes('channelDraft'), 'Channel credentials must never enter the AI generation request')

console.log('Add agent channels tests passed')
