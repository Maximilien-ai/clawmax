export interface AgentListEntry {
  id: string
}

export function mergeAgentToFront<T extends AgentListEntry>(existing: T[], created: T): T[] {
  return [created, ...existing.filter(agent => agent.id !== created.id)]
}

export function getVisibleAgentTags(tags: string[], limit = 3): { visible: string[]; hiddenCount: number } {
  const safeLimit = Math.max(0, limit)
  return {
    visible: tags.slice(0, safeLimit),
    hiddenCount: Math.max(0, tags.length - safeLimit),
  }
}

export function formatAgentGroupCount(count: number): string | null {
  if (count <= 0) return null
  return `${count} group${count === 1 ? '' : 's'}`
}

export function getAgentBudgetPresentation(params: {
  costTrackingEnabled: boolean
  costLimit?: number | null
  meteringCost?: number
}): { usedPct: number | null; barColor: string } {
  if (!params.costTrackingEnabled || !params.costLimit || params.costLimit <= 0 || params.meteringCost === undefined) {
    return { usedPct: null, barColor: 'bg-gray-300 dark:bg-gray-700' }
  }

  const usedPct = (params.meteringCost / params.costLimit) * 100
  if (usedPct >= 95) return { usedPct, barColor: 'bg-red-500' }
  if (usedPct >= 80) return { usedPct, barColor: 'bg-yellow-500' }
  return { usedPct, barColor: 'bg-green-500' }
}
