export async function workspaceSwitchError(response: Response): Promise<string> {
  const fallback = `Workspace switch could not be confirmed (HTTP ${response.status}). Refresh the workspace list before retrying.`
  if (!response.headers.get('content-type')?.includes('application/json')) return fallback
  try {
    const data = await response.json()
    return typeof data?.error === 'string' && data.error.length <= 300 ? data.error : fallback
  } catch { return fallback }
}
