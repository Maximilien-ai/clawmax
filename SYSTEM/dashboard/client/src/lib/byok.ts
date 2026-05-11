const STORAGE_KEY = 'clawmax-byok-preview'
const DISMISS_KEY = 'clawmax-byok-preview-dismissed'
const BROWSER_VAULT_UPDATED_EVENT = 'clawmax-browser-vault-updated'

export interface StoredByokKeys {
  openai?: string
  anthropic?: string
  geminiApiKey?: string
  ollamaBaseUrl?: string
  ollamaDefaultModel?: string
  verifiedProviders?: Partial<Record<'openai' | 'anthropic' | 'gemini' | 'ollama', string>>
  sensoApiKey?: string
  sensoContextLabel?: string
  opikApiKey?: string
  opikWorkspace?: string
  opikProject?: string
  githubDefaultRepo?: string
  preferredModel?: string
  partnerSecrets?: Record<string, Record<string, string>>
  partnerValues?: Record<string, Record<string, string>>
}

export interface ByokRequestPayload {
  openai?: string
  anthropic?: string
  gemini?: string
  ollamaBaseUrl?: string
}

interface AiExecutionConfig {
  allowSystemKeysForUserExecution?: boolean
  ollamaEnabled?: boolean
  defaultOllamaBaseUrl?: string
  recommendedModel?: string
  systemKeyDefaults?: {
    openai?: boolean
    anthropic?: boolean
    gemini?: boolean
  }
  userKeyDefaults?: {
    openai?: boolean
    anthropic?: boolean
    gemini?: boolean
  }
}

export type ProviderKeyMismatch = {
  provider: 'openai' | 'anthropic' | 'gemini'
  expectedLabel: string
  detectedProvider: 'openai' | 'anthropic' | 'gemini'
  detectedLabel: string
  message: string
}

function detectProviderFromKeyShape(key: string): ProviderKeyMismatch['detectedProvider'] | null {
  const trimmed = key.trim()
  if (!trimmed) return null
  if (/^sk-ant-/i.test(trimmed)) return 'anthropic'
  if (/^AIza[0-9A-Za-z\-_]{20,}$/i.test(trimmed)) return 'gemini'
  if (/^sk-(?!ant-)[0-9A-Za-z_\-]{10,}$/i.test(trimmed)) return 'openai'
  return null
}

export function detectProviderKeyMismatch(
  provider: 'openai' | 'anthropic' | 'gemini',
  key: string
): ProviderKeyMismatch | null {
  const detectedProvider = detectProviderFromKeyShape(key)
  if (!detectedProvider || detectedProvider === provider) return null

  const labels = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
  } as const

  return {
    provider,
    expectedLabel: labels[provider],
    detectedProvider,
    detectedLabel: labels[detectedProvider],
    message: `This looks like a ${labels[detectedProvider]} key, not a ${labels[provider]} key.`,
  }
}

export function getByokStorageKey() {
  return STORAGE_KEY
}

export function getByokDismissKey() {
  return DISMISS_KEY
}

export function readStoredByokKeys(): StoredByokKeys {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const next = typeof parsed === 'object' && parsed ? parsed as StoredByokKeys : {}
    const partnerSecrets = { ...(next.partnerSecrets || {}) }
    const partnerValues = { ...(next.partnerValues || {}) }

    if (next.sensoApiKey) {
      partnerSecrets.senso = { ...(partnerSecrets.senso || {}), apiKey: partnerSecrets.senso?.apiKey || next.sensoApiKey }
    }
    if (next.sensoContextLabel) {
      partnerValues.senso = { ...(partnerValues.senso || {}), contextLabel: partnerValues.senso?.contextLabel || next.sensoContextLabel }
    }
    if (next.opikApiKey) {
      partnerSecrets.opik = { ...(partnerSecrets.opik || {}), apiKey: partnerSecrets.opik?.apiKey || next.opikApiKey }
    }
    if (next.opikWorkspace) {
      partnerValues.opik = { ...(partnerValues.opik || {}), workspace: partnerValues.opik?.workspace || next.opikWorkspace }
    }
    if (next.opikProject) {
      partnerValues.opik = { ...(partnerValues.opik || {}), project: partnerValues.opik?.project || next.opikProject }
    }
    if (next.githubDefaultRepo) {
      partnerValues.github = { ...(partnerValues.github || {}), defaultRepo: partnerValues.github?.defaultRepo || next.githubDefaultRepo }
    }

    return {
      ...next,
      partnerSecrets,
      partnerValues,
    }
  } catch {
    return {}
  }
}

export function writeStoredByokKeys(keys: StoredByokKeys, options?: { silent?: boolean }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  if (typeof window !== 'undefined' && !options?.silent) {
    window.dispatchEvent(new CustomEvent(BROWSER_VAULT_UPDATED_EVENT))
  }
}

export function buildByokVerificationFingerprint(
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama',
  values: { openai?: string; anthropic?: string; geminiApiKey?: string; ollamaBaseUrl?: string; ollamaDefaultModel?: string }
): string {
  if (provider === 'openai') return values.openai?.trim() || ''
  if (provider === 'anthropic') return values.anthropic?.trim() || ''
  if (provider === 'gemini') return values.geminiApiKey?.trim() || ''
  return `${values.ollamaBaseUrl?.trim() || ''}::${values.ollamaDefaultModel?.trim() || ''}`
}

/** Translate browser storage shape into the request shape expected by server routes. */
export function byokForRequest(): ByokRequestPayload {
  const keys = readStoredByokKeys()
  return {
    openai: keys.openai,
    anthropic: keys.anthropic,
    gemini: keys.geminiApiKey,
    ollamaBaseUrl: keys.ollamaBaseUrl,
  }
}

/** Check if any LLM API keys are available (BYOK, system, or user defaults) */
export function hasAnyLLMKeys(config?: { systemKeyDefaults?: { openai?: boolean; anthropic?: boolean }; userKeyDefaults?: { openai?: boolean; anthropic?: boolean } }): boolean {
  const byok = readStoredByokKeys()
  if (byok.openai || byok.anthropic || byok.geminiApiKey || byok.ollamaBaseUrl || byok.ollamaDefaultModel) return true
  if (config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || (config as any)?.systemKeyDefaults?.gemini) return true
  if (config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic || (config as any)?.userKeyDefaults?.gemini) return true
  return false
}

/** Check whether the current browser/user execution path can actually run AI generation */
export function hasAiGenerationAccess(config?: AiExecutionConfig | null): boolean {
  const byok = readStoredByokKeys()
  if (byok.openai || byok.anthropic) return true
  if (config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic) return true
  if (
    config?.allowSystemKeysForUserExecution &&
    (config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic)
  ) {
    return true
  }
  return false
}

/** Check whether the current browser/user execution path can actually run chat turns */
export function hasChatExecutionAccess(config?: AiExecutionConfig | null): boolean {
  const byok = readStoredByokKeys()
  if (byok.openai || byok.anthropic || byok.geminiApiKey || byok.ollamaBaseUrl || byok.ollamaDefaultModel) return true
  if (config?.ollamaEnabled && !!config.defaultOllamaBaseUrl) return true
  if (config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic || config?.userKeyDefaults?.gemini) return true
  if (
    config?.allowSystemKeysForUserExecution &&
    (config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || config?.systemKeyDefaults?.gemini)
  ) {
    return true
  }
  return false
}

/** Build query string with BYOK keys for model discovery endpoints */
export function byokModelParams(): string {
  return byokModelParamsWithOptions()
}

export function byokModelParamsWithOptions(options?: { showAll?: boolean }): string {
  const keys = readStoredByokKeys()
  const params = new URLSearchParams()
  if (keys.openai) params.set('openaiKey', keys.openai)
  if (keys.anthropic) params.set('anthropicKey', keys.anthropic)
  if (keys.geminiApiKey) params.set('geminiKey', keys.geminiApiKey)
  if (keys.ollamaBaseUrl) params.set('ollamaBaseUrl', keys.ollamaBaseUrl)
  if (options?.showAll) params.set('showAll', 'true')
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Fetch models with BYOK keys included */
export async function fetchModelsWithByok(options?: { showAll?: boolean }): Promise<{ models: string[]; modelsByProvider: Record<string, any> }> {
  const res = await fetch(`/api/agents/models${byokModelParamsWithOptions(options)}`)
  if (!res.ok) throw new Error('Failed to load models')
  return res.json()
}

/** Refresh models (clear cache) with BYOK keys */
export async function refreshModelsWithByok(options?: { showAll?: boolean }): Promise<{ models: string[]; modelsByProvider: Record<string, any> }> {
  const res = await fetch('/api/agents/models/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...byokForRequest(), showAll: options?.showAll === true }),
  })
  if (!res.ok) throw new Error('Failed to refresh models')
  return res.json()
}
