import {
  MailDraft,
  MailInvocation,
  MailProviderAdapter,
  MailProviderId,
  NormalizedMailMessage,
} from './mail-capabilities'

type FetchLike = typeof fetch

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0/me'
const MAX_BODY_CHARS = 100_000

interface GmailHeader {
  name?: string
  value?: string
}

interface GmailPart {
  mimeType?: string
  headers?: GmailHeader[]
  body?: { data?: string }
  parts?: GmailPart[]
}

interface GmailMessage {
  id?: string
  threadId?: string
  internalDate?: string
  labelIds?: string[]
  payload?: GmailPart
}

interface GraphRecipient {
  emailAddress?: { address?: string }
}

interface GraphMessage {
  id?: string
  conversationId?: string
  from?: GraphRecipient
  toRecipients?: GraphRecipient[]
  subject?: string
  receivedDateTime?: string
  isRead?: boolean
  body?: { content?: string }
}

async function providerJson<T>(
  fetchFn: FetchLike,
  url: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetchFn(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new Error('Mail provider request failed')
  }
  let body: any = {}
  try {
    body = await response.json()
  } catch {
    body = {}
  }
  if (!response.ok) {
    const code = typeof body?.error?.code === 'string' && /^[A-Za-z0-9_.-]{1,80}$/.test(body.error.code)
      ? ` (${body.error.code})`
      : ''
    throw new Error(`Mail provider returned HTTP ${response.status}${code}`)
  }
  return body as T
}

function header(part: GmailPart | undefined, name: string): string {
  return part?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || ''
}

function addresses(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean)
}

function decodeBase64Url(value: string | undefined): string {
  if (!value) return ''
  try {
    return Buffer.from(value, 'base64url').toString('utf8').slice(0, MAX_BODY_CHARS)
  } catch {
    return ''
  }
}

function gmailBody(part: GmailPart | undefined): string {
  if (!part) return ''
  if (part.mimeType?.toLowerCase() === 'text/plain' && part.body?.data) return decodeBase64Url(part.body.data)
  for (const child of part.parts || []) {
    const found = gmailBody(child)
    if (found) return found
  }
  if (part.body?.data) return decodeBase64Url(part.body.data)
  return ''
}

function normalizeGmail(message: GmailMessage, includeBody: boolean): NormalizedMailMessage {
  const received = header(message.payload, 'Date')
  const parsedDate = Date.parse(received)
  const fallback = Number(message.internalDate)
  const result: NormalizedMailMessage = {
    id: message.id || '',
    threadId: message.threadId,
    from: header(message.payload, 'From'),
    to: addresses(header(message.payload, 'To')),
    subject: header(message.payload, 'Subject'),
    receivedAt: Number.isFinite(parsedDate)
      ? new Date(parsedDate).toISOString()
      : Number.isFinite(fallback)
        ? new Date(fallback).toISOString()
        : '',
    unread: (message.labelIds || []).includes('UNREAD'),
  }
  if (includeBody) result.body = gmailBody(message.payload)
  return result
}

function normalizeGraph(message: GraphMessage, includeBody: boolean): NormalizedMailMessage {
  const result: NormalizedMailMessage = {
    id: message.id || '',
    threadId: message.conversationId,
    from: message.from?.emailAddress?.address || '',
    to: (message.toRecipients || []).map((recipient) => recipient.emailAddress?.address || '').filter(Boolean),
    subject: message.subject || '',
    receivedAt: message.receivedDateTime || '',
    unread: message.isRead === false,
  }
  if (includeBody) result.body = `${message.body?.content || ''}`.slice(0, MAX_BODY_CHARS)
  return result
}

async function mapConcurrent<T, R>(values: T[], limit: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length)
  let index = 0
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (index < values.length) {
      const current = index++
      results[current] = await mapper(values[current])
    }
  })
  await Promise.all(workers)
  return results
}

export class GmailMailProvider implements MailProviderAdapter {
  readonly provider = 'gmail' as const

  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  private async getMessage(id: string, includeBody: boolean): Promise<NormalizedMailMessage> {
    const query = new URLSearchParams({ format: includeBody ? 'full' : 'metadata' })
    if (!includeBody) {
      for (const name of ['From', 'To', 'Subject', 'Date']) query.append('metadataHeaders', name)
    }
    const message = await providerJson<GmailMessage>(
      this.fetchFn,
      `${GMAIL_BASE}/messages/${encodeURIComponent(id)}?${query}`,
      this.accessToken,
    )
    return normalizeGmail(message, includeBody)
  }

  async invoke(request: MailInvocation): Promise<NormalizedMailMessage[] | NormalizedMailMessage | MailDraft> {
    if (request.capability === 'mail.read.metadata' || request.capability === 'mail.read.body') {
      return this.getMessage(request.args.messageId || '', request.capability === 'mail.read.body')
    }
    if (request.capability === 'mail.draft.create') {
      const raw = [
        `To: ${(request.args.to || []).join(', ')}`,
        `Subject: ${request.args.subject || ''}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        request.args.body || '',
      ].join('\r\n')
      const created = await providerJson<{ id?: string }>(
        this.fetchFn,
        `${GMAIL_BASE}/drafts`,
        this.accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { raw: Buffer.from(raw, 'utf8').toString('base64url') } }),
        },
      )
      return {
        id: created.id || '',
        to: [...(request.args.to || [])],
        subject: request.args.subject || '',
        body: request.args.body || '',
      }
    }

    const query = new URLSearchParams({
      maxResults: `${request.args.limit || 20}`,
      includeSpamTrash: 'false',
    })
    if (request.capability === 'mail.search') query.set('q', request.args.query || '')
    const listed = await providerJson<{ messages?: Array<{ id?: string }> }>(
      this.fetchFn,
      `${GMAIL_BASE}/messages?${query}`,
      this.accessToken,
    )
    const ids = (listed.messages || []).map((message) => message.id || '').filter(Boolean)
    return mapConcurrent(ids, 5, (id) => this.getMessage(id, false))
  }
}

export class Microsoft365MailProvider implements MailProviderAdapter {
  readonly provider = 'microsoft365' as const

  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  private headers(includeBody = false): Record<string, string> {
    return includeBody ? { Prefer: 'outlook.body-content-type="text"' } : {}
  }

  async invoke(request: MailInvocation): Promise<NormalizedMailMessage[] | NormalizedMailMessage | MailDraft> {
    const select = 'id,conversationId,from,toRecipients,subject,receivedDateTime,isRead'
    if (request.capability === 'mail.read.metadata' || request.capability === 'mail.read.body') {
      const includeBody = request.capability === 'mail.read.body'
      const query = new URLSearchParams({ '$select': includeBody ? `${select},body` : select })
      const message = await providerJson<GraphMessage>(
        this.fetchFn,
        `${GRAPH_BASE}/messages/${encodeURIComponent(request.args.messageId || '')}?${query}`,
        this.accessToken,
        { headers: this.headers(includeBody) },
      )
      return normalizeGraph(message, includeBody)
    }
    if (request.capability === 'mail.draft.create') {
      const created = await providerJson<GraphMessage>(
        this.fetchFn,
        `${GRAPH_BASE}/messages`,
        this.accessToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.headers(true) },
          body: JSON.stringify({
            subject: request.args.subject || '',
            body: { contentType: 'Text', content: request.args.body || '' },
            toRecipients: (request.args.to || []).map((address) => ({ emailAddress: { address } })),
          }),
        },
      )
      return {
        id: created.id || '',
        to: [...(request.args.to || [])],
        subject: request.args.subject || '',
        body: request.args.body || '',
      }
    }

    const query = new URLSearchParams({
      '$top': `${request.args.limit || 20}`,
      '$select': select,
      '$orderby': 'receivedDateTime desc',
    })
    if (request.capability === 'mail.search') query.set('$search', `"${request.args.query || ''}"`)
    const path = request.capability === 'mail.list' ? '/mailFolders/inbox/messages' : '/messages'
    const listed = await providerJson<{ value?: GraphMessage[] }>(
      this.fetchFn,
      `${GRAPH_BASE}${path}?${query}`,
      this.accessToken,
    )
    return (listed.value || []).map((message) => normalizeGraph(message, false))
  }
}

export function createAuthenticatedMailProvider(
  provider: MailProviderId,
  accessToken: string,
  fetchFn: FetchLike = fetch,
): MailProviderAdapter {
  if (!accessToken) throw new Error('Mail provider access token is required')
  if (provider === 'gmail') return new GmailMailProvider(accessToken, fetchFn)
  if (provider === 'microsoft365') return new Microsoft365MailProvider(accessToken, fetchFn)
  throw new Error('Unsupported mail provider')
}

export const __test = {
  GMAIL_BASE,
  GRAPH_BASE,
  decodeBase64Url,
  gmailBody,
  normalizeGmail,
  normalizeGraph,
}
