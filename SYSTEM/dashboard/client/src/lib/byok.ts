const STORAGE_KEY = 'clawmax-byok-preview'
const DISMISS_KEY = 'clawmax-byok-preview-dismissed'

export interface StoredByokKeys {
  openai?: string
  anthropic?: string
  opikApiKey?: string
  opikWorkspace?: string
  opikProject?: string
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
