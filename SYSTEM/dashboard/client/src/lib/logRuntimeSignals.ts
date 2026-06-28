import { detectGatewayDiagnostics, type GatewayDiagnosticsSignal } from './gatewayDiagnostics'

export interface LogRuntimeSignal {
  title: string
  detail: string
  hint: string
  severity: 'warning' | 'critical'
}

export function detectLogRuntimeSignal(
  logs: string[],
  streamError?: string | null,
): LogRuntimeSignal | null {
  const gatewaySignal = detectGatewayDiagnostics(logs, streamError ? { error: streamError } : null) as GatewayDiagnosticsSignal | null
  if (gatewaySignal) return gatewaySignal

  const combined = logs.join('\n')
  if (combined.includes('missing dist/entry.(m)js')) {
    return {
      title: 'OpenClaw Runtime Build Missing',
      detail: 'The runtime image includes OpenClaw, but the built entrypoint files are missing.',
      hint: 'Rebuild the runtime image from the canonical Dockerfile so the pinned OpenClaw build stage produces the expected dist entrypoint files.',
      severity: 'critical',
    }
  }

  if (combined.includes('openclaw fixture')) {
    return {
      title: 'Fixture OpenClaw Runtime Detected',
      detail: 'This runtime is still using a fixture OpenClaw build instead of the real CLI/runtime.',
      hint: 'Replace the fixture runtime with the real pinned OpenClaw build before using this environment for normal operator workflows.',
      severity: 'warning',
    }
  }

  return null
}
