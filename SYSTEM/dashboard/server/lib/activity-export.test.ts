import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  ACTIVITY_EXPORT_VERSION,
  createActivityExportEvent,
  appendActivityExportEvent,
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
if (previousStatePath === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
else process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = previousStatePath

console.log('Activity export tests: 16 passed')
