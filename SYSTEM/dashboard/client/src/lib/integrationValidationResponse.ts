export async function readIntegrationValidationResponse(response: Response): Promise<Record<string, any>> {
  const unavailable = () => new Error('Integration validation unavailable. Settings may be saved, but are not verified. Retry validation when the service is ready.')
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw unavailable()
  let data: unknown
  try { data = await response.json() } catch { throw unavailable() }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw unavailable()
  const entries = Object.values(data)
  if (!entries.some(entry => entry && typeof entry === 'object' && 'status' in entry)) throw unavailable()
  return data as Record<string, any>
}
