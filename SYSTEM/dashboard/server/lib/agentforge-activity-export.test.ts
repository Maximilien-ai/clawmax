import assert from 'assert'
import {
  AGENTFORGE_CONSENT_VERSION,
  AGENTFORGE_DESTINATION_ID,
  AGENTFORGE_SUPPORTED_SCOPES,
  agentForgeActivityEndpoint,
  exchangeAgentForgeEnrollment,
  registerAgentForgeConsent,
  revokeAgentForgeConsent,
  type AgentForgeRuntimeConfig,
} from './agentforge-activity-export'

const config: AgentForgeRuntimeConfig = {
  apiUrl: 'https://agentforge.example',
  apiKey: 'partner-secret',
  privacyUrl: 'https://agentforge.example/privacy',
}

const requests: Array<{ url: string; init?: RequestInit }> = []
const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
  requests.push({ url: String(url), init })
  const body = JSON.parse(String(init?.body || '{}'))
  if (String(url).endsWith('/enrollments/exchange')) return new Response(JSON.stringify({ enrollmentId: 'enrollment_1', status: 'active' }), { status: 201 })
  if (init?.method === 'DELETE') return new Response(JSON.stringify({ receiptId: body.receiptId, status: 'revoked', purgeStatus: 'pending' }), { status: 202 })
  return new Response(JSON.stringify({ receiptId: body.receiptId, status: 'active', scopes: body.scopes }), { status: 201 })
}

void (async () => {
  assert.strictEqual(AGENTFORGE_DESTINATION_ID, 'agentforge')
  assert.deepStrictEqual(AGENTFORGE_SUPPORTED_SCOPES, ['agent-chat', 'workflow', 'builder'])
  assert.strictEqual(agentForgeActivityEndpoint(config), 'https://agentforge.example/api/v1/clawmax/activity-events')

  const enrollment = await exchangeAgentForgeEnrollment({ connectionCode: 'CODE123', workspaceId: 'ws_opaque', userId: 'usr_opaque' }, { config, fetchImpl: fetchImpl as typeof fetch })
  assert.strictEqual(enrollment.enrollmentId, 'enrollment_1')
  const exchangeRequest = requests[0]
  assert.strictEqual(exchangeRequest.url, 'https://agentforge.example/api/v1/clawmax/enrollments/exchange')
  assert.strictEqual((exchangeRequest.init?.headers as Record<string, string>).Authorization, 'Bearer partner-secret')
  assert.strictEqual(JSON.parse(String(exchangeRequest.init?.body)).destinationId, AGENTFORGE_DESTINATION_ID)

  const consent = await registerAgentForgeConsent({ receiptId: 'consent_1', enrollmentId: enrollment.enrollmentId, workspaceId: 'ws_opaque', userId: 'usr_opaque', scopes: ['agent-chat'], consentedAt: '2026-09-04T12:00:00.000Z', expiresAt: '2026-10-04T12:00:00.000Z' }, { config, fetchImpl: fetchImpl as typeof fetch })
  assert.strictEqual(consent.status, 'active')
  const consentRequest = requests[1]
  assert.strictEqual((consentRequest.init?.headers as Record<string, string>)['Idempotency-Key'], 'consent_1')
  assert.strictEqual(JSON.parse(String(consentRequest.init?.body)).consentVersion, AGENTFORGE_CONSENT_VERSION)

  const revoked = await revokeAgentForgeConsent('consent_1', { config, fetchImpl: fetchImpl as typeof fetch })
  assert.strictEqual(revoked.purgeStatus, 'pending')
  assert.strictEqual((requests[2].init?.headers as Record<string, string>)['Idempotency-Key'], 'consent_1:revoke')

  await assert.rejects(() => exchangeAgentForgeEnrollment({ connectionCode: 'BAD', workspaceId: 'ws', userId: 'usr' }, {
    config,
    fetchImpl: (async () => new Response(JSON.stringify({ error: 'Connection code is invalid.' }), { status: 404 })) as typeof fetch,
  }), /Connection code is invalid/)
  console.log('agentforge-activity-export.test.ts: ok (14 assertions)')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
