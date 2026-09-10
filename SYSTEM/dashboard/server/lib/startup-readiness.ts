export type StartupReadinessCheck = {
  name: string
  read: () => unknown[] | Record<string, unknown> | null | undefined
}

export type StartupReadiness = {
  ready: true
  checkedAt: string
  stores: Record<string, number>
}

function countResult(result: unknown): number {
  if (Array.isArray(result)) return result.length
  if (result && typeof result === 'object') return Object.keys(result).length
  return 0
}

export function verifyCorePersistentStateReadable(checks: StartupReadinessCheck[]): StartupReadiness {
  const stores: Record<string, number> = {}
  for (const check of checks) {
    try {
      stores[check.name] = countResult(check.read())
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Required persistent store "${check.name}" is unreadable: ${detail}`)
    }
  }
  return { ready: true, checkedAt: new Date().toISOString(), stores }
}
