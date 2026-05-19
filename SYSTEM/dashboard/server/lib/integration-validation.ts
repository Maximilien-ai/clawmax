export interface IntegrationValidationResult {
  ok: boolean
  status: 'valid' | 'invalid' | 'error' | 'skipped'
  message: string
}

export interface IntegrationValidationResponse {
  openai?: IntegrationValidationResult
  anthropic?: IntegrationValidationResult
  gemini?: IntegrationValidationResult
  ollama?: IntegrationValidationResult
  opik?: IntegrationValidationResult
  senso?: IntegrationValidationResult
}

type FetchLike = typeof fetch

const OPENAI_VALIDATION_MODEL = 'gpt-4o-mini'
const ANTHROPIC_VALIDATION_MODEL = 'claude-3-5-haiku-latest'

function detectProviderFromKeyShape(key: string): 'openai' | 'anthropic' | 'gemini' | null {
  const trimmed = key.trim()
  if (!trimmed) return null
  if (/^sk-ant-/i.test(trimmed)) return 'anthropic'
  if (/^AIza[0-9A-Za-z\-_]{20,}$/i.test(trimmed)) return 'gemini'
  if (/^sk-(?!ant-)[0-9A-Za-z_\-]{10,}$/i.test(trimmed)) return 'openai'
  return null
}

function looksLikeSubscriptionCredential(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return /^sess-/i.test(trimmed)
    || /^ya29\./i.test(trimmed)
    || /^1\/\//.test(trimmed)
    || /^gh[opusr]_/i.test(trimmed)
    || /^github_pat_/i.test(trimmed)
}

function providerShapeMismatch(
  provider: 'openai' | 'anthropic' | 'gemini',
  apiKey: string
): IntegrationValidationResult | null {
  const detected = detectProviderFromKeyShape(apiKey)
  if (!detected || detected === provider) return null

  const labels = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
  } as const

  return invalid(`This looks like a ${labels[detected]} key, not a ${labels[provider]} key`)
}

function providerCredentialShapeMismatch(
  provider: 'openai' | 'anthropic',
  apiKey: string
): IntegrationValidationResult | null {
  const trimmed = apiKey.trim()
  if (!trimmed) return null

  const expectedPrefix = provider === 'openai' ? /^sk-/i : /^sk-ant-/i
  if (expectedPrefix.test(trimmed)) return null

  const label = provider === 'openai' ? 'OpenAI' : 'Anthropic'
  if (looksLikeSubscriptionCredential(trimmed)) {
    return invalid(`${label} subscription or app credentials cannot be used here. Use a ${label} developer API key instead.`)
  }

  return invalid(`This does not look like a ${label} developer API key. Check Key only works with real prompt-capable API keys.`)
}

function skipped(message: string): IntegrationValidationResult {
  return { ok: true, status: 'skipped', message }
}

function valid(message: string): IntegrationValidationResult {
  return { ok: true, status: 'valid', message }
}

function invalid(message: string): IntegrationValidationResult {
  return { ok: false, status: 'invalid', message }
}

function errored(message: string): IntegrationValidationResult {
  return { ok: false, status: 'error', message }
}

export async function validateOpenAIKey(apiKey: string, fetchImpl: FetchLike = fetch): Promise<IntegrationValidationResult> {
  if (!apiKey.trim()) return skipped('No OpenAI key provided')
  const mismatch = providerShapeMismatch('openai', apiKey)
  if (mismatch) return mismatch
  const credentialMismatch = providerCredentialShapeMismatch('openai', apiKey)
  if (credentialMismatch) return credentialMismatch
  try {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({
        model: OPENAI_VALIDATION_MODEL,
        messages: [{ role: 'user', content: 'Reply with OK' }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return valid('OpenAI key is valid and can complete prompts')
    if (res.status === 401 || res.status === 403) return invalid('OpenAI rejected this key')
    if (res.status === 400 || res.status === 404) return invalid(`OpenAI key could not complete a test prompt on ${OPENAI_VALIDATION_MODEL}`)
    return errored(`OpenAI prompt validation returned ${res.status}`)
  } catch (err: any) {
    return errored(`OpenAI prompt validation failed: ${err.message || 'network error'}`)
  }
}

export async function validateAnthropicKey(apiKey: string, fetchImpl: FetchLike = fetch): Promise<IntegrationValidationResult> {
  if (!apiKey.trim()) return skipped('No Anthropic key provided')
  const mismatch = providerShapeMismatch('anthropic', apiKey)
  if (mismatch) return mismatch
  const credentialMismatch = providerCredentialShapeMismatch('anthropic', apiKey)
  if (credentialMismatch) return credentialMismatch
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_VALIDATION_MODEL,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Reply with OK' }],
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return valid('Anthropic key is valid and can complete prompts')
    if (res.status === 401 || res.status === 403) return invalid('Anthropic rejected this key')
    if (res.status === 400 || res.status === 404) return invalid(`Anthropic key could not complete a test prompt on ${ANTHROPIC_VALIDATION_MODEL}`)
    return errored(`Anthropic prompt validation returned ${res.status}`)
  } catch (err: any) {
    return errored(`Anthropic prompt validation failed: ${err.message || 'network error'}`)
  }
}

export async function validateGeminiKey(apiKey: string, fetchImpl: FetchLike = fetch): Promise<IntegrationValidationResult> {
  if (!apiKey.trim()) return skipped('No Gemini key provided')
  const mismatch = providerShapeMismatch('gemini', apiKey)
  if (mismatch) return mismatch
  try {
    const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return valid('Gemini key is valid')
    if (res.status === 401 || res.status === 403) return invalid('Gemini rejected this key')
    return errored(`Gemini validation returned ${res.status}`)
  } catch (err: any) {
    return errored(`Gemini validation failed: ${err.message || 'network error'}`)
  }
}

function normalizeOllamaBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim() || getDefaultOllamaBaseUrl()
  return trimmed.replace(/\/+$/, '')
}

export async function validateOllamaConfig(
  baseUrl: string,
  defaultModel: string,
  fetchImpl: FetchLike = fetch
): Promise<IntegrationValidationResult> {
  const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl)
  const normalizedModel = defaultModel.trim()
  if (!baseUrl.trim() && !normalizedModel) {
    return skipped('Ollama is optional and not configured')
  }
  if (normalizedBaseUrl === getDefaultOllamaBaseUrl() && !normalizedModel) {
    return skipped('Ollama is optional and not configured')
  }
  try {
    const res = await fetchImpl(`${normalizedBaseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      if (res.status === 404) return invalid('Ollama responded, but the tags API was not found')
      return errored(`Ollama validation returned ${res.status}`)
    }
    const body = await res.json() as { models?: Array<{ name?: string }> }
    const models = (body.models || []).map((m) => (m.name || '').trim()).filter(Boolean)
    if (models.length === 0) return invalid('Connected to Ollama, but no local models are installed yet')
    if (normalizedModel && !models.includes(normalizedModel)) {
      return invalid(`Ollama is reachable, but default model "${normalizedModel}" is not installed`)
    }
    return valid(normalizedModel ? `Ollama is reachable and ${normalizedModel} is available` : `Ollama is reachable with ${models.length} installed model(s)`)
  } catch (err: any) {
    return errored(`Ollama validation failed: ${err.message || 'connection error'}`)
  }
}

export async function validateOpikConfig(
  apiKey: string,
  workspace: string,
  projectName: string,
  fetchImpl: FetchLike = fetch
): Promise<IntegrationValidationResult> {
  if (!apiKey.trim()) return skipped('No Opik key provided')
  if (!workspace.trim()) return invalid('Opik workspace is required when using an Opik key')
  const project = projectName.trim() || 'clawmax'
  try {
    const url = `https://www.comet.com/opik/api/v1/private/traces?project_name=${encodeURIComponent(project)}&size=1`
    const res = await fetchImpl(url, {
      headers: {
        Authorization: apiKey.trim(),
        'Comet-Workspace': workspace.trim(),
      },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return valid('Opik credentials look valid')
    if (res.status === 401 || res.status === 403) return invalid('Opik rejected this key or workspace access')
    if (res.status === 404) return invalid('Opik project or workspace was not found')
    return errored(`Opik validation returned ${res.status}`)
  } catch (err: any) {
    return errored(`Opik validation failed: ${err.message || 'network error'}`)
  }
}

export async function validateSensoConfig(apiKey: string): Promise<IntegrationValidationResult> {
  if (!apiKey.trim()) return skipped('No Senso key provided')
  return valid('Senso key is present. Live API validation is not yet implemented from this form.')
}

export async function validateIntegrations(input: {
  openai?: string
  anthropic?: string
  gemini?: string
  ollamaBaseUrl?: string
  ollamaDefaultModel?: string
  opikApiKey?: string
  opikWorkspace?: string
  opikProject?: string
  sensoApiKey?: string
}, fetchImpl: FetchLike = fetch): Promise<IntegrationValidationResponse> {
  const [openai, anthropic, gemini, ollama, opik, senso] = await Promise.all([
    validateOpenAIKey(input.openai || '', fetchImpl),
    validateAnthropicKey(input.anthropic || '', fetchImpl),
    validateGeminiKey(input.gemini || '', fetchImpl),
    validateOllamaConfig(input.ollamaBaseUrl || '', input.ollamaDefaultModel || '', fetchImpl),
    validateOpikConfig(input.opikApiKey || '', input.opikWorkspace || '', input.opikProject || '', fetchImpl),
    validateSensoConfig(input.sensoApiKey || ''),
  ])

  return { openai, anthropic, gemini, ollama, opik, senso }
}
import { getDefaultOllamaBaseUrl } from './dashboard-env'
