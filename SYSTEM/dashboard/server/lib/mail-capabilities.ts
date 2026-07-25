export const MAIL_CAPABILITIES = [
  'mail.list',
  'mail.search',
  'mail.read.metadata',
  'mail.read.body',
  'mail.draft.create',
] as const

export type MailCapability = typeof MAIL_CAPABILITIES[number]
export type MailProviderId = 'gmail' | 'microsoft365'

export interface MailInvocationContext {
  workspaceId: string
  agentId: string
  pluginId: string
  pluginFingerprint: string
}

export interface MailCapabilityGrant extends MailInvocationContext {
  id: string
  provider: MailProviderId
  accountId: string
  capabilities: MailCapability[]
  revokedAt?: string
}

export interface MailInvocation {
  provider: MailProviderId
  accountId: string
  capability: MailCapability
  context: MailInvocationContext
  args: {
    query?: string
    messageId?: string
    limit?: number
    to?: string[]
    subject?: string
    body?: string
  }
}

export interface NormalizedMailMessage {
  id: string
  threadId?: string
  from: string
  to: string[]
  subject: string
  receivedAt: string
  unread: boolean
  body?: string
}

export interface MailDraft {
  id: string
  to: string[]
  subject: string
  body: string
}

export interface MailProviderAdapter {
  readonly provider: MailProviderId
  invoke(request: MailInvocation): Promise<NormalizedMailMessage[] | NormalizedMailMessage | MailDraft>
}

const MAX_RESULTS = 50
const MAX_QUERY_LENGTH = 500
const MAX_DRAFT_RECIPIENTS = 20
const MAX_DRAFT_SUBJECT_LENGTH = 998
const MAX_DRAFT_BODY_LENGTH = 100_000

function requireText(value: string | undefined, label: string, maxLength: number): string {
  const normalized = value?.trim() || ''
  if (!normalized) throw new Error(`${label} is required`)
  if (normalized.length > maxLength) throw new Error(`${label} exceeds the ${maxLength} character limit`)
  return normalized
}

function assertContextMatches(grant: MailCapabilityGrant, request: MailInvocation): void {
  const expected: Array<[keyof MailInvocationContext, string]> = [
    ['workspaceId', grant.workspaceId],
    ['agentId', grant.agentId],
    ['pluginId', grant.pluginId],
    ['pluginFingerprint', grant.pluginFingerprint],
  ]
  for (const [key, value] of expected) {
    if (request.context[key] !== value) throw new Error(`Mail grant ${key} mismatch`)
  }
}

export function validateMailInvocation(grant: MailCapabilityGrant, request: MailInvocation): MailInvocation {
  if (!MAIL_CAPABILITIES.includes(request.capability)) throw new Error('Unsupported mail capability')
  if (request.provider !== 'gmail' && request.provider !== 'microsoft365') throw new Error('Unsupported mail provider')
  if (grant.revokedAt) throw new Error('Mail grant is revoked')
  if (grant.provider !== request.provider) throw new Error('Mail grant provider mismatch')
  if (grant.accountId !== request.accountId) throw new Error('Mail grant account mismatch')
  assertContextMatches(grant, request)
  if (!grant.capabilities.includes(request.capability)) {
    throw new Error(`Mail capability ${request.capability} is not granted`)
  }

  const args = { ...(request.args || {}) }
  if (request.capability === 'mail.list' || request.capability === 'mail.search') {
    args.limit = Math.max(1, Math.min(MAX_RESULTS, Number(args.limit) || 20))
  }
  if (request.capability === 'mail.search') {
    args.query = requireText(args.query, 'Search query', MAX_QUERY_LENGTH)
  }
  if (request.capability === 'mail.read.metadata' || request.capability === 'mail.read.body') {
    args.messageId = requireText(args.messageId, 'Message ID', 500)
  }
  if (request.capability === 'mail.draft.create') {
    const recipients = Array.from(new Set((args.to || []).map((entry) => entry.trim()).filter(Boolean)))
    if (recipients.length === 0) throw new Error('At least one draft recipient is required')
    if (recipients.length > MAX_DRAFT_RECIPIENTS) throw new Error(`Draft recipients exceed the ${MAX_DRAFT_RECIPIENTS} recipient limit`)
    args.to = recipients
    args.subject = requireText(args.subject, 'Draft subject', MAX_DRAFT_SUBJECT_LENGTH)
    args.body = requireText(args.body, 'Draft body', MAX_DRAFT_BODY_LENGTH)
  }

  return { ...request, args }
}

export function createMailAuditEvent(request: MailInvocation, outcome: 'succeeded' | 'failed') {
  return {
    provider: request.provider,
    accountId: request.accountId,
    capability: request.capability,
    workspaceId: request.context.workspaceId,
    agentId: request.context.agentId,
    pluginId: request.context.pluginId,
    outcome,
    messageId: request.args.messageId,
    resultLimit: request.args.limit,
    recipientCount: request.args.to?.length,
  }
}

export async function invokeMailCapability(
  grant: MailCapabilityGrant,
  adapter: MailProviderAdapter,
  request: MailInvocation,
) {
  if (adapter.provider !== request.provider) throw new Error('Mail adapter provider mismatch')
  return adapter.invoke(validateMailInvocation(grant, request))
}

export class FakeMailProvider implements MailProviderAdapter {
  readonly provider: MailProviderId
  private readonly messages: NormalizedMailMessage[]
  private draftSequence = 0

  constructor(provider: MailProviderId, messages: NormalizedMailMessage[]) {
    this.provider = provider
    this.messages = messages.map((message) => ({ ...message, to: [...message.to] }))
  }

  async invoke(request: MailInvocation): Promise<NormalizedMailMessage[] | NormalizedMailMessage | MailDraft> {
    if (request.capability === 'mail.draft.create') {
      this.draftSequence += 1
      return {
        id: `draft-${this.draftSequence}`,
        to: [...(request.args.to || [])],
        subject: request.args.subject || '',
        body: request.args.body || '',
      }
    }

    if (request.capability === 'mail.read.metadata' || request.capability === 'mail.read.body') {
      const found = this.messages.find((message) => message.id === request.args.messageId)
      if (!found) throw new Error('Mail message not found')
      const result = { ...found, to: [...found.to] }
      if (request.capability === 'mail.read.metadata') delete result.body
      return result
    }

    const query = request.args.query?.toLowerCase()
    return this.messages
      .filter((message) => !query || `${message.from} ${message.subject}`.toLowerCase().includes(query))
      .slice(0, request.args.limit || 20)
      .map((message) => {
        const result = { ...message, to: [...message.to] }
        delete result.body
        return result
      })
  }
}
