export const INTEGRATION_VALIDATION_UNAVAILABLE = 'Integration validation unavailable. Settings may be saved, but are not verified. Retry validation when the service is ready.'
export const INTEGRATION_VALIDATION_CSRF_REJECTED = 'Integration validation was blocked by the Dashboard\'s cross-origin protection (csrf_rejected): this page\'s address is not an allowed Dashboard origin. Open the Dashboard at its configured address (DASHBOARD_APP_URL / CORS_ORIGIN), or restart it with SYSTEM/start.sh, then retry. Settings may be saved, but are not verified.'

/** Errors whose message is safe and meaningful to show the user as-is. */
export class IntegrationValidationError extends Error {}

export async function readIntegrationValidationResponse(response: Response): Promise<Record<string, any>> {
  const unavailable = () => new IntegrationValidationError(INTEGRATION_VALIDATION_UNAVAILABLE)
  const isJson = response.headers.get('content-type')?.includes('application/json')
  if (response.status === 403 && isJson) {
    // Only the guard's error code is read; nothing from the response body is echoed to the user.
    const code = await response.json().then((body: unknown) => (body as { code?: unknown } | null)?.code, () => undefined)
    if (code === 'csrf_rejected') throw new IntegrationValidationError(INTEGRATION_VALIDATION_CSRF_REJECTED)
    throw unavailable()
  }
  if (!response.ok || !isJson) throw unavailable()
  let data: unknown
  try { data = await response.json() } catch { throw unavailable() }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw unavailable()
  const entries = Object.values(data)
  if (!entries.some(entry => entry && typeof entry === 'object' && 'status' in entry)) throw unavailable()
  return data as Record<string, any>
}
