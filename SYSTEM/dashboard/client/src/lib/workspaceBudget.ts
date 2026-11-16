import { buildWorkspaceScopedPath } from './workspaceScope'

export type WorkspaceBudgetSnapshot = { enabled: false } | {
  enabled: true
  config: { limitUsd: number; enforced: boolean }
  currentSpendUsd: number
  usedPct: number
  level: 'ok' | 'warning' | 'exceeded'
}

export async function loadWorkspaceBudget(workspaceId: string, signal?: AbortSignal, send: typeof fetch = fetch): Promise<WorkspaceBudgetSnapshot> {
  const response = await send(buildWorkspaceScopedPath('/api/budget', workspaceId), { signal })
  if (!response.ok) throw new Error('Workspace budget could not be loaded.')
  const data: any = await response.json()
  if (data?.enabled === false) return { enabled: false }
  if (!data?.config || !Number.isFinite(data.config.limitUsd) || data.config.limitUsd < 0 ||
      typeof data.config.enforced !== 'boolean' || !Number.isFinite(data.currentSpendUsd) ||
      !Number.isFinite(data.usedPct) || !['ok', 'warning', 'exceeded'].includes(data.level)) {
    throw new Error('Workspace budget response was incomplete. Retry to load the saved settings.')
  }
  return { ...data, enabled: true }
}

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
    const result: any = await response.json().catch(() => null)
    throw new Error(result?.error || 'Workspace budget could not be saved.')
  }
}
