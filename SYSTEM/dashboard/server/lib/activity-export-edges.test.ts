import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  ACTIVITY_EXPORT_BATCH_LIMIT,
  ACTIVITY_EXPORT_EVENT_LIMIT,
  ACTIVITY_EXPORT_VERSION,
  appendActivityExportEvent,
  createActivityExportEvent,
  deliverActivityExportBatch,
  flushActivityExportOutbox,
  getActivityExportConsent,
  getOpaqueActivityWorkspaceId,
  listActivityExportConsents,
  listActivityExportOutbox,
  listAllActivityExportOutbox,
  listReceivedActivityExportEvents,
  receiveActivityExportBatch,
  redactActivityText,
  revokeActivityExportConsent,
  revokeActivityExportDestinationConsent,
  saveActivityExportConsent,
  setActivityExportQueueListener,
  validateActivityExportBatch,
  type ActivityExportConsent,
  type ActivityExportEvent,
} from './activity-export'

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  await fn()
  passed++
  console.log(`✓ ${name}`)
}

const originalStatePath = process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
const originalEndpoint = process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT
const originalToken = process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN
const originalDeploymentKind = process.env.DASHBOARD_DEPLOYMENT_KIND
const originalInstanceKey = process.env.CLAWMAX_INSTANCE_KEY
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-activity-export-edges-'))
const statePath = path.join(tempRoot, 'state.json')
process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = statePath

const consent = (overrides: Partial<ActivityExportConsent> = {}): ActivityExportConsent => ({
  receiptId: 'receipt-a',
  version: ACTIVITY_EXPORT_VERSION,
  destinationId: 'destination-a',
  workspaceId: 'workspace-a',
  userId: 'user-a',
  scopes: ['agent-chat', 'workflow'],
  active: true,
  consentedAt: '2026-08-28T00:00:00.000Z',
  ...overrides,
})

const event = (overrides: Partial<ActivityExportEvent> = {}): ActivityExportEvent => ({
  eventId: 'event-a',
  version: ACTIVITY_EXPORT_VERSION,
  destinationId: 'destination-a',
  consentReceiptId: 'receipt-a',
  source: 'agent-chat',
  occurredAt: '2026-08-28T00:00:00.000Z',
  workspaceId: getOpaqueActivityWorkspaceId('workspace-a'),
  userId: 'user-a',
  ...overrides,
})

function resetState(value?: unknown) {
  if (value === undefined) fs.rmSync(statePath, { force: true })
  else fs.writeFileSync(statePath, typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
}

void (async () => {
  await test('malformed and partial state files fail closed with normalized queue attempts', () => {
    resetState('{not json')
    assert.deepStrictEqual(listAllActivityExportOutbox(), [])
    resetState({ consents: null, outbox: [event()], received: null })
    assert.strictEqual((listAllActivityExportOutbox()[0] as any).attempts, 0)
  })

  await test('consent listing filters inactive and unrelated receipts', () => {
    resetState()
    saveActivityExportConsent(consent())
    saveActivityExportConsent(consent({ receiptId: 'inactive', active: false }))
    saveActivityExportConsent(consent({ receiptId: 'other-user', userId: 'user-b' }))
    assert.deepStrictEqual(listActivityExportConsents('user-a', 'workspace-a').map((item) => item.receiptId), ['receipt-a'])
    assert.strictEqual(getActivityExportConsent('missing', 'workspace-a'), null)
  })

  await test('destination revocation is scoped, purges queued events, and reports no-op revocations', () => {
    resetState()
    const first = consent()
    const second = consent({ receiptId: 'receipt-b', destinationId: 'destination-b' })
    saveActivityExportConsent(first)
    saveActivityExportConsent(second)
    assert(appendActivityExportEvent({ eventId: 'first', source: 'workflow', workspaceId: 'workspace-a', userId: 'user-a' }, first))
    assert(appendActivityExportEvent({ eventId: 'second', source: 'workflow', workspaceId: 'workspace-a', userId: 'user-a' }, second))
    assert.strictEqual(revokeActivityExportDestinationConsent('user-a', 'workspace-a', 'missing'), false)
    assert.strictEqual(revokeActivityExportDestinationConsent('user-a', 'workspace-a', 'destination-a'), true)
    assert.deepStrictEqual(listAllActivityExportOutbox().map((item) => item.eventId), ['second'])
    assert.strictEqual(revokeActivityExportConsent('missing', 'workspace-a'), false)
  })

  await test('queue listener wakes once and duplicate or invalid appends stay silent', () => {
    resetState()
    let wakeups = 0
    setActivityExportQueueListener(() => { wakeups++ })
    const active = consent()
    assert(appendActivityExportEvent({ eventId: 'dedupe', source: 'workflow', workspaceId: 'workspace-a', userId: 'user-a' }, active))
    assert.strictEqual(appendActivityExportEvent({ eventId: 'dedupe', source: 'workflow', workspaceId: 'workspace-a', userId: 'user-a' }, active), null)
    assert.strictEqual(appendActivityExportEvent({ eventId: 'invalid', source: 'builder', workspaceId: 'workspace-a', userId: 'user-a' }, active), null)
    assert.strictEqual(wakeups, 1)
    setActivityExportQueueListener(null)
  })

  await test('consent validation rejects every authorization boundary and invalid timestamps', () => {
    const input = { eventId: 'boundary', source: 'agent-chat' as const, workspaceId: 'workspace-a', userId: 'user-a' }
    assert.strictEqual(createActivityExportEvent(input, consent({ version: 'old' as any })), null)
    assert.strictEqual(createActivityExportEvent(input, consent({ destinationId: '' })), null)
    assert.strictEqual(createActivityExportEvent(input, consent({ receiptId: '' })), null)
    assert.strictEqual(createActivityExportEvent(input, consent({ scopes: ['workflow'] })), null)
    assert.strictEqual(createActivityExportEvent(input, consent({ expiresAt: '2020-01-01T00:00:00.000Z' })), null)
    assert.strictEqual(createActivityExportEvent({ ...input, occurredAt: 'not-a-date' }, consent()), null)
  })

  await test('event creation preserves supplied identity and adds only configured deployment metadata', () => {
    delete process.env.DASHBOARD_DEPLOYMENT_KIND
    delete process.env.CLAWMAX_INSTANCE_KEY
    const plain = createActivityExportEvent({ eventId: 'fixed', occurredAt: '2026-08-28T01:00:00.000Z', source: 'agent-chat', workspaceId: 'workspace-a', userId: 'user-a' }, consent())
    assert.strictEqual(plain?.eventId, 'fixed')
    assert.strictEqual(plain?.occurredAt, '2026-08-28T01:00:00.000Z')
    assert.deepStrictEqual(plain?.metadata, {})
    process.env.DASHBOARD_DEPLOYMENT_KIND = 'tenant'
    process.env.CLAWMAX_INSTANCE_KEY = 'instance-a'
    const deployed = createActivityExportEvent({ source: 'agent-chat', workspaceId: 'workspace-a', userId: 'user-a', metadata: { safe: true } }, consent())
    assert.deepStrictEqual(deployed?.metadata, { safe: true, deploymentKind: 'tenant', instanceKey: 'instance-a' })
  })

  await test('redaction handles absent text, credentials, and bounded transcripts', () => {
    assert.strictEqual(redactActivityText(undefined), undefined)
    assert.strictEqual(redactActivityText('password=hunter2 proxy-authorization: token'), '[REDACTED] [REDACTED]')
    const long = redactActivityText('x'.repeat(12001)) || ''
    assert(long.endsWith('… [TRUNCATED]'))
    assert.strictEqual(long.length, 12013)
  })

  await test('batch validation covers type, count, identity, and event-size limits', () => {
    assert.strictEqual(validateActivityExportBatch(null as any).ok, false)
    assert.strictEqual(validateActivityExportBatch(Array.from({ length: ACTIVITY_EXPORT_BATCH_LIMIT + 1 }, (_, index) => event({ eventId: `event-${index}` }))).ok, false)
    assert.strictEqual(validateActivityExportBatch([event({ version: 'old' as any })]).ok, false)
    assert.strictEqual(validateActivityExportBatch([event({ eventId: '' })]).ok, false)
    assert.strictEqual(validateActivityExportBatch([event({ destinationId: '' })]).ok, false)
    assert.strictEqual(validateActivityExportBatch([event({ consentReceiptId: '' })]).ok, false)
    assert.strictEqual(validateActivityExportBatch([event({ content: 'x'.repeat(ACTIVITY_EXPORT_EVENT_LIMIT) })]).ok, false)
  })

  await test('receiver rejects invalid batches and filters received events by owner and workspace', () => {
    resetState()
    assert.throws(() => receiveActivityExportBatch([]), /At least one activity event/)
    assert.deepStrictEqual(receiveActivityExportBatch([event(), event({ eventId: 'event-b', userId: 'user-b' })]), { accepted: 2, duplicates: 0 })
    assert.deepStrictEqual(listReceivedActivityExportEvents('user-a', 'workspace-a').map((item) => item.eventId), ['event-a'])
    assert.deepStrictEqual(listReceivedActivityExportEvents('user-a', 'workspace-b'), [])
  })

  await test('empty and filtered flushes do not call delivery', async () => {
    resetState()
    assert.deepStrictEqual(await flushActivityExportOutbox(), { attempted: 0, delivered: 0, remaining: 0 })
    const active = consent()
    assert(appendActivityExportEvent({ eventId: 'queued', source: 'workflow', workspaceId: 'workspace-a', userId: 'user-a' }, active))
    let calls = 0
    const result = await flushActivityExportOutbox({ userId: 'other', fetchImpl: async () => { calls++; return new Response('{}') } })
    assert.deepStrictEqual(result, { attempted: 0, delivered: 0, remaining: 1 })
    assert.strictEqual(calls, 0)
  })

  await test('flush honors workspace, destination, and maximum batch filters', async () => {
    resetState()
    const active = consent()
    for (const id of ['one', 'two', 'three']) {
      assert(appendActivityExportEvent({ eventId: id, source: 'workflow', workspaceId: 'workspace-a', userId: 'user-a' }, active))
    }
    const result = await flushActivityExportOutbox({ workspaceId: 'workspace-a', destinationId: 'destination-a', maxEvents: 2, endpoint: 'https://receiver.example', token: 'token', fetchImpl: async () => new Response('{}', { status: 202 }) })
    assert.deepStrictEqual(result, { attempted: 2, delivered: 2, remaining: 1 })
  })

  await test('failed flush retains noncandidate entries and records delivery errors', async () => {
    resetState()
    const active = consent()
    assert(appendActivityExportEvent({ eventId: 'failed', source: 'workflow', workspaceId: 'workspace-a', userId: 'user-a' }, active))
    assert(appendActivityExportEvent({ eventId: 'untouched', source: 'workflow', workspaceId: 'workspace-a', userId: 'user-a' }, active))
    const result = await flushActivityExportOutbox({ maxEvents: 1, endpoint: 'https://receiver.example', token: 'token', fetchImpl: async () => new Response('{}', { status: 429 }) })
    assert.strictEqual(result.attempted, 1)
    assert.strictEqual(result.delivered, 0)
    assert.match(result.error || '', /429/)
    const queued = listAllActivityExportOutbox() as any[]
    assert.strictEqual(queued.find((item) => item.eventId === 'failed')?.attempts, 1)
    assert.strictEqual(queued.find((item) => item.eventId === 'untouched')?.attempts, 0)
  })

  await test('delivery validates configuration, environment fallback, rejection, and thrown values', async () => {
    delete process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT
    delete process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN
    assert.match((await deliverActivityExportBatch([])).error || '', /At least one/)
    assert.match((await deliverActivityExportBatch([event()])).error || '', /not configured/)
    process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT = 'https://env-receiver.example'
    process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN = 'env-token'
    const accepted = await deliverActivityExportBatch([event()], { fetchImpl: async (url, init) => {
      assert.strictEqual(url, 'https://env-receiver.example')
      assert.strictEqual((init?.headers as any).Authorization, 'Bearer env-token')
      return new Response('{}', { status: 202 })
    } })
    assert.deepStrictEqual(accepted, { delivered: true, status: 202 })
    assert.deepStrictEqual(await deliverActivityExportBatch([event()], { fetchImpl: async () => { throw 'failure' } }), { delivered: false, error: 'Activity Export delivery failed.' })
    assert.deepStrictEqual(await deliverActivityExportBatch([event()], { fetchImpl: async () => { throw new Error('offline') } }), { delivered: false, error: 'offline' })
  })

  console.log(`activity-export-edges.test.ts: ok (${passed} tests)`)
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  setActivityExportQueueListener(null)
  fs.rmSync(tempRoot, { recursive: true, force: true })
  if (originalStatePath === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
  else process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = originalStatePath
  if (originalEndpoint === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT
  else process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT = originalEndpoint
  if (originalToken === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN
  else process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN = originalToken
  if (originalDeploymentKind === undefined) delete process.env.DASHBOARD_DEPLOYMENT_KIND
  else process.env.DASHBOARD_DEPLOYMENT_KIND = originalDeploymentKind
  if (originalInstanceKey === undefined) delete process.env.CLAWMAX_INSTANCE_KEY
  else process.env.CLAWMAX_INSTANCE_KEY = originalInstanceKey
})
