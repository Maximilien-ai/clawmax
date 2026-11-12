import { getDashboardDeploymentKind, getDashboardEnvRaw } from './dashboard-env'

export class ModelEndpointPolicyError extends Error {}

/** Request bodies may select a model endpoint only from operator-trusted
 * origins. Construct the destination origin from configuration, never from
 * the request, and never follow redirects carrying provider credentials. */
export function modelDiscoveryEndpoint(value: string, suffix: '/models' | '/api/tags'): string {
  let requested: URL
  try { requested = new URL(value) } catch { throw new ModelEndpointPolicyError('Enter a valid HTTP(S) model-service URL.') }
  if (!['http:', 'https:'].includes(requested.protocol) || requested.username || requested.password || requested.search || requested.hash) {
    throw new ModelEndpointPolicyError('Model-service URLs must use HTTP(S), without credentials, query parameters or fragments.')
  }
  if (requested.hostname.startsWith('169.254.') || ['metadata.google.internal', '100.100.100.200', '[fd00:ec2::254]'].includes(requested.hostname)) {
    throw new ModelEndpointPolicyError('Cloud metadata endpoints cannot be used as model services.')
  }
  const raw = getDashboardEnvRaw()
  const candidates = [
    ...(raw.CLAWMAX_MODEL_ENDPOINT_ORIGINS || process.env.CLAWMAX_MODEL_ENDPOINT_ORIGINS || '').split(','),
    raw.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL,
    raw.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL,
    raw.SYSTEM_OPENAI_COMPATIBLE_BASE_URL || process.env.SYSTEM_OPENAI_COMPATIBLE_BASE_URL,
    raw.USER_OPENAI_COMPATIBLE_BASE_URL || process.env.USER_OPENAI_COMPATIBLE_BASE_URL,
  ].filter((entry): entry is string => Boolean(entry?.trim()))
  if (getDashboardDeploymentKind() !== 'cloud') {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'host.containers.internal', 'host.docker.internal']) {
      for (const port of [11434, 1234]) candidates.push(`http://${host}:${port}`)
    }
  }
  const origins = candidates.flatMap(candidate => {
    try {
      const url = new URL(candidate.trim())
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? [url.origin] : []
    } catch { return [] }
  })
  const approvedOrigin = origins.find(origin => origin === requested.origin)
  if (!approvedOrigin) throw new ModelEndpointPolicyError('This model-service origin is not enabled. Ask the operator to add it to CLAWMAX_MODEL_ENDPOINT_ORIGINS, or configure the service base URL on the server.')
  // URL.pathname cannot replace the trusted origin, including a leading //.
  const endpoint = new URL(approvedOrigin)
  let end = requested.pathname.length
  while (end > 0 && requested.pathname[end - 1] === '/') end--
  endpoint.pathname = `${requested.pathname.slice(0, end)}${suffix}`
  return endpoint.href
}
