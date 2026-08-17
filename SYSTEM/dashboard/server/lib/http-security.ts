export function parseCorsOrigins(value: string | undefined, fallbackOrigin: string): string[] {
  return (value || fallbackOrigin)
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true
  return allowedOrigins.includes(origin.replace(/\/+$/, ''))
}


export function isDashboardAuthBypassAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const bypassRequested = env.BYPASS_OAUTH === 'true'
    || env.DASHBOARD_AUTH_DISABLED === 'true'
    || String(env.DASHBOARD_AUTH_MODE || '').trim().toLowerCase() === 'bypass'
  if (!bypassRequested) return false

  const deploymentKind = String(env.DASHBOARD_DEPLOYMENT_KIND || env.CLAWMAX_DEPLOYMENT_KIND || '')
    .trim()
    .toLowerCase()
  return deploymentKind !== 'cloud'
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

export function resolveDashboardBindHost(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn,
): string {
  const requested = String(
    env.DASHBOARD_HOST || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  ).trim() || '127.0.0.1'

  if (!isDashboardAuthBypassAllowed(env) || LOOPBACK_HOSTS.has(requested.toLowerCase())) {
    return requested
  }

  if (env.DASHBOARD_ALLOW_UNAUTHENTICATED_NETWORK_BIND === 'true') {
    warn('[SECURITY] Dashboard authentication is disabled on a network interface. Anything that can reach this port can run agents.')
    return requested
  }

  warn(`[SECURITY] Refusing to bind ${requested} with dashboard authentication disabled; using 127.0.0.1. Enable authentication or set DASHBOARD_ALLOW_UNAUTHENTICATED_NETWORK_BIND=true to accept the risk.`)
  return '127.0.0.1'
}

interface HeaderResponse {
  setHeader(name: string, value: string): unknown
}

export function applyDashboardSecurityHeaders(response: HeaderResponse, noStore = false): void {
  response.setHeader('Content-Security-Policy', "base-uri 'self'; frame-ancestors 'none'; object-src 'none'")
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  if (noStore) response.setHeader('Cache-Control', 'no-store')
}
