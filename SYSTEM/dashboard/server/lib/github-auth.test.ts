/**
 * GitHub/Auth OTP test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/github-auth.test.ts
 */

import fs from 'fs'
import path from 'path'
import {
  createAuthRouter,
  getOtpProviderDiagnosticContext,
  isOtpAuthConfigured,
  summarizeOtpProviderError,
} from './github-auth'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const otpStorePath = path.join(__dirname, '..', 'data', 'auth', 'otp-store.json')
const otpDevFilePath = path.resolve(__dirname, '..', '..', '..', '..', '.clawmax-otp-dev.json')
const originalStore = fs.existsSync(otpStorePath) ? fs.readFileSync(otpStorePath, 'utf-8') : null
const originalDevFile = fs.existsSync(otpDevFilePath) ? fs.readFileSync(otpDevFilePath, 'utf-8') : null
const envKeys = [
  'DASHBOARD_AUTH_MODE',
  'OTP_ALLOWED_EMAILS',
  'OTP_DEV_MODE',
  'OTP_EXPIRY_MINUTES',
  'RESEND_API_KEY',
  'OTP_FROM_EMAIL',
  'SIGNUP_FROM_EMAIL',
  'OTP_EMAIL_SUBJECT',
  'NODE_ENV',
]
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.error(`  Error: ${err.message}`)
    testsFailed++
  }
}

function resetFiles() {
  if (originalStore === null) {
    fs.rmSync(otpStorePath, { force: true })
  } else {
    fs.mkdirSync(path.dirname(otpStorePath), { recursive: true })
    fs.writeFileSync(otpStorePath, originalStore, 'utf-8')
  }

  if (originalDevFile === null) {
    fs.rmSync(otpDevFilePath, { force: true })
  } else {
    fs.writeFileSync(otpDevFilePath, originalDevFile, 'utf-8')
  }
}

function resetEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
}

function configureOtpEnv() {
  process.env.DASHBOARD_AUTH_MODE = 'email_otp'
  process.env.OTP_ALLOWED_EMAILS = 'owner@example.com'
  process.env.OTP_DEV_MODE = 'log'
  process.env.OTP_EXPIRY_MINUTES = '15'
  delete process.env.RESEND_API_KEY
  process.env.NODE_ENV = 'development'
}

function getRouteHandler(method: 'post' | 'get', routePath: string) {
  const router = createAuthRouter()
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
}

function makeReq(body: Record<string, unknown> = {}) {
  return {
    body,
    cookies: {},
    headers: {},
    ip: '127.0.0.1',
    secure: false,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    cookiesSet: [] as Array<{ name: string; value: string; options: Record<string, unknown> }>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
    cookie(name: string, value: string, options: Record<string, unknown>) {
      this.cookiesSet.push({ name, value, options })
      return this
    },
  }
}

function readDevCode(): string {
  const payload = JSON.parse(fs.readFileSync(otpDevFilePath, 'utf-8'))
  return payload.code
}

console.log(`\n${YELLOW}=== GitHub/Auth OTP Test Suite ===${RESET}\n`)

async function run() {
  await test('OTP auth config enables in dev log mode with allowlisted email', () => {
    resetFiles()
    configureOtpEnv()
    assert(isOtpAuthConfigured(), 'Expected OTP auth to be configured')
  })

  await test('OTP request returns dev file hint and writes latest code for allowlisted email', async () => {
    resetFiles()
    configureOtpEnv()
    const handler = getRouteHandler('post', '/otp/request')
    const req = makeReq({ email: 'owner@example.com' })
    const res = makeRes()

    await handler(req, res)

    assert(res.statusCode === 200, 'Expected OTP request to succeed')
    assert(res.jsonBody?.ok === true, 'Expected ok response')
    assert(res.jsonBody?.devOtpFile === otpDevFilePath, 'Expected dev OTP file path in response')
    assert(res.jsonBody?.retryAfterSeconds === 30, `Expected initial resend cooldown, got ${res.jsonBody?.retryAfterSeconds}`)
    assert(fs.existsSync(otpDevFilePath), 'Expected dev OTP file to be written')
    assert(/^\d{6}$/.test(readDevCode()), 'Expected a 6-digit dev OTP code')
  })

  await test('OTP dev log mode still writes code in production when explicitly enabled', async () => {
    resetFiles()
    configureOtpEnv()
    process.env.NODE_ENV = 'production'
    const handler = getRouteHandler('post', '/otp/request')
    const req = makeReq({ email: 'owner@example.com' })
    const res = makeRes()

    await handler(req, res)

    assert(res.statusCode === 200, 'Expected OTP request to succeed in production log mode')
    assert(res.jsonBody?.devOtpFile === otpDevFilePath, 'Expected dev OTP file path in response in production log mode')
    assert(fs.existsSync(otpDevFilePath), 'Expected dev OTP file to be written in production log mode')
    assert(/^\d{6}$/.test(readDevCode()), 'Expected a 6-digit dev OTP code in production log mode')
  })

  await test('OTP resend is blocked during cooldown with retry metadata', async () => {
    resetFiles()
    configureOtpEnv()
    const handler = getRouteHandler('post', '/otp/request')

    await handler(makeReq({ email: 'owner@example.com' }), makeRes())
    const res = makeRes()
    await handler(makeReq({ email: 'owner@example.com' }), res)

    assert(res.statusCode === 429, `Expected cooldown status, got ${res.statusCode}`)
    assert(typeof res.jsonBody?.retryAfterSeconds === 'number', 'Expected retryAfterSeconds')
    assert(typeof res.jsonBody?.resendAvailableAt === 'number', 'Expected resendAvailableAt')
  })

  await test('OTP resend after cooldown issues a fresh code and increases cooldown after repeated sends', async () => {
    resetFiles()
    configureOtpEnv()
    const handler = getRouteHandler('post', '/otp/request')

    await handler(makeReq({ email: 'owner@example.com' }), makeRes())
    let firstCode = readDevCode()

    for (let sendIndex = 2; sendIndex <= 4; sendIndex++) {
      const store = JSON.parse(fs.readFileSync(otpStorePath, 'utf-8'))
      const active = [...store.records].reverse().find((record: any) => record.email === 'owner@example.com' && !record.consumedAt && !record.supersededAt)
      active.cooldownUntil = Date.now() - 1000
      fs.writeFileSync(otpStorePath, JSON.stringify(store, null, 2), 'utf-8')

      const res = makeRes()
      await handler(makeReq({ email: 'owner@example.com' }), res)
      const nextCode = readDevCode()

      assert(res.statusCode === 200, `Expected resend ${sendIndex} to succeed`)
      assert(nextCode !== firstCode, 'Expected a fresh OTP code on resend')
      if (sendIndex <= 3) {
        assert(res.jsonBody?.retryAfterSeconds === 30, `Expected 30s cooldown for send ${sendIndex}, got ${res.jsonBody?.retryAfterSeconds}`)
      } else {
        assert(res.jsonBody?.retryAfterSeconds === 60, `Expected 60s cooldown for send ${sendIndex}, got ${res.jsonBody?.retryAfterSeconds}`)
      }
      firstCode = nextCode
    }
  })

  await test('OTP request for non-allowlisted email stays generic and does not create dev file', async () => {
    resetFiles()
    configureOtpEnv()
    const hadDevFile = fs.existsSync(otpDevFilePath)
    const before = hadDevFile ? fs.readFileSync(otpDevFilePath, 'utf-8') : null
    const handler = getRouteHandler('post', '/otp/request')
    const req = makeReq({ email: 'other@example.com' })
    const res = makeRes()

    await handler(req, res)

    assert(res.statusCode === 200, 'Expected generic success response')
    assert(res.jsonBody?.ok === true, 'Expected ok response')
    assert(typeof res.jsonBody?.devOtpFile === 'undefined', 'Expected no dev file hint for disallowed email')
    if (!hadDevFile) {
      assert(!fs.existsSync(otpDevFilePath), 'Expected no dev file for disallowed email')
    } else {
      const after = fs.readFileSync(otpDevFilePath, 'utf-8')
      assert(after === before, 'Expected disallowed email request not to rewrite existing dev OTP file')
    }
  })

  await test('OTP provider diagnostic context redacts API key and extracts sender domain', () => {
    const context = getOtpProviderDiagnosticContext(
      're_test_secret_123456789',
      'Max <max@send.clawmax.ai>',
      'Your ClawMax login code',
    )

    assert(context.provider === 'resend', 'Expected resend provider label')
    assert(context.senderAddress === 'max@send.clawmax.ai', 'Expected sender address extraction')
    assert(context.senderDomain === 'send.clawmax.ai', 'Expected sender domain extraction')
    assert(context.apiKeyFingerprint !== 're_test_secret_123456789', 'Expected API key to be fingerprinted')
    assert(context.apiKeyFingerprint.length === 12, 'Expected short API key fingerprint')
  })

  await test('OTP provider error summary keeps safe transport metadata', () => {
    const summary = summarizeOtpProviderError({
      name: 'application_error',
      type: 'provider_error',
      code: 'internal_error',
      statusCode: 500,
      message: 'Internal server error. We are unable to process your request right now, please try again later.',
    })

    assert(summary.name === 'application_error', 'Expected error name in summary')
    assert(summary.type === 'provider_error', 'Expected error type in summary')
    assert(summary.code === 'internal_error', 'Expected error code in summary')
    assert(summary.statusCode === 500, 'Expected status code in summary')
    assert(
      summary.message.includes('Internal server error'),
      'Expected provider message in summary',
    )
  })

  await test('OTP verify creates session cookie and authenticates user', async () => {
    resetFiles()
    configureOtpEnv()
    const requestHandler = getRouteHandler('post', '/otp/request')
    const verifyHandler = getRouteHandler('post', '/otp/verify')

    await requestHandler(makeReq({ email: 'owner@example.com' }), makeRes())
    const code = readDevCode()
    const res = makeRes()

    verifyHandler(makeReq({ email: 'owner@example.com', code, rememberDevice: true }), res)

    assert(res.statusCode === 200, 'Expected verify to succeed')
    assert(res.jsonBody?.authenticated === true, 'Expected authenticated response')
    assert(res.jsonBody?.user?.authType === 'otp', 'Expected OTP auth type')
    assert(res.cookiesSet.some((cookie) => cookie.name === 'clawmax_session'), 'Expected session cookie to be set')
  })

  await test('OTP code is single-use and reused codes are rejected', async () => {
    resetFiles()
    configureOtpEnv()
    const requestHandler = getRouteHandler('post', '/otp/request')
    const verifyHandler = getRouteHandler('post', '/otp/verify')

    await requestHandler(makeReq({ email: 'owner@example.com' }), makeRes())
    const code = readDevCode()

    verifyHandler(makeReq({ email: 'owner@example.com', code, rememberDevice: false }), makeRes())
    const reused = makeRes()
    verifyHandler(makeReq({ email: 'owner@example.com', code, rememberDevice: false }), reused)

    assert(reused.statusCode === 400, 'Expected reused code to fail')
    assert(reused.jsonBody?.error === 'Code expired or invalid', 'Expected generic invalid-code error')
  })

  await test('OTP verify rejects expired codes', async () => {
    resetFiles()
    configureOtpEnv()
    const requestHandler = getRouteHandler('post', '/otp/request')
    const verifyHandler = getRouteHandler('post', '/otp/verify')

    await requestHandler(makeReq({ email: 'owner@example.com' }), makeRes())
    const code = readDevCode()
    const store = JSON.parse(fs.readFileSync(otpStorePath, 'utf-8'))
    store.records[store.records.length - 1].expiresAt = Date.now() - 1000
    fs.writeFileSync(otpStorePath, JSON.stringify(store, null, 2), 'utf-8')

    const res = makeRes()
    verifyHandler(makeReq({ email: 'owner@example.com', code, rememberDevice: false }), res)

    assert(res.statusCode === 400, 'Expected expired code to fail')
    assert(res.jsonBody?.error === 'Code expired or invalid', 'Expected expired-code error')
  })

  resetEnv()
  resetFiles()

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
  resetEnv()
  resetFiles()
  console.error(err)
  process.exit(1)
})
