import assert from 'assert'
import {
  beginMailOAuthConnection,
  disconnectMailOAuthConnection,
  isMailOAuthProvider,
  loadMailOAuthStatus,
  refreshMailOAuthConnection,
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

  console.log('mailOAuth.test.ts: 10 assertions passed')
}

run().finally(() => {
  globalThis.fetch = originalFetch
})
