import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { ACTIVITY_EXPORT_VERSION, appendActivityExportEvent, flushActivityExportOutbox,
  revokeActivityExportDestinationConsent, saveActivityExportConsent,
  type ActivityExportConsent } from './activity-export'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-settlement-'))
  const previous = process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
  try {
    for (const status of [202, 503]) {
      const statePath = path.join(root, `${status}.json`)
      process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = statePath
      const receipt: ActivityExportConsent = { receiptId: 'revoked', version: ACTIVITY_EXPORT_VERSION,
        destinationId: 'agentforge', workspaceId: 'workspace', userId: 'user', scopes: ['agent-chat'],
        active: true, consentedAt: new Date().toISOString() }
      saveActivityExportConsent(receipt)
      appendActivityExportEvent({ source: 'agent-chat', workspaceId: 'workspace', userId: 'user', content: 'synthetic' }, receipt)
      let settle!: (response: Response) => void
      const pending = flushActivityExportOutbox({ endpoint: 'https://synthetic.example', token: 'synthetic',
        fetchImpl: (() => new Promise<Response>(resolve => { settle = resolve })) as typeof fetch })
      revokeActivityExportDestinationConsent('user', 'workspace', 'agentforge')
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
    console.log('Activity export settlement: success/failure preserve revocation, concurrent enqueue, and state-path isolation')
  } finally {
    if (previous === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
    else process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = previous
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
