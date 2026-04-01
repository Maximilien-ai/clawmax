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
}

type FetchLike = typeof fetch

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
  try {
    const res = await fetchImpl('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return valid('OpenAI key is valid')
    if (res.status === 401 || res.status === 403) return invalid('OpenAI rejected this key')
    return errored(`OpenAI validation returned ${res.status}`)
  } catch (err: any) {
    return errored(`OpenAI validation failed: ${err.message || 'network error'}`)
  }
}

export async function validateAnthropicKey(apiKey: string, fetchImpl: FetchLike = fetch): Promise<IntegrationValidationResult> {
  if (!apiKey.trim()) return skipped('No Anthropic key provided')
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/models?limit=1', {
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return valid('Anthropic key is valid')
    if (res.status === 401 || res.status === 403) return invalid('Anthropic rejected this key')
    return errored(`Anthropic validation returned ${res.status}`)
  } catch (err: any) {
    return errored(`Anthropic validation failed: ${err.message || 'network error'}`)
  }
}

export async function validateGeminiKey(apiKey: string, fetchImpl: FetchLike = fetch): Promise<IntegrationValidationResult> {
  if (!apiKey.trim()) return skipped('No Gemini key provided')
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
  const trimmed = baseUrl.trim() || 'http://localhost:11434'
  return trimmed.replace(/\/+$/, '')
}

export async function validateOllamaConfig(
  baseUrl: string,
  defaultModel: string,
  fetchImpl: FetchLike = fetch
): Promise<IntegrationValidationResult> {
  const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl)
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
    if (defaultModel.trim() && !models.includes(defaultModel.trim())) {
      return invalid(`Ollama is reachable, but default model "${defaultModel.trim()}" is not installed`)
    }
    return valid(defaultModel.trim() ? `Ollama is reachable and ${defaultModel.trim()} is available` : `Ollama is reachable with ${models.length} installed model(s)`)
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

export async function validateIntegrations(input: {
  openai?: string
  anthropic?: string
  gemini?: string
  ollamaBaseUrl?: string
  ollamaDefaultModel?: string
  opikApiKey?: string
  opikWorkspace?: string
  opikProject?: string
}, fetchImpl: FetchLike = fetch): Promise<IntegrationValidationResponse> {
  const [openai, anthropic, gemini, ollama, opik] = await Promise.all([
    validateOpenAIKey(input.openai || '', fetchImpl),
    validateAnthropicKey(input.anthropic || '', fetchImpl),
    validateGeminiKey(input.gemini || '', fetchImpl),
    validateOllamaConfig(input.ollamaBaseUrl || '', input.ollamaDefaultModel || '', fetchImpl),
    validateOpikConfig(input.opikApiKey || '', input.opikWorkspace || '', input.opikProject || '', fetchImpl),
  ])

  return { openai, anthropic, gemini, ollama, opik }
}
