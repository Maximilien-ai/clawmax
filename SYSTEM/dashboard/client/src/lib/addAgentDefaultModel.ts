import type { StoredByokKeys } from './byok'
import { resolveAutoDefaultModel, resolveNonDeprecatedOpenAiModel } from './openAiModelLifecycle'

type WizardAuthConfig = {
  preferredModel?: string
  recommendedModel?: string
  workspaceOpenAiCompatibleBaseUrl?: string
  workspaceOpenAiCompatibleDefaultModel?: string
  userKeyDefaults?: { openai?: boolean }
  systemKeyDefaults?: { openai?: boolean }
  allowSystemKeysForUserExecution?: boolean
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

  // Discovery can omit one model from an otherwise usable provider. Preserve
  // that explicit preference, but not a provider that vanished after key removal.
  const availablePreference = (candidate: string) => candidate && models.some(model => model.split('/')[0] === candidate.split('/')[0]) ? candidate : ''
  const explicitPreferred = models.length ? availablePreference(browserPreferred) || availablePreference(configPreferred) : browserPreferred || configPreferred
  if (explicitPreferred) return resolveNonDeprecatedOpenAiModel(models, explicitPreferred)
  if (models.length === 0) return browserPreferred || configPreferred || configRecommended

  // A browser OpenAI key has the same precedence as generation. Workspace-only
  // profiles can also use an allowed deployed OpenAI key; explicit browser BYOK
  // keeps its existing precedence over a different protected credential.
  const openAiAvailable = !!byok.openai?.trim() || (!byok.openaiCompatibleBaseUrl?.trim() && (
    config.userKeyDefaults?.openai || (config.allowSystemKeysForUserExecution && config.systemKeyDefaults?.openai)
  ))
  if (openAiAvailable) {
    const openAiDefault = resolveAutoDefaultModel(models.filter(model => model.startsWith('openai/')))
    if (openAiDefault) return openAiDefault
  }

  const localCandidates = [
    resolveQualifiedLocalModel('ollama', byok.ollamaDefaultModel),
    resolveQualifiedLocalModel('openai-compatible', byok.openaiCompatibleBaseUrl?.trim() ? byok.openaiCompatibleDefaultModel : config.workspaceOpenAiCompatibleDefaultModel || byok.openaiCompatibleDefaultModel),
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

  const compatibleConfigured = !!(normalize(byok.openaiCompatibleBaseUrl) || normalize(config.workspaceOpenAiCompatibleBaseUrl) || normalize(config.defaultOpenAiCompatibleBaseUrl))
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
