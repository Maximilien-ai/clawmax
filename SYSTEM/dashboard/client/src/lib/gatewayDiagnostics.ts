export interface GatewayDiagnosticsSignal {
  title: string
  detail: string
  hint: string
  severity: 'warning' | 'critical'
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle))
}

export function detectGatewayDiagnostics(logs: string[], status?: { code?: string; error?: string } | null): GatewayDiagnosticsSignal | null {
  const combined = `${logs.join('\n')}\n${status?.error || ''}`.toLowerCase()
  const hasTokenMismatch = includesAny(combined, ['token_mismatch', 'gateway token mismatch', 'reason=token_mismatch'])
  const hasConfigRestart = includesAny(combined, [
    'config change requires gateway restart',
    'received sigusr1; restarting',
    'config change detected; evaluating reload',
  ])
  const hasPortConflict = includesAny(combined, [
    'gateway already running',
    'port 18789 is already in use',
    'address already in use',
  ])
  const hasWebsocketDrop = includesAny(combined, [
    'websocket close 1006',
    'gateway connection closed',
    'connection closed before status completed',
  ])

  if ((hasConfigRestart && hasPortConflict) || (hasTokenMismatch && hasPortConflict)) {
    return {
      title: 'Gateway Restart Loop Detected',
      detail: 'The runtime is restarting the gateway while another process is still bound to the gateway port. Token mismatch is likely a follow-on symptom after the gateway bounce, not the primary fault.',
      hint: 'Treat this as runtime supervisor/process-management instability. Check sidecar restart logic, PID ownership, and port 18789 conflicts.',
      severity: 'critical',
    }
  }

  if (hasTokenMismatch && hasWebsocketDrop) {
    return {
      title: 'Gateway Session Drift Detected',
      detail: 'The dashboard is seeing token/session mismatch after the gateway connection drops. This usually means the runtime bounced or reloaded underneath an active session.',
      hint: 'Check runtime logs for gateway restart, config reload, or supervisor churn around the same timestamp.',
      severity: 'warning',
    }
  }

  if (hasConfigRestart) {
    return {
      title: 'Gateway Reload During Active Use',
      detail: 'The runtime is reloading gateway config while the dashboard is actively using the gateway.',
      hint: 'Check which process owns gateway field changes and whether the runtime is reloading too aggressively.',
      severity: 'warning',
    }
  }

  return null
}
