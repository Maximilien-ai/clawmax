/**
 * The origins SYSTEM/start.sh resolves must win over .env, keep explicit configuration, and make
 * the CSRF guard and OAuth redirects trust exactly the resulting origins.
 *
 * Run with: npx ts-node --transpileOnly server/lib/dashboard-origin-precedence.test.ts
 */
import assert from 'assert'
import { execFileSync } from 'child_process'
import dotenv from 'dotenv'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Request, Response } from 'express'
import { getDashboardRuntimeEnvOverrides } from './dashboard-env'
import { createAuthRouter } from './github-auth'
import { browserMutationGuard, dashboardCorsOrigins } from './http-security'

// The real start.sh lines that resolve the origins, run as-is against a fixture .env.
const startSh = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'start.sh'), 'utf8')
function startShSource(pattern: RegExp): string {
  const match = startSh.match(pattern)
  assert(match, `start.sh must contain ${pattern}`)
  return match[0]
}
const originResolution = [
  startShSource(/^FRONTEND_PORT=.*$/m),
  startShSource(/^FRONTEND_ORIGIN=.*$/m),
  ...['read_dotenv_var', 'append_delimited_value', 'resolve_dashboard_origins']
    .map(name => startShSource(new RegExp(`^${name}\\(\\) \\{$[\\s\\S]*?^\\}$`, 'm'))),
  startShSource(/^resolve_dashboard_origins .*$/m),
].join('\n')

/** The environment the API ends up with after `start.sh` with this .env and shell. */
function launch(dotEnv: string, shell: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-origins-'))
  try {
    fs.writeFileSync(path.join(dir, '.env'), dotEnv)
    const out = execFileSync('bash', ['-c', `${originResolution}\nprintf '%s\\n%s' "$DASHBOARD_APP_URL" "$CORS_ORIGIN"`], {
      cwd: dir, env: { PATH: process.env.PATH, ...shell }, encoding: 'utf8',
    })
    const [DASHBOARD_APP_URL, CORS_ORIGIN] = out.split('\n')
    // dashboard-env's load order: .env with override, then the launcher's runtime override keys.
    return { ...dotenv.parse(dotEnv), ...getDashboardRuntimeEnvOverrides({ ...shell, DASHBOARD_APP_URL, CORS_ORIGIN }) }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/** A browser POST as it reaches the API through Vite's proxy (changeOrigin rewrites Host). */
function guardAllows(env: NodeJS.ProcessEnv, origin: string): boolean {
  const headers: Record<string, string> = { origin, host: '127.0.0.1:3001', cookie: 'session=synthetic' }
  const req = { method: 'POST', protocol: 'http', get: (name: string) => headers[name.toLowerCase()] } as unknown as Request
  let status = 200
  let body: unknown
  const res = { status(code: number) { status = code; return this }, json(value: unknown) { body = value; return this } } as unknown as Response
  let passed = false
  browserMutationGuard(dashboardCorsOrigins(env))(req, res, () => { passed = true })
  if (!passed) assert.deepEqual([status, (body as { code?: string } | undefined)?.code], [403, 'csrf_rejected'])
  return passed
}

/** Where GET /api/auth/logout sends the browser for this return_to. */
const logoutLayer = (createAuthRouter() as any).stack.find((layer: any) => layer.route?.path === '/logout' && layer.route.methods.get)
function logoutRedirect(env: NodeJS.ProcessEnv, returnTo: string): string {
  const keys = ['DASHBOARD_APP_URL', 'CORS_ORIGIN'] as const
  const saved = keys.map(key => process.env[key])
  const apply = (values: (string | undefined)[]) => keys.forEach((key, i) => {
    if (values[i] === undefined) delete process.env[key]
    else process.env[key] = values[i]
  })
  apply(keys.map(key => env[key]))
  try {
    let redirectedTo = ''
    const res = { clearCookie() { return this }, redirect(url: string) { redirectedTo = url } }
    logoutLayer.route.stack[0].handle({ query: { return_to: returnTo }, headers: { host: 'localhost:3001' }, cookies: {} }, res)
    return redirectedTo
  } finally {
    apply(saved)
  }
}

const unauthorized = ['https://evil.example', 'http://evil.example', 'null', 'http://localhost:5173.evil.example', 'http://localhost:5199']

/** The served origin passes, every unauthorized origin is rejected, OAuth follows the same trust. */
function assertTrust(env: NodeJS.ProcessEnv, trusted: string[], label: string) {
  assert.deepEqual(dashboardCorsOrigins(env), trusted, `${label}: allowed origins`)
  for (const origin of trusted) {
    assert(guardAllows(env, origin), `${label}: ${origin} must pass the guard`)
    assert.equal(logoutRedirect(env, `${origin}/dashboards/a?view=detail`), `${origin}/dashboards/a?view=detail`, `${label}: return to ${origin}`)
  }
  for (const bad of unauthorized.filter(origin => !trusted.includes(origin))) {
    assert(!guardAllows(env, bad), `${label}: ${bad} must be rejected`)
    if (bad !== 'null') assert.equal(logoutRedirect(env, `${bad}/phish`), new URL(env.DASHBOARD_APP_URL || '').href, `${label}: ${bad} falls back to the app URL`)
  }
}

// The .env RC94 checkouts ship with: written for the default port, kept after the launcher moved.
const staleDotEnv = 'CORS_ORIGIN=http://localhost:5173\nDASHBOARD_APP_URL=http://localhost:5173\n'

for (const port of [5173, 5174, 5180]) {
  const served = `http://localhost:${port}`
  // The origin start.sh serves is always trusted; the explicit .env origin stays trusted too.
  const env = launch(staleDotEnv, { DASHBOARD_CLIENT_PORT: String(port) })
  assert.equal(env.DASHBOARD_APP_URL, 'http://localhost:5173', `explicit .env app URL kept for ${port}`)
  assertTrust(env, [...new Set(['http://localhost:5173', served])], `stale .env, port ${port}`)
  // Without a .env the launcher's derived origin is the whole boundary.
  const clean = launch('', { DASHBOARD_CLIENT_PORT: String(port) })
  assert.equal(clean.DASHBOARD_APP_URL, served)
  assertTrust(clean, [served], `no .env, port ${port}`)
  if (port !== 5173) assert(!guardAllows(clean, 'http://localhost:5173'), `5173 is not trusted for ${port} without .env`)
}
// The default port with no DASHBOARD_CLIENT_PORT at all.
assertTrust(launch('', {}), ['http://localhost:5173'], 'defaults')

// ngrok: the public URL configured in .env keeps working, alongside the served local origin.
const ngrokDotEnv = 'NGROK_URL=demo.ngrok.dev\nCORS_ORIGIN=https://demo.ngrok.dev,http://localhost:5173\nDASHBOARD_APP_URL=https://demo.ngrok.dev\n'
const ngrok = launch(ngrokDotEnv, { DASHBOARD_CLIENT_PORT: '5174' })
assert.equal(ngrok.DASHBOARD_APP_URL, 'https://demo.ngrok.dev')
assertTrust(ngrok, ['https://demo.ngrok.dev', 'http://localhost:5173', 'http://localhost:5174'], 'ngrok')
// A .env app URL without CORS_ORIGIN keeps the API's own fallback (the app URL) trusted.
assertTrust(launch('DASHBOARD_APP_URL=https://demo.ngrok.dev\n', {}), ['https://demo.ngrok.dev', 'http://localhost:5173'], 'ngrok app URL only')

// Explicit shell configuration wins exactly as given, over .env and the derived origin.
const deployment = launch(staleDotEnv, {
  DASHBOARD_CLIENT_PORT: '5174',
  DASHBOARD_APP_URL: 'https://dashboard.example.com',
  CORS_ORIGIN: 'https://dashboard.example.com, https://ops.example.com/',
})
assert.equal(deployment.DASHBOARD_APP_URL, 'https://dashboard.example.com')
assertTrust(deployment, ['https://dashboard.example.com', 'https://ops.example.com'], 'shell CORS_ORIGIN')
assert(!guardAllows(deployment, 'http://localhost:5174') && !guardAllows(deployment, 'http://localhost:5173'), 'shell CORS_ORIGIN is not widened')
// A shell app URL alone (as SYSTEM/local-dev.mjs sets it) replaces the .env app URL.
const shellAppUrl = launch(staleDotEnv, { DASHBOARD_CLIENT_PORT: '5174', DASHBOARD_APP_URL: 'http://localhost:5174' })
assert.equal(shellAppUrl.DASHBOARD_APP_URL, 'http://localhost:5174')
assertTrust(shellAppUrl, ['http://localhost:5173', 'http://localhost:5174'], 'shell app URL')

// A remote app URL from the shell, without CORS_ORIGIN, does not also trust the local port.
const remoteAppUrl = launch('', { DASHBOARD_CLIENT_PORT: '5174', DASHBOARD_APP_URL: 'https://dashboard.example.com' })
assertTrust(remoteAppUrl, ['https://dashboard.example.com'], 'shell remote app URL')
assert(!guardAllows(remoteAppUrl, 'http://localhost:5174'), 'a shell app URL is not widened to the local port')

// No launcher at all (e.g. `npm run dev` directly): .env stays authoritative.
const noLauncher = { ...dotenv.parse(staleDotEnv), ...getDashboardRuntimeEnvOverrides({ CORS_ORIGIN: '  ' }) }
assertTrust(noLauncher, ['http://localhost:5173'], 'no launcher')

// The real module applies the precedence at load time, whatever the local .env contains.
const loaded = execFileSync(process.execPath, [
  '-r', 'ts-node/register/transpile-only', '-e',
  "require('./server/lib/dashboard-env'); console.log('ORIGINS=' + JSON.stringify([process.env.DASHBOARD_APP_URL, process.env.CORS_ORIGIN]))",
], {
  cwd: path.resolve(__dirname, '..', '..'),
  env: { ...process.env, DASHBOARD_APP_URL: 'http://localhost:5180', CORS_ORIGIN: 'http://localhost:5180' },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
})
assert.deepEqual(JSON.parse(loaded.split('\n').find(line => line.startsWith('ORIGINS='))?.slice('ORIGINS='.length) || 'null'), ['http://localhost:5180', 'http://localhost:5180'])

console.log('Dashboard origin precedence tests passed')
