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

/**
 * Whether this process is serving an unauthenticated dashboard on an address other than loopback.
 *
 * Auth bypass is intended for a dashboard only its own machine can reach. Nothing today ties the
 * two together: the bypass is decided from env alone, while the bind (and, in a container, the
 * published port) is decided elsewhere. The result observed in the field was a dashboard answering
 * unauthenticated API calls from any host on the local network, with agents running under
 * --dangerously-skip-permissions -- remote agent execution, not merely a read leak.
 *
 * A process inside a container cannot detect this itself: port forwarding NATs every caller, so a
 * request from the host and one from another machine look identical. This therefore warns rather
 * than blocks, and names the remediation, which is to publish the port on loopback.
 */
export function describeUnauthenticatedExposureRisk(env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!isDashboardAuthBypassAllowed(env)) return undefined
  const host = String(env.DASHBOARD_HOST || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')).trim()
  const loopbackOnly = host === '127.0.0.1' || host === 'localhost' || host === '::1'
  if (loopbackOnly) return undefined
  return [
    `Dashboard authentication is disabled and the server is bound to ${host}, not loopback.`,
    'Any host that can reach this port controls the agents, which execute with permission checks skipped.',
    'Publish the port on 127.0.0.1 (for example -p 127.0.0.1:3201:3001), or enable authentication.',
  ].join(' ')
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
