import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  __test,
  beginMailOAuth,
  completeMailOAuth,
  createFakeMailOAuthProvider,
  createPkcePair,
  disconnectMailOAuth,
  getMailOAuthStatus,
  listMailOAuthConnections,
  MailOAuthProviderAdapter,
} from './mail-oauth'

const originalMasterKey = process.env.CLAWMAX_SECRET_MASTER_KEY
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-mail-oauth-'))
const workspace = path.join(tempRoot, 'mail-workspace')
fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
process.env.CLAWMAX_SECRET_MASTER_KEY = 'mail-oauth-test-key-with-at-least-thirty-two-characters'

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

function flowState(authorizationUrl: string): string {
  return new URL(authorizationUrl).searchParams.get('state') || ''
}

async function run() {
  const gmail = createFakeMailOAuthProvider('gmail', {
    accountId: 'google-123',
    accountEmail: 'owner@example.test',
  })
  const microsoft = createFakeMailOAuthProvider('microsoft365')
  const adapters = { gmail, microsoft365: microsoft }

  await test('creates an RFC 7636 S256 verifier and challenge', () => {
    const pair = createPkcePair()
    assert(pair.verifier.length >= 43 && pair.verifier.length <= 128)
    assert.strictEqual(pair.challenge, Buffer.from(
      require('crypto').createHash('sha256').update(pair.verifier).digest(),
    ).toString('base64url'))
    assert(!pair.challenge.includes('='))
  })

  let state = ''
  await test('begins a workspace and actor-bound Gmail authorization', () => {
    const result = beginMailOAuth({
      provider: 'gmail',
      actorId: 'owner@example.test',
      scopes: ['mail.read.metadata', 'mail.read.metadata', 'mail.draft.create'],
      adapter: gmail,
      workspacePath: workspace,
    })
    const url = new URL(result.authorizationUrl)
    state = flowState(result.authorizationUrl)
    assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256')
    assert(url.searchParams.get('code_challenge'))
    assert(state.length >= 40)
    assert.strictEqual(url.searchParams.get('scope'), 'mail.draft.create mail.read.metadata')
  })

  await test('stores neither raw state nor PKCE material in plaintext', () => {
    const raw = fs.readFileSync(__test.storePath(workspace), 'utf8')
    assert(!raw.includes(state))
    assert(!raw.includes('verifier'))
    assert(raw.includes('"ciphertext"'))
  })

  await test('rejects completion by a different authenticated actor', async () => {
    const result = beginMailOAuth({
      provider: 'gmail',
      actorId: 'owner@example.test',
      scopes: [],
      adapter: gmail,
      workspacePath: workspace,
    })
    await assert.rejects(
      completeMailOAuth({
        provider: 'gmail',
        actorId: 'other@example.test',
        state: flowState(result.authorizationUrl),
        code: 'actor-code',
        adapter: gmail,
        workspacePath: workspace,
      }),
      /actor mismatch/,
    )
  })

  await test('completes the fake Google exchange and returns metadata only', async () => {
    const connection = await completeMailOAuth({
      provider: 'gmail',
      actorId: 'owner@example.test',
      state,
      code: 'authorization-code-secret',
      adapter: gmail,
      workspacePath: workspace,
    })
    assert.strictEqual(connection.accountId, 'google-123')
    assert.strictEqual(connection.accountEmail, 'owner@example.test')
    assert.strictEqual(connection.status, 'connected')
    assert(!JSON.stringify(connection).includes('token'))
    assert(!JSON.stringify(connection).includes('authorization-code-secret'))
  })

  await test('rejects replay of a consumed OAuth state', async () => {
    await assert.rejects(
      completeMailOAuth({
        provider: 'gmail',
        actorId: 'owner@example.test',
        state,
        code: 'authorization-code-secret',
        adapter: gmail,
        workspacePath: workspace,
      }),
      /already been used/,
    )
  })

  await test('persists encrypted connections across store reloads', () => {
    const first = listMailOAuthConnections(workspace)
    const second = listMailOAuthConnections(workspace)
    assert.deepStrictEqual(second, first)
    assert.strictEqual(second[0].accountId, 'google-123')
  })

  await test('does not persist tokens, codes, or account passwords in plaintext', () => {
    const raw = fs.readFileSync(__test.storePath(workspace), 'utf8')
    assert(!raw.includes('gmail-access-token'))
    assert(!raw.includes('gmail-refresh-token'))
    assert(!raw.includes('authorization-code-secret'))
    assert(!raw.includes('password'))
  })

  await test('reports provider readiness separately from connection status', () => {
    const status = getMailOAuthStatus(adapters, workspace)
    assert.strictEqual(status.storageConfigured, true)
    assert.strictEqual(status.providers[0].configured, true)
    assert.strictEqual(status.providers[0].connections.length, 1)
    assert(!JSON.stringify(status).includes('accessToken'))
    assert(!JSON.stringify(status).includes('refreshToken'))
  })

  await test('expires a short-lived state before exchange', async () => {
    const now = Date.parse('2026-07-25T12:00:00.000Z')
    const result = beginMailOAuth({
      provider: 'microsoft365',
      actorId: 'owner@example.test',
      scopes: [],
      adapter: microsoft,
      workspacePath: workspace,
      now,
    })
    await assert.rejects(
      completeMailOAuth({
        provider: 'microsoft365',
        actorId: 'owner@example.test',
        state: flowState(result.authorizationUrl),
        code: 'late-code',
        adapter: microsoft,
        workspacePath: workspace,
        now: now + 11 * 60 * 1000,
      }),
      /expired/,
    )
  })

  await test('completes the same contract through the fake Microsoft provider', async () => {
    const result = beginMailOAuth({
      provider: 'microsoft365',
      actorId: 'owner@example.test',
      scopes: ['mail.read.metadata'],
      adapter: microsoft,
      workspacePath: workspace,
    })
    const connection = await completeMailOAuth({
      provider: 'microsoft365',
      actorId: 'owner@example.test',
      state: flowState(result.authorizationUrl),
      code: 'microsoft-code-secret',
      adapter: microsoft,
      workspacePath: workspace,
    })
    assert.strictEqual(connection.provider, 'microsoft365')
    assert.strictEqual(connection.accountId, 'microsoft365-account')
    assert(!JSON.stringify(connection).includes('microsoft-code-secret'))
  })

  await test('marks an expired connection without a refresh token for reconnection', async () => {
    const expiredAdapter: MailOAuthProviderAdapter = {
      ...createFakeMailOAuthProvider('microsoft365'),
      async exchangeCode() {
        return {
          accountId: 'expired-account',
          scopes: ['mail.read.metadata'],
          accessToken: 'expired-access-secret',
          expiresAt: '2026-01-01T00:00:00.000Z',
        }
      },
    }
    const result = beginMailOAuth({
      provider: 'microsoft365',
      actorId: 'owner@example.test',
      scopes: [],
      adapter: expiredAdapter,
      workspacePath: workspace,
    })
    await completeMailOAuth({
      provider: 'microsoft365',
      actorId: 'owner@example.test',
      state: flowState(result.authorizationUrl),
      code: 'expired-code',
      adapter: expiredAdapter,
      workspacePath: workspace,
    })
    const connection = listMailOAuthConnections(workspace, Date.parse('2026-07-25T12:00:00.000Z'))
      .find((entry) => entry.accountId === 'expired-account')
    assert.strictEqual(connection?.status, 'expired')
    assert.strictEqual(connection?.reconnectRequired, true)
  })

  await test('disconnect revokes provider credentials before deleting metadata', async () => {
    await disconnectMailOAuth({
      provider: 'gmail',
      accountId: 'google-123',
      actorId: 'owner@example.test',
      adapter: gmail,
      workspacePath: workspace,
    })
    assert.strictEqual(gmail.revokedTokens.length, 1)
    assert(!listMailOAuthConnections(workspace).some((entry) => entry.accountId === 'google-123'))
  })

  await test('writes metadata-only OAuth audit records', () => {
    const audit = fs.readFileSync(__test.auditPath(workspace), 'utf8')
    assert(audit.includes('mail.oauth.connected'))
    assert(audit.includes('mail.oauth.disconnected'))
    assert(!audit.includes('authorization-code-secret'))
    assert(!audit.includes('access-token'))
    assert(!audit.includes('refresh-token'))
    assert(!audit.includes('verifier'))
  })

  await test('fails closed when the operator master key is missing', () => {
    delete process.env.CLAWMAX_SECRET_MASTER_KEY
    assert.throws(() => listMailOAuthConnections(workspace), /CLAWMAX_SECRET_MASTER_KEY/)
    process.env.CLAWMAX_SECRET_MASTER_KEY = 'mail-oauth-test-key-with-at-least-thirty-two-characters'
  })

  console.log(`\nTests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  if (failed > 0) process.exitCode = 1
}

run().finally(() => {
  if (originalMasterKey === undefined) delete process.env.CLAWMAX_SECRET_MASTER_KEY
  else process.env.CLAWMAX_SECRET_MASTER_KEY = originalMasterKey
  fs.rmSync(tempRoot, { recursive: true, force: true })
})
