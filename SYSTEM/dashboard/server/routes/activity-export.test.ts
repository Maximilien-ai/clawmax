import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as auth from '../lib/github-auth'
import * as partner from '../lib/agentforge-activity-export'
import * as activity from '../lib/activity-export'
import { writeWorkspaceIntegrationConfig, writeWorkspaceIntegrationSecrets } from '../lib/workspace-integrations'
import router from './activity-export'

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentforge-route-'))
  const env = { workspace: process.env.CLAWMAX_TEST_WORKSPACE, state: process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH }
  const originalAuth = auth.getAuthenticatedSession
  const originalRegister = partner.registerAgentForgeConsent
  process.env.CLAWMAX_TEST_WORKSPACE = root
  process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = path.join(root, 'export.json')
  ;(auth as any).getAuthenticatedSession = () => ({ userId: 'user', login: 'user', name: null })
  const config = { apiUrl: 'https://synthetic.example', privacyUrl: 'https://synthetic.example/privacy', apiKey: 'synthetic-key' }
  try {
    writeWorkspaceIntegrationConfig({ partners: { agentforge: { apiUrl: config.apiUrl, privacyUrl: config.privacyUrl } } })
    writeWorkspaceIntegrationSecrets({ partners: { agentforge: { apiKey: config.apiKey } } })
    const receiverBinding = partner.agentForgeReceiverBinding(config)
    const enroll = () => activity.saveActivityExportEnrollment({ enrollmentId: 'enrollment', destinationId: 'agentforge', workspaceId: root,
      userId: 'user', externalUserId: 'usr', externalWorkspaceId: 'ws', status: 'active', connectedAt: new Date().toISOString(), receiverBinding })
    const layer = (router as any).stack.find((entry: any) => entry.route?.path === '/consent' && entry.route.methods.post)
    const handler = layer.route.stack[0].handle
    for (const revoke of ['all', 'destination', 'disconnect', 'none']) {
      enroll()
      let settle!: () => void
      ;(partner as any).registerAgentForgeConsent = async () => { await new Promise<void>(resolve => { settle = resolve }) }
      let status = 200
      const res = { status(code: number) { status = code; return this }, json(_body: unknown) { return this } }
      const pending = handler({ body: { destinationId: 'agentforge', scopes: ['agent-chat'] } }, res)
      if (revoke === 'all') activity.revokeActivityExportConsent('user', root)
      if (revoke === 'destination') activity.revokeActivityExportDestinationConsent('user', root, 'agentforge')
      if (revoke === 'disconnect') activity.revokeActivityExportEnrollment('user', root, 'agentforge')
      settle()
      await pending
      assert.equal(status, revoke === 'none' ? 201 : 409, revoke)
      assert.equal(activity.listActivityExportConsents('user', root).length, revoke === 'none' ? 1 : 0)
    }
    writeWorkspaceIntegrationConfig({ partners: { agentforge: { apiUrl: 'https://changed.example', privacyUrl: config.privacyUrl } } })
    writeWorkspaceIntegrationConfig({ partners: { agentforge: { apiUrl: config.apiUrl, privacyUrl: config.privacyUrl } } })
    assert.equal(activity.listActivityExportConsents('user', root).length, 0, 'restoring configuration cannot revive consent')
    assert.equal(activity.getActivityExportEnrollment('user', root, 'agentforge'), null)
    console.log('AgentForge consent race and configuration-revocation tests passed')
  } finally {
    ;(auth as any).getAuthenticatedSession = originalAuth
    ;(partner as any).registerAgentForgeConsent = originalRegister
    if (env.workspace === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
    else process.env.CLAWMAX_TEST_WORKSPACE = env.workspace
    if (env.state === undefined) delete process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH
    else process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH = env.state
    fs.rmSync(root, { recursive: true, force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
