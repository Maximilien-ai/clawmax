import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { getWorkspacePath, listAgents, parseGroupsWithMembers } from './workspace'

export class ChannelRecipientError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}

/** Validate the entire recipient set before persistence, then recheck at dispatch. */
export function channelRecipients(type: 'group' | 'community', name: string, requested: unknown): string[] {
  if (requested === undefined) return []
  if (!Array.isArray(requested) || requested.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(id))) {
    throw new ChannelRecipientError(400, 'invalid_mentions', 'Mentions must be a list of valid agent IDs.')
  }
  const recipients = [...new Set(requested)] as string[]
  if (!recipients.length) return []
  const active = new Set(listAgents().filter(agent => !agent.archived).map(agent => agent.id))
  let allowed: Set<string>
  if (type === 'group' && /^bulk-chat-\d{13}$/.test(name)) {
    // An explicitly selected temporary conversation is limited to this workspace.
    allowed = active
  } else {
    const file = path.join(getWorkspacePath(), 'ORG', type === 'group' ? 'GROUPS.md' : 'COMMUNITIES.md')
    const parsed = fs.existsSync(file) ? parseGroupsWithMembers(fs.readFileSync(file, 'utf8')) : { groups: [], communities: [] }
    const channel = (type === 'group' ? parsed.groups : parsed.communities).find(entry => entry.name === name)
    if (!channel) throw new ChannelRecipientError(404, 'channel_not_found', 'This channel no longer exists. Refresh Communications.')
    allowed = new Set(channel.members.filter(id => active.has(id)))
  }
  if (recipients.some(id => !allowed.has(id))) {
    throw new ChannelRecipientError(403, 'recipient_not_in_channel', 'A mentioned agent is no longer an active member of this channel. Refresh Communications before sending.')
  }
  return recipients
}

export function channelSessionId(type: 'group' | 'community', name: string, agentId: string): string {
  const identity = JSON.stringify([path.resolve(getWorkspacePath()), type, name, agentId])
  return `channel-${crypto.createHash('sha256').update(identity).digest('hex')}`
}
