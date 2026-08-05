import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  ACTIVITY_EXPORT_VERSION,
  getOpaqueActivityWorkspaceId,
  createActivityExportEvent,
  deliverActivityExportBatch,
  appendActivityExportEvent,
  appendActivityExportEventsForActiveConsents,
  flushActivityExportOutbox,
  receiveActivityExportBatch,
  getActivityExportConsent,
  listActivityExportOutbox,
  redactActivityText,
  saveActivityExportConsent,
  revokeActivityExportConsent,
  validateActivityExportBatch,
  type ActivityExportConsent,
} from './activity-export'

const consent: ActivityExportConsent = {
  receiptId: 'consent_demo',
  version: ACTIVITY_EXPORT_VERSION,
  destinationId: 'clawmax-ai',
  workspaceId: 'workspace_demo',
  userId: 'user_demo',
  scopes: ['agent-chat', 'workflow'],
  active: true,
  consentedAt: '2026-08-05T00:00:00.000Z',
}

const event = createActivityExportEvent({
  source: 'agent-chat',
  workspaceId: 'workspace_demo',
  userId: 'user_demo',
  content: 'token=sk-secret-value and Authorization: Bearer abc123',
}, consent)

assert(event, 'active matching consent should create an event')
assert.strictEqual(event?.version, ACTIVITY_EXPORT_VERSION)
assert.strictEqual(event?.workspaceId, getOpaqueActivityWorkspaceId('workspace_demo'))
assert(!event?.workspaceId.includes('/'), 'exported workspace id must not contain a filesystem path')
assert(event?.content?.includes('[REDACTED]'), 'event content must redact credentials')
assert(!event?.content?.includes('sk-secret-value'), 'raw API keys must not survive redaction')
assert.strictEqual(redactActivityText('Contact max@example.com or +1 (415) 555-0199'), 'Contact [REDACTED] or [REDACTED]')
assert.strictEqual(createActivityExportEvent({ source: 'agent-chat', workspaceId: 'workspace_demo', userId: 'user_demo', metadata: { email: 'max@example.com', safe: true } }, consent)?.metadata?.email, '[REDACTED]')
assert.strictEqual(createActivityExportEvent({ ...event!, source: 'builder' }, consent), null, 'unconsented scope must be rejected')
assert.strictEqual(createActivityExportEvent({ ...event!, userId: 'other-user' }, consent), null, 'another user cannot use this consent')
assert.strictEqual(createActivityExportEvent({ ...event!, workspaceId: 'other-workspace' }, consent), null, 'another workspace cannot use this consent')
assert.strictEqual(createActivityExportEvent({ ...event!, source: 'agent-chat' }, { ...consent, active: false }), null, 'revoked consent must stop capture')
assert.strictEqual(redactActivityText('-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----'), '[REDACTED]')
assert.deepStrictEqual(validateActivityExportBatch([event!]), { ok: true })
assert.strictEqual(validateActivityExportBatch([event!, { ...event!, eventId: event!.eventId }]).ok, false, 'duplicate events must be rejected')
assert.strictEqual(validateActivityExportBatch([]).ok, false, 'empty batches must be rejected')

const previousStatePath = process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
const statePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-activity-export-')), 'state.json')
process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = statePath
saveActivityExportConsent(consent)
assert.strictEqual(getActivityExportConsent('user_demo', 'workspace_demo')?.receiptId, 'consent_demo')
const persisted = appendActivityExportEvent({ source: 'workflow', workspaceId: 'workspace_demo', userId: 'user_demo', content: 'workflow output' }, consent)
assert(persisted, 'consented event should be persisted to the outbox')
assert.strictEqual(listActivityExportOutbox('user_demo', 'workspace_demo').length, 1)
assert.strictEqual(revokeActivityExportConsent('user_demo', 'workspace_demo'), true)
assert.strictEqual(getActivityExportConsent('user_demo', 'workspace_demo'), null)
assert.strictEqual(listActivityExportOutbox('user_demo', 'workspace_demo').length, 0, 'revoking consent purges unsent events')
if (previousStatePath === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
else process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = previousStatePath

;(async () => {
  process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = statePath
  let deliveredRequest: any = null
  const delivery = await deliverActivityExportBatch([event!], {
    endpoint: 'https://receiver.example/activity',
    token: 'demo-token',
    fetchImpl: async (_url, init) => { deliveredRequest = init; return new Response('{}', { status: 202 }) },
  })
  assert.strictEqual(delivery.delivered, true)
  assert.strictEqual(deliveredRequest.headers.Authorization, 'Bearer demo-token')
  assert.strictEqual(deliveredRequest.headers['X-ClawMax-Schema-Version'], ACTIVITY_EXPORT_VERSION)
  const deliveredBody = JSON.parse(deliveredRequest.body)
  assert(deliveredBody.batchId && deliveredBody.destinationId === 'clawmax-ai' && deliveredBody.sentAt && Array.isArray(deliveredBody.events), 'delivery must use the canonical batch envelope')
  assert.strictEqual((await deliverActivityExportBatch([event!], { fetchImpl: async () => new Response('{}', { status: 503 }) })).delivered, false)
  assert.deepStrictEqual(receiveActivityExportBatch([event!]), { accepted: 1, duplicates: 0 })
  assert.deepStrictEqual(receiveActivityExportBatch([event!]), { accepted: 0, duplicates: 1 })
  saveActivityExportConsent({ ...consent, active: true })
  const queuedEvent = appendActivityExportEvent({ source: 'workflow', workspaceId: 'workspace_demo', userId: 'user_demo', content: 'deliver me' }, consent)
  assert(queuedEvent)
  const flushed = await flushActivityExportOutbox({ endpoint: 'https://receiver.example/activity', token: 'demo-token', fetchImpl: async () => new Response('{}', { status: 202 }) })
  assert.deepStrictEqual(flushed, { attempted: 1, delivered: 1, remaining: 0 })
  const retryEvent = appendActivityExportEvent({ source: 'workflow', workspaceId: 'workspace_demo', userId: 'user_demo', content: 'retry me' }, consent)
  assert(retryEvent)
  const failedFlush = await flushActivityExportOutbox({ endpoint: 'https://receiver.example/activity', token: 'demo-token', fetchImpl: async () => new Response('{}', { status: 503 }) })
  assert.strictEqual(failedFlush.delivered, 0)
  assert.strictEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')).outbox[0].attempts, 1)
  revokeActivityExportConsent('user_demo', 'workspace_demo')
  saveActivityExportConsent({ ...consent, active: true })
  saveActivityExportConsent({ ...consent, receiptId: 'consent_digo', destinationId: 'digo', active: true })
  const fanout = appendActivityExportEventsForActiveConsents({ source: 'workflow', workspaceId: 'workspace_demo', userId: 'user_demo', content: 'fan out' })
  assert.strictEqual(fanout.length, 2)
  assert.strictEqual((await flushActivityExportOutbox({ destinationId: 'clawmax-ai', endpoint: 'https://receiver.example/activity', token: 'demo-token', fetchImpl: async () => new Response('{}', { status: 202 }) })).delivered, 1)
  assert.strictEqual((await flushActivityExportOutbox({ destinationId: 'digo', endpoint: 'https://digo.example/activity', token: 'digo-token', fetchImpl: async () => new Response('{}', { status: 202 }) })).delivered, 1)
  console.log('Activity export tests: 26 passed')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
