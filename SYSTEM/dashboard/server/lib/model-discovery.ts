/**
 * Dynamic model discovery for configured hosted and local model providers.
 * Results are cached for 1 hour. Falls back to hardcoded lists on API failure.
 */
import { getDefaultOllamaBaseUrl, getSystemProviderKeys, getUserDefaultProviderKeys, type ProviderKeys } from './dashboard-env'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProviderModels {
  name: string
  models: string[]
}

export interface ModelsResponse {
  models: string[]
  modelsByProvider: Record<string, ProviderModels>
}

type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama' | 'openai-compatible'

// ── Cache ──────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry {
  models: string[]
  fetchedAt: number
}

const cache: Record<string, CacheEntry> = {}

function getCached(provider: string): string[] | null {
  const entry = cache[provider]
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    delete cache[provider]
    return null
  }
  return entry.models
}

function setCache(provider: string, models: string[]) {
  // Entries are keyed per endpoint and per credential, so a long-lived process accumulates one
  // per credential ever seen. Expired entries are dropped on write rather than only when that
  // exact key is read again.
  const now = Date.now()
  for (const [key, entry] of Object.entries(cache)) {
    if (now - entry.fetchedAt > CACHE_TTL_MS) delete cache[key]
  }
  cache[provider] = { models, fetchedAt: now }
}

/** Force-clear cache (useful for manual refresh) */
export function clearModelCache() {
  for (const key of Object.keys(cache)) delete cache[key]
}

export function getPreferredAnthropicModel(): string {
  const cached = getCached('anthropic') || []
  const preferred = [...cached, ...FALLBACK_ANTHROPIC].find((model) => model.startsWith('anthropic/claude-'))
  return preferred || 'anthropic/claude-3-5-sonnet-20241022'
}

// ── Hardcoded fallbacks ────────────────────────────────────────────────────────

export const FALLBACK_ANTHROPIC = [
  'anthropic/claude-sonnet-4-20250514',
  'anthropic/claude-opus-4-20250514',
  'anthropic/claude-haiku-4-5-20251001',
  'anthropic/claude-3-5-sonnet-20241022',
  'anthropic/claude-3-5-haiku-20241022',
]

// Models advertised by the OpenClaw runtime pinned for ClawMax 1.9.9.
// Provider APIs can return aliases that OpenClaw itself does not recognize.
export const FALLBACK_OPENAI = [
  'openai/gpt-5.4-mini',
  'openai/gpt-5.4',
  'openai/gpt-5.4-nano',
  'openai/gpt-5.4-pro',
  'openai/gpt-5.3-chat-latest',
  'openai/gpt-5.3-codex',
  'openai/gpt-5.5',
  'openai/gpt-5.5-pro',
  'openai/o1',
  'openai/o3',
  'openai/o3-mini',
  'openai/o4-mini',
]

export const FALLBACK_GEMINI = [
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.0-flash',
  'google/gemma-4-31b-it',
]

const FALLBACK_OPENROUTER = ['openrouter/auto']

// Models confirmed by the OpenClaw runtime pinned for ClawMax 1.9.9.
// New xAI releases remain hidden until that runtime advertises them.
export const FALLBACK_XAI = [
  'xai/grok-3',
  'xai/grok-3-fast',
  'xai/grok-4.3',
  'xai/grok-4.20-0309-reasoning',
  'xai/grok-4.20-0309-non-reasoning',
  'xai/grok-code-fast-1',
]

const COMPATIBLE_MODELS: Record<Exclude<ProviderId, 'ollama'>, string[]> = {
  openai: FALLBACK_OPENAI,
  anthropic: FALLBACK_ANTHROPIC,
  gemini: FALLBACK_GEMINI,
  openrouter: FALLBACK_OPENROUTER,
  xai: FALLBACK_XAI,
  'openai-compatible': [],
}

function filterCompatibleDiscoveredModels(provider: ProviderId, models: string[], showAll = false): string[] {
  if (showAll || provider === 'ollama') return models
  if (provider === 'openai-compatible') {
    return models.filter((model) => isOpenAICompatibleChatModel(model.replace(/^openai-compatible\//, '')))
  }
  if (provider === 'openrouter') {
    return models.filter((model) => isOpenAICompatibleChatModel(model.replace(/^openrouter\//, '')))
  }
  if (provider === 'xai') {
    const compatible = new Set(FALLBACK_XAI)
    return models.filter((model) => compatible.has(model))
  }
  const compatible = new Set(COMPATIBLE_MODELS[provider as keyof typeof COMPATIBLE_MODELS] || [])
  return models.filter((model) => compatible.has(model))
}

// ── Model name filters (skip embedding, tts, whisper, dall-e, etc.) ────────

const OPENAI_CHAT_PREFIXES = ['gpt-', 'o1', 'o3', 'o4', 'chatgpt-']
const OPENAI_EXCLUDE = ['instruct', 'realtime', 'audio', 'search']

function isOpenAIChatModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (!OPENAI_CHAT_PREFIXES.some(p => lower.startsWith(p))) return false
  if (OPENAI_EXCLUDE.some(e => lower.includes(e))) return false
  return true
}

const ANTHROPIC_CHAT_PREFIXES = ['claude-']

function isAnthropicChatModel(id: string): boolean {
  return ANTHROPIC_CHAT_PREFIXES.some(p => id.toLowerCase().startsWith(p))
}

function isGeminiApiTextModel(id: string): boolean {
  const lower = id.toLowerCase()
  if (lower.startsWith('gemini-')) return !lower.includes('embedding')
  return /^gemma-\d[0-9a-z.-]*-it$/.test(lower)
}

const OPENAI_COMPATIBLE_EXCLUDE = [
  'embedding',
  'embed',
  'rerank',
  'whisper',
  'tts',
  'speech',
  'transcription',
  'moderation',
]

function isOpenAICompatibleChatModel(id: string): boolean {
  const lower = id.toLowerCase()
  return !OPENAI_COMPATIBLE_EXCLUDE.some((token) => lower.includes(token))
}

// ── API fetchers ───────────────────────────────────────────────────────────────

async function fetchOpenAIModels(apiKey: string): Promise<string[]> {
  const cached = getCached('openai')
  if (cached) return cached

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn(`OpenAI models API returned ${res.status}`)
      return FALLBACK_OPENAI
    }
    const body = await res.json() as { data: Array<{ id: string }> }
    const models = body.data
      .map(m => m.id)
      .filter(isOpenAIChatModel)
      .sort()
      .map(id => `openai/${id}`)

    if (models.length === 0) return FALLBACK_OPENAI
    setCache('openai', models)
    return models
  } catch (err) {
    console.warn('Failed to fetch OpenAI models, using fallback:', (err as Error).message)
    return FALLBACK_OPENAI
  }
}

async function fetchAnthropicModels(apiKey: string): Promise<string[]> {
  const cached = getCached('anthropic')
  if (cached) return cached

  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn(`Anthropic models API returned ${res.status}`)
      return FALLBACK_ANTHROPIC
    }
    const body = await res.json() as { data: Array<{ id: string }> }
    const models = body.data
      .map(m => m.id)
      .filter(isAnthropicChatModel)
      .sort()
      .map(id => `anthropic/${id}`)

    if (models.length === 0) return FALLBACK_ANTHROPIC
    setCache('anthropic', models)
    return models
  } catch (err) {
    console.warn('Failed to fetch Anthropic models, using fallback:', (err as Error).message)
    return FALLBACK_ANTHROPIC
  }
}

async function fetchGeminiModels(apiKey: string): Promise<string[]> {
  const cached = getCached('gemini')
  if (cached) return cached

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn(`Gemini models API returned ${res.status}`)
      return FALLBACK_GEMINI
    }
    const body = await res.json() as { models?: Array<{ name: string }> }
    const models = (body.models || [])
      .map((m) => m.name.replace(/^models\//, ''))
      .filter(isGeminiApiTextModel)
      .sort()
      .map((id) => `google/${id}`)

    if (models.length === 0) return FALLBACK_GEMINI
    setCache('gemini', models)
    return models
  } catch (err) {
    console.warn('Failed to fetch Gemini models, using fallback:', (err as Error).message)
    return FALLBACK_GEMINI
  }
}

async function fetchOpenRouterModels(apiKey: string): Promise<string[]> {
  const cached = getCached('openrouter')
  if (cached) return cached

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn(`OpenRouter models API returned ${res.status}`)
      return FALLBACK_OPENROUTER
    }
    const body = await res.json() as { data?: Array<{ id?: string }> }
    const models = (body.data || [])
      .map((model) => (model.id || '').trim())
      .filter(Boolean)
      .filter(isOpenAICompatibleChatModel)
      .sort()
      .map((id) => `openrouter/${id}`)
    const resolved = Array.from(new Set([...FALLBACK_OPENROUTER, ...models]))
    setCache('openrouter', resolved)
    return resolved
  } catch (err) {
    console.warn('Failed to fetch OpenRouter models, using fallback:', (err as Error).message)
    return FALLBACK_OPENROUTER
  }
}

async function fetchXaiModels(apiKey: string): Promise<string[]> {
  const cached = getCached('xai')
  if (cached) return cached

  try {
    const res = await fetch('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      console.warn(`xAI models API returned ${res.status}`)
      return FALLBACK_XAI
    }
    const body = await res.json() as { data?: Array<{ id?: string }> }
    const discovered = (body.data || [])
      .map((model) => (model.id || '').trim())
      .filter((id) => id.toLowerCase().startsWith('grok-'))
      .sort()
      .map((id) => `xai/${id}`)
    const runtimeCompatible = discovered.filter((model) => FALLBACK_XAI.includes(model))
    const resolved = Array.from(new Set([...FALLBACK_XAI, ...runtimeCompatible]))
    setCache('xai', resolved)
    return resolved
  } catch (err) {
    console.warn('Failed to fetch xAI models, using fallback:', (err as Error).message)
    return FALLBACK_XAI
  }
}

async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
  const normalizedBaseUrl = (baseUrl.trim() || getDefaultOllamaBaseUrl()).replace(/\/+$/, '')
  if (!normalizedBaseUrl) return []
  const cacheKey = `ollama:${normalizedBaseUrl}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(`${normalizedBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      console.warn(`Ollama tags API returned ${res.status}`)
      return []
    }
    const body = await res.json() as { models?: Array<{ name?: string }> }
    const models = (body.models || [])
      .map((m) => (m.name || '').trim())
      .filter(Boolean)
      .sort()
      .map((id) => `ollama/${id}`)

    setCache(cacheKey, models)
    return models
  } catch (err) {
    console.warn('Failed to fetch Ollama models:', (err as Error).message)
    return []
  }
}

/**
 * Cache key for one endpoint as seen through one credential.
 *
 * A gateway URL returns a different catalog per key, so keying on the URL alone would serve one
 * operator's private model ids to the next caller of the same URL.
 */
function openAiCompatibleCacheKey(normalizedBaseUrl: string, apiKey?: string): string {
  return `openai-compatible:${normalizedBaseUrl}::${apiKey?.trim() || ''}`
}

// One /models request per endpoint at a time. Without this, N concurrent cold generations each
// issue their own 5s request to the same endpoint before any of them populates the cache.
const inFlightOpenAICompatibleFetches = new Map<string, Promise<string[]>>()

async function fetchOpenAICompatibleModels(baseUrl: string, apiKey?: string): Promise<string[]> {
  const normalizedBaseUrl = (baseUrl.trim() || '').replace(/\/+$/, '')
  if (!normalizedBaseUrl) return []
  const cacheKey = openAiCompatibleCacheKey(normalizedBaseUrl, apiKey)
  const cached = getCached(cacheKey)
  if (cached) return cached
  const inFlight = inFlightOpenAICompatibleFetches.get(cacheKey)
  if (inFlight) return inFlight

  const request = (async () => {
    try {
      const headers: Record<string, string> = {}
      if (apiKey?.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`
      }
      const res = await fetch(`${normalizedBaseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) {
        console.warn(`OpenAI-compatible models API returned ${res.status}`)
        return []
      }
      const body = await res.json() as { data?: Array<{ id?: string }> }
      // Kept in the endpoint's own order: endpoint validation completes its test prompt on the
      // first chat-capable model as returned, and the default-model fallback must land on that
      // same model. Callers that display the list sort it themselves.
      const models = (body.data || [])
        .map((m) => (m.id || '').trim())
        .filter(Boolean)
        .map((id) => `openai-compatible/${id}`)

      setCache(cacheKey, models)
      return models
    } catch (err) {
      console.warn('Failed to fetch OpenAI-compatible models:', (err as Error).message)
      return []
    } finally {
      inFlightOpenAICompatibleFetches.delete(cacheKey)
    }
  })()
  inFlightOpenAICompatibleFetches.set(cacheKey, request)
  return request
}

/**
 * The model an OpenAI-compatible endpoint runs when the operator named no default.
 *
 * BYOK labels "Default model" optional, and endpoint validation already completes its test prompt
 * on the first chat-capable discovered model — so a verified endpoint with that box empty is
 * usable, and every consumer must resolve it the same way instead of reporting it unusable.
 */
export async function resolveOpenAiCompatibleDefaultModel(input: {
  baseUrl?: string
  apiKey?: string
  defaultModel?: string
}): Promise<string | undefined> {
  const configured = input.defaultModel?.trim().replace(/^openai-compatible\//, '')
  if (configured) return configured
  const baseUrl = input.baseUrl?.trim()
  if (!baseUrl) return undefined
  const discovered = await fetchOpenAICompatibleModels(baseUrl, input.apiKey)
  return firstChatModel(discovered)
}

/**
 * Same answer as resolveOpenAiCompatibleDefaultModel, from the discovery cache only.
 *
 * Callers reached from deep inside a synchronous resolution chain cannot await; they warm the
 * cache at their request boundary and read it here.
 */
export function getCachedOpenAiCompatibleDefaultModel(baseUrl?: string, apiKey?: string): string | undefined {
  const normalizedBaseUrl = (baseUrl?.trim() || '').replace(/\/+$/, '')
  if (!normalizedBaseUrl) return undefined
  return firstChatModel(getCached(openAiCompatibleCacheKey(normalizedBaseUrl, apiKey)) || [])
}

function firstChatModel(discovered: string[]): string | undefined {
  const chatModel = filterCompatibleDiscoveredModels('openai-compatible', discovered)[0]
  return chatModel?.replace(/^openai-compatible\//, '') || undefined
}

// ── Public API ─────────────────────────────────────────────────────────────────

function resolveApiKey(provider: 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'xai', rawEnv?: Record<string, string>): string | undefined {
  const systemKeys = getSystemProviderKeys(rawEnv)
  const userKeys = getUserDefaultProviderKeys(rawEnv)
  return systemKeys[provider] || userKeys[provider]
}

/** Fetch models for all configured providers. Returns immediately from cache when warm. */
export async function discoverModels(
  byokKeys?: { openai?: string; anthropic?: string; gemini?: string; openrouter?: string; xai?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string },
  options?: { showAll?: boolean }
): Promise<ModelsResponse> {
  const openaiKey = byokKeys?.openai || resolveApiKey('openai')
  const anthropicKey = byokKeys?.anthropic || resolveApiKey('anthropic')
  const geminiKey = byokKeys?.gemini || resolveApiKey('gemini')
  const openrouterKey = byokKeys?.openrouter || resolveApiKey('openrouter')
  const xaiKey = byokKeys?.xai || resolveApiKey('xai')
  const ollamaBaseUrl = byokKeys?.ollamaBaseUrl?.trim()
  const openaiCompatibleApiKey = byokKeys?.openaiCompatibleApiKey?.trim()
  const openaiCompatibleBaseUrl = byokKeys?.openaiCompatibleBaseUrl?.trim()
  const showAll = options?.showAll === true

  const fetches: Promise<{ provider: string; name: string; models: string[] }>[] = []

  if (anthropicKey) {
    fetches.push(
      fetchAnthropicModels(anthropicKey).then(models => ({
        provider: 'anthropic',
        name: 'Anthropic',
        models,
      }))
    )
  }

  if (openaiKey) {
    fetches.push(
      fetchOpenAIModels(openaiKey).then(models => ({
        provider: 'openai',
        name: 'OpenAI',
        models,
      }))
    )
  }

  if (geminiKey) {
    fetches.push(
      fetchGeminiModels(geminiKey).then(models => ({
        provider: 'gemini',
        name: 'Gemini',
        models,
      }))
    )
  }

  if (openrouterKey) {
    fetches.push(
      fetchOpenRouterModels(openrouterKey).then(models => ({
        provider: 'openrouter',
        name: 'OpenRouter',
        models,
      }))
    )
  }

  if (xaiKey) {
    fetches.push(
      fetchXaiModels(xaiKey).then(models => ({
        provider: 'xai',
        name: 'xAI',
        models,
      }))
    )
  }

  if (ollamaBaseUrl) {
    fetches.push(
      fetchOllamaModels(ollamaBaseUrl).then(models => ({
        provider: 'ollama',
        name: 'Ollama',
        models,
      }))
    )
  }

  if (openaiCompatibleBaseUrl) {
    fetches.push(
      // Sorted for the picker; the cache keeps the endpoint's own order for default-model resolution.
      fetchOpenAICompatibleModels(openaiCompatibleBaseUrl, openaiCompatibleApiKey).then(models => ({
        provider: 'openai-compatible',
        name: 'OpenAI-Compatible',
        models: [...models].sort(),
      }))
    )
  }

  const results = await Promise.all(fetches)

  const allModels: string[] = []
  const modelsByProvider: Record<string, ProviderModels> = {}

  for (const r of results) {
    const filteredModels = filterCompatibleDiscoveredModels(r.provider as ProviderId, r.models, showAll)
    allModels.push(...filteredModels)
    modelsByProvider[r.provider] = { name: r.name, models: filteredModels }
  }

  // Sort providers alphabetically
  const sorted: Record<string, ProviderModels> = {}
  Object.keys(modelsByProvider)
    .sort()
    .forEach(k => { sorted[k] = modelsByProvider[k] })

  return { models: allModels, modelsByProvider: sorted }
}

/** Synchronous flat list — returns cached models or fallback. For validation use. */
export function getAvailableModelsCached(rawEnv?: Record<string, string>): string[] {
  const models: string[] = []
  const openaiKey = resolveApiKey('openai', rawEnv)
  const anthropicKey = resolveApiKey('anthropic', rawEnv)
  const geminiKey = resolveApiKey('gemini', rawEnv)
  const openrouterKey = resolveApiKey('openrouter', rawEnv)
  const xaiKey = resolveApiKey('xai', rawEnv)
  const integrations = readWorkspaceIntegrationConfig()
  const systemKeys = getSystemProviderKeys(rawEnv)
  const userKeys = getUserDefaultProviderKeys(rawEnv)

  if (anthropicKey) {
    models.push(...(getCached('anthropic') || FALLBACK_ANTHROPIC))
  }
  if (openaiKey) {
    models.push(...(getCached('openai') || FALLBACK_OPENAI))
  }
  if (geminiKey) {
    models.push(...(getCached('gemini') || FALLBACK_GEMINI))
  }
  if (openrouterKey) {
    models.push(...(getCached('openrouter') || FALLBACK_OPENROUTER))
  }
  if (xaiKey) {
    models.push(...(getCached('xai') || FALLBACK_XAI))
  }

  const localDefaults: string[] = []
  const ollamaDefaultModel = integrations.ollamaDefaultModel?.trim()
  const ollamaBaseUrl = integrations.ollamaBaseUrl?.trim() || getDefaultOllamaBaseUrl(rawEnv)
  if (ollamaBaseUrl && ollamaDefaultModel) {
    localDefaults.push(`ollama/${ollamaDefaultModel}`)
  }

  const compatibleBaseUrl = integrations.openaiCompatibleBaseUrl?.trim()
    || userKeys.openaiCompatibleBaseUrl?.trim()
    || systemKeys.openaiCompatibleBaseUrl?.trim()
  const compatibleDefaultModel = integrations.openaiCompatibleDefaultModel?.trim()
    || userKeys.openaiCompatibleDefaultModel?.trim()
    || systemKeys.openaiCompatibleDefaultModel?.trim()
    // BYOK's "Default model" box is optional, so an endpoint that named none is still usable on
    // whichever chat model it advertises.
    || getCachedOpenAiCompatibleDefaultModel(compatibleBaseUrl)
  if (compatibleBaseUrl && compatibleDefaultModel) {
    localDefaults.push(`openai-compatible/${compatibleDefaultModel}`)
  }

  return Array.from(new Set([...models, ...localDefaults]))
}

export const __test = {
  filterCompatibleDiscoveredModels,
  isGeminiApiTextModel,
  isOpenAICompatibleChatModel,
}
