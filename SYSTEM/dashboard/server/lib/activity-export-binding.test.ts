import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as integrations from './workspace-integrations'
import { agentForgeReceiverBinding, agentForgeActivityEndpoint } from './agentforge-activity-export'
import { ACTIVITY_EXPORT_VERSION, appendActivityExportEvent, flushActivityExportOutbox,
  listActivityExportConsents, saveActivityExportConsent, saveActivityExportEnrollment,
  getActivityExportEnrollment, revokeActivityExportConsent, listActivityExportPurges } from './activity-export'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-binding-'))
  const previousState = process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
  const previousWorkspace = process.env.CLAWMAX_TEST_WORKSPACE
  const originalConfig = integrations.getResolvedWorkspaceIntegrationConfig
  const originalSecrets = integrations.readWorkspaceIntegrationSecrets
  const initial = { apiUrl: 'https://receiver.example', apiKey: 'synthetic-secret', privacyUrl: 'https://receiver.example/privacy' }
  let config = { ...initial }
  ;(integrations as any).getResolvedWorkspaceIntegrationConfig = () => ({ partners: { agentforge: config } })
  ;(integrations as any).readWorkspaceIntegrationSecrets = () => ({ partners: { agentforge: { apiKey: config.apiKey } } })
  process.env.CLAWMAX_TEST_WORKSPACE = root
  process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = path.join(root, 'state.json')
  try {
    const receiverBinding = agentForgeReceiverBinding(initial)
    const consent: import('./activity-export').ActivityExportConsent = { receiptId: 'receipt', version: ACTIVITY_EXPORT_VERSION, destinationId: 'agentforge', workspaceId: root,
      userId: 'user', scopes: ['agent-chat' as const], active: true, consentedAt: new Date().toISOString(), receiverBinding }
    saveActivityExportConsent(consent)
    saveActivityExportEnrollment({ enrollmentId: 'enrollment', destinationId: 'agentforge', workspaceId: root, userId: 'user',
      externalUserId: 'opaque-user', externalWorkspaceId: 'opaque-workspace', status: 'active', connectedAt: new Date().toISOString(), receiverBinding })
    const input = { source: 'agent-chat' as const, workspaceId: root, userId: 'user', content: 'Synthetic email user@example.com' }
    assert(appendActivityExportEvent(input, consent))
    const forbiddenFetch = (async () => { assert.fail('must not contact changed receiver') }) as typeof fetch
    for (const key of ['apiUrl', 'apiKey', 'privacyUrl'] as const) {
      config = { ...initial, [key]: key === 'apiKey' ? 'changed-secret' : 'https://different.example' }
      assert.deepEqual(listActivityExportConsents('user', root), [])
      assert.equal(getActivityExportEnrollment('user', root, 'agentforge'), null)
      assert.equal(appendActivityExportEvent(input, consent), null)
      assert.equal((await flushActivityExportOutbox({ endpoint: agentForgeActivityEndpoint(config)!, token: config.apiKey, fetchImpl: forbiddenFetch })).attempted, 0)
    }
    config = { ...initial }
    assert.equal(appendActivityExportEvent(input, { ...consent, receiverBinding: undefined }), null, 'legacy receipts require fresh consent')
    process.env.CLAWMAX_TEST_WORKSPACE = path.join(root, 'other')
    assert.equal(appendActivityExportEvent(input, consent), null, 'another workspace cannot borrow configuration')
    process.env.CLAWMAX_TEST_WORKSPACE = root
    assert.equal((await flushActivityExportOutbox({ endpoint: 'https://wrong.example', token: initial.apiKey, fetchImpl: forbiddenFetch })).attempted, 0)
    const sent = await flushActivityExportOutbox({ endpoint: agentForgeActivityEndpoint(initial)!, token: initial.apiKey,
      fetchImpl: (async (_url, init) => {
        assert(!String(init?.body).includes('user@example.com'))
        return new Response('{}', { status: 202 })
      }) as typeof fetch })
    assert.equal(sent.delivered, 1)
    revokeActivityExportConsent('user', root)
    assert.equal(listActivityExportPurges('agentforge')[0].receiverBinding, receiverBinding)
    assert.equal(listActivityExportPurges('agentforge')[0].workspaceId, root)
    assert(!fs.readFileSync(process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH!, 'utf8').includes(initial.apiKey))
    console.log('Activity export receiver-binding tests passed')
  } finally {
    ;(integrations as any).getResolvedWorkspaceIntegrationConfig = originalConfig
    ;(integrations as any).readWorkspaceIntegrationSecrets = originalSecrets
    if (previousState === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
    else process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = previousState
    if (previousWorkspace === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
    else process.env.CLAWMAX_TEST_WORKSPACE = previousWorkspace
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
