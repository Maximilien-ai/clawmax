import { normalizeChatMessage } from '../../../server/lib/chat-normalization'
import { runtimeDiagnosticProse } from './chatRuntimeErrors'
import { resolveNavigableWorkspaceDocPath } from './workspaceDocNavigation'

type ComparableMessage = {
  id: string
  from: string
  content: string
  timestamp: number
}

type ComparableMember = {
  id: string
  name: string
}

export function mergeTypingAgents(
  pendingReplyAgents: Set<string>,
  activeWorkflowAgents: Set<string>
): Set<string> {
  return new Set([...pendingReplyAgents, ...activeWorkflowAgents])
}

export function removeRespondedAgentsFromPending(
  pendingReplyAgents: Set<string>,
  newMessages: ComparableMessage[],
  previousMessageCount: number,
  channelMembers: ComparableMember[] = []
): Set<string> {
  if (pendingReplyAgents.size === 0 || newMessages.length <= previousMessageCount) {
    return pendingReplyAgents
  }

  const nextPending = new Set(pendingReplyAgents)
  const latestMessages = newMessages.slice(previousMessageCount)
  for (const message of latestMessages) {
    if (message.from && message.from !== 'User') {
      const normalizedFrom = message.from.trim().toLowerCase()
      const matchingMember = channelMembers.find((member) =>
        member.id.trim().toLowerCase() === normalizedFrom
        || member.name.trim().toLowerCase() === normalizedFrom
      )
      if (matchingMember) {
        nextPending.delete(matchingMember.id)
      } else {
        nextPending.delete(message.from)
      }
    }
  }
  return nextPending
}

export function buildCommunicationCacheKey(type: 'community' | 'group', name: string): string {
  return `${type}:${name}`
}

export function resolveCommunicationDocPath(
  target: string,
  docEntries: Array<{ path: string }>
): string | null {
  return resolveNavigableWorkspaceDocPath(target, docEntries)
}

export function shouldUpdateChannelMessages(
  previousMessages: ComparableMessage[],
  nextMessages: ComparableMessage[]
): boolean {
  if (previousMessages.length !== nextMessages.length) {
    return true
  }

  for (let index = 0; index < previousMessages.length; index += 1) {
    const previous = previousMessages[index]
    const next = nextMessages[index]
    if (
      previous.id !== next.id ||
      previous.from !== next.from ||
      previous.content !== next.content ||
      previous.timestamp !== next.timestamp
    ) {
      return true
    }
  }

  return false
}
export function communicationTitle(channel: { name: string; displayName?: string; description?: string | null; tags?: string[] }): string {
  return channel.tags?.includes('bulk-chat') && channel.description
    ? channel.description : channel.displayName?.trim() || channel.name
}

/**
 * A group or community message as the panel shows it. The server normalizes messages when it stores
 * and loads them; the same fence-aware normalizer runs here, so code, JSON examples and diagrams are
 * shown as written. (This was a drifted copy of the old line filter that emptied fenced JSON blocks.)
 * A one-line runtime failure is still restated as a plain explanation.
 */
export function cleanCommunicationMessage(content: string): string {
  const cleaned = normalizeChatMessage(content) || content
  const prose = runtimeDiagnosticProse(cleaned).trim()
  if (
    /^(model fallback decision|FailoverError|FallbackSummaryError|Incorrect API key provided|Provider .* auth issue|network connection error|Connection error)/i.test(prose)
    && !/[\r\n]/.test(cleaned)
  ) {
    if (/Incorrect API key provided|auth issue|missing credentials|missing api key/i.test(prose)) {
      return 'Runtime auth error while contacting the configured model provider. Check the provider key/configuration and retry.'
    }
    if (/network connection error|Connection error|timeout|timed out|cooldown/i.test(prose)) {
      return 'Runtime connection error while contacting the configured model provider. Check provider/network availability and retry.'
    }
    return 'Runtime model execution error. Review workflow details or retry the run.'
  }
  return cleaned
}
