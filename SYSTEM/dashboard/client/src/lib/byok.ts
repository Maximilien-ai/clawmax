const STORAGE_KEY = 'clawmax-byok-preview'
const DISMISS_KEY = 'clawmax-byok-preview-dismissed'
const BROWSER_VAULT_UPDATED_EVENT = 'clawmax-browser-vault-updated'

export interface StoredByokKeys {
  openai?: string
  anthropic?: string
  geminiApiKey?: string
  ollamaBaseUrl?: string
  ollamaDefaultModel?: string
  openaiCompatibleApiKey?: string
  openaiCompatibleBaseUrl?: string
  openaiCompatibleDefaultModel?: string
  verifiedProviders?: Partial<Record<'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openaiCompatible', string>>
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
  openaiCompatibleApiKey?: string
  openaiCompatibleBaseUrl?: string
  openaiCompatibleDefaultModel?: string
}

interface AiExecutionConfig {
  deploymentKind?: 'local' | 'onprem' | 'cloud'
  allowSystemKeysForUserExecution?: boolean
  managedRuntime?: boolean
  ollamaEnabled?: boolean
  defaultOllamaBaseUrl?: string
  defaultOpenAiCompatibleBaseUrl?: string
  recommendedModel?: string
  systemKeyDefaults?: {
    openai?: boolean
    anthropic?: boolean
    gemini?: boolean
    openaiCompatible?: boolean
  }
  userKeyDefaults?: {
    openai?: boolean
    anthropic?: boolean
    gemini?: boolean
    openaiCompatible?: boolean
  }
}

export interface AiGenerationReadiness {
  enabled: boolean
  warning?: string
}

export function isOllamaUiAvailable(config?: AiExecutionConfig | null): boolean {
  if (config?.deploymentKind === 'cloud') return false
  return config?.ollamaEnabled === true && !!config.defaultOllamaBaseUrl
}

function normalizeOllamaBaseUrlCandidate(value?: string | null): string {
  return String(value || '').trim().replace(/\/+$/, '')
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '0.0.0.0'
    || normalized === '::1'
}

export function isLocalOllamaBaseUrl(value?: string | null): boolean {
  const normalized = normalizeOllamaBaseUrlCandidate(value)
  if (!normalized) return false
  try {
    return isLoopbackHostname(new URL(normalized).hostname)
  } catch {
    return false
  }
}

export function resolveOllamaBaseUrlForRuntime(input: {
  configuredBaseUrl?: string | null
  managedRuntime?: boolean
  runtimeDefaultBaseUrl?: string | null
}): string {
  const configuredBaseUrl = normalizeOllamaBaseUrlCandidate(input.configuredBaseUrl)
  const runtimeDefaultBaseUrl = normalizeOllamaBaseUrlCandidate(input.runtimeDefaultBaseUrl)
  if (!input.managedRuntime || !runtimeDefaultBaseUrl) {
    return configuredBaseUrl || runtimeDefaultBaseUrl
  }
  if (!configuredBaseUrl) return runtimeDefaultBaseUrl
  if (configuredBaseUrl === runtimeDefaultBaseUrl) return configuredBaseUrl
  if (isLocalOllamaBaseUrl(configuredBaseUrl) && !isLocalOllamaBaseUrl(runtimeDefaultBaseUrl)) {
    return runtimeDefaultBaseUrl
  }
  return configuredBaseUrl
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
  provider: 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'openaiCompatible',
  values: { openai?: string; anthropic?: string; geminiApiKey?: string; ollamaBaseUrl?: string; ollamaDefaultModel?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
): string {
  if (provider === 'openai') return values.openai?.trim() || ''
  if (provider === 'anthropic') return values.anthropic?.trim() || ''
  if (provider === 'gemini') return values.geminiApiKey?.trim() || ''
  if (provider === 'openaiCompatible') {
    return `${values.openaiCompatibleBaseUrl?.trim() || ''}::${values.openaiCompatibleApiKey?.trim() || ''}::${values.openaiCompatibleDefaultModel?.trim() || ''}`
  }
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
    openaiCompatibleApiKey: keys.openaiCompatibleApiKey,
    openaiCompatibleBaseUrl: keys.openaiCompatibleBaseUrl,
    openaiCompatibleDefaultModel: keys.openaiCompatibleDefaultModel,
  }
}

/** Check if any LLM API keys are available (BYOK, system, or user defaults) */
export function hasAnyLLMKeys(config?: { systemKeyDefaults?: { openai?: boolean; anthropic?: boolean }; userKeyDefaults?: { openai?: boolean; anthropic?: boolean } }): boolean {
  const byok = readStoredByokKeys()
  if (byok.openai || byok.anthropic || byok.geminiApiKey || byok.ollamaBaseUrl || byok.ollamaDefaultModel || byok.openaiCompatibleBaseUrl || byok.openaiCompatibleDefaultModel) return true
  if (config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || (config as any)?.systemKeyDefaults?.gemini || (config as any)?.systemKeyDefaults?.openaiCompatible) return true
  if (config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic || (config as any)?.userKeyDefaults?.gemini || (config as any)?.userKeyDefaults?.openaiCompatible) return true
  return false
}

/** Check whether the current browser/user execution path can actually run AI generation */
export function hasAiGenerationAccess(config?: AiExecutionConfig | null): boolean {
  const byok = readStoredByokKeys()
  if (byok.openai || byok.anthropic || byok.openaiCompatibleBaseUrl) return true
  if (config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic || (config as any)?.userKeyDefaults?.openaiCompatible) return true
  if (
    config?.allowSystemKeysForUserExecution &&
    (config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || (config as any)?.systemKeyDefaults?.openaiCompatible)
  ) {
    return true
  }
  return false
}

export function getAiGenerationReadiness(config?: AiExecutionConfig | null): AiGenerationReadiness {
  const enabled = hasAiGenerationAccess(config)
  if (!enabled) {
    return {
      enabled: false,
      warning: 'AI generation will fail until you add and verify an OpenAI, Anthropic, or OpenAI-compatible setup, or use a usable shared hosted execution path.',
    }
  }

  const byok = readStoredByokKeys()
  const verifiedProviders = byok.verifiedProviders || {}
  const hasSharedHostedExecution = !!(
    config?.userKeyDefaults?.openai
    || config?.userKeyDefaults?.anthropic
    || (config as any)?.userKeyDefaults?.openaiCompatible
    || (config?.allowSystemKeysForUserExecution && (config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || (config as any)?.systemKeyDefaults?.openaiCompatible))
  )

  const openaiFingerprint = buildByokVerificationFingerprint('openai', { openai: byok.openai })
  const anthropicFingerprint = buildByokVerificationFingerprint('anthropic', { anthropic: byok.anthropic })
  const openaiCompatibleFingerprint = buildByokVerificationFingerprint('openaiCompatible', {
    openaiCompatibleApiKey: byok.openaiCompatibleApiKey,
    openaiCompatibleBaseUrl: byok.openaiCompatibleBaseUrl,
    openaiCompatibleDefaultModel: byok.openaiCompatibleDefaultModel,
  })
  const openaiVerified = !!openaiFingerprint && verifiedProviders.openai === openaiFingerprint
  const anthropicVerified = !!anthropicFingerprint && verifiedProviders.anthropic === anthropicFingerprint
  const openaiCompatibleVerified = !!openaiCompatibleFingerprint && verifiedProviders.openaiCompatible === openaiCompatibleFingerprint
  const hasHostedBrowserKey = !!(byok.openai?.trim() || byok.anthropic?.trim() || (byok.openaiCompatibleBaseUrl?.trim() && byok.openaiCompatibleDefaultModel?.trim()))
  const hasVerifiedHostedBrowserKey = openaiVerified || anthropicVerified || openaiCompatibleVerified

  if (byok.openaiCompatibleBaseUrl?.trim() && !byok.openaiCompatibleDefaultModel?.trim()) {
    return {
      enabled: true,
      warning: 'OpenAI-compatible AI generation needs a default model in BYOK. Add one before using templates, agents, workflows, or skills generation.',
    }
  }

  if (hasHostedBrowserKey && !hasVerifiedHostedBrowserKey && !hasSharedHostedExecution) {
    return {
      enabled: true,
      warning: 'Your browser-local OpenAI, Anthropic, or OpenAI-compatible setup has not been verified yet. AI generation may fail until you run Check Key in BYOK.',
    }
  }

  if (!hasHostedBrowserKey && !hasSharedHostedExecution) {
    return {
      enabled: true,
      warning: 'No verified hosted execution path is available for AI generation yet. Add and check an OpenAI, Anthropic, or OpenAI-compatible setup in BYOK if generation fails.',
    }
  }

  return { enabled: true }
}

/** Check whether the current browser/user execution path can actually run chat turns */
export function hasChatExecutionAccess(config?: AiExecutionConfig | null): boolean {
  const byok = readStoredByokKeys()
  if (byok.openai || byok.anthropic || byok.geminiApiKey || byok.ollamaBaseUrl || byok.ollamaDefaultModel || byok.openaiCompatibleBaseUrl || byok.openaiCompatibleDefaultModel) return true
  if (isOllamaUiAvailable(config)) return true
  if (config?.userKeyDefaults?.openai || config?.userKeyDefaults?.anthropic || config?.userKeyDefaults?.gemini || (config as any)?.userKeyDefaults?.openaiCompatible) return true
  if (
    config?.allowSystemKeysForUserExecution &&
    (config?.systemKeyDefaults?.openai || config?.systemKeyDefaults?.anthropic || config?.systemKeyDefaults?.gemini || (config as any)?.systemKeyDefaults?.openaiCompatible)
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
  if (keys.openaiCompatibleApiKey) params.set('openaiCompatibleApiKey', keys.openaiCompatibleApiKey)
  if (keys.openaiCompatibleBaseUrl) params.set('openaiCompatibleBaseUrl', keys.openaiCompatibleBaseUrl)
  if (keys.openaiCompatibleDefaultModel) params.set('openaiCompatibleDefaultModel', keys.openaiCompatibleDefaultModel)
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
