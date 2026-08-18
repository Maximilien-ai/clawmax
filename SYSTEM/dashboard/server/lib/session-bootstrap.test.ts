import fs from 'fs'
import os from 'os'
import path from 'path'
import jwt from 'jsonwebtoken'
import { createAuthRouter } from './github-auth'
import {
  authorizeSessionBootstrap,
  getSessionBootstrapConfig,
  SessionBootstrapReplayStore,
  validateSessionBootstrapClaims,
} from './session-bootstrap'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
  } catch (error: any) {
    failed++
    console.error(`FAIL ${name}: ${error.message}`)
  }
}

const now = Date.parse('2026-08-18T18:02:00Z')
const secret = 'test-bootstrap-secret-with-32-characters-minimum'
const validEnv = {
  CLAWMAX_SESSION_BOOTSTRAP_SECRET: secret,
  CLAWMAX_TENANT_ID: 'tenant_test_001',
  CLAWMAX_WORKSPACE_ID: 'workspace_test_001',
  CLAWMAX_RUNTIME_ID: 'runtime_test_001',
  CLAWMAX_POLICY_VERSION: 'policy-test-007',
  CLAWMAX_SESSION_BOOTSTRAP_ORIGINS: 'https://ent1.clawmax.ai',
  CLAWMAX_ENTERPRISE_SESSION_TTL_SECONDS: '900',
} as NodeJS.ProcessEnv

function claims(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: 'v0.1',
    bootstrap_id: 'sbs_6Qp9Jv2Lm4Nx7Kr1',
    actor_id: 'actor_test_001',
    membership_id: 'membership_test_001',
    tenant_id: 'tenant_test_001',
    workspace_id: 'workspace_test_001',
    runtime_id: 'runtime_test_001',
    policy_version: 'policy-test-007',
    entry_origin: 'https://ent1.clawmax.ai',
    audience: 'clawmax-dashboard-session',
    issued_at: '2026-08-18T18:00:00Z',
    expires_at: '2026-08-18T18:05:00Z',
    ...overrides,
  }
}

function expectRejected(fn: () => unknown, message: string) {
  let rejected = false
  try { fn() } catch { rejected = true }
  assert(rejected, message)
}

function getRouteHandler() {
  const router = createAuthRouter()
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === '/session-bootstrap' && entry.route?.methods?.post)
  assert(!!layer, 'session bootstrap route is missing')
  return layer.route.stack[0].handle as Function
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    headers: {} as Record<string, string>,
    status(code: number) { this.statusCode = code; return this },
    setHeader(name: string, value: string) { this.headers[name.toLowerCase()] = value; return this },
    json(body: unknown) { this.jsonBody = body; return this },
  }
}

async function run() {
  await test('bootstrap remains disabled in normal deployments', () => {
    const config = getSessionBootstrapConfig({})
    assert(!config.enabled && !config.valid, 'empty environment must not enable bootstrap')
  })

  await test('partial configuration fails closed', () => {
    const config = getSessionBootstrapConfig({ CLAWMAX_SESSION_BOOTSTRAP_SECRET: secret })
    assert(config.enabled && !config.valid, 'partial configuration must be invalid')
  })

  await test('complete configuration is accepted', () => {
    const config = getSessionBootstrapConfig(validEnv)
    assert(config.valid && config.sessionTtlSeconds === 900, 'valid configuration was rejected')
  })

  await test('accepted Enterprise fixture validates', () => {
    const result = validateSessionBootstrapClaims(claims(), getSessionBootstrapConfig(validEnv), now)
    assert(result.bootstrap_id === 'sbs_6Qp9Jv2Lm4Nx7Kr1', 'fixture ID changed')
  })

  await test('unknown claims are rejected', () => {
    expectRejected(() => validateSessionBootstrapClaims(claims({ internal_target: 'forbidden' }), getSessionBootstrapConfig(validEnv), now), 'unknown claim passed')
  })

  await test('expired and future grants are rejected', () => {
    const config = getSessionBootstrapConfig(validEnv)
    expectRejected(() => validateSessionBootstrapClaims(claims(), config, Date.parse('2026-08-18T18:06:00Z')), 'expired claim passed')
    expectRejected(() => validateSessionBootstrapClaims(claims(), config, Date.parse('2026-08-18T17:50:00Z')), 'future claim passed')
  })

  await test('lifetimes over five minutes are rejected', () => {
    expectRejected(() => validateSessionBootstrapClaims(claims({ expires_at: '2026-08-18T18:05:01Z' }), getSessionBootstrapConfig(validEnv), now), 'long grant passed')
  })

  await test('non-HTTPS and non-origin entry values are rejected', () => {
    const config = getSessionBootstrapConfig({ ...validEnv, CLAWMAX_SESSION_BOOTSTRAP_ORIGINS: 'http://ent1.localhost:4100' })
    assert(!config.valid, 'HTTP configured origin passed')
    expectRejected(() => validateSessionBootstrapClaims(claims({ entry_origin: 'https://ent1.clawmax.ai/path' }), getSessionBootstrapConfig(validEnv), now), 'origin path passed')
  })

  await test('all runtime substitutions fail closed', () => {
    const config = getSessionBootstrapConfig(validEnv)
    for (const [field, value] of Object.entries({
      tenant_id: 'tenant_test_002',
      workspace_id: 'workspace_test_002',
      runtime_id: 'runtime_test_002',
      policy_version: 'policy-test-008',
      entry_origin: 'https://ent2.clawmax.ai',
    })) {
      expectRejected(() => validateSessionBootstrapClaims(claims({ [field]: value }), config, now), `${field} substitution passed`)
    }
  })

  await test('bearer authentication requires an exact secret', () => {
    assert(authorizeSessionBootstrap(`Bearer ${secret}`, secret), 'exact secret rejected')
    assert(!authorizeSessionBootstrap(`Bearer ${secret}x`, secret), 'changed secret passed')
    assert(!authorizeSessionBootstrap(secret, secret), 'untyped secret passed')
  })

  await test('replay ledger persists only a hash and rejects reuse', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-session-bootstrap-'))
    const ledgerPath = path.join(root, 'ledger.json')
    const store = new SessionBootstrapReplayStore(ledgerPath)
    assert(store.consume('sbs_6Qp9Jv2Lm4Nx7Kr1', '2026-08-18T18:05:00Z', now), 'first use rejected')
    assert(!new SessionBootstrapReplayStore(ledgerPath).consume('sbs_6Qp9Jv2Lm4Nx7Kr1', '2026-08-18T18:05:00Z', now), 'replay passed')
    assert(!fs.readFileSync(ledgerPath, 'utf-8').includes('sbs_6Qp9Jv2Lm4Nx7Kr1'), 'raw bootstrap ID persisted')
    fs.writeFileSync(ledgerPath, '{broken', 'utf-8')
    expectRejected(() => store.consume('sbs_7Qp9Jv2Lm4Nx7Kr2', '2026-08-18T18:05:00Z', now), 'corrupt ledger failed open')
    fs.rmSync(root, { recursive: true, force: true })
  })

  await test('route is hidden when bootstrap is disabled', () => {
    const saved = { ...process.env }
    for (const key of Object.keys(validEnv)) delete process.env[key]
    const res = makeRes()
    getRouteHandler()({ headers: {}, body: {} }, res)
    assert(res.statusCode === 404, `expected 404, got ${res.statusCode}`)
    process.env = saved
  })

  await test('route exchanges one valid grant for a short-lived bearer session', () => {
    const saved = { ...process.env }
    Object.assign(process.env, validEnv, { JWT_SECRET: 'session-bootstrap-test-jwt-secret-32-chars' })
    const replayPath = path.join(__dirname, '..', 'data', 'auth', 'session-bootstrap-replays.json')
    const originalLedger = fs.existsSync(replayPath) ? fs.readFileSync(replayPath, 'utf-8') : null
    const uniqueClaims = claims({
      bootstrap_id: `sbs_${cryptoSafeId()}`,
      issued_at: new Date(Date.now() - 1000).toISOString(),
      expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    })
    const req = { headers: { authorization: `Bearer ${secret}` }, body: uniqueClaims }
    const res = makeRes()
    getRouteHandler()(req, res)
    assert(res.statusCode === 200, `exchange failed with ${res.statusCode}`)
    assert(res.headers['cache-control'] === 'no-store', 'response can be cached')
    assert(res.jsonBody?.token_type === 'Bearer' && res.jsonBody?.expires_in === 900, 'token metadata missing')
    const decoded = jwt.verify(res.jsonBody.dashboard_session_token, process.env.JWT_SECRET!) as any
    assert(decoded.authType === 'enterprise' && decoded.enterprise?.tenantId === 'tenant_test_001', 'runtime binding missing from session')
    const replay = makeRes()
    getRouteHandler()(req, replay)
    assert(replay.statusCode === 409, `expected replay denial, got ${replay.statusCode}`)

    if (originalLedger === null) fs.rmSync(replayPath, { force: true })
    else fs.writeFileSync(replayPath, originalLedger, 'utf-8')
    process.env = saved
  })

  console.log(`session-bootstrap.test.ts: ${passed} tests passed`)
  if (failed > 0) process.exit(1)
}

function cryptoSafeId(): string {
  return `${Date.now().toString(36)}abcdefghijklmnop`.slice(0, 20)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
