/**
 * Dynamic model discovery — fetches available models from OpenAI and Anthropic APIs.
 * Results are cached for 1 hour. Falls back to hardcoded lists on API failure.
 */
import { getSystemProviderKeys, getUserDefaultProviderKeys, type ProviderKeys } from './dashboard-env'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProviderModels {
  name: string
  models: string[]
}

export interface ModelsResponse {
  models: string[]
  modelsByProvider: Record<string, ProviderModels>
}

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
  cache[provider] = { models, fetchedAt: Date.now() }
}

/** Force-clear cache (useful for manual refresh) */
export function clearModelCache() {
  for (const key of Object.keys(cache)) delete cache[key]
}

// ── Hardcoded fallbacks ────────────────────────────────────────────────────────

const FALLBACK_ANTHROPIC = [
  'anthropic/claude-sonnet-4-20250514',
  'anthropic/claude-opus-4-20250514',
  'anthropic/claude-haiku-4-5-20251001',
  'anthropic/claude-3-5-sonnet-20241022',
  'anthropic/claude-3-5-haiku-20241022',
]

const FALLBACK_OPENAI = [
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4.1',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1-nano',
  'openai/o1',
  'openai/o1-mini',
  'openai/o3',
  'openai/o3-mini',
  'openai/o4-mini',
]

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

// ── Public API ─────────────────────────────────────────────────────────────────

function resolveApiKey(provider: 'openai' | 'anthropic'): string | undefined {
  const systemKeys = getSystemProviderKeys()
  const userKeys = getUserDefaultProviderKeys()
  return systemKeys[provider] || userKeys[provider]
}

/** Fetch models for all configured providers. Returns immediately from cache when warm. */
export async function discoverModels(): Promise<ModelsResponse> {
  const openaiKey = resolveApiKey('openai')
  const anthropicKey = resolveApiKey('anthropic')

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

  const results = await Promise.all(fetches)

  const allModels: string[] = []
  const modelsByProvider: Record<string, ProviderModels> = {}

  for (const r of results) {
    allModels.push(...r.models)
    modelsByProvider[r.provider] = { name: r.name, models: r.models }
  }

  // Sort providers alphabetically
  const sorted: Record<string, ProviderModels> = {}
  Object.keys(modelsByProvider)
    .sort()
    .forEach(k => { sorted[k] = modelsByProvider[k] })

  return { models: allModels, modelsByProvider: sorted }
}

/** Synchronous flat list — returns cached models or fallback. For validation use. */
export function getAvailableModelsCached(): string[] {
  const models: string[] = []
  const openaiKey = resolveApiKey('openai')
  const anthropicKey = resolveApiKey('anthropic')

  if (anthropicKey) {
    models.push(...(getCached('anthropic') || FALLBACK_ANTHROPIC))
  }
  if (openaiKey) {
    models.push(...(getCached('openai') || FALLBACK_OPENAI))
  }
  return models
}
