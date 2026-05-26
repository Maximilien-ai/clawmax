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
    builtInEstimatedCostUsd: Math.round(builtInEstimatedCostUsd * 100) / 100,
    userAgentCount,
    userEstimatedCostUsd: Math.round(userEstimatedCostUsd * 100) / 100,
  }
}
