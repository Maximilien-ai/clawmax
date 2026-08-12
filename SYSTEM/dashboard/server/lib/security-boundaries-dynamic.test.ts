import assert from 'assert'
import http from 'http'
import express from 'express'
import cors from 'cors'
import { requireGitHubAuth } from './github-auth'
import { applyDashboardSecurityHeaders, isCorsOriginAllowed } from './http-security'

const originalEnv = { ...process.env }

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
  app.get('/api/protected', requireGitHubAuth, (_req, res) => res.json({ ok: true }))

  const server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
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

  console.log('security-boundaries-dynamic.test.ts: 14 tests passed')
  process.exit(0)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
