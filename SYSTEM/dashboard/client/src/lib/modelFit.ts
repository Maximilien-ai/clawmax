import { byokForRequest } from './byok'

export type ModelFitPreference = 'quality' | 'balanced' | 'cost'

export const MODEL_FIT_DETAILS_STORAGE_KEY = 'clawmax-model-fit-details-expanded'
export const MODEL_FIT_AUTO_STORAGE_KEY = 'clawmax-model-fit-auto-apply'

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

function readStoredBoolean(key: string, fallback: boolean, storage?: Pick<Storage, 'getItem'>): boolean {
  if (!storage) return fallback
  const value = storage.getItem(key)
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

export function readModelFitDetailsExpanded(storage?: Pick<Storage, 'getItem'>): boolean {
  return readStoredBoolean(MODEL_FIT_DETAILS_STORAGE_KEY, true, storage)
}

export function readModelFitAutoApply(storage?: Pick<Storage, 'getItem'>): boolean {
  return readStoredBoolean(MODEL_FIT_AUTO_STORAGE_KEY, false, storage)
}

export function storeModelFitPreference(
  key: typeof MODEL_FIT_DETAILS_STORAGE_KEY | typeof MODEL_FIT_AUTO_STORAGE_KEY,
  value: boolean,
  storage?: Pick<Storage, 'setItem'>,
): void {
  storage?.setItem(key, String(value))
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
