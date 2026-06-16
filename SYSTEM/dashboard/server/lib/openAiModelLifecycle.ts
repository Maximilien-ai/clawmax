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

function stripProviderPrefix(model: string): string {
  if (model.startsWith('openai/')) return model.slice('openai/'.length)
  if (model.startsWith('openai-compatible/')) return model.slice('openai-compatible/'.length)
  return model
}

export function getOpenAiModelDeprecation(model?: string | null): OpenAiModelDeprecation | null {
  const trimmed = normalize(model)
  if (!trimmed) return null
  return OPENAI_DEPRECATED_MODELS[stripProviderPrefix(trimmed)] || null
}
