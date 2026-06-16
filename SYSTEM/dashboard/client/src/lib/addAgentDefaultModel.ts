import type { StoredByokKeys } from './byok'
import { resolveNonDeprecatedOpenAiModel } from './openAiModelLifecycle'

type WizardAuthConfig = {
  preferredModel?: string
  recommendedModel?: string
  ollamaEnabled?: boolean
  defaultOllamaBaseUrl?: string
  defaultOpenAiCompatibleBaseUrl?: string
}

function normalize(value?: string | null): string {
  return String(value || '').trim()
}

function resolveQualifiedLocalModel(prefix: 'ollama' | 'openai-compatible', model?: string | null): string {
  const trimmed = normalize(model)
  if (!trimmed) return ''
  if (trimmed.startsWith(`${prefix}/`)) return trimmed
  return `${prefix}/${trimmed}`
}

function matches(models: string[], candidate?: string | null): string {
  const trimmed = normalize(candidate)
  if (!trimmed) return ''
  return models.find((model) => model === trimmed) || ''
}

export function resolveAddAgentWizardDefaultModel(args: {
  models: string[]
  config?: WizardAuthConfig | null
  byok?: Partial<StoredByokKeys> | null
}): string {
  const models = args.models || []
  const config = args.config || {}
  const byok = args.byok || {}

  const browserPreferred = normalize(byok.preferredModel || byok.systemPreferredModel)
  const configPreferred = normalize(config.preferredModel)
  const configRecommended = normalize(config.recommendedModel)

  const explicitPreferred = matches(models, browserPreferred) || matches(models, configPreferred)
  if (explicitPreferred) return resolveNonDeprecatedOpenAiModel(models, explicitPreferred)
  if (models.length === 0) return browserPreferred || configPreferred || configRecommended

  const localCandidates = [
    resolveQualifiedLocalModel('ollama', byok.ollamaDefaultModel),
    resolveQualifiedLocalModel('openai-compatible', byok.openaiCompatibleDefaultModel),
  ].filter(Boolean)
  for (const candidate of localCandidates) {
    const match = matches(models, candidate)
    if (match) return match
  }

  const ollamaConfigured = config.ollamaEnabled && !!(normalize(byok.ollamaBaseUrl) || normalize(config.defaultOllamaBaseUrl))
  if (ollamaConfigured) {
    const firstOllama = models.find((model) => model.startsWith('ollama/'))
    if (firstOllama) return firstOllama
  }

  const compatibleConfigured = !!(normalize(byok.openaiCompatibleBaseUrl) || normalize(config.defaultOpenAiCompatibleBaseUrl))
  if (compatibleConfigured) {
    const firstCompatible = models.find((model) => model.startsWith('openai-compatible/'))
    if (firstCompatible) return firstCompatible
  }

  const recommendedMatch = matches(models, configRecommended)
  if (recommendedMatch) return resolveNonDeprecatedOpenAiModel(models, recommendedMatch)

  return resolveNonDeprecatedOpenAiModel(models, models[0] || configRecommended)
}

export function resolveAddAgentWizardSuggestedModel(args: {
  models: string[]
  currentModel?: string | null
  suggestedModel?: string | null
}): string {
  const models = args.models || []
  const currentModel = normalize(args.currentModel)
  const suggestedModel = normalize(args.suggestedModel)

  if (!suggestedModel) return currentModel
  if (models.length === 0) return suggestedModel

  const suggestedMatch = matches(models, suggestedModel)
  if (suggestedMatch) return suggestedMatch

  return currentModel
}
