import assert from 'assert'
import {
  beginMailOAuthConnection,
  createMailGrant,
  disconnectMailOAuthConnection,
  isMailOAuthProvider,
  loadMailGrantStatus,
  loadMailOAuthStatus,
  refreshMailOAuthConnection,
  revokeMailGrant,
} from './mailOAuth'

const originalFetch = globalThis.fetch
const calls: Array<{ url: string; init?: RequestInit }> = []

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: `${input}`, init })
  if (`${input}`.endsWith('/status')) {
    return new Response(JSON.stringify({ storageConfigured: true, providers: [] }), { status: 200 })
  }
  if (`${input}`.endsWith('/begin')) {
    return new Response(JSON.stringify({ authorizationUrl: 'https://oauth.test/authorize' }), { status: 200 })
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}) as typeof fetch

async function run() {
  assert(isMailOAuthProvider('gmail'))
  assert(isMailOAuthProvider('microsoft365'))
  assert(!isMailOAuthProvider('imap'))

  const status = await loadMailOAuthStatus()
  assert.strictEqual(status.storageConfigured, true)

  const url = await beginMailOAuthConnection('gmail', ['mail.read.metadata'])
  assert.strictEqual(url, 'https://oauth.test/authorize')
  assert.deepStrictEqual(JSON.parse(`${calls[1].init?.body}`), { capabilities: ['mail.read.metadata'] })

  await refreshMailOAuthConnection('gmail', 'gmail:account/with spaces')
  assert(calls[2].url.includes('gmail%3Aaccount%2Fwith%20spaces/refresh'))
  assert.strictEqual(calls[2].init?.method, 'POST')

  await disconnectMailOAuthConnection('microsoft365', 'ms:account')
  assert(calls[3].url.includes('ms%3Aaccount'))
  assert.strictEqual(calls[3].init?.method, 'DELETE')

  await loadMailGrantStatus()
  assert.strictEqual(calls[4].url, '/api/mail/oauth/grants')

  await createMailGrant({
    agentId: 'mail-agent', provider: 'gmail', accountId: 'gmail-account', capabilities: ['mail.list'],
  })
  assert.strictEqual(calls[5].url, '/api/mail/oauth/grants')
  assert.strictEqual(calls[5].init?.method, 'POST')
  assert.deepStrictEqual(JSON.parse(`${calls[5].init?.body}`), {
    agentId: 'mail-agent', provider: 'gmail', accountId: 'gmail-account', capabilities: ['mail.list'],
  })

  await revokeMailGrant('grant/id with spaces')
  assert(calls[6].url.endsWith('/grant%2Fid%20with%20spaces'))
  assert.strictEqual(calls[6].init?.method, 'DELETE')

  console.log('mailOAuth.test.ts: 16 assertions passed')
}

run().finally(() => {
  globalThis.fetch = originalFetch
})
