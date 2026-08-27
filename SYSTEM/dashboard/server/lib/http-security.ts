import fs from 'fs'

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

/** Files every common container runtime drops into the filesystem root. */
const CONTAINER_MARKER_FILES = ['/.dockerenv', '/run/.containerenv']

/**
 * Whether this container shares the host's network stack (`--network=host`, K8s `hostNetwork`).
 *
 * This is the case that makes "containerized" alone unsafe to act on: with host networking there is
 * no separate namespace and no port forwarding, so binding 0.0.0.0 in here IS binding the host's
 * LAN interface. The reasoning that makes a bridged container safe -- exposure is decided by how the
 * port is published -- does not hold, because nothing is being published at all.
 *
 * Detected by looking for a real NIC. A bridged container sees only a veth pair, which has no
 * backing device; with host networking it sees the host's physical interfaces, which do. Verified
 * on this deployment: bridged reports eth0 with no `device` link, `--network=host` reports eth0 with
 * one.
 */
export function isHostNetworkContainer(
  listInterfaces: () => string[] = () => { try { return fs.readdirSync('/sys/class/net') } catch { return [] } },
  hasBackingDevice: (iface: string) => boolean = (iface) => fs.existsSync(`/sys/class/net/${iface}/device`),
): boolean {
  return listInterfaces().filter((iface) => iface !== 'lo').some(hasBackingDevice)
}

/**
 * Whether this process is running inside a container.
 *
 * The marker check is injectable so tests state the answer they mean. Reading the real filesystem
 * by default would make every bind-host assertion depend on where the suite happens to run, and CI
 * frequently runs in a container -- the tests would then assert the opposite of what they say.
 */
export function isContainerRuntime(
  env: NodeJS.ProcessEnv = process.env,
  markerExists: (path: string) => boolean = (candidate) => fs.existsSync(candidate),
): boolean {
  // podman sets container=podman; some runtimes set container=oci/lxc. Any value means containerized.
  if (String(env.container || '').trim()) return true
  return CONTAINER_MARKER_FILES.some(markerExists)
}

export function resolveDashboardBindHost(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = console.warn,
  inContainer: (env: NodeJS.ProcessEnv) => boolean = isContainerRuntime,
  onHostNetwork: () => boolean = isHostNetworkContainer,
): string {
  const requested = String(
    env.DASHBOARD_HOST || (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  ).trim() || '127.0.0.1'

  if (!isDashboardAuthBypassAllowed(env) || LOOPBACK_HOSTS.has(requested.toLowerCase())) {
    return requested
  }

  // A container cannot protect itself by binding loopback, and trying to takes it offline.
  //
  // Publishing a port forwards traffic into this process's own network namespace, so a server bound
  // to 127.0.0.1 in here is reachable only from inside the container -- the forwarder cannot connect
  // and the published port is dead. The network exposure comes from HOW the port is published
  // (`-p 3001:3001` versus `-p 127.0.0.1:3001:3001`), which is decided outside this process and is
  // invisible to it. Refusing to bind therefore closes nothing and breaks everything: the dashboard
  // starts cleanly, logs that it is running, and never answers.
  // ...but only when the container actually has its own network namespace. With host networking
  // there is no forwarding and nothing is published: 0.0.0.0 in here is the host's LAN interface,
  // so the reasoning above inverts and this must fail closed like any other host process.
  if (inContainer(env) && !onHostNetwork()) {
    warn('[SECURITY] Dashboard authentication is disabled. Publish this port on loopback only '
      + '(for example -p 127.0.0.1:3001:3001) — anything that can reach it can run agents.')
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
