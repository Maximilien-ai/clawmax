export type WorkflowCosts = 'Metering unavailable' | 'Metering off' | 'Loading cost…' | Map<string, number>

export function readWorkflowCosts(data: any): WorkflowCosts {
  if (data?.enabled === false) return 'Metering off'
  if (!Array.isArray(data?.byWorkflow)) return 'Metering unavailable'
  const costs = new Map<string, number>()
  for (const row of data.byWorkflow) {
    if (typeof row?.workflowId === 'string' && Number.isFinite(row.estimatedCostUsd) && row.estimatedCostUsd >= 0) {
      costs.set(row.workflowId, row.estimatedCostUsd)
    }
  }
  return costs
}

export function workflowCostLabel(costs: WorkflowCosts, id: string): string {
  if (typeof costs === 'string') return costs
  const amount = costs.get(id)
  return amount === undefined ? 'No recorded cost' : `$${amount.toFixed(2)} est. · All time`
}
