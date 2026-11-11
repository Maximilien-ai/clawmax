/**
 * The workflow editor's quick check of a schedule; the server validates the cron expression fully.
 * `manual` is valid: the workflow runs only when started (templates, AI drafts and imports use it).
 */
export function workflowScheduleError(schedule: string): string | null {
  const trimmed = schedule.trim()
  if (!trimmed || trimmed === 'manual') return null
  const parts = trimmed.split(/\s+/)
  if (parts.length < 5 || parts.length > 6) return 'Cron expression must have 5 or 6 fields'
  if (!parts.every((part) => /^[0-9*,\-/]+$/.test(part))) return 'Invalid characters in cron expression'
  return null
}
