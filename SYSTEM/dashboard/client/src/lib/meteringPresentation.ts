export type MeteringAgentRow = {
  agentId: string
  agentType?: 'built-in' | 'user' | 'unknown'
  isBuiltIn?: boolean
  totalCalls: number
  totalTokens: number
  estimatedCostUsd: number
  avgDurationMs: number
  lastActivity: string
  models: Record<string, number>
}

export function summarizeMeteringByAgentType(
  byAgent: MeteringAgentRow[],
  builtInAgentIds: Set<string> = new Set(),
): {
  builtInAgentCount: number
  builtInEstimatedCostUsd: number
  userAgentCount: number
  userEstimatedCostUsd: number
} {
  let builtInAgentCount = 0
  let builtInEstimatedCostUsd = 0
  let userAgentCount = 0
  let userEstimatedCostUsd = 0

  for (const agent of byAgent) {
    const isBuiltIn = agent.isBuiltIn === true || agent.agentType === 'built-in' || builtInAgentIds.has(agent.agentId)
    if (isBuiltIn) {
      builtInAgentCount += 1
      builtInEstimatedCostUsd += Number(agent.estimatedCostUsd || 0)
    } else {
      userAgentCount += 1
      userEstimatedCostUsd += Number(agent.estimatedCostUsd || 0)
    }
  }

  return {
    builtInAgentCount,
    builtInEstimatedCostUsd,
    userAgentCount,
    userEstimatedCostUsd,
  }
}

export function formatMeteringCost(value: number): string {
  const cost = Number(value || 0)
  if (cost <= 0) return '$0.00'
  if (cost < 0.01) return '<$0.01'
  return `$${cost.toFixed(2)}`
}

export function formatMeteringTokens(value: number): string {
  const tokens = Math.max(0, Math.round(Number(value || 0)))
  if (tokens < 1000) return `${tokens}`
  return `${(tokens / 1000).toFixed(1)}k`
}
