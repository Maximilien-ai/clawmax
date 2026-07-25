import assert from 'assert'
import fs from 'fs'
import path from 'path'
import {
  createProductionMailOAuthProviders,
  GoogleMailOAuthProvider,
  MicrosoftMailOAuthProvider,
} from './mail-oauth-providers'

interface FetchCall {
  url: string
  init: RequestInit
}

function fakeFetch(responses: Array<{ status?: number; body?: unknown }>) {
  const calls: FetchCall[] = []
  const fetchFn = async (input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: `${input}`, init })
    const next = responses.shift()
    if (!next) throw new Error('Unexpected fetch')
    const body = next.body === undefined ? '' : JSON.stringify(next.body)
    return new Response(body, {
      status: next.status || 200,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    })
  }
  return { calls, fetchFn: fetchFn as typeof fetch }
}

function form(call: FetchCall): URLSearchParams {
  return call.init.body as URLSearchParams
}

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (error: any) {
    console.error(`✗ ${name}: ${error.message}`)
    failed++
  }
}

async function run() {
  await test('deployment examples forward both provider credential sets', () => {
    const repoRoot = path.resolve(__dirname, '../../../..')
    const compose = fs.readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8')
    const envExample = fs.readFileSync(path.join(repoRoot, 'SYSTEM/dashboard/.env.example'), 'utf8')
    for (const key of [
      'GMAIL_OAUTH_CLIENT_ID',
      'GMAIL_OAUTH_CLIENT_SECRET',
      'GMAIL_OAUTH_REDIRECT_URI',
      'MICROSOFT365_OAUTH_CLIENT_ID',
      'MICROSOFT365_OAUTH_CLIENT_SECRET',
      'MICROSOFT365_OAUTH_REDIRECT_URI',
      'MICROSOFT365_OAUTH_TENANT',
    ]) {
      assert(compose.includes(`${key}:`), `docker-compose.yml must forward ${key}`)
      assert(envExample.includes(key), `.env.example must document ${key}`)
    }
  })

  await test('production provider readiness names every missing credential', () => {
    const providers = createProductionMailOAuthProviders({}, (async () => {
      throw new Error('network must not be used')
    }) as typeof fetch)
    assert.strictEqual(providers.gmail.configured, false)
    assert.match(providers.gmail.unavailableReason || '', /GMAIL_OAUTH_CLIENT_ID/)
    assert.strictEqual(providers.microsoft365.configured, false)
    assert.match(providers.microsoft365.unavailableReason || '', /MICROSOFT365_OAUTH_CLIENT_ID/)
  })

  await test('Google authorization uses PKCE, offline access, and metadata-only default scope', () => {
    const provider = new GoogleMailOAuthProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      redirectUri: 'https://clawmax.test/api/mail/oauth/gmail/callback',
    })
    const url = new URL(provider.getAuthorizationUrl({
      state: 'state-123',
      codeChallenge: 'challenge-123',
      scopes: [],
    }))
    assert.strictEqual(url.origin, 'https://accounts.google.com')
    assert.strictEqual(url.searchParams.get('access_type'), 'offline')
    assert.strictEqual(url.searchParams.get('include_granted_scopes'), 'true')
    assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256')
    assert.strictEqual(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.metadata')
  })

  await test('Google capability requests map to distinct restricted scopes', () => {
    const provider = new GoogleMailOAuthProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      redirectUri: 'https://clawmax.test/callback',
    })
    const url = new URL(provider.getAuthorizationUrl({
      state: 'state',
      codeChallenge: 'challenge',
      scopes: ['mail.read.body', 'mail.draft.create'],
    }))
    const scopes = (url.searchParams.get('scope') || '').split(' ')
    assert(scopes.includes('https://www.googleapis.com/auth/gmail.readonly'))
    assert(scopes.includes('https://www.googleapis.com/auth/gmail.compose'))
    assert(!scopes.includes('https://mail.google.com/'))
  })

  await test('authorization rejects caller-supplied provider scopes and unsafe redirects', () => {
    const provider = new GoogleMailOAuthProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      redirectUri: 'https://clawmax.test/callback',
    })
    assert.throws(() => provider.getAuthorizationUrl({
      state: 'state',
      codeChallenge: 'challenge',
      scopes: ['https://mail.google.com/'],
    }), /Unsupported mail capability/)
    const unsafe = new GoogleMailOAuthProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      redirectUri: 'http://attacker.test/callback',
    })
    assert.strictEqual(unsafe.configured, false)
  })

  await test('Google code exchange identifies the account without exposing its raw ID', async () => {
    const http = fakeFetch([
      { body: {
        access_token: 'google-access-sentinel',
        refresh_token: 'google-refresh-sentinel',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.readonly',
      } },
      { body: { emailAddress: 'Owner@Example.test' } },
    ])
    const provider = new GoogleMailOAuthProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      redirectUri: 'https://clawmax.test/callback',
    }, http.fetchFn)
    const tokens = await provider.exchangeCode({
      code: 'google-code-sentinel',
      codeVerifier: 'v'.repeat(64),
      redirectUri: 'https://clawmax.test/callback',
    })
    assert.strictEqual(http.calls[0].url, 'https://oauth2.googleapis.com/token')
    assert.strictEqual(form(http.calls[0]).get('code_verifier'), 'v'.repeat(64))
    assert.strictEqual(form(http.calls[0]).get('client_secret'), 'google-secret')
    assert.strictEqual(http.calls[1].url, 'https://gmail.googleapis.com/gmail/v1/users/me/profile')
    assert.strictEqual((http.calls[1].init.headers as any).Authorization, 'Bearer google-access-sentinel')
    assert.match(tokens.accountId, /^gmail:[a-f0-9]{24}$/)
    assert.strictEqual(tokens.accountEmail, 'Owner@Example.test')
    assert.strictEqual(tokens.refreshToken, 'google-refresh-sentinel')
  })

  await test('Google refresh tolerates omission of a replacement refresh token', async () => {
    const http = fakeFetch([{ body: { access_token: 'new-google-access', expires_in: 1800 } }])
    const provider = new GoogleMailOAuthProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      redirectUri: 'https://clawmax.test/callback',
    }, http.fetchFn)
    const refreshed = await provider.refresh({ refreshToken: 'old-google-refresh', scopes: [] })
    assert.strictEqual(form(http.calls[0]).get('grant_type'), 'refresh_token')
    assert.strictEqual(form(http.calls[0]).get('refresh_token'), 'old-google-refresh')
    assert.strictEqual(refreshed.accessToken, 'new-google-access')
    assert.strictEqual(refreshed.refreshToken, undefined)
  })

  await test('Google disconnect uses the refresh token at its revocation endpoint', async () => {
    const http = fakeFetch([{}])
    const provider = new GoogleMailOAuthProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      redirectUri: 'https://clawmax.test/callback',
    }, http.fetchFn)
    await provider.revoke({ accessToken: 'access-sentinel', refreshToken: 'refresh-sentinel' })
    assert.strictEqual(http.calls[0].url, 'https://oauth2.googleapis.com/revoke')
    assert.strictEqual(form(http.calls[0]).get('token'), 'refresh-sentinel')
  })

  await test('Microsoft authorization uses PKCE, offline access, and no send scope', () => {
    const provider = new MicrosoftMailOAuthProvider({
      clientId: 'microsoft-client',
      clientSecret: 'microsoft-secret',
      redirectUri: 'https://clawmax.test/api/mail/oauth/microsoft365/callback',
    })
    const url = new URL(provider.getAuthorizationUrl({
      state: 'state-456',
      codeChallenge: 'challenge-456',
      scopes: ['mail.read.body', 'mail.draft.create'],
    }))
    assert.strictEqual(url.pathname, '/common/oauth2/v2.0/authorize')
    assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256')
    const scopes = (url.searchParams.get('scope') || '').split(' ')
    assert(scopes.includes('Mail.Read'))
    assert(scopes.includes('Mail.ReadWrite'))
    assert(scopes.includes('User.Read'))
    assert(scopes.includes('offline_access'))
    assert(!scopes.includes('Mail.Send'))
  })

  await test('Microsoft rejects unsafe tenant interpolation', () => {
    assert.throws(() => new MicrosoftMailOAuthProvider({
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: 'https://clawmax.test/callback',
      tenant: '../common?bad=true',
    }), /Invalid Microsoft OAuth tenant/)
  })

  await test('Microsoft code exchange resolves the delegated Graph account', async () => {
    const http = fakeFetch([
      { body: {
        access_token: 'microsoft-access-sentinel',
        refresh_token: 'microsoft-refresh-sentinel',
        expires_in: 3600,
        scope: 'Mail.Read User.Read offline_access',
      } },
      { body: { id: 'entra-object-123', mail: null, userPrincipalName: 'owner@contoso.test' } },
    ])
    const provider = new MicrosoftMailOAuthProvider({
      clientId: 'microsoft-client',
      clientSecret: 'microsoft-secret',
      redirectUri: 'https://clawmax.test/callback',
      tenant: 'organizations',
    }, http.fetchFn)
    const tokens = await provider.exchangeCode({
      code: 'microsoft-code-sentinel',
      codeVerifier: 'm'.repeat(64),
      redirectUri: 'https://clawmax.test/callback',
    })
    assert.strictEqual(http.calls[0].url, 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token')
    assert.strictEqual(form(http.calls[0]).get('code'), 'microsoft-code-sentinel')
    assert.match(http.calls[1].url, /^https:\/\/graph\.microsoft\.com\/v1\.0\/me/)
    assert.match(tokens.accountId, /^microsoft365:[a-f0-9]{24}$/)
    assert.strictEqual(tokens.accountEmail, 'owner@contoso.test')
  })

  await test('Microsoft refresh retains delegated scopes and accepts token rotation', async () => {
    const http = fakeFetch([{ body: {
      access_token: 'rotated-ms-access',
      refresh_token: 'rotated-ms-refresh',
      scope: 'Mail.Read User.Read offline_access',
      expires_in: 3600,
    } }])
    const provider = new MicrosoftMailOAuthProvider({
      clientId: 'microsoft-client',
      clientSecret: 'microsoft-secret',
      redirectUri: 'https://clawmax.test/callback',
    }, http.fetchFn)
    const refreshed = await provider.refresh({
      refreshToken: 'old-ms-refresh',
      scopes: ['Mail.Read', 'User.Read', 'offline_access'],
    })
    assert.strictEqual(form(http.calls[0]).get('refresh_token'), 'old-ms-refresh')
    assert.strictEqual(form(http.calls[0]).get('scope'), 'Mail.Read User.Read offline_access')
    assert.strictEqual(refreshed.refreshToken, 'rotated-ms-refresh')
  })

  await test('provider failures expose safe status but redact upstream descriptions', async () => {
    const http = fakeFetch([{ status: 400, body: {
      error: 'invalid_grant',
      error_description: 'code google-code-sentinel and secret google-secret were rejected',
    } }])
    const provider = new GoogleMailOAuthProvider({
      clientId: 'google-client',
      clientSecret: 'google-secret',
      redirectUri: 'https://clawmax.test/callback',
    }, http.fetchFn)
    await assert.rejects(
      provider.exchangeCode({
        code: 'google-code-sentinel',
        codeVerifier: 'v'.repeat(64),
        redirectUri: 'https://clawmax.test/callback',
      }),
      (error: any) => {
        assert.match(error.message, /HTTP 400 \(invalid_grant\)/)
        assert(!error.message.includes('google-code-sentinel'))
        assert(!error.message.includes('google-secret'))
        return true
      },
    )
  })

  console.log(`\nTests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  if (failed > 0) process.exitCode = 1
}

run()
