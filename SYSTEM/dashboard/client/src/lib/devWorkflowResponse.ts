/** A dev run can be admitted before a proxy disconnects. Never surface the
 * browser's raw JSON parser error or imply an empty response means no run. */
export async function readDevWorkflowResponse(response: Pick<Response, 'text' | 'status'>): Promise<Record<string, any>> {
  const body = await response.text()
  let parsed: unknown
  try { parsed = JSON.parse(body) } catch { parsed = null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Workflow service response unavailable (HTTP ${response.status}). Check Executions before retrying.`)
  }
  return parsed as Record<string, any>
}

export function devWorkflowErrorMessage(error: unknown): string {
  if (error instanceof TypeError) return 'Workflow connection unavailable. Check Executions before retrying.'
  return error instanceof Error && error.message ? error.message : 'Dev Workflow unavailable. Check Executions before retrying.'
}
