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
