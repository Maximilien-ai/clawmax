const STORAGE_KEY = 'clawmax-byok-preview'
const DISMISS_KEY = 'clawmax-byok-preview-dismissed'
const BROWSER_VAULT_UPDATED_EVENT = 'clawmax-browser-vault-updated'

export interface StoredByokKeys {
  openai?: string
  anthropic?: string
  geminiApiKey?: string
  ollamaBaseUrl?: string
  ollamaDefaultModel?: string
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

export function writeStoredByokKeys(keys: StoredByokKeys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BROWSER_VAULT_UPDATED_EVENT))
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

/** Build query string with BYOK keys for model discovery endpoints */
export function byokModelParams(): string {
  const keys = readStoredByokKeys()
  const params = new URLSearchParams()
  if (keys.openai) params.set('openaiKey', keys.openai)
  if (keys.anthropic) params.set('anthropicKey', keys.anthropic)
  if (keys.geminiApiKey) params.set('geminiKey', keys.geminiApiKey)
  if (keys.ollamaBaseUrl) params.set('ollamaBaseUrl', keys.ollamaBaseUrl)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/** Fetch models with BYOK keys included */
export async function fetchModelsWithByok(): Promise<{ models: string[]; modelsByProvider: Record<string, any> }> {
  const res = await fetch(`/api/agents/models${byokModelParams()}`)
  if (!res.ok) throw new Error('Failed to load models')
  return res.json()
}

/** Refresh models (clear cache) with BYOK keys */
export async function refreshModelsWithByok(): Promise<{ models: string[]; modelsByProvider: Record<string, any> }> {
  const keys = readStoredByokKeys()
  const res = await fetch('/api/agents/models/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ openai: keys.openai, anthropic: keys.anthropic, gemini: keys.geminiApiKey, ollamaBaseUrl: keys.ollamaBaseUrl }),
  })
  if (!res.ok) throw new Error('Failed to refresh models')
  return res.json()
}
