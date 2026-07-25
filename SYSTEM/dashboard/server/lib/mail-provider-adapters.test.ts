import assert from 'assert'
import {
  GmailMailProvider,
  Microsoft365MailProvider,
} from './mail-provider-adapters'
import {
  invokeMailCapability,
  MailCapabilityGrant,
  MailInvocation,
} from './mail-capabilities'

interface FetchCall {
  url: string
  init: RequestInit
}

function fakeFetch(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: FetchCall[] = []
  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: `${input}`, init })
    const next = responses.shift()
    if (!next) throw new Error('Unexpected provider request')
    return new Response(JSON.stringify(next.body || {}), {
      status: next.status || 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return { calls, fetchFn: fetchFn as typeof fetch }
}

const context = {
  workspaceId: 'workspace-a',
  agentId: 'agent-a',
  pluginId: 'clawmax-mail',
  pluginFingerprint: 'sha256:trusted',
}

function grant(provider: 'gmail' | 'microsoft365'): MailCapabilityGrant {
  return {
    id: `grant-${provider}`,
    provider,
    accountId: `account-${provider}`,
    capabilities: ['mail.list', 'mail.search', 'mail.read.metadata', 'mail.read.body', 'mail.draft.create'],
    ...context,
  }
}

function request(
  provider: 'gmail' | 'microsoft365',
  capability: MailInvocation['capability'],
  args: MailInvocation['args'] = {},
): MailInvocation {
  return {
    provider,
    accountId: `account-${provider}`,
    capability,
    context,
    args,
  }
}

function gmailMessage(body?: string) {
  return {
    id: 'gmail-message-1',
    threadId: 'gmail-thread-1',
    internalDate: '1784980800000',
    labelIds: ['INBOX', 'UNREAD'],
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'From', value: 'sender@example.test' },
        { name: 'To', value: 'owner@example.test' },
        { name: 'Subject', value: 'Quarterly update' },
        { name: 'Date', value: 'Sat, 25 Jul 2026 12:00:00 +0000' },
      ],
      parts: body ? [{
        mimeType: 'text/plain',
        body: { data: Buffer.from(body).toString('base64url') },
      }] : [],
    },
  }
}

function graphMessage(body?: string) {
  return {
    id: 'graph-message-1',
    conversationId: 'graph-thread-1',
    from: { emailAddress: { address: 'sender@contoso.test' } },
    toRecipients: [{ emailAddress: { address: 'owner@contoso.test' } }],
    subject: 'Quarterly update',
    receivedDateTime: '2026-07-25T12:00:00Z',
    isRead: false,
    body: body === undefined ? undefined : { content: body },
  }
}

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (error: any) {
    console.error(`✗ ${name}: ${error.message}`)
    failed++
  }
}

async function run() {
  await test('Gmail list fetches bounded inbox IDs then metadata only', async () => {
    const http = fakeFetch([
      { body: { messages: [{ id: 'gmail-message-1' }] } },
      { body: gmailMessage('private body must not appear') },
    ])
    const result = await invokeMailCapability(
      grant('gmail'),
      new GmailMailProvider('gmail-token-sentinel', http.fetchFn),
      request('gmail', 'mail.list', { limit: 10 }),
    ) as any[]
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].subject, 'Quarterly update')
    assert(!('body' in result[0]))
    assert(new URL(http.calls[0].url).searchParams.get('maxResults') === '10')
    assert(new URL(http.calls[1].url).searchParams.get('format') === 'metadata')
    assert.strictEqual((http.calls[0].init.headers as any).Authorization, 'Bearer gmail-token-sentinel')
  })

  await test('Gmail search sends the bounded provider query', async () => {
    const http = fakeFetch([{ body: { messages: [] } }])
    await invokeMailCapability(
      grant('gmail'),
      new GmailMailProvider('token', http.fetchFn),
      request('gmail', 'mail.search', { query: 'from:billing@example.test', limit: 5 }),
    )
    const url = new URL(http.calls[0].url)
    assert.strictEqual(url.searchParams.get('q'), 'from:billing@example.test')
    assert.strictEqual(url.searchParams.get('maxResults'), '5')
  })

  await test('Gmail metadata and body use distinct formats', async () => {
    const metadataHttp = fakeFetch([{ body: gmailMessage('hidden') }])
    const metadata = await invokeMailCapability(
      grant('gmail'),
      new GmailMailProvider('token', metadataHttp.fetchFn),
      request('gmail', 'mail.read.metadata', { messageId: 'gmail-message-1' }),
    ) as any
    assert(!('body' in metadata))
    assert.strictEqual(new URL(metadataHttp.calls[0].url).searchParams.get('format'), 'metadata')

    const bodyHttp = fakeFetch([{ body: gmailMessage('expected body') }])
    const body = await invokeMailCapability(
      grant('gmail'),
      new GmailMailProvider('token', bodyHttp.fetchFn),
      request('gmail', 'mail.read.body', { messageId: 'gmail-message-1' }),
    ) as any
    assert.strictEqual(body.body, 'expected body')
    assert.strictEqual(new URL(bodyHttp.calls[0].url).searchParams.get('format'), 'full')
  })

  await test('Gmail creates an unsent RFC 2822 draft at the drafts endpoint', async () => {
    const http = fakeFetch([{ body: { id: 'gmail-draft-1' } }])
    const draft = await invokeMailCapability(
      grant('gmail'),
      new GmailMailProvider('token', http.fetchFn),
      request('gmail', 'mail.draft.create', {
        to: ['reviewer@example.test'],
        subject: 'Review',
        body: 'Please review.',
      }),
    ) as any
    assert.strictEqual(draft.id, 'gmail-draft-1')
    assert(http.calls[0].url.endsWith('/drafts'))
    assert.strictEqual(http.calls[0].init.method, 'POST')
    const payload = JSON.parse(`${http.calls[0].init.body}`)
    const raw = Buffer.from(payload.message.raw, 'base64url').toString('utf8')
    assert(raw.includes('To: reviewer@example.test'))
    assert(raw.includes('Subject: Review'))
    assert(!http.calls[0].url.includes('send'))
  })

  await test('Microsoft list uses Inbox, explicit fields, and no message body', async () => {
    const http = fakeFetch([{ body: { value: [graphMessage('private body')] } }])
    const result = await invokeMailCapability(
      grant('microsoft365'),
      new Microsoft365MailProvider('graph-token-sentinel', http.fetchFn),
      request('microsoft365', 'mail.list', { limit: 12 }),
    ) as any[]
    assert.strictEqual(result.length, 1)
    assert(!('body' in result[0]))
    const url = new URL(http.calls[0].url)
    assert(url.pathname.includes('/mailFolders/inbox/messages'))
    assert.strictEqual(url.searchParams.get('$top'), '12')
    assert(!url.searchParams.get('$select')?.includes('body'))
    assert.strictEqual((http.calls[0].init.headers as any).Authorization, 'Bearer graph-token-sentinel')
  })

  await test('Microsoft search encodes the query without altering the endpoint', async () => {
    const http = fakeFetch([{ body: { value: [] } }])
    await invokeMailCapability(
      grant('microsoft365'),
      new Microsoft365MailProvider('token', http.fetchFn),
      request('microsoft365', 'mail.search', { query: 'invoice" OR from:attacker', limit: 5 }),
    )
    const url = new URL(http.calls[0].url)
    assert.strictEqual(url.pathname, '/v1.0/me/messages')
    assert.strictEqual(url.searchParams.get('$search'), '"invoice" OR from:attacker"')
  })

  await test('Microsoft metadata omits body while body reads request text', async () => {
    const metadataHttp = fakeFetch([{ body: graphMessage('hidden') }])
    const metadata = await invokeMailCapability(
      grant('microsoft365'),
      new Microsoft365MailProvider('token', metadataHttp.fetchFn),
      request('microsoft365', 'mail.read.metadata', { messageId: 'graph-message-1' }),
    ) as any
    assert(!('body' in metadata))
    assert(!new URL(metadataHttp.calls[0].url).searchParams.get('$select')?.includes('body'))

    const bodyHttp = fakeFetch([{ body: graphMessage('expected graph body') }])
    const body = await invokeMailCapability(
      grant('microsoft365'),
      new Microsoft365MailProvider('token', bodyHttp.fetchFn),
      request('microsoft365', 'mail.read.body', { messageId: 'graph-message-1' }),
    ) as any
    assert.strictEqual(body.body, 'expected graph body')
    assert.strictEqual((bodyHttp.calls[0].init.headers as any).Prefer, 'outlook.body-content-type="text"')
  })

  await test('Microsoft creates a draft without calling sendMail', async () => {
    const http = fakeFetch([{ body: { id: 'graph-draft-1' } }])
    const draft = await invokeMailCapability(
      grant('microsoft365'),
      new Microsoft365MailProvider('token', http.fetchFn),
      request('microsoft365', 'mail.draft.create', {
        to: ['reviewer@contoso.test'],
        subject: 'Review',
        body: 'Please review.',
      }),
    ) as any
    assert.strictEqual(draft.id, 'graph-draft-1')
    assert(http.calls[0].url.endsWith('/me/messages'))
    assert(!http.calls[0].url.includes('sendMail'))
    const body = JSON.parse(`${http.calls[0].init.body}`)
    assert.strictEqual(body.body.contentType, 'Text')
    assert.strictEqual(body.toRecipients[0].emailAddress.address, 'reviewer@contoso.test')
  })

  await test('provider errors retain safe codes but redact response descriptions', async () => {
    const http = fakeFetch([{ status: 429, body: {
      error: { code: 'TooManyRequests', message: 'token sentinel-token was rejected' },
    } }])
    await assert.rejects(
      invokeMailCapability(
        grant('microsoft365'),
        new Microsoft365MailProvider('sentinel-token', http.fetchFn),
        request('microsoft365', 'mail.list'),
      ),
      (error: any) => {
        assert.match(error.message, /HTTP 429 \(TooManyRequests\)/)
        assert(!error.message.includes('sentinel-token'))
        return true
      },
    )
  })

  console.log(`\nTests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  if (failed > 0) process.exitCode = 1
}

run()
