const STORAGE_KEY = 'clawmax-byok-preview'
const DISMISS_KEY = 'clawmax-byok-preview-dismissed'

export interface StoredByokKeys {
  openai?: string
  anthropic?: string
  opikApiKey?: string
  opikWorkspace?: string
  opikProject?: string
  preferredModel?: string
}

export function getByokStorageKey() {
  return STORAGE_KEY
}

export function getByokDismissKey() {
  return DISMISS_KEY
}

export function readStoredByokKeys(): StoredByokKeys {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function writeStoredByokKeys(keys: StoredByokKeys) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys))
}

/** Build query string with BYOK keys for model discovery endpoints */
export function byokModelParams(): string {
  const keys = readStoredByokKeys()
  const params = new URLSearchParams()
  if (keys.openai) params.set('openaiKey', keys.openai)
  if (keys.anthropic) params.set('anthropicKey', keys.anthropic)
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
    body: JSON.stringify({ openai: keys.openai, anthropic: keys.anthropic }),
  })
  if (!res.ok) throw new Error('Failed to refresh models')
  return res.json()
}
