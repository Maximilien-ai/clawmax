import assert from 'assert'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { resetWorkspaceManagerForTests } from '../lib/workspace-manager'

const original = {
  home: process.env.HOME,
  workspace: process.env.OPENCLAW_WORKSPACE,
  testWorkspace: process.env.CLAWMAX_TEST_WORKSPACE,
  masterKey: process.env.CLAWMAX_SECRET_MASTER_KEY,
}
const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-mail-oauth-routes-'))
const workspace = path.join(tempHome, 'workspace')
fs.mkdirSync(path.join(workspace, 'SYSTEM'), { recursive: true })
fs.mkdirSync(path.join(tempHome, '.openclaw'), { recursive: true })
process.env.HOME = tempHome
process.env.OPENCLAW_WORKSPACE = workspace
process.env.CLAWMAX_TEST_WORKSPACE = workspace
process.env.CLAWMAX_SECRET_MASTER_KEY = 'mail-oauth-route-key-with-at-least-thirty-two-characters'
resetWorkspaceManagerForTests()

const oauth = require('../lib/mail-oauth') as typeof import('../lib/mail-oauth')
const gmail = oauth.createFakeMailOAuthProvider('gmail', {
  accountId: 'route-google-account',
  accountEmail: 'route@example.test',
})
const microsoft = oauth.createFakeMailOAuthProvider('microsoft365')
const router = require('./mail-oauth').createMailOAuthRouter({ gmail, microsoft365: microsoft })

let passed = 0
let failed = 0

function handler(method: string, routePath: string): Function {
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle
}

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    contentType: '',
    status(code: number) { this.statusCode = code; return this },
    json(body: any) { this.body = body; return this },
    type(value: string) { this.contentType = value; return this },
    send(body: any) { this.body = body; return this },
  }
}

async function invoke(method: string, routePath: string, req: any) {
  const res = response()
  await handler(method, routePath)(req, res)
  return res
}

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
  let state = ''

  await test('operator mail OAuth routes are mounted behind dashboard authentication', () => {
    const indexSource = fs.readFileSync(path.join(__dirname, '..', 'index.ts'), 'utf8')
    assert(indexSource.includes("app.use('/api/mail/oauth', protect, mailOAuthRouter)"))
  })

  await test('status exposes configured providers without credentials', async () => {
    const res = await invoke('get', '/status', { params: {}, query: {}, body: {}, headers: {}, cookies: {} })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.body.storageConfigured, true)
    assert(res.body.providers.every((provider: any) => provider.configured))
    assert(!JSON.stringify(res.body).includes('Token'))
  })

  await test('begin returns a PKCE authorization URL', async () => {
    const res = await invoke('post', '/:provider/begin', {
      params: { provider: 'gmail' },
      query: {},
      body: { scopes: ['mail.read.metadata'] },
      headers: {},
      cookies: {},
    })
    assert.strictEqual(res.statusCode, 200)
    const url = new URL(res.body.authorizationUrl)
    state = url.searchParams.get('state') || ''
    assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256')
    assert(state)
  })

  await test('callback exchanges a code without returning credentials', async () => {
    const res = await invoke('get', '/:provider/callback', {
      params: { provider: 'gmail' },
      query: { state, code: 'route-code-secret' },
      body: {},
      headers: {},
      cookies: {},
    })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.body.connection.accountEmail, 'route@example.test')
    assert(!JSON.stringify(res.body).includes('route-code-secret'))
    assert(!JSON.stringify(res.body).includes('accessToken'))
  })

  await test('status returns restart-persisted connection metadata', async () => {
    const freshRouter = require('./mail-oauth').createMailOAuthRouter({ gmail, microsoft365: microsoft })
    const layer = freshRouter.stack.find((entry: any) => entry.route?.path === '/status' && entry.route?.methods?.get)
    const res = response()
    await layer.route.stack[0].handle({ params: {}, query: {}, body: {}, headers: {}, cookies: {} }, res)
    assert.strictEqual(res.body.providers[0].connections[0].accountId, 'route-google-account')
  })

  await test('browser callback closes its popup without posting account or token data', async () => {
    const begin = await invoke('post', '/:provider/begin', {
      params: { provider: 'microsoft365' },
      query: {},
      body: { capabilities: ['mail.read.metadata'] },
      headers: {},
      cookies: {},
    })
    const popupState = new URL(begin.body.authorizationUrl).searchParams.get('state') || ''
    const res = await invoke('get', '/:provider/callback', {
      params: { provider: 'microsoft365' },
      query: { state: popupState, code: 'popup-code-secret' },
      body: {},
      headers: { accept: 'text/html' },
      cookies: {},
    })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.contentType, 'html')
    assert(`${res.body}`.includes('clawmax-mail-oauth-complete'))
    assert(`${res.body}`.includes('window.close()'))
    assert(!`${res.body}`.includes('popup-code-secret'))
    assert(!`${res.body}`.includes('tester@microsoft365.test'))
  })

  await test('callback blocks OAuth state replay', async () => {
    const res = await invoke('get', '/:provider/callback', {
      params: { provider: 'gmail' },
      query: { state, code: 'route-code-secret' },
      body: {},
      headers: {},
      cookies: {},
    })
    assert.strictEqual(res.statusCode, 403)
    assert(/already been used/.test(res.body.error))
  })

  await test('refresh route rotates a connected account without exposing tokens', async () => {
    const res = await invoke('post', '/:provider/connections/:accountId/refresh', {
      params: { provider: 'gmail', accountId: 'route-google-account' },
      query: {},
      body: {},
      headers: {},
      cookies: {},
    })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(gmail.refreshedTokens.length, 1)
    assert(!JSON.stringify(res.body).includes('refreshed-access-token'))
  })

  await test('unsupported provider is a client error', async () => {
    const res = await invoke('post', '/:provider/begin', {
      params: { provider: 'imap' }, query: {}, body: {}, headers: {}, cookies: {},
    })
    assert.strictEqual(res.statusCode, 400)
  })

  await test('raw provider scopes are rejected before authorization state is created', async () => {
    const res = await invoke('post', '/:provider/begin', {
      params: { provider: 'gmail' },
      query: {},
      body: { capabilities: ['https://mail.google.com/'] },
      headers: {},
      cookies: {},
    })
    assert.strictEqual(res.statusCode, 400)
    assert.match(res.body.error, /Unsupported mail capability/)
  })

  await test('disconnect revokes and removes a connection', async () => {
    const res = await invoke('delete', '/:provider/connections/:accountId', {
      params: { provider: 'gmail', accountId: 'route-google-account' },
      query: {},
      body: {},
      headers: {},
      cookies: {},
    })
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(gmail.revokedTokens.length, 1)
    assert.strictEqual(res.body.status.providers[0].connections.length, 0)
  })

  await test('disconnecting an unknown account returns not found', async () => {
    const res = await invoke('delete', '/:provider/connections/:accountId', {
      params: { provider: 'gmail', accountId: 'missing' },
      query: {},
      body: {},
      headers: {},
      cookies: {},
    })
    assert.strictEqual(res.statusCode, 404)
  })

  console.log(`\nTests passed: ${passed}`)
  console.log(`Tests failed: ${failed}`)
  if (failed > 0) process.exitCode = 1
}

run().finally(() => {
  if (original.home === undefined) delete process.env.HOME
  else process.env.HOME = original.home
  if (original.workspace === undefined) delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = original.workspace
  if (original.testWorkspace === undefined) delete process.env.CLAWMAX_TEST_WORKSPACE
  else process.env.CLAWMAX_TEST_WORKSPACE = original.testWorkspace
  if (original.masterKey === undefined) delete process.env.CLAWMAX_SECRET_MASTER_KEY
  else process.env.CLAWMAX_SECRET_MASTER_KEY = original.masterKey
  fs.rmSync(tempHome, { recursive: true, force: true })
})
