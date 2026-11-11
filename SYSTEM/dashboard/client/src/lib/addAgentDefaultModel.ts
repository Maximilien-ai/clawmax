import type { StoredByokKeys } from './byok'
import { resolveAutoDefaultModel, resolveNonDeprecatedOpenAiModel } from './openAiModelLifecycle'

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

  const browserPreferred = resolveNonDeprecatedOpenAiModel(models, normalize(byok.preferredModel))
  const configPreferred = resolveNonDeprecatedOpenAiModel(models, normalize(config.preferredModel))
  const configRecommended = resolveNonDeprecatedOpenAiModel(models, normalize(config.recommendedModel))

  const explicitPreferred = browserPreferred || configPreferred
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

  // Auto with no usable recommendation, e.g. a key kept only in this browser, which the server
  // cannot recommend for. The first listed model used to win, and for OpenAI that is gpt-4.1.
  return resolveAutoDefaultModel(models)
}

export function resolveAddAgentWizardSuggestedModel(args: {
  models: string[]
  currentModel?: string | null
  suggestedModel?: string | null
}): string {
  const models = args.models || []
  const currentModel = resolveNonDeprecatedOpenAiModel(models, normalize(args.currentModel))
  const suggestedModel = resolveNonDeprecatedOpenAiModel(models, normalize(args.suggestedModel))

  if (currentModel) {
    if (models.length === 0) return currentModel
    // Catalog discovery is advisory; never replace an explicit selection with AI's choice.
    return currentModel
  }

  if (!suggestedModel) return currentModel
  if (models.length === 0) return suggestedModel

  const suggestedMatch = matches(models, suggestedModel)
  if (suggestedMatch) return suggestedMatch

  return currentModel
}
