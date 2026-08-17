import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { API_AUTHORIZATION_MATRIX } from './api-authorization-matrix'
import { applyDashboardSecurityHeaders, isCorsOriginAllowed, isDashboardAuthBypassAllowed, parseCorsOrigins, resolveDashboardBindHost } from './http-security'
import { requireGitHubAuth } from './github-auth'

const indexSource = fs.readFileSync(path.resolve(__dirname, '..', 'index.ts'), 'utf8')

const protectedRouterMounts = [
  "app.use('/api/docs', protect, docsRouter)",
  "app.use('/api/agents', protect, agentsRouter)",
  "app.use('/api/agents', protect, chatRouter)",
  "app.use('/api/agents', protect, logsRouter)",
  "app.use('/api/templates', protect, templatesRouter)",
  "app.use('/api/template-registry', protect, templateRegistryRouter)",
  "app.use('/api/activity-export', protect, activityExportRouter)",
  "app.use('/api/skills', protect, skillsRouter)",
  "app.use('/api/skill-secret-broker', protect, skillSecretBrokerRouter)",
  "app.use('/api/mail/oauth', protect, mailOAuthRouter)",
  "app.use('/api/workflows', protect, workflowsRouter)",
  "app.use('/api/ai', protect, aiRouter)",
  "app.use('/api/ai-builder', protect, aiBuilderRouter)",
  "app.use('/api/workspace-dashboards', protect, workspaceDashboardsRouter)",
  "app.use('/api/workspaces', protect, workspacesRouter)",
  "app.use('/api/notifications', protect, notificationsRouter)",
  "app.use('/api/integrations', protect, integrationsRouter)",
  "app.use('/api/plugins', protect, pluginsRouter)",
  "app.use('/api/teams', protect, teamsRouter)",
  "app.use('/api', protect, channelsRouter)",
]

for (const mount of protectedRouterMounts) {
  assert(indexSource.includes(mount), `Expected authenticated router mount: ${mount}`)
}

assert(indexSource.includes("app.use('/api/runtime/skill-broker', skillSecretBrokerRuntimeRouter)"))
assert(indexSource.includes("app.use('/api/runtime/mail', createMailRuntimeRouter())"))
assert(!indexSource.includes("app.use('/api/workspace-dashboards', workspaceDashboardsRouter)"), 'Workspace dashboard payloads must not be mounted without authentication')
assert(!indexSource.includes('origin: true'), 'Credentialed CORS must never reflect arbitrary origins')
assert(indexSource.includes("app.disable('x-powered-by')"), 'Express framework disclosure must be disabled')
assert(!indexSource.includes("removeHeader('X-Content-Type-Options')"), 'Static responses must retain nosniff protection')

const matrixKeys = API_AUTHORIZATION_MATRIX.map((entry) => `${entry.methods} ${entry.path}`)
assert.equal(new Set(matrixKeys).size, matrixKeys.length, 'Authorization matrix entries must be unique')
assert(API_AUTHORIZATION_MATRIX.every((entry) => entry.scope.trim()), 'Every authorization entry must state its scope')
assert(API_AUTHORIZATION_MATRIX.some((entry) => entry.authorization === 'capability'))
assert(API_AUTHORIZATION_MATRIX.some((entry) => entry.path === '/api/workspace-dashboards/:token' && entry.authorization === 'dashboard-auth'))

const origins = parseCorsOrigins(' https://dashboard.example.com/, http://localhost:5173 ', 'http://unused')
assert.deepEqual(origins, ['https://dashboard.example.com', 'http://localhost:5173'])
assert(isCorsOriginAllowed(undefined, origins), 'Non-browser requests without Origin must remain allowed')
assert(isCorsOriginAllowed('https://dashboard.example.com', origins), 'Configured browser origin must be allowed')
assert(!isCorsOriginAllowed('https://attacker.example', origins), 'Unconfigured browser origin must be denied')

assert(isDashboardAuthBypassAllowed({ BYPASS_OAUTH: 'true', DASHBOARD_DEPLOYMENT_KIND: 'onprem' } as NodeJS.ProcessEnv))
assert(!isDashboardAuthBypassAllowed({ BYPASS_OAUTH: 'true', DASHBOARD_DEPLOYMENT_KIND: 'cloud' } as NodeJS.ProcessEnv))

const bindWarnings: string[] = []
assert.equal(resolveDashboardBindHost({ NODE_ENV: 'production' } as NodeJS.ProcessEnv), '0.0.0.0')
assert.equal(resolveDashboardBindHost({ NODE_ENV: 'production', BYPASS_OAUTH: 'true' } as NodeJS.ProcessEnv, warning => bindWarnings.push(warning)), '127.0.0.1')
assert(bindWarnings[0]?.includes('Refusing to bind 0.0.0.0'), 'Unsafe unauthenticated production bind must fail closed with an actionable warning')
assert.equal(resolveDashboardBindHost({ DASHBOARD_HOST: '::1', BYPASS_OAUTH: 'true' } as NodeJS.ProcessEnv), '::1')
assert.equal(resolveDashboardBindHost({
  NODE_ENV: 'production',
  BYPASS_OAUTH: 'true',
  DASHBOARD_ALLOW_UNAUTHENTICATED_NETWORK_BIND: 'true',
} as NodeJS.ProcessEnv, warning => bindWarnings.push(warning)), '0.0.0.0')
assert(bindWarnings[1]?.includes('Anything that can reach this port can run agents'), 'Explicit unsafe override must emit a security warning')

assert(indexSource.includes('const HOST = resolveDashboardBindHost(process.env)'), 'Server bind selection must account for authentication bypass')
const composeSource = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'docker-compose.yml'), 'utf8')
assert(composeSource.includes('${DASHBOARD_BIND_ADDRESS:-127.0.0.1}:${DASHBOARD_PORT:-3001}:3001'), 'Compose must publish the dashboard on host loopback by default')

const securityHeaders: Record<string, string> = {}
applyDashboardSecurityHeaders({
  setHeader(name: string, value: string) { securityHeaders[name] = value },
}, true)
assert.equal(securityHeaders['X-Content-Type-Options'], 'nosniff')
assert.equal(securityHeaders['X-Frame-Options'], 'DENY')
assert.equal(securityHeaders['Referrer-Policy'], 'no-referrer')
assert.equal(securityHeaders['Cache-Control'], 'no-store')
assert(securityHeaders['Content-Security-Policy'].includes("frame-ancestors 'none'"))

const originalEnv = { ...process.env }
try {
  process.env.BYPASS_OAUTH = 'true'
  process.env.DASHBOARD_DEPLOYMENT_KIND = 'cloud'
  delete process.env.DASHBOARD_AUTH_DISABLED
  delete process.env.DASHBOARD_AUTH_MODE
  let nextCalled = false
  const response = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this },
    json(body: any) { this.body = body; return this },
  }
  requireGitHubAuth({ headers: {}, cookies: {} } as any, response as any, () => { nextCalled = true })
  assert(!nextCalled, 'Managed cloud must reject local auth bypass flags')
  assert.equal(response.statusCode, 401)
} finally {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key]
  }
  Object.assign(process.env, originalEnv)
}

console.log('security-boundaries.test.ts: 52 tests passed')
