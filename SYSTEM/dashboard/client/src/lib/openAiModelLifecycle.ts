export type ModelLifecycleStatus = 'deprecated' | 'retired' | 'sunsetting'

export type ProviderModelLifecycle = {
  providerLabel: string
  status: ModelLifecycleStatus
  replacementModel?: string
  shutdownDate: string
  sourceUrl: string
}

const OPENAI_DEPRECATIONS_URL = 'https://developers.openai.com/api/docs/deprecations'
const ANTHROPIC_DEPRECATIONS_URL = 'https://platform.claude.com/docs/en/about-claude/model-deprecations'
const GEMINI_DEPRECATIONS_URL = 'https://ai.google.dev/gemini-api/docs/deprecations'

const MODEL_LIFECYCLE: Record<string, ProviderModelLifecycle> = {
  'openai:gpt-4o': { providerLabel: 'OpenAI', status: 'retired', replacementModel: 'gpt-4.1', shutdownDate: '2026-07-01', sourceUrl: OPENAI_DEPRECATIONS_URL },
  'openai:gpt-5-2025-08-07': { providerLabel: 'OpenAI', status: 'deprecated', replacementModel: 'gpt-5', shutdownDate: '2026-12-10', sourceUrl: OPENAI_DEPRECATIONS_URL },
  'openai:gpt-5-mini-2025-08-07': { providerLabel: 'OpenAI', status: 'deprecated', replacementModel: 'gpt-5-mini', shutdownDate: '2026-12-10', sourceUrl: OPENAI_DEPRECATIONS_URL },
  'openai:gpt-5-nano-2025-08-07': { providerLabel: 'OpenAI', status: 'deprecated', replacementModel: 'gpt-5-nano', shutdownDate: '2026-12-10', sourceUrl: OPENAI_DEPRECATIONS_URL },
  'openai:gpt-5-pro-2025-10-06': { providerLabel: 'OpenAI', status: 'deprecated', replacementModel: 'gpt-5-pro', shutdownDate: '2026-12-10', sourceUrl: OPENAI_DEPRECATIONS_URL },

  'anthropic:claude-opus-4-1-20250805': { providerLabel: 'Anthropic', status: 'deprecated', replacementModel: 'claude-opus-4-8', shutdownDate: '2026-08-05', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-opus-4-20250514': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-opus-4-8', shutdownDate: '2026-06-15', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-sonnet-4-20250514': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-sonnet-4-6', shutdownDate: '2026-06-15', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-3-7-sonnet-20250219': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-sonnet-4-6', shutdownDate: '2026-02-19', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-3-5-haiku-20241022': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-haiku-4-5-20251001', shutdownDate: '2026-02-19', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-3-haiku-20240307': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-haiku-4-5-20251001', shutdownDate: '2026-04-20', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-3-5-sonnet-20240620': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-sonnet-4-6', shutdownDate: '2025-10-28', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-3-5-sonnet-20241022': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-sonnet-4-6', shutdownDate: '2025-10-28', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-3-opus-20240229': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-opus-4-8', shutdownDate: '2026-01-05', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-2.0': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-opus-4-8', shutdownDate: '2025-07-21', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-2.1': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-opus-4-8', shutdownDate: '2025-07-21', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-3-sonnet-20240229': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-sonnet-4-6', shutdownDate: '2025-07-21', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-1.0': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-haiku-4-5-20251001', shutdownDate: '2024-11-06', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-1.1': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-haiku-4-5-20251001', shutdownDate: '2024-11-06', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-1.2': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-haiku-4-5-20251001', shutdownDate: '2024-11-06', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-1.3': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-haiku-4-5-20251001', shutdownDate: '2024-11-06', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-instant-1.0': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-haiku-4-5-20251001', shutdownDate: '2024-11-06', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-instant-1.1': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-haiku-4-5-20251001', shutdownDate: '2024-11-06', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },
  'anthropic:claude-instant-1.2': { providerLabel: 'Anthropic', status: 'retired', replacementModel: 'claude-haiku-4-5-20251001', shutdownDate: '2024-11-06', sourceUrl: ANTHROPIC_DEPRECATIONS_URL },

  'google:gemini-3.1-flash-image-preview': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-flash-image', shutdownDate: '2026-06-25', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-3-pro-image-preview': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3-pro-image', shutdownDate: '2026-06-25', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-3-flash-preview': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.5-flash', shutdownDate: '2026-12-09', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-3-pro-preview': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-pro-preview', shutdownDate: '2026-03-09', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-3.1-flash-lite-preview': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-flash-lite', shutdownDate: '2026-05-25', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-pro': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-pro-preview', shutdownDate: '2026-10-16', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-pro-preview-03-25': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-pro-preview', shutdownDate: '2025-12-02', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-pro-preview-05-06': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-pro-preview', shutdownDate: '2025-12-02', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-pro-preview-06-05': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-pro-preview', shutdownDate: '2025-12-02', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-flash': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.5-flash', shutdownDate: '2026-10-16', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-flash-image': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-flash-image-preview', shutdownDate: '2026-10-02', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-flash-lite': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-flash-lite', shutdownDate: '2026-10-16', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-flash-lite-preview-09-2025': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-flash-lite', shutdownDate: '2026-03-31', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-flash-preview-05-20': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.5-flash', shutdownDate: '2025-11-18', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-flash-image-preview': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-2.5-flash-image', shutdownDate: '2026-01-15', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-flash-preview-09-25': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.5-flash', shutdownDate: '2026-02-17', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.0-flash': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.5-flash', shutdownDate: '2026-06-01', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.0-flash-001': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.5-flash', shutdownDate: '2026-06-01', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.0-flash-lite': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-flash-lite', shutdownDate: '2026-06-01', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.0-flash-lite-001': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-flash-lite', shutdownDate: '2026-06-01', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.0-flash-preview-image-generation': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-2.5-flash-image', shutdownDate: '2025-11-14', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.0-flash-lite-preview': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-2.5-flash-lite', shutdownDate: '2025-12-09', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.0-flash-lite-preview-02-05': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-2.5-flash-lite', shutdownDate: '2025-12-09', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.0-flash-live-001': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-flash-live-preview', shutdownDate: '2025-12-09', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-live-2.5-flash-preview': { providerLabel: 'Gemini', status: 'deprecated', replacementModel: 'gemini-3.1-flash-live-preview', shutdownDate: '2025-12-09', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-flash-preview-tts': { providerLabel: 'Gemini', status: 'sunsetting', replacementModel: 'gemini-3.1-flash-tts-preview', shutdownDate: '', sourceUrl: GEMINI_DEPRECATIONS_URL },
  'google:gemini-2.5-pro-preview-tts': { providerLabel: 'Gemini', status: 'sunsetting', replacementModel: 'gemini-3.1-flash-tts-preview', shutdownDate: '', sourceUrl: GEMINI_DEPRECATIONS_URL },
}

function normalize(model?: string | null): string {
  return String(model || '').trim()
}

function parseProviderModel(model: string): { providerPrefix: string; providerKey: string; baseModel: string } {
  if (model.startsWith('openai/')) return { providerPrefix: 'openai/', providerKey: 'openai', baseModel: model.slice('openai/'.length) }
  if (model.startsWith('openai-compatible/')) return { providerPrefix: 'openai-compatible/', providerKey: 'openai-compatible', baseModel: model.slice('openai-compatible/'.length) }
  if (model.startsWith('anthropic/')) return { providerPrefix: 'anthropic/', providerKey: 'anthropic', baseModel: model.slice('anthropic/'.length) }
  if (model.startsWith('google/')) return { providerPrefix: 'google/', providerKey: 'google', baseModel: model.slice('google/'.length) }
  if (model.startsWith('gemini/')) return { providerPrefix: 'gemini/', providerKey: 'google', baseModel: model.slice('gemini/'.length) }
  return { providerPrefix: '', providerKey: '', baseModel: model }
}

function lifecycleKey(model: string): string {
  const parsed = parseProviderModel(model)
  return `${parsed.providerKey}:${parsed.baseModel}`
}

export function getModelLifecycleEntry(model?: string | null): ProviderModelLifecycle | null {
  const trimmed = normalize(model)
  if (!trimmed) return null
  return MODEL_LIFECYCLE[lifecycleKey(trimmed)] || null
}

export function getModelLifecycleReplacement(model?: string | null): string | null {
  const trimmed = normalize(model)
  if (!trimmed) return null
  const entry = getModelLifecycleEntry(trimmed)
  if (!entry?.replacementModel) return null
  const { providerPrefix } = parseProviderModel(trimmed)
  return `${providerPrefix}${entry.replacementModel}`
}

export function resolveNonDeprecatedOpenAiModel(models: string[], candidate?: string | null): string {
  const trimmed = normalize(candidate)
  if (!trimmed) return ''
  const replacement = getModelLifecycleReplacement(trimmed)
  if (replacement && models.includes(replacement)) return replacement
  return trimmed
}

export function isSelectableLifecycleModel(model: string, currentValue?: string | null): boolean {
  if (normalize(model) === normalize(currentValue)) return true
  const entry = getModelLifecycleEntry(model)
  if (!entry) return true
  if (entry.status === 'sunsetting') return true
  return false
}

export function formatOpenAiModelLabel(model: string): string {
  const entry = getModelLifecycleEntry(model)
  if (!entry) return model
  if (entry.replacementModel) return `${model} [${entry.status} → ${entry.replacementModel}]`
  if (entry.shutdownDate) return `${model} [${entry.status} → shuts off ${entry.shutdownDate}]`
  return `${model} [${entry.status}]`
}

export function formatOpenAiDeprecationNotice(model?: string | null): string | null {
  const entry = getModelLifecycleEntry(model)
  if (!entry) return null
  const parsed = parseProviderModel(normalize(model))
  if (entry.replacementModel && entry.shutdownDate) {
    return `${entry.providerLabel} model "${parsed.baseModel}" is ${entry.status} and shuts off on ${entry.shutdownDate}. Use ${entry.replacementModel} instead.`
  }
  if (entry.replacementModel) {
    return `${entry.providerLabel} model "${parsed.baseModel}" is ${entry.status}. Prefer ${entry.replacementModel} instead.`
  }
  if (entry.shutdownDate) {
    return `${entry.providerLabel} model "${parsed.baseModel}" has a published shutdown date of ${entry.shutdownDate}.`
  }
  return `${entry.providerLabel} model "${parsed.baseModel}" is ${entry.status}.`
}

export function getOpenAiModelDeprecation(model?: string | null): ProviderModelLifecycle | null {
  const entry = getModelLifecycleEntry(model)
  return entry?.providerLabel === 'OpenAI' ? entry : null
}

export function getOpenAiModelReplacement(model?: string | null): string | null {
  const entry = getOpenAiModelDeprecation(model)
  if (!entry) return null
  return getModelLifecycleReplacement(model)
}
