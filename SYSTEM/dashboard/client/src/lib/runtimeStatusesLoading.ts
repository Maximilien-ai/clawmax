export type RuntimeStatusesViewState = 'loading' | 'error' | 'ready'

/**
 * Single source of truth for what the ByokWizard Runtime step should render.
 * 'loading' takes priority while the initial fetch is in flight; 'error' only
 * applies once loading has finished and produced neither statuses nor a
 * successful empty result (i.e. the fetch actually failed); otherwise 'ready'
 * (which also covers a legitimately empty, successfully-fetched list).
 */
export function describeRuntimeStatusesViewState(input: {
  loading: boolean
  statusesCount: number
  error: string | null
}): RuntimeStatusesViewState {
  if (input.loading && input.statusesCount === 0) return 'loading'
  if (!input.loading && input.statusesCount === 0 && input.error) return 'error'
  return 'ready'
}

/**
 * Human-readable message for a failed GET /api/integrations/runtimes call.
 * `status` is the HTTP status code when the server responded but with a
 * non-ok status, or null/undefined when the request itself failed (network
 * error, thrown exception, etc.).
 */
export function describeRuntimeStatusesFetchError(status?: number | null): string {
  if (typeof status === 'number') {
    return `Could not detect installed runtimes (server responded HTTP ${status}). Check the server logs and retry.`
  }
  return 'Could not detect installed runtimes. Check your network connection and retry.'
}
