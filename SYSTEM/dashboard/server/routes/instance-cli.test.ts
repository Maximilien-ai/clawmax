import assert from 'assert'
import crypto from 'crypto'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import express from 'express'
import { resetWorkspaceManagerForTests } from '../lib/workspace-manager'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'
let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    passed++
  } catch (error: any) {
    console.log(`${RED}✗${RESET} ${name}: ${error.message}`)
    failed++
  }
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-instance-cli-'))
  process.env.HOME = root
  process.env.OPENCLAW_WORKSPACE = path.join(root, 'workspaces', 'default')
  process.env.CLAWMAX_WORKSPACES_ROOT = path.join(root, 'workspaces')
  process.env.CLAWMAX_CLI_API_STATE_PATH = path.join(root, 'state', 'cli-api.json')
  process.env.DASHBOARD_TOKEN = 'test-dashboard-token'
  process.env.DASHBOARD_PUBLIC_URL = 'https://mbp14.example.test'
  process.env.CLAWMAX_INSTANCE_KEY = 'inst_test'
  process.env.CLAWMAX_VERSION = '2.0.0-test-rc65'
  delete process.env.BYPASS_OAUTH
  resetWorkspaceManagerForTests()
  delete require.cache[require.resolve('./instance-cli')]
  const { createInstanceCliRouter, selectCliMembership } = require('./instance-cli')
  // dashboard-env intentionally loads the operator's ignored .env at module
  // initialization. Restore this test's isolated contract values afterward.
  process.env.HOME = root
  process.env.OPENCLAW_WORKSPACE = path.join(root, 'workspaces', 'default')
  process.env.CLAWMAX_WORKSPACES_ROOT = path.join(root, 'workspaces')
  process.env.CLAWMAX_CLI_API_STATE_PATH = path.join(root, 'state', 'cli-api.json')
  process.env.DASHBOARD_TOKEN = 'test-dashboard-token'
  process.env.DASHBOARD_PUBLIC_URL = 'https://mbp14.example.test'
  process.env.CLAWMAX_INSTANCE_KEY = 'inst_test'
  process.env.CLAWMAX_VERSION = '2.0.0-test-rc65'
  delete process.env.BYPASS_OAUTH
  delete process.env.DASHBOARD_AUTH_DISABLED
  process.env.DASHBOARD_AUTH_MODE = 'email_otp'

  const app = express()
  app.use(express.json())
  app.use('/api/cli/v1', createInstanceCliRouter())
  app.get('*', (_req, res) => res.type('html').send('<html>SPA</html>'))
  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('test server did not bind')
  const base = `http://127.0.0.1:${address.port}`
  const auth = { authorization: 'Bearer test-dashboard-token', 'x-clawmax-client': 'cli' }

  const request = async (route: string, options: RequestInit = {}) => {
    const response = await fetch(`${base}${route}`, options)
    const text = await response.text()
    return { response, text, json: text ? JSON.parse(text) : null }
  }

  await test('discovery is unauthenticated, strict, and publishes stable HTTPS auth endpoints', async () => {
    const result = await request('/api/cli/v1/discovery')
    assert.strictEqual(result.response.status, 200)
    assert.strictEqual(result.response.headers.get('content-type')?.startsWith('application/json'), true)
    assert.strictEqual(result.json.apiVersion, 'clawmax.instance/v1')
    assert.strictEqual(result.json.kind, 'InstanceDiscovery')
    assert.strictEqual(result.json.instance.id, 'inst_test')
    assert.strictEqual(result.json.instance.dashboardVersion, '2.0.0-test-rc65')
    assert.deepStrictEqual(result.json.auth.modes, ['authorization_code_pkce'])
    assert.strictEqual(result.json.auth.tokenEndpoint, 'https://mbp14.example.test/api/cli/v1/auth/token')

    delete process.env.DASHBOARD_PUBLIC_URL
    const derived = await request('/api/cli/v1/discovery', { headers: { 'x-forwarded-host': 'loopback.example.test' } })
    assert.strictEqual(derived.json.auth.issuer, 'https://loopback.example.test')
    process.env.DASHBOARD_PUBLIC_URL = 'https://mbp14.example.test'
  })

  await test('PKCE login issues a one-time access session and rotating refresh credential', async () => {
    process.env.BYPASS_OAUTH = 'true'
    const verifier = crypto.randomBytes(48).toString('base64url')
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: 'clawmax-cli',
      redirect_uri: 'http://127.0.0.1:49152/callback',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'test-state',
    })
    const authorize = await fetch(`${base}/api/cli/v1/auth/authorize?${query}`, { redirect: 'manual' })
    assert.strictEqual(authorize.status, 302)
    const callback = new URL(authorize.headers.get('location')!)
    assert.strictEqual(callback.searchParams.get('state'), 'test-state')
    const code = callback.searchParams.get('code')!
    delete process.env.BYPASS_OAUTH

    const token = await request('/api/cli/v1/auth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grantType: 'authorization_code', clientId: 'clawmax-cli', code,
        redirectUri: 'http://127.0.0.1:49152/callback', codeVerifier: verifier,
      }),
    })
    assert.strictEqual(token.response.status, 200)
    assert.strictEqual(token.json.kind, 'TokenSession')
    assert.strictEqual(token.json.instanceId, 'inst_test')
    const identity = await request('/api/cli/v1/identity', { headers: { authorization: `Bearer ${token.json.accessToken}` } })
    assert.strictEqual(identity.json.actorId, 'actor_local')

    const refreshed = await request('/api/cli/v1/auth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grantType: 'refresh_token', clientId: 'clawmax-cli', refreshToken: token.json.refreshToken }),
    })
    assert.strictEqual(refreshed.response.status, 200)
    assert.notStrictEqual(refreshed.json.refreshToken, token.json.refreshToken)
    const oldRefresh = await request('/api/cli/v1/auth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grantType: 'refresh_token', clientId: 'clawmax-cli', refreshToken: token.json.refreshToken }),
    })
    assert.strictEqual(oldRefresh.json.error.code, 'invalid_grant')

    const revoked = await fetch(`${base}/api/cli/v1/auth/revoke`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'clawmax-cli', token: refreshed.json.refreshToken, tokenTypeHint: 'refresh_token' }),
    })
    assert.strictEqual(revoked.status, 204)
    assert.strictEqual(await revoked.text(), '')
  })

  await test('PKCE endpoints reject malformed, replayed, and unsupported requests', async () => {
    const invalidAuthorize = await request('/api/cli/v1/auth/authorize?response_type=code')
    assert.strictEqual(invalidAuthorize.json.error.code, 'invalid_authorization_request')
    const malformedToken = await request('/api/cli/v1/auth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '[]',
    })
    assert.strictEqual(malformedToken.json.error.code, 'invalid_token_request')
    const malformedCode = await request('/api/cli/v1/auth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grantType: 'authorization_code' }),
    })
    assert.strictEqual(malformedCode.json.error.code, 'invalid_token_request')
    const invalidCode = await request('/api/cli/v1/auth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grantType: 'authorization_code', clientId: 'clawmax-cli', code: 'missing',
        redirectUri: 'http://127.0.0.1:49152/callback', codeVerifier: 'invalid',
      }),
    })
    assert.strictEqual(invalidCode.json.error.code, 'invalid_grant')
    const invalidRefresh = await request('/api/cli/v1/auth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grantType: 'refresh_token', clientId: 'wrong', refreshToken: 'missing' }),
    })
    assert.strictEqual(invalidRefresh.json.error.code, 'invalid_token_request')
    const unsupported = await request('/api/cli/v1/auth/token', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grantType: 'password' }),
    })
    assert.strictEqual(unsupported.json.error.code, 'unsupported_grant_type')
    const invalidRevoke = await request('/api/cli/v1/auth/revoke', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'secret' }),
    })
    assert.strictEqual(invalidRevoke.response.status, 400)
  })

  await test('identity rejects missing authentication with a versioned error', async () => {
    const result = await request('/api/cli/v1/identity', { headers: { 'x-request-id': 'request-from-cli' } })
    assert.strictEqual(result.response.status, 401)
    assert.strictEqual(result.json.kind, 'Error')
    assert.strictEqual(result.json.error.code, 'authentication_required')
    assert.strictEqual(result.json.requestId, 'request-from-cli')
    const wrongToken = await request('/api/cli/v1/identity', { headers: { authorization: 'Bearer wrong-token' } })
    assert.strictEqual(wrongToken.response.status, 401)
  })

  await test('identity derives actor and membership on the server', async () => {
    const result = await request('/api/cli/v1/identity', { headers: auth })
    assert.strictEqual(result.response.status, 200)
    assert.strictEqual(result.json.kind, 'Identity')
    assert.strictEqual(result.json.actorId, 'actor_local')
    assert.deepStrictEqual(result.json.memberships, [{ id: 'membership_local', tenantId: 'tenant_local', role: 'owner' }])
  })

  await test('workspace list returns only contract fields and never selects a workspace', async () => {
    const result = await request('/api/cli/v1/workspaces', { headers: auth })
    assert.strictEqual(result.response.status, 200)
    assert.strictEqual(result.json.kind, 'WorkspaceList')
    assert.strictEqual(result.json.items.length, 1)
    assert.deepStrictEqual(Object.keys(result.json.items[0]), ['id', 'name', 'tenantId', 'membershipId', 'role', 'scopes'])
  })

  const body = {
    apiVersion: 'clawmax.instance/v1',
    kind: 'WorkspaceCreateRequest',
    name: 'Operations',
    idempotencyKey: 'workspace-create-operations',
  }

  await test('workspace creation persists immutable authorization and audit evidence without selecting it', async () => {
    const result = await request('/api/cli/v1/workspaces', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': body.idempotencyKey },
      body: JSON.stringify(body),
    })
    assert.strictEqual(result.response.status, 201)
    assert.strictEqual(result.json.created, true)
    assert.strictEqual(result.json.workspace.id, 'operations')
    const registry = JSON.parse(fs.readFileSync(path.join(root, '.openclaw', 'dashboard-workspaces.json'), 'utf8'))
    assert.strictEqual(registry.activeWorkspaceId, 'default')
    const state = JSON.parse(fs.readFileSync(process.env.CLAWMAX_CLI_API_STATE_PATH!, 'utf8'))
    assert.strictEqual(state.createdWorkspaces[0].workspaceId, 'operations')
    assert.strictEqual(state.createdWorkspaces[0].actorId, 'actor_local')
    assert.match(state.createdWorkspaces[0].createdAt, /^\d{4}-\d{2}-\d{2}T/)
  })

  await test('exact idempotent replay returns the same immutable workspace with 200', async () => {
    const result = await request('/api/cli/v1/workspaces', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': body.idempotencyKey },
      body: JSON.stringify(body),
    })
    assert.strictEqual(result.response.status, 200)
    assert.strictEqual(result.json.created, false)
    assert.strictEqual(result.json.workspace.id, 'operations')
  })

  await test('idempotency, name, membership, and strict-body conflicts fail closed', async () => {
    const create = (payload: any, header = payload.idempotencyKey) => request('/api/cli/v1/workspaces', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': header },
      body: JSON.stringify(payload),
    })
    assert.strictEqual((await create({ ...body, name: 'Different' })).response.status, 409)
    assert.strictEqual((await create({ ...body, idempotencyKey: 'different-key' }, 'wrong-key')).json.error.code, 'idempotency_conflict')
    assert.strictEqual((await create({ ...body, idempotencyKey: 'new-key', membershipId: 'unknown' })).response.status, 403)
    assert.strictEqual((await create({ ...body, idempotencyKey: 'name-key' })).json.error.code, 'workspace_name_conflict')
    assert.strictEqual((await create({ ...body, idempotencyKey: 'strict-key', tenantId: 'attacker' })).response.status, 400)
  })

  await test('workspace creation rejects malformed versioned fields before writing state', async () => {
    const invalidBodies = [
      [],
      { ...body, apiVersion: 'clawmax.instance/v2', idempotencyKey: 'bad-version' },
      { ...body, kind: 'Workspace', idempotencyKey: 'bad-kind' },
      { ...body, name: ' Operations ', idempotencyKey: 'bad-trim' },
      { ...body, name: 'x'.repeat(129), idempotencyKey: 'bad-length' },
      { ...body, name: 'Operations\nInjected', idempotencyKey: 'bad-newline' },
      { ...body, idempotencyKey: 'not valid' },
      { ...body, membershipId: 'not valid', idempotencyKey: 'bad-membership' },
      { ...body, name: '---', idempotencyKey: 'bad-name' },
    ]

    for (const invalidBody of invalidBodies) {
      const result = await request('/api/cli/v1/workspaces', {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': 'invalid-request' },
        body: JSON.stringify(invalidBody),
      })
      assert.strictEqual(result.response.status, 400)
      assert.strictEqual(result.json.error.code, 'invalid_request')
    }
  })

  await test('ambiguous membership requires explicit selection', () => {
    const actor = {
      actorId: 'actor', email: 'actor@example.test', displayName: 'Actor',
      memberships: [
        { id: 'membership-a', tenantId: 'tenant-a', role: 'owner' },
        { id: 'membership-b', tenantId: 'tenant-b', role: 'member' },
      ],
    }
    assert.strictEqual(selectCliMembership(actor), 'ambiguous')
    assert.strictEqual(selectCliMembership(actor, 'membership-b')?.tenantId, 'tenant-b')
    assert.strictEqual(selectCliMembership(actor, 'missing'), null)
  })

  await test('agent listing is workspace contextual and does not mutate selection', async () => {
    const result = await request('/api/cli/v1/workspaces/operations/agents', { headers: auth })
    assert.strictEqual(result.response.status, 200)
    assert.strictEqual(result.json.kind, 'AgentList')
    assert.deepStrictEqual(result.json.items, [])
    const missing = await request('/api/cli/v1/workspaces/missing/agents', { headers: auth })
    assert.strictEqual(missing.response.status, 403)
  })

  await test('workflow listing is workspace contextual and strictly versioned', async () => {
    const result = await request('/api/cli/v1/workspaces/operations/workflows', { headers: auth })
    assert.strictEqual(result.response.status, 200)
    assert.strictEqual(result.json.apiVersion, 'clawmax.instance/v1')
    assert.strictEqual(result.json.kind, 'WorkflowList')
    assert.deepStrictEqual(result.json.items, [])
    const missing = await request('/api/cli/v1/workspaces/missing/workflows', { headers: auth })
    assert.strictEqual(missing.response.status, 403)
  })

  await test('unknown CLI paths return versioned JSON 404 and never SPA HTML', async () => {
    const result = await request('/api/cli/v1/not-a-route')
    assert.strictEqual(result.response.status, 404)
    assert.strictEqual(result.response.headers.get('content-type')?.startsWith('application/json'), true)
    assert.strictEqual(result.json.apiVersion, 'clawmax.instance/v1')
    assert.strictEqual(result.json.error.code, 'route_not_found')
    assert(!result.text.includes('<html>'))
  })

  await test('corrupt CLI authorization state fails closed with an actionable versioned error', async () => {
    const stateFile = process.env.CLAWMAX_CLI_API_STATE_PATH!
    const valid = fs.readFileSync(stateFile, 'utf8')
    fs.writeFileSync(stateFile, '{"version":999}', 'utf8')
    const result = await request('/api/cli/v1/workspaces', { headers: auth })
    assert.strictEqual(result.response.status, 503)
    assert.strictEqual(result.json.error.code, 'workspace_store_unavailable')
    assert.strictEqual(result.json.error.retryable, true)
    fs.writeFileSync(stateFile, valid, 'utf8')
  })

  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  fs.rmSync(root, { recursive: true, force: true })
  console.log(`\n${passed} tests passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
