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
