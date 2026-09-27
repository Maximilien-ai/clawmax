import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ACTIVITY_EXPORT_VERSION, appendActivityExportEvent, flushActivityExportOutbox,
  revokeActivityExportDestinationConsent, saveActivityExportConsent,
  revokeActivityExportConsent, revokeActivityExportEnrollment,
  type ActivityExportConsent } from './activity-export'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-settlement-'))
  const previous = process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
  try {
    for (const status of [202, 503]) {
      const statePath = path.join(root, `${status}.json`)
      process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = statePath
      const receipt: ActivityExportConsent = { receiptId: 'revoked', version: ACTIVITY_EXPORT_VERSION,
        destinationId: 'synthetic', workspaceId: 'workspace', userId: 'user', scopes: ['agent-chat'],
        active: true, consentedAt: new Date().toISOString() }
      saveActivityExportConsent(receipt)
      appendActivityExportEvent({ source: 'agent-chat', workspaceId: 'workspace', userId: 'user', content: 'synthetic' }, receipt)
      let settle!: (response: Response) => void
      const pending = flushActivityExportOutbox({ endpoint: 'https://synthetic.example', token: 'synthetic',
        fetchImpl: (() => new Promise<Response>(resolve => { settle = resolve })) as typeof fetch })
      revokeActivityExportDestinationConsent('user', 'workspace', 'synthetic')
      const newer = { ...receipt, receiptId: 'new-user', userId: 'another-user' }
      saveActivityExportConsent(newer)
      const queued = appendActivityExportEvent({ source: 'agent-chat', workspaceId: 'workspace', userId: 'another-user', content: 'new synthetic' }, newer)!
      // Changing the caller's ambient state path must not redirect settlement.
      const otherPath = path.join(root, `other-${status}.json`)
      fs.writeFileSync(otherPath, '{"untouched":true}')
      process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = otherPath
      settle(new Response('{}', { status }))
      await pending
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      assert.equal(state.consents.revoked.active, false)
      assert.equal(state.consents['new-user'].active, true)
      assert.deepEqual(state.outbox.map((entry: any) => entry.eventId), [queued.eventId])
      assert.equal(state.outbox[0].attempts, 0)
      assert.equal(fs.readFileSync(otherPath, 'utf8'), '{"untouched":true}')
    }
    for (const mode of ['all', 'destination', 'disconnect']) {
      const statePath = path.join(root, `purge-${mode}.json`)
      process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = statePath
      const consent: ActivityExportConsent = { receiptId: 'one', version: ACTIVITY_EXPORT_VERSION,
        destinationId: 'agentforge', workspaceId: 'workspace', userId: 'user', scopes: ['agent-chat'],
        active: true, consentedAt: new Date().toISOString() }
      for (const receiptId of ['one', 'two']) saveActivityExportConsent({ ...consent, receiptId })
      saveActivityExportConsent({ ...consent, receiptId: 'other-user', userId: 'another-user' })
      const revoke = () => mode === 'all' ? revokeActivityExportConsent('user', 'workspace')
        : mode === 'disconnect' ? revokeActivityExportEnrollment('user', 'workspace', 'agentforge')
          : revokeActivityExportDestinationConsent('user', 'workspace', 'agentforge')
      revoke()
      revoke()
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      assert.equal(state.consents.one.active, false)
      assert.equal(state.consents.two.active, false)
      assert.equal(state.consents['other-user'].active, true)
      assert.deepEqual(state.purges.map((entry: any) => entry.receiptId).sort(), ['one', 'two'])
    }
    for (const change of ['expired', 'invalid-expiry', 'inactive', 'scope', 'workspace', 'user', 'destination', 'missing']) {
      const statePath = path.join(root, `authority-${change}.json`)
      process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = statePath
      const receipt: ActivityExportConsent = { receiptId: 'authority', version: ACTIVITY_EXPORT_VERSION,
        destinationId: 'synthetic', workspaceId: 'workspace', userId: 'user', scopes: ['agent-chat'],
        active: true, consentedAt: new Date().toISOString() }
      saveActivityExportConsent(receipt)
      appendActivityExportEvent({ source: 'agent-chat', workspaceId: 'workspace', userId: 'user', content: 'synthetic' }, receipt)
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      const changed = state.consents.authority
      if (change === 'expired') changed.expiresAt = '2000-01-01T00:00:00Z'
      if (change === 'invalid-expiry') changed.expiresAt = 'invalid'
      if (change === 'inactive') changed.active = false
      if (change === 'scope') changed.scopes = ['workflow']
      if (change === 'workspace') changed.workspaceId = 'another-workspace'
      if (change === 'user') changed.userId = 'another-user'
      if (change === 'destination') changed.destinationId = 'another-destination'
      if (change === 'missing') delete state.consents.authority
      fs.writeFileSync(statePath, JSON.stringify(state))
      const result = await flushActivityExportOutbox({ endpoint: 'https://synthetic.example', token: 'synthetic',
        fetchImpl: (async () => { assert.fail(`unauthorized delivery: ${change}`) }) as typeof fetch })
      assert.equal(result.attempted, 0, change)
      assert.equal(result.remaining, 1, 'held entries remain inspectable')
      if (change === 'expired' || change === 'invalid-expiry') {
        assert.equal(appendActivityExportEvent({ source: 'agent-chat', workspaceId: 'workspace', userId: 'user' }, changed), null)
      }
    }
    console.log('Activity export settlement, revocation, and delivery authority passed')
  } finally {
    if (previous === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
    else process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
