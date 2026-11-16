import nodeAssert from 'assert'
import http from 'http'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { requireGitHubAuth } from './github-auth'
import { browserMutationGuard, applyDashboardSecurityHeaders, dashboardCorsOrigins, isCorsOriginAllowed } from './http-security'

const originalEnv = { ...process.env }
let assertionsRun = 0
const assert = Object.assign(
  (value: unknown, message?: string | Error) => { assertionsRun++; nodeAssert(value, message) },
  {
    equal: (a: unknown, b: unknown, message?: string) => { assertionsRun++; nodeAssert.equal(a, b, message) },
    deepEqual: (a: unknown, b: unknown, message?: string) => { assertionsRun++; nodeAssert.deepEqual(a, b, message) },
  },
)

assert.deepEqual(dashboardCorsOrigins({ DASHBOARD_APP_URL: 'http://localhost:5174' }), ['http://localhost:5174'])
assert.deepEqual(dashboardCorsOrigins({ DASHBOARD_APP_URL: 'http://localhost:5174', CORS_ORIGIN: 'https://dashboard.example.com' }), ['https://dashboard.example.com'])
assert.deepEqual(dashboardCorsOrigins({}), ['http://localhost:5173'])

async function run() {
  process.env.DASHBOARD_DEPLOYMENT_KIND = 'cloud'
  process.env.BYPASS_OAUTH = 'true'
  delete process.env.DASHBOARD_AUTH_DISABLED
  delete process.env.DASHBOARD_AUTH_MODE

  const allowedOrigins = ['https://dashboard.example.com']
  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    applyDashboardSecurityHeaders(res, req.path.startsWith('/api/'))
    next()
  })
  app.use(cors({
    origin: (origin, callback) => callback(null, isCorsOriginAllowed(origin, allowedOrigins)),
    credentials: true,
  }))
  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.use(cookieParser())
  app.use('/api', browserMutationGuard(allowedOrigins))
  let mutations = 0
  app.all('/api/mutation-fixture', (_req, res) => { mutations++; res.json({ ok: true }) })
  app.get('/api/protected', requireGitHubAuth, (_req, res) => res.json({ ok: true }))
  app.get('/api/workspace-dashboards/test-token', requireGitHubAuth, (_req, res) => res.json({ ok: true }))

  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server has no TCP address')
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    const forgedHeaders: Array<Record<string, string>> = [
      { Origin: 'https://attacker.example', Cookie: 'session=fixture' }, { Cookie: 'session=fixture' },
      { Origin: 'http://attacker.example', Host: 'attacker.example', Cookie: 'session=fixture' },
      { Referer: 'http://attacker.example/form', Host: 'attacker.example', Cookie: 'session=fixture' },
      { Origin: 'https://attacker.example', Host: 'attacker.example', 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'attacker.example', Cookie: 'session=fixture' },
      { Origin: 'null', Cookie: 'session=fixture' },
      { Origin: 'https://dashboard.example.com.attacker.example', Cookie: 'session=fixture' },
      { Origin: 'https://dashboard.example.com@attacker.example', Cookie: 'session=fixture' },
      { Origin: 'https://attacker.example', Referer: 'https://dashboard.example.com/page', Cookie: 'session=fixture' },
      { Referer: 'https://attacker.example/page', Cookie: 'session=fixture' },
      { 'Sec-Fetch-Site': 'cross-site', Cookie: 'session=fixture' },
      { 'Sec-Fetch-Site': 'same-site', Cookie: 'session=fixture' },
    ]
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const headers of forgedHeaders) {
        const denied = await fetch(`${baseUrl}/api/mutation-fixture`, { method, headers })
        assert.equal(denied.status, 403)
        assert.equal(mutations, 0, 'Denied browser request must never execute')
      }
    }
    const trusted = await fetch(`${baseUrl}/api/mutation-fixture`, { method: 'POST', headers: { Origin: 'https://dashboard.example.com', Cookie: 'session=fixture' } })
    assert.equal(trusted.status, 200)
    const cli = await fetch(`${baseUrl}/api/mutation-fixture`, { method: 'POST' })
    assert.equal(cli.status, 200)
    assert.equal(mutations, 2)
    const loopback = await fetch(`${baseUrl}/api/mutation-fixture`, { method: 'POST', headers: { Origin: baseUrl, Cookie: 'session=fixture' } })
    assert.equal(loopback.status, 200, 'Literal loopback deployments remain usable without trusting arbitrary Host names')
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const before = mutations
      const allowed = await fetch(`${baseUrl}/api/mutation-fixture`, { method, headers: { Origin: allowedOrigins[0], Cookie: 'session=fixture' } })
      assert.equal(allowed.status, 200)
      assert.equal(mutations, before + 1, 'Trusted cookie-bearing mutations remain usable')
      const referer = await fetch(`${baseUrl}/api/mutation-fixture`, { method, headers: { Referer: `${allowedOrigins[0]}/page`, Cookie: 'session=fixture' } })
      assert.equal(referer.status, 200)
      assert.equal(mutations, before + 2, 'Trusted Referer fallback remains usable')
    }
    const publicResponse = await fetch(`${baseUrl}/api/health`)
    assert.equal(publicResponse.status, 200, 'Public health request should succeed')
    assert.equal(publicResponse.headers.get('x-powered-by'), null)
    assert.equal(publicResponse.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(publicResponse.headers.get('x-frame-options'), 'DENY')
    assert.equal(publicResponse.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(publicResponse.headers.get('cache-control'), 'no-store')
    assert(publicResponse.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"))

    const protectedResponse = await fetch(`${baseUrl}/api/protected`)
    assert.equal(protectedResponse.status, 401, 'Cloud bypass flag must not authorize protected request')

    const sharedDashboardResponse = await fetch(`${baseUrl}/api/workspace-dashboards/test-token`)
    assert.equal(sharedDashboardResponse.status, 401, 'Workspace dashboard tokens must not bypass dashboard authentication')

    const allowedCors = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://dashboard.example.com' },
    })
    assert.equal(allowedCors.headers.get('access-control-allow-origin'), 'https://dashboard.example.com')
    assert.equal(allowedCors.headers.get('access-control-allow-credentials'), 'true')

    const deniedCors = await fetch(`${baseUrl}/api/health`, {
      headers: { Origin: 'https://attacker.example' },
    })
    assert.equal(deniedCors.status, 200, 'CORS must not change non-browser HTTP semantics')
    assert.equal(deniedCors.headers.get('access-control-allow-origin'), null, 'Unknown origin must not receive CORS permission')
    assert.equal(deniedCors.headers.get('access-control-allow-credentials'), null, 'Unknown origin must not receive credential permission')
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  }

  console.log(`security-boundaries-dynamic.test.ts: ${assertionsRun} tests passed`)
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
