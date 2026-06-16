export type OpenAiModelDeprecation = {
  replacementModel: string
  shutdownDate: string
  sourceUrl: string
}

const OPENAI_DEPRECATED_MODELS: Record<string, OpenAiModelDeprecation> = {
  'gpt-5-2025-08-07': {
    replacementModel: 'gpt-5',
    shutdownDate: '2026-12-10',
    sourceUrl: 'https://platform.openai.com/docs/deprecations',
  },
  'gpt-5-mini-2025-08-07': {
    replacementModel: 'gpt-5-mini',
    shutdownDate: '2026-12-10',
    sourceUrl: 'https://platform.openai.com/docs/deprecations',
  },
  'gpt-5-nano-2025-08-07': {
    replacementModel: 'gpt-5-nano',
    shutdownDate: '2026-12-10',
    sourceUrl: 'https://platform.openai.com/docs/deprecations',
  },
  'gpt-5-pro-2025-10-06': {
    replacementModel: 'gpt-5-pro',
    shutdownDate: '2026-12-10',
    sourceUrl: 'https://platform.openai.com/docs/deprecations',
  },
}

function normalize(model?: string | null): string {
  return String(model || '').trim()
}

function stripProviderPrefix(model: string): { providerPrefix: string; baseModel: string } {
  if (model.startsWith('openai/')) return { providerPrefix: 'openai/', baseModel: model.slice('openai/'.length) }
  if (model.startsWith('openai-compatible/')) return { providerPrefix: 'openai-compatible/', baseModel: model.slice('openai-compatible/'.length) }
  return { providerPrefix: '', baseModel: model }
}

export function getOpenAiModelDeprecation(model?: string | null): OpenAiModelDeprecation | null {
  const trimmed = normalize(model)
  if (!trimmed) return null
  const { baseModel } = stripProviderPrefix(trimmed)
  return OPENAI_DEPRECATED_MODELS[baseModel] || null
}

export function getOpenAiModelReplacement(model?: string | null): string | null {
  const trimmed = normalize(model)
  if (!trimmed) return null
  const deprecation = getOpenAiModelDeprecation(trimmed)
  if (!deprecation) return null
  const { providerPrefix } = stripProviderPrefix(trimmed)
  return `${providerPrefix}${deprecation.replacementModel}`
}

export function resolveNonDeprecatedOpenAiModel(models: string[], candidate?: string | null): string {
  const trimmed = normalize(candidate)
  if (!trimmed) return ''
  const replacement = getOpenAiModelReplacement(trimmed)
  if (replacement && models.includes(replacement)) return replacement
  return trimmed
}

export function formatOpenAiModelLabel(model: string): string {
  const deprecation = getOpenAiModelDeprecation(model)
  if (!deprecation) return model
  return `${model} [deprecated → ${deprecation.replacementModel}]`
}

export function formatOpenAiDeprecationNotice(model?: string | null): string | null {
  const deprecation = getOpenAiModelDeprecation(model)
  if (!deprecation) return null
  return `This OpenAI snapshot is deprecated and shuts off on ${deprecation.shutdownDate}. Use ${deprecation.replacementModel} instead.`
}
