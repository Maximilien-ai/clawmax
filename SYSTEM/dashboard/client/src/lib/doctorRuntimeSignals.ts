import { detectLogRuntimeSignal, type LogRuntimeSignal } from './logRuntimeSignals'

export interface DoctorRuntimeSignalInput {
  message?: string
  platform?: {
    gatewayRecovery?: {
      message?: string
    }
    providerExecution?: {
      status?: 'configured' | 'partial' | 'missing'
      message?: string
    }
  }
  results?: Array<{
    checks?: Array<{
      message?: string
    }>
  }>
}

export function detectDoctorRuntimeSignal(input: DoctorRuntimeSignalInput | null | undefined): LogRuntimeSignal | null {
  if (!input) return null
  const providerExecution = input.platform?.providerExecution
  if (providerExecution?.status === 'missing' && typeof providerExecution.message === 'string' && providerExecution.message.trim()) {
    return {
      title: 'Shared Model Execution Path Missing',
      detail: providerExecution.message.trim(),
      hint: 'Configure at least one shared hosted provider credential or a local runtime path before relying on scheduled workflows or multi-agent execution in this runtime.',
      severity: 'critical',
    }
  }
  if (providerExecution?.status === 'partial' && typeof providerExecution.message === 'string' && providerExecution.message.trim()) {
    return {
      title: 'Shared Model Execution Path Needs Attention',
      detail: providerExecution.message.trim(),
      hint: 'This runtime has only a partial local/runtime execution path. Verify whether the configured local runtime is reachable or whether a shared provider credential is still required.',
      severity: 'warning',
    }
  }
  const messages: string[] = []

  if (typeof input.message === 'string' && input.message.trim()) {
    messages.push(input.message)
  }
  if (typeof input.platform?.gatewayRecovery?.message === 'string' && input.platform.gatewayRecovery.message.trim()) {
    messages.push(input.platform.gatewayRecovery.message)
  }
  for (const result of input.results || []) {
    for (const check of result.checks || []) {
      if (typeof check.message === 'string' && check.message.trim()) {
        messages.push(check.message)
      }
    }
  }

  if (messages.length === 0) return null
  return detectLogRuntimeSignal(messages, input.message || null)
}
