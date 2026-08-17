import fs from 'fs'
import path from 'path'
import {
  createAuthRouter,
  isGitHubAuthConfigured,
  isOtpAuthConfigured,
  requireGitHubAuth,
  shouldUseSecureAuthCookies,
} from './github-auth'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

const otpStorePath = path.join(__dirname, '..', 'data', 'auth', 'otp-store.json')
const originalStore = fs.existsSync(otpStorePath) ? fs.readFileSync(otpStorePath, 'utf-8') : null
const envKeys = [
  'DASHBOARD_AUTH_MODE',
  'AUTH_MODE',
  'OTP_ALLOWED_EMAILS',
  'OTP_DEV_MODE',
  'OTP_EXPIRY_MINUTES',
  'RESEND_API_KEY',
  'OTP_FROM_EMAIL',
  'SIGNUP_FROM_EMAIL',
  'OTP_EMAIL_SUBJECT',
  'NODE_ENV',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'DASHBOARD_APP_URL',
  'CORS_ORIGIN',
  'BYPASS_OAUTH',
  'DASHBOARD_ALLOW_INSECURE_LOCAL_COOKIES',
  'DASHBOARD_DEPLOYMENT_KIND',
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
}

function resetEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (typeof value === 'undefined') delete process.env[key]
    else process.env[key] = value
  }
}

function configureOtpEnv() {
  process.env.DASHBOARD_AUTH_MODE = 'email_otp'
  delete process.env.AUTH_MODE
  process.env.OTP_ALLOWED_EMAILS = 'owner@example.com'
  process.env.OTP_DEV_MODE = 'log'
  process.env.OTP_EXPIRY_MINUTES = '15'
  delete process.env.RESEND_API_KEY
  process.env.NODE_ENV = 'development'
  delete process.env.BYPASS_OAUTH
  delete process.env.DASHBOARD_AUTH_DISABLED
}

function configureGitHubEnv() {
  process.env.DASHBOARD_AUTH_MODE = 'github_oauth'
  delete process.env.AUTH_MODE
  process.env.GITHUB_CLIENT_ID = 'gh-client-id'
  process.env.GITHUB_CLIENT_SECRET = 'gh-client-secret'
  process.env.DASHBOARD_APP_URL = 'http://localhost:5174'
  delete process.env.BYPASS_OAUTH
  delete process.env.DASHBOARD_AUTH_DISABLED
}

function getRouteHandler(method: 'post' | 'get', routePath: string) {
  const router = createAuthRouter()
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === routePath && entry.route?.methods?.[method])
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${routePath} not found`)
  return layer.route.stack[0].handle as Function
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    cookies: {},
    headers: {},
    query: {},
    ip: '127.0.0.1',
    secure: false,
    ...overrides,
  } as any
}

function makeRes() {
  return {
    statusCode: 200,
    jsonBody: undefined as any,
    redirectedTo: '' as string,
    headers: {} as Record<string, string>,
    cookiesSet: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(body: any) {
      this.jsonBody = body
      return this
    },
    redirect(url: string) {
      this.redirectedTo = url
      return this
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    clearCookie() {
      return this
    },
    cookie(name: string, value: string) {
      this.cookiesSet[name] = value
      return this
    },
  }
}

console.log(`\n${YELLOW}=== GitHub/Auth Edge Test Suite ===${RESET}\n`)

async function run() {
  await test('GitHub auth route returns 404 when email OTP mode disables OAuth', async () => {
    resetFiles()
    configureOtpEnv()
    const handler = getRouteHandler('get', '/github')
    const res = makeRes()
    await handler(makeReq(), res)
    assert(res.statusCode === 404, 'Expected disabled GitHub auth to return 404')
    assert(/not enabled/i.test(res.jsonBody?.error || ''), 'Expected GitHub disabled guidance')
  })

  await test('auth configuration helpers honor explicit mode selection', () => {
    configureOtpEnv()
    assert(isOtpAuthConfigured(), 'Expected OTP auth configured in email_otp mode')
    assert(!isGitHubAuthConfigured(), 'Expected GitHub auth not configured without credentials')

    configureGitHubEnv()
    delete process.env.OTP_ALLOWED_EMAILS
    assert(!isOtpAuthConfigured(), 'Expected OTP auth disabled in github_oauth mode')
    assert(isGitHubAuthConfigured(), 'Expected GitHub auth configured when credentials exist')
  })

  await test('auth cookies stay Secure by default on local HTTP', () => {
    const req = makeReq({ headers: { host: 'tenant-a.localhost:4101' } })
    assert(shouldUseSecureAuthCookies(req, {
      DASHBOARD_DEPLOYMENT_KIND: 'local',
      DASHBOARD_APP_URL: 'http://tenant-a.localhost:4101',
    }), 'Expected local HTTP cookies to remain Secure without explicit opt-in')
  })

  await test('explicit local HTTP option permits non-Secure cookies for matching .localhost origin', () => {
    const req = makeReq({ headers: { host: 'tenant-a.localhost:4101' } })
    assert(!shouldUseSecureAuthCookies(req, {
      DASHBOARD_ALLOW_INSECURE_LOCAL_COOKIES: 'true',
      DASHBOARD_DEPLOYMENT_KIND: 'local',
      DASHBOARD_APP_URL: 'http://tenant-a.localhost:4101',
      NODE_ENV: 'production',
    }), 'Expected explicit local exception to work independently of NODE_ENV')
  })

  await test('local HTTP cookie option fails closed for cloud and on-prem deployments', () => {
    const req = makeReq({ headers: { host: 'tenant-a.localhost:4101' } })
    for (const deploymentKind of ['cloud', 'onprem']) {
      assert(shouldUseSecureAuthCookies(req, {
        DASHBOARD_ALLOW_INSECURE_LOCAL_COOKIES: 'true',
        DASHBOARD_DEPLOYMENT_KIND: deploymentKind,
        DASHBOARD_APP_URL: 'http://tenant-a.localhost:4101',
      }), `Expected ${deploymentKind} cookie to remain Secure`)
    }
  })

  await test('local HTTP cookie option fails closed for non-local, mismatched, and HTTPS app origins', () => {
    const req = makeReq({ headers: { host: 'tenant-a.localhost:4101' } })
    const baseEnv = {
      DASHBOARD_ALLOW_INSECURE_LOCAL_COOKIES: 'true',
      DASHBOARD_DEPLOYMENT_KIND: 'local',
    }
    for (const appUrl of [
      'http://tenant.example.com:4101',
      'http://tenant-b.localhost:4101',
      'https://tenant-a.localhost:4101',
      'not-a-url',
    ]) {
      assert(shouldUseSecureAuthCookies(req, { ...baseEnv, DASHBOARD_APP_URL: appUrl }), `Expected Secure cookie for ${appUrl}`)
    }
  })

  await test('HTTPS requests always use Secure auth cookies', () => {
    const req = makeReq({
      headers: { host: 'tenant-a.localhost:4101', 'x-forwarded-proto': 'https' },
    })
    assert(shouldUseSecureAuthCookies(req, {
      DASHBOARD_ALLOW_INSECURE_LOCAL_COOKIES: 'true',
      DASHBOARD_DEPLOYMENT_KIND: 'local',
      DASHBOARD_APP_URL: 'http://tenant-a.localhost:4101',
    }), 'Expected HTTPS request to keep Secure cookie')
  })

  await test('OTP verify rejects codes after too many invalid attempts', async () => {
    resetFiles()
    configureOtpEnv()
    const requestHandler = getRouteHandler('post', '/otp/request')
    const verifyHandler = getRouteHandler('post', '/otp/verify')

    await requestHandler(makeReq({ body: { email: 'owner@example.com' } }), makeRes())
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = makeRes()
      verifyHandler(makeReq({ body: { email: 'owner@example.com', code: '000000' } }), res)
      assert(res.statusCode === 400, `Expected invalid code error before lockout on attempt ${attempt + 1}`)
    }

    const locked = makeRes()
    verifyHandler(makeReq({ body: { email: 'owner@example.com', code: '000000' } }), locked)
    assert(locked.statusCode === 429, 'Expected lockout after too many attempts')
    assert(/too many attempts/i.test(locked.jsonBody?.error || ''), 'Expected attempt limit guidance')
  })

  await test('auth me route returns unauthenticated payload without a session', async () => {
    resetFiles()
    configureGitHubEnv()
    const handler = getRouteHandler('get', '/me')
    const res = makeRes()
    await handler(makeReq(), res)
    assert(res.statusCode === 200, 'Expected auth me success without session')
    assert(res.jsonBody?.authenticated === false, 'Expected unauthenticated response')
    assert(res.headers['Cache-Control'] === 'no-store', 'Expected no-store caching')
  })

  await test('logout redirect normalizes unsafe return_to origins', async () => {
    resetFiles()
    configureGitHubEnv()
    process.env.CORS_ORIGIN = 'http://localhost:5174'
    const handler = getRouteHandler('get', '/logout')
    const res = makeRes()
    await handler(makeReq({
      query: { return_to: 'https://evil.example/phish' },
      headers: { host: 'localhost:3001' },
    }), res)
    assert(res.redirectedTo === 'http://localhost:5174/', `Expected safe app redirect, got ${res.redirectedTo}`)
  })

  await test('logout rejects a foreign return_to when no CORS allowlist is configured', async () => {
    resetFiles()
    configureGitHubEnv()
    delete process.env.DASHBOARD_APP_URL
    delete process.env.CORS_ORIGIN
    const handler = getRouteHandler('get', '/logout')
    const res = makeRes()
    await handler(makeReq({
      query: { return_to: 'https://evil.example/phish' },
      headers: { host: 'localhost:3001' },
    }), res)
    assert(res.redirectedTo === 'http://localhost:3001/', `Expected request-origin fallback, got ${res.redirectedTo}`)
  })

  await test('GitHub login preserves an approved shared dashboard return path', async () => {
    resetFiles()
    configureGitHubEnv()
    process.env.CORS_ORIGIN = 'http://localhost:5174'
    const handler = getRouteHandler('get', '/github')
    const res = makeRes()
    const returnTo = 'http://localhost:5174/dashboards/secret-token?view=detail#results'
    await handler(makeReq({
      query: { return_to: returnTo },
      headers: { host: 'localhost:3001' },
    }), res)
    assert(res.cookiesSet.oauth_return_to === returnTo, 'Expected approved dashboard path to survive OAuth state storage')
    assert(res.redirectedTo.startsWith('https://github.com/login/oauth/authorize?'), 'Expected GitHub authorization redirect')
  })

  await test('logout preserves an approved shared dashboard return path', async () => {
    resetFiles()
    configureGitHubEnv()
    process.env.CORS_ORIGIN = 'http://localhost:5174'
    const handler = getRouteHandler('get', '/logout')
    const res = makeRes()
    const returnTo = 'http://localhost:5174/dashboards/secret-token?view=detail#results'
    await handler(makeReq({
      query: { return_to: returnTo },
      headers: { host: 'localhost:3001' },
    }), res)
    assert(res.redirectedTo === returnTo, `Expected shared dashboard redirect, got ${res.redirectedTo}`)
  })

  await test('requireGitHubAuth returns login guidance when no session or token exists', () => {
    resetFiles()
    configureOtpEnv()
    const req = makeReq()
    const res = makeRes()
    let nextCalled = false
    requireGitHubAuth(req, res as any, () => { nextCalled = true })
    assert(!nextCalled, 'Expected auth middleware to block unauthenticated request')
    assert(res.statusCode === 401, 'Expected unauthorized status')
    assert(res.jsonBody?.message === 'Please log in', 'Expected OTP login guidance')
    assert(typeof res.jsonBody?.loginUrl === 'undefined', 'Expected no GitHub login URL in OTP mode')
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
