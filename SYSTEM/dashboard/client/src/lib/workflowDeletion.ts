/** Only known public error codes may replace a deletion failure's safe fallback. */
export async function requireWorkflowDeletion(response: { ok: boolean; json(): Promise<unknown> }, fallback: string): Promise<void> {
  if (response.ok) return
  const body = await response.json().catch(() => null)
  if (body && typeof body === 'object' && 'code' in body && body.code === 'workflow_legacy_cleanup_failed') {
    throw new Error('The workflow was kept because its older scheduled jobs could not be stopped. Check Runtime status before trying again.')
  }
  throw new Error(fallback)
}

/** Settle every deletion before refreshing the list or deciding what is retryable. */
export async function deleteWorkflowBatch(ids: string[], remove: (id: string) => Promise<void>) {
  const unique = [...new Set(ids)]
  const results = await Promise.allSettled(unique.map(async id => remove(id)))
  const deleted: string[] = []
  const failed: Array<{ id: string; error: string }> = []
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') deleted.push(unique[index])
    else failed.push({ id: unique[index], error: result.reason instanceof Error ? result.reason.message : 'Failed to delete workflow' })
  })
  return { deleted, failed }
}
