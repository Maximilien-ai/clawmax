import { byokForRequest } from './byok'

export type ModelFitPreference = 'quality' | 'balanced' | 'cost'
export type ModelFitSelectionMode = 'auto' | 'manual'

export const MODEL_FIT_DETAILS_STORAGE_KEY = 'clawmax-model-fit-details-expanded'

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
  excludedModels?: Array<{ model: string; reason: string }>
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

export function storeModelFitPreference(
  key: typeof MODEL_FIT_DETAILS_STORAGE_KEY,
  value: boolean,
  storage?: Pick<Storage, 'setItem'>,
): void {
  storage?.setItem(key, String(value))
}

export function normalizeAgentModelFitState(value: any): {
  selectionMode: ModelFitSelectionMode
  preference: ModelFitPreference
} {
  return {
    selectionMode: value?.selectionMode === 'auto' ? 'auto' : 'manual',
    preference: ['quality', 'balanced', 'cost'].includes(String(value?.preference))
      ? value.preference as ModelFitPreference
      : 'balanced',
  }
}

export function syncAgentModelFitIdentity(
  content: string,
  selectionMode: ModelFitSelectionMode,
  preference: ModelFitPreference,
): string {
  const metadataIndex = content.search(/^##\s+Creation Metadata\b/im)
  let runtime = metadataIndex === -1 ? content : content.slice(0, metadataIndex)
  const suffix = metadataIndex === -1 ? '' : content.slice(metadataIndex)
  const upsertField = (label: 'Model Selection' | 'Model Priority', value: string) => {
    const pattern = new RegExp(`^[-*]\\s+\\*\\*${label}:\\*\\*\\s*.*$`, 'm')
    if (pattern.test(runtime)) {
      runtime = runtime.replace(pattern, `- **${label}:** ${value}`)
      return
    }
    const backupPattern = /^[-*]\s+\*\*Backup Model:\*\*\s*.*$/m
    const modelPattern = /^[-*]\s+\*\*Model:\*\*\s*.*$/m
    if (backupPattern.test(runtime)) {
      runtime = runtime.replace(backupPattern, match => `${match}\n- **${label}:** ${value}`)
    } else if (modelPattern.test(runtime)) {
      runtime = runtime.replace(modelPattern, match => `${match}\n- **${label}:** ${value}`)
    } else {
      runtime = `${runtime.trimEnd()}\n- **${label}:** ${value}\n`
    }
  }
  upsertField('Model Selection', selectionMode)
  upsertField('Model Priority', preference)
  return suffix ? `${runtime.trimEnd()}\n\n${suffix.trimStart()}` : runtime
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
  /** Pinned CLI runtime, so the server ranks that runtime's catalog instead of the provider one. */
  runtime?: string
  signal?: AbortSignal
}): Promise<ModelFitRecommendation> {
  const response = await fetch('/api/agents/model-fit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: input.description,
      availableModels: input.availableModels,
      runtime: input.runtime,
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
