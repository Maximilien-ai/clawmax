export interface ModelPricing {
  inputPer1kUsd: number
  outputPer1kUsd: number
}

const MODEL_PRICING: Array<{ match: string; pricing: ModelPricing }> = [
  { match: 'claude-opus-4-6', pricing: { inputPer1kUsd: 0.015, outputPer1kUsd: 0.075 } },
  { match: 'claude-sonnet-4-6', pricing: { inputPer1kUsd: 0.003, outputPer1kUsd: 0.015 } },
  { match: 'claude-haiku-4-5', pricing: { inputPer1kUsd: 0.001, outputPer1kUsd: 0.005 } },
  { match: 'gpt-5.4', pricing: { inputPer1kUsd: 0.00125, outputPer1kUsd: 0.01 } },
  { match: 'gpt-5', pricing: { inputPer1kUsd: 0.00125, outputPer1kUsd: 0.01 } },
  { match: 'gpt-4o', pricing: { inputPer1kUsd: 0.005, outputPer1kUsd: 0.015 } },
  { match: 'gpt-4o-mini', pricing: { inputPer1kUsd: 0.00015, outputPer1kUsd: 0.0006 } },
]

export function getModelPricing(model: string): ModelPricing | null {
  const normalized = String(model || '').toLowerCase()
  const match = MODEL_PRICING.find((entry) => normalized.includes(entry.match))
  return match?.pricing || null
}

export function estimateModelCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(model)
  if (!pricing) return 0
  return (Math.max(0, inputTokens) / 1000) * pricing.inputPer1kUsd
    + (Math.max(0, outputTokens) / 1000) * pricing.outputPer1kUsd
}

export function estimateTraceCostUsd(metadata: Record<string, any>): number {
  const explicit = Number(metadata?.estimated_cost_usd || 0)
  if (explicit > 0) return explicit

  const input = Number(metadata?.tokens_input || 0)
  const output = Number(metadata?.tokens_output || 0)
  const total = Number(metadata?.tokens_total || 0)
  const resolvedInput = input > 0 || output > 0 ? input : Math.floor(total / 2)
  const resolvedOutput = input > 0 || output > 0 ? output : Math.ceil(total / 2)

  return estimateModelCostUsd(String(metadata?.model || ''), resolvedInput, resolvedOutput)
}

