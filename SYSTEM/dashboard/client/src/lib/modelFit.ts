import { byokForRequest } from './byok'

export type ModelFitPreference = 'quality' | 'balanced' | 'cost'

export interface ModelFitCandidate {
  model: string
  score: number
  tier: 'efficient' | 'balanced' | 'quality' | 'unknown'
  reasons: string[]
  caveats: string[]
}

export interface ModelFitRecommendation {
  recommendedModel: string | null
  candidates: ModelFitCandidate[]
  confidence: 'low' | 'medium'
  summary: string
  disclaimer: string
}

export function buildAgentModelFitDescription(input: {
  identity?: string
  soul?: string
  tools?: string
}): string {
  return [input.identity, input.soul, input.tools]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n')
}

export async function requestModelFit(input: {
  description: string
  availableModels: string[]
  preference: ModelFitPreference
  signal?: AbortSignal
}): Promise<ModelFitRecommendation> {
  const response = await fetch('/api/agents/model-fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: input.description,
      availableModels: input.availableModels,
      preference: input.preference,
      byokKeys: byokForRequest(),
    }),
    signal: input.signal,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || 'Could not suggest a model')
  }
  return data as ModelFitRecommendation
}
