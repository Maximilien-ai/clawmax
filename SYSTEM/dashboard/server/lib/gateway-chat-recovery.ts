interface Attempt {
  rawError: string
  completionText: string
  hadVisibleOutput: boolean
  persistedAssistant: unknown
  incompleteReason?: string
  exitCode?: number | null
}

export function isRejectedGatewayChat(result: Attempt): boolean {
  // OpenClaw 2026.9.5 asserts request-entry lifetime before invoking the agent
  // handler, then releases the entry. Only this exact pre-dispatch rejection
  // proves that replay cannot duplicate a started agent task.
  return result.exitCode === 1
    && /^(?:Error:\s*)?Gateway request entry is closed$/.test(result.rawError.trim())
    && !result.hadVisibleOutput && !result.completionText.trim()
    && !result.persistedAssistant && !result.incompleteReason
}

export async function recoverRejectedGatewayChat<T extends Attempt>(first: T, options: {
  usedGateway: boolean
  signal: AbortSignal
  waitUntilReady: () => Promise<boolean>
  assertCurrentAuthority: () => void
  retry: () => Promise<T>
}): Promise<T> {
  if (!options.usedGateway || options.signal.aborted || !isRejectedGatewayChat(first)) return first
  if (!await options.waitUntilReady() || options.signal.aborted) return first
  options.assertCurrentAuthority()
  // Deliberately one retry, with the same model/session and within the original
  // serialized turn. Never recurse or retry timeouts, disconnects or partial runs.
  return options.retry()
}
