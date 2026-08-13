export const MAX_DASHBOARD_INTERACTION_MESSAGE_LENGTH = 4000
export const DASHBOARD_INTERACTION_WINDOW_MS = 60_000
export const DASHBOARD_INTERACTION_LIMIT = 10

export interface DashboardInteractionAttempt {
  at: number
}

export function validateDashboardInteractionMessage(message: string): string | null {
  const trimmed = message.trim()
  if (!trimmed) return 'Enter a message before sending.'
  if (trimmed.length > MAX_DASHBOARD_INTERACTION_MESSAGE_LENGTH) {
    return `Messages are limited to ${MAX_DASHBOARD_INTERACTION_MESSAGE_LENGTH.toLocaleString()} characters.`
  }
  return null
}

export function canSendDashboardInteraction(
  attempts: DashboardInteractionAttempt[],
  now = Date.now(),
): boolean {
  const recent = attempts.filter((attempt) => now - attempt.at < DASHBOARD_INTERACTION_WINDOW_MS)
  return recent.length < DASHBOARD_INTERACTION_LIMIT
}

export function pruneDashboardInteractionAttempts(
  attempts: DashboardInteractionAttempt[],
  now = Date.now(),
): DashboardInteractionAttempt[] {
  return attempts.filter((attempt) => now - attempt.at < DASHBOARD_INTERACTION_WINDOW_MS)
}
