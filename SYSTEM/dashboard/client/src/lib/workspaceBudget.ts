import { buildWorkspaceScopedPath } from './workspaceScope'

export function parseWorkspaceBudgetLimit(input: string): number {
  const value = Number(input)
  if (!input.trim() || !Number.isFinite(value) || value < 0) throw new Error('Enter a valid, non-negative workspace budget.')
  return value
}

export async function saveWorkspaceBudget(workspaceId: string, input: string, enforced: boolean, send: typeof fetch = fetch): Promise<void> {
  const limitUsd = parseWorkspaceBudgetLimit(input)
  const response = await send(buildWorkspaceScopedPath('/api/budget', workspaceId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId, limitUsd, enforced }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    throw new Error(result?.error || 'Workspace budget could not be saved.')
  }
}
