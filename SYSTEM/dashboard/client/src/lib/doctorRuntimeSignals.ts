import { detectLogRuntimeSignal, type LogRuntimeSignal } from './logRuntimeSignals'

export interface DoctorRuntimeSignalInput {
  message?: string
  platform?: {
    gatewayRecovery?: {
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
