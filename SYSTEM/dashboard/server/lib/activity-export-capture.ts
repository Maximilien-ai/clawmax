import { appendActivityExportEventsForActiveConsents, type ActivityExportEventInput } from './activity-export'

/** Optional activity capture must never fail the user's chat or Builder request. */
export function captureConsentedActivity(
  input: ActivityExportEventInput,
  enqueue = appendActivityExportEventsForActiveConsents,
) {
  try {
    return enqueue(input)
  } catch {
    // Never print prompt text, receiver configuration, or arbitrary error details.
    console.warn('[Activity Export] Could not queue consented activity; request continues.')
    return []
  }
}
