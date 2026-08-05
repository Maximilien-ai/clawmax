import assert from 'assert'
import {
  ACTIVITY_EXPORT_VERSION,
  createActivityExportEvent,
  redactActivityText,
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
assert(event?.content?.includes('[REDACTED]'), 'event content must redact credentials')
assert(!event?.content?.includes('sk-secret-value'), 'raw API keys must not survive redaction')
assert.strictEqual(createActivityExportEvent({ ...event!, source: 'builder' }, consent), null, 'unconsented scope must be rejected')
assert.strictEqual(createActivityExportEvent({ ...event!, userId: 'other-user' }, consent), null, 'another user cannot use this consent')
assert.strictEqual(createActivityExportEvent({ ...event!, workspaceId: 'other-workspace' }, consent), null, 'another workspace cannot use this consent')
assert.strictEqual(createActivityExportEvent({ ...event!, source: 'agent-chat' }, { ...consent, active: false }), null, 'revoked consent must stop capture')
assert.strictEqual(redactActivityText('-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----'), '[REDACTED]')
assert.deepStrictEqual(validateActivityExportBatch([event!]), { ok: true })
assert.strictEqual(validateActivityExportBatch([event!, { ...event!, eventId: event!.eventId }]).ok, false, 'duplicate events must be rejected')
assert.strictEqual(validateActivityExportBatch([]).ok, false, 'empty batches must be rejected')

console.log('Activity export tests: 10 passed')
