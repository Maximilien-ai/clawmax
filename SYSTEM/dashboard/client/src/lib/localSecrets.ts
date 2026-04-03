export interface SecretRequirement {
  key: string
  label: string
  kind?: 'api_key' | 'token' | 'text' | 'id' | 'url'
  required?: boolean
  help?: string
  placeholder?: string
  sensitive?: boolean
  workflowFieldLabel?: string
}

type SecretScope = 'template' | 'workflow' | 'skill'

function getSecretStorageKey(scope: SecretScope, subjectId: string) {
  return `clawmax-local-secrets:${scope}:${subjectId}`
}

export function readLocalSecrets(scope: SecretScope, subjectId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(getSecretStorageKey(scope, subjectId)) || '{}')
  } catch {
    return {}
  }
}

export function writeLocalSecrets(scope: SecretScope, subjectId: string, secrets: Record<string, string>) {
  try {
    const cleaned = Object.fromEntries(
      Object.entries(secrets).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    )
    localStorage.setItem(getSecretStorageKey(scope, subjectId), JSON.stringify(cleaned))
  } catch {}
}

export function replaceWorkflowFieldValue(content: string, fieldLabel: string, value: string) {
  if (!value.trim()) return content
  const escaped = fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^(-\\s+\\*\\*${escaped}:\\*\\*)\\s+.*$`, 'gim')
  return content.replace(pattern, `$1 ${value.trim()}`)
}
