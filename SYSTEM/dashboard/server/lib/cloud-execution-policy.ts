// Pure policy shared with the browser. No environment, filesystem, or credentials.
export const CLOUD_LOCAL_EXECUTION_NOTICE = 'Cloud instances cannot access models or CLI tools on your computer. Use a hosted provider or a cloud-reachable OpenAI-compatible service.'
export const CLOUD_CLI_NOTICE = 'Local CLI runtimes are unavailable on cloud instances. Use model-provider API keys, or run ClawMax on-prem to use local CLIs.'

export function cloudModelEndpointError(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined
  try {
    const url = new URL(value.trim())
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return 'Use an HTTP(S) model-service URL without embedded credentials.'
    }
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || host === '0.0.0.0' || host.startsWith('127.') || host === '::' || host === '::1'
      || host.startsWith('::ffff:7f') || host === '::ffff:0:0'
      || host === 'host.containers.internal' || host === 'host.docker.internal') {
      return 'Cloud cannot reach a model on your computer through localhost or a local-machine address. Enter a cloud-reachable service URL.'
    }
  } catch {
    return 'Enter a valid HTTP(S) model-service URL that this cloud instance can reach.'
  }
  return undefined
}
