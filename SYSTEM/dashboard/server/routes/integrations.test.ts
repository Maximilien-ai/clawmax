/**
 * Integrations routes test suite
 *
 * Run with: npx ts-node --transpileOnly server/routes/integrations.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import assert from 'assert'
import { getWorkspaceResendSenderPolicy, resolveResendTestRecipient } from '../lib/resend-partner'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const originalHome = process.env.HOME
const originalWorkspace = process.env.OPENCLAW_WORKSPACE
const originalDeploymentKind = process.env.DASHBOARD_DEPLOYMENT_KIND
const originalEnableOllama = process.env.DASHBOARD_ENABLE_OLLAMA
const originalVisiblePartners = process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES
const originalResendApiKey = process.env.RESEND_API_KEY
const originalResendDefaultFrom = process.env.RESEND_DEFAULT_FROM
const originalResendDefaultFromName = process.env.RESEND_DEFAULT_FROM_NAME
const originalOtpFromEmail = process.env.OTP_FROM_EMAIL
const originalSignupFromEmail = process.env.SIGNUP_FROM_EMAIL
const originalFetch = (globalThis as any).fetch

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`${GREEN}✓${RESET} ${name}`)
      testsPassed++
    })
    .catch((err: any) => {
      console.log(`${RED}✗${RESET} ${name}`)
      console.error(`  Error: ${err.message}`)
      testsFailed++
    })
}

function ensureWorkspaceScaffold(workspacePath: string) {
  fs.mkdirSync(path.join(workspacePath, 'SYSTEM'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'AGENTS'), { recursive: true })
  fs.mkdirSync(path.join(workspacePath, 'ORG'), { recursive: true })
}

function writeWorkspaceRegistry(tmpHome: string, workspacePath: string) {
  const registryPath = path.join(tmpHome, '.openclaw', 'dashboard-workspaces.json')
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, JSON.stringify({
    version: '1.0.0',
    activeWorkspaceId: 'integrations-workspace',
    workspaces: [{
      id: 'integrations-workspace',
      name: 'Integrations Workspace',
      path: workspacePath,
      createdAt: '2026-06-01T00:00:00.000Z',
      lastAccessedAt: '2026-06-01T00:00:00.000Z',
      color: '#3B82F6',
      tags: [],
    }],
  }, null, 2))
}

function getRouteHandler(method: 'get' | 'put' | 'post', routePath: string) {
  delete require.cache[require.resolve('./integrations')]
  const router = require('./integrations').default
  const layer = router.stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    cookies: {},
    on() {},
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value
    },
  }
}

async function run() {
  console.log(`\n${YELLOW}=== Integrations Routes Test Suite ===${RESET}\n`)

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-integrations-routes-home-'))
  const workspacePath = path.join(tmpHome, 'workspaces', 'integrations-workspace')
  ensureWorkspaceScaffold(workspacePath)
  writeWorkspaceRegistry(tmpHome, workspacePath)
  fs.mkdirSync(path.join(tmpHome, '.openclaw'), { recursive: true })

  process.env.HOME = tmpHome
  process.env.OPENCLAW_WORKSPACE = workspacePath

  await test('status omits ollama provider on cloud runtimes', async () => {
    process.env.DASHBOARD_DEPLOYMENT_KIND = 'cloud'
    delete process.env.DASHBOARD_ENABLE_OLLAMA

    const handler = getRouteHandler('get', '/status')
    process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'github,senso,opik,resend'
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected status route success')
    assert(Array.isArray(res.jsonBody?.providers), 'Expected providers array')
    assert(!res.jsonBody.providers.includes('ollama'), 'Expected ollama to be hidden for cloud runtimes')
    assert(Array.isArray(res.jsonBody?.visiblePartners) && res.jsonBody.visiblePartners.includes('resend'), 'Expected resend partner visibility')
  })

  await test('config round-trip persists workspace defaults and secret presence', async () => {
    process.env.DASHBOARD_DEPLOYMENT_KIND = 'local'
    process.env.DASHBOARD_ENABLE_OLLAMA = 'true'

    const putHandler = getRouteHandler('put', '/config')
    process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'github,senso,opik,resend'
    const putRes = makeRes()
    await putHandler(makeReq({
      body: {
        preferredModel: 'openai/gpt-5',
        systemPreferredModel: 'openai/gpt-5',
        githubDefaultRepo: 'owner/repo',
        ollamaBaseUrl: 'http://localhost:11434',
        ollamaDefaultModel: 'llama3.2',
        enabledPartners: ['github', 'github'],
        partners: {
          github: {
            repoLabelsEnabled: true,
          },
        },
        partnerSecrets: {
          github: {
            token: 'ghp_test_123',
          },
          resend: {
            apiKey: 're_test_123',
          },
        },
      },
    }), putRes)

    assert.strictEqual(putRes.statusCode, 200, 'Expected config update success')
    assert.strictEqual(putRes.jsonBody?.config?.preferredModel, 'openai/gpt-5', 'Expected preferred model persistence')
    assert.deepStrictEqual(putRes.jsonBody?.config?.enabledPartners, ['github'], 'Expected enabled partners deduped')
    assert.strictEqual(putRes.jsonBody?.secretPresence?.github?.token, true, 'Expected GitHub token presence to be reported')
    assert.strictEqual(putRes.jsonBody?.secretPresence?.resend?.apiKey, true, 'Expected Resend API key presence to be reported')
    assert.strictEqual(putRes.jsonBody?.secretSummaries?.resend?.apiKey?.preview, 're_t••••_123', 'Expected masked Resend secret preview to be reported')

    const getHandler = getRouteHandler('get', '/config')
    const getRes = makeRes()
    await getHandler(makeReq(), getRes)

    assert.strictEqual(getRes.statusCode, 200, 'Expected config fetch success')
    assert.strictEqual(getRes.jsonBody?.config?.githubDefaultRepo, 'owner/repo', 'Expected github repo persistence')
    assert.strictEqual(getRes.jsonBody?.config?.ollamaDefaultModel, 'llama3.2', 'Expected ollama defaults persistence')
    assert.strictEqual(getRes.jsonBody?.secretPresence?.github?.token, true, 'Expected GitHub token secret presence after reload')
    assert.strictEqual(getRes.jsonBody?.secretPresence?.resend?.apiKey, true, 'Expected Resend API key presence after reload')
    assert.strictEqual(getRes.jsonBody?.secretSummaries?.resend?.apiKey?.preview, 're_t••••_123', 'Expected masked Resend secret preview after reload')
  })

  await test('config update preserves existing github token when a later save sends a blank token', async () => {
    const putHandler = getRouteHandler('put', '/config')
    process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = 'github,senso,opik,resend'
    const putRes = makeRes()
    await putHandler(makeReq({
      body: {
        partnerSecrets: {
          github: {
            token: '   ',
          },
        },
      },
    }), putRes)

    assert.strictEqual(putRes.statusCode, 200, 'Expected config update success')
    assert.strictEqual(putRes.jsonBody?.secretPresence?.github?.token, true, 'Expected existing token presence to be preserved')

    const secretsPath = path.join(workspacePath, 'SYSTEM', 'integrations.secrets.json')
    const secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf-8'))
    assert.strictEqual(secrets?.partners?.github?.token, 'ghp_test_123', 'Expected blank token update not to erase existing token')
    assert.strictEqual(secrets?.partners?.resend?.apiKey, 're_test_123', 'Expected unrelated server-stored partner secret to remain persisted')
  })

  await test('resend test-email uses persisted workspace API key', async () => {
    let requestUrl = ''
    let requestInit: any = null
    ;(globalThis as any).fetch = async (url: string, init: any) => {
      requestUrl = url
      requestInit = init
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'email_test_123' }),
      }
    }

    try {
      const handler = getRouteHandler('post', '/resend/test-email')
      const res = makeRes()
    await handler(makeReq({
      body: {
        to: 'recipient@example.com',
        subject: 'Integration test',
        text: 'Hello from ClawMax',
      },
    }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected Resend test email route success')
      assert.strictEqual(res.jsonBody?.id, 'email_test_123', 'Expected Resend provider id to be returned')
      assert.strictEqual(requestUrl, 'https://api.resend.com/emails', 'Expected Resend emails endpoint')
      assert.strictEqual(requestInit?.headers?.Authorization, 'Bearer re_test_123', 'Expected persisted workspace API key to be used')
      const payload = JSON.parse(requestInit?.body || '{}')
      assert.deepStrictEqual(payload.to, ['recipient@example.com'], 'Expected recipient list payload')
      assert.strictEqual(payload.from, 'ClawMax Agent <agent@send.clawmax.ai>', 'Expected branded default sender payload')
      assert.strictEqual(payload.subject, 'Integration test', 'Expected subject payload')
    } finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })

  await test('resend test recipient prefers authenticated actor email over request body', async () => {
    assert.strictEqual(resolveResendTestRecipient({
      requestedTo: 'other@example.com',
      actorEmail: ' owner@example.com ',
      actorLogin: 'github-user',
    }), 'owner@example.com')

    assert.strictEqual(resolveResendTestRecipient({
      requestedTo: 'other@example.com',
      actorEmail: null,
      actorLogin: 'otp-user@example.com',
    }), 'otp-user@example.com')
  })

  await test('resend test recipient allows custom recipient override on local runtimes', async () => {
    assert.strictEqual(resolveResendTestRecipient({
      requestedTo: ' local-dev@example.com ',
      actorEmail: 'owner@example.com',
      actorLogin: 'owner@example.com',
      allowCustomRecipient: true,
    }), 'local-dev@example.com')
  })

  await test('resend test recipient allows custom recipient override on on-prem runtimes without OTP identity', async () => {
    assert.strictEqual(resolveResendTestRecipient({
      requestedTo: ' onprem@example.com ',
      actorEmail: '',
      actorLogin: '',
      allowCustomRecipient: true,
    }), 'onprem@example.com')
  })

  await test('config reports env-backed resend secret presence when workspace secret file is empty', async () => {
    process.env.RESEND_API_KEY = 're_env_runtime_1234'
    const secretsPath = path.join(workspacePath, 'SYSTEM', 'integrations.secrets.json')
    fs.writeFileSync(secretsPath, JSON.stringify({ partners: {} }, null, 2), 'utf-8')

    const handler = getRouteHandler('get', '/config')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected config fetch success')
    assert.strictEqual(res.jsonBody?.secretPresence?.resend?.apiKey, true, 'Expected env-backed Resend presence to be reported')
    assert.strictEqual(res.jsonBody?.secretSummaries?.resend?.apiKey?.preview, 're_e••••1234', 'Expected masked env-backed Resend preview')
  })

  await test('resend test-email uses workspace resend sender overrides when configured', async () => {
    const configPath = path.join(workspacePath, 'SYSTEM', 'integrations.json')
    fs.writeFileSync(configPath, JSON.stringify({
      partners: {
        resend: {
          fromEmail: 'agent@send.clawmax.ai',
          fromName: 'Workspace Mailer',
          replyTo: 'support@clawmax.ai',
        },
      },
    }, null, 2), 'utf-8')

    let requestInit: any = null
    ;(globalThis as any).fetch = async (_url: string, init: any) => {
      requestInit = init
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 'email_test_sender_override' }),
      }
    }

    try {
      const handler = getRouteHandler('post', '/resend/test-email')
      const res = makeRes()
      await handler(makeReq({
        body: {
          to: 'recipient@example.com',
          subject: 'Sender override test',
          text: 'Hello from override policy',
        },
      }), res)

      assert.strictEqual(res.statusCode, 200, 'Expected Resend sender override route success')
      const payload = JSON.parse(requestInit?.body || '{}')
      assert.strictEqual(payload.from, 'Workspace Mailer <agent@send.clawmax.ai>', 'Expected workspace sender override')
      assert.strictEqual(payload.reply_to, 'support@clawmax.ai', 'Expected workspace reply-to override')
    } finally {
      ;(globalThis as any).fetch = originalFetch
    }
  })

  await test('resend sender policy accepts preformatted env senders without nesting display names', async () => {
    const configPath = path.join(workspacePath, 'SYSTEM', 'integrations.json')
    fs.writeFileSync(configPath, JSON.stringify({ partners: {} }, null, 2), 'utf-8')
    delete process.env.RESEND_DEFAULT_FROM
    delete process.env.RESEND_DEFAULT_FROM_NAME
    delete process.env.SIGNUP_FROM_EMAIL
    process.env.OTP_FROM_EMAIL = 'ClawMax Notifications <agent@send.clawmax.ai>'

    const policy = getWorkspaceResendSenderPolicy()
    assert.strictEqual(policy.fromEmail, 'agent@send.clawmax.ai', 'Expected normalized sender email')
    assert.strictEqual(policy.fromName, 'ClawMax Notifications', 'Expected extracted sender display name')
    assert.strictEqual(policy.from, 'ClawMax Notifications <agent@send.clawmax.ai>', 'Expected normalized formatted sender')
  })

  await test('resend test-email reports missing workspace API key cleanly', async () => {
    delete process.env.RESEND_API_KEY
    const secretsPath = path.join(workspacePath, 'SYSTEM', 'integrations.secrets.json')
    fs.writeFileSync(secretsPath, JSON.stringify({ partners: {} }, null, 2), 'utf-8')

    const handler = getRouteHandler('post', '/resend/test-email')
    const res = makeRes()
    await handler(makeReq({ body: { to: 'recipient@example.com' } }), res)

    assert.strictEqual(res.statusCode, 400, 'Expected missing Resend key to be a validation error')
    assert(/RESEND_API_KEY is not configured/i.test(res.jsonBody?.error || ''), 'Expected clear missing-key message')
  })

  await test('config round-trip persists a valid agentRuntime and omits invalid values', async () => {
    const putHandler = getRouteHandler('put', '/config')

    const validRes = makeRes()
    await putHandler(makeReq({ body: { agentRuntime: 'claude' } }), validRes)
    assert.strictEqual(validRes.statusCode, 200, 'Expected config update success')
    assert.strictEqual(validRes.jsonBody?.config?.agentRuntime, 'claude', 'Expected agentRuntime to persist')

    const getHandler = getRouteHandler('get', '/config')
    const getRes = makeRes()
    await getHandler(makeReq(), getRes)
    assert.strictEqual(getRes.jsonBody?.config?.agentRuntime, 'claude', 'Expected persisted agentRuntime on reload')

    const invalidRes = makeRes()
    await putHandler(makeReq({ body: { agentRuntime: 'not-a-runtime' } }), invalidRes)
    assert.strictEqual(invalidRes.statusCode, 200, 'Expected config update success even with invalid agentRuntime')
    assert.strictEqual(invalidRes.jsonBody?.config?.agentRuntime, undefined, 'Expected invalid agentRuntime to be omitted, not stored')
  })

  await test('GET /runtimes reports detected runtimes and the workspace default', async () => {
    const putHandler = getRouteHandler('put', '/config')
    await putHandler(makeReq({ body: { agentRuntime: 'droid' } }), makeRes())

    const handler = getRouteHandler('get', '/runtimes')
    const res = makeRes()
    await handler(makeReq(), res)

    assert.strictEqual(res.statusCode, 200, 'Expected runtimes route success')
    assert.strictEqual(res.jsonBody?.workspaceDefault, 'droid', 'Expected workspace default to reflect persisted agentRuntime')
    assert(Array.isArray(res.jsonBody?.runtimes) && res.jsonBody.runtimes.length === 3, 'Expected three runtime statuses')
    const ids = res.jsonBody.runtimes.map((r: any) => r.id).sort()
    assert.deepStrictEqual(ids, ['claude', 'droid', 'openclaw'], 'Expected all three runtime ids')
    const droidStatus = res.jsonBody.runtimes.find((r: any) => r.id === 'droid')
    assert.strictEqual(droidStatus?.active, true, 'Expected droid to be marked active')
    const claudeStatus = res.jsonBody.runtimes.find((r: any) => r.id === 'claude')
    assert.strictEqual(claudeStatus?.active, false, 'Expected claude to be marked inactive')
    for (const status of res.jsonBody.runtimes) {
      assert(typeof status.installed === 'boolean', 'Expected installed boolean on each runtime status')
      assert(typeof status.label === 'string' && status.label.length > 0, 'Expected label on each runtime status')
      assert(typeof status.installHint === 'string' && status.installHint.length > 0, 'Expected installHint on each runtime status')
    }
  })

  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalDeploymentKind === 'undefined') delete process.env.DASHBOARD_DEPLOYMENT_KIND
  else process.env.DASHBOARD_DEPLOYMENT_KIND = originalDeploymentKind
  if (typeof originalEnableOllama === 'undefined') delete process.env.DASHBOARD_ENABLE_OLLAMA
  else process.env.DASHBOARD_ENABLE_OLLAMA = originalEnableOllama
  if (typeof originalVisiblePartners === 'undefined') delete process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES
  else process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = originalVisiblePartners
  if (typeof originalResendApiKey === 'undefined') delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalResendApiKey
  if (typeof originalResendDefaultFrom === 'undefined') delete process.env.RESEND_DEFAULT_FROM
  else process.env.RESEND_DEFAULT_FROM = originalResendDefaultFrom
  if (typeof originalResendDefaultFromName === 'undefined') delete process.env.RESEND_DEFAULT_FROM_NAME
  else process.env.RESEND_DEFAULT_FROM_NAME = originalResendDefaultFromName
  if (typeof originalOtpFromEmail === 'undefined') delete process.env.OTP_FROM_EMAIL
  else process.env.OTP_FROM_EMAIL = originalOtpFromEmail
  if (typeof originalSignupFromEmail === 'undefined') delete process.env.SIGNUP_FROM_EMAIL
  else process.env.SIGNUP_FROM_EMAIL = originalSignupFromEmail
  ;(globalThis as any).fetch = originalFetch

  console.log('\n========================================')
  console.log(`Tests passed: ${testsPassed}`)
  console.log(`Tests failed: ${testsFailed}`)
  console.log('========================================\n')

  if (testsFailed > 0) {
    console.log(`${RED}Some tests failed${RESET}`)
    process.exit(1)
  } else {
    console.log(`${GREEN}All tests passed${RESET}`)
  }
}

run().catch((err) => {
  if (typeof originalHome === 'undefined') delete process.env.HOME
  else process.env.HOME = originalHome
  if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
  else process.env.OPENCLAW_WORKSPACE = originalWorkspace
  if (typeof originalDeploymentKind === 'undefined') delete process.env.DASHBOARD_DEPLOYMENT_KIND
  else process.env.DASHBOARD_DEPLOYMENT_KIND = originalDeploymentKind
  if (typeof originalEnableOllama === 'undefined') delete process.env.DASHBOARD_ENABLE_OLLAMA
  else process.env.DASHBOARD_ENABLE_OLLAMA = originalEnableOllama
  if (typeof originalVisiblePartners === 'undefined') delete process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES
  else process.env.WORKSPACES_INTEGRATIONS_THIRD_PARTIES = originalVisiblePartners
  if (typeof originalResendApiKey === 'undefined') delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = originalResendApiKey
  if (typeof originalResendDefaultFrom === 'undefined') delete process.env.RESEND_DEFAULT_FROM
  else process.env.RESEND_DEFAULT_FROM = originalResendDefaultFrom
  if (typeof originalResendDefaultFromName === 'undefined') delete process.env.RESEND_DEFAULT_FROM_NAME
  else process.env.RESEND_DEFAULT_FROM_NAME = originalResendDefaultFromName
  if (typeof originalOtpFromEmail === 'undefined') delete process.env.OTP_FROM_EMAIL
  else process.env.OTP_FROM_EMAIL = originalOtpFromEmail
  if (typeof originalSignupFromEmail === 'undefined') delete process.env.SIGNUP_FROM_EMAIL
  else process.env.SIGNUP_FROM_EMAIL = originalSignupFromEmail
  ;(globalThis as any).fetch = originalFetch
  console.error(err)
  process.exit(1)
})
