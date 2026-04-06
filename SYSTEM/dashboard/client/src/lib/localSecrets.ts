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

export interface SecretReadinessSummary {
  total: number
  required: number
  present: number
  missingRequired: number
  optionalMissing: number
  status: 'ready' | 'partial' | 'missing'
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

export function summarizeSecretReadiness(
  requirements: SecretRequirement[],
  secrets: Record<string, string>
): SecretReadinessSummary {
  const total = requirements.length
  const required = requirements.filter((requirement) => requirement.required !== false).length
  const present = requirements.filter((requirement) => (secrets[requirement.key] || '').trim().length > 0).length
  const missingRequired = requirements.filter((requirement) => requirement.required !== false && !(secrets[requirement.key] || '').trim()).length
  const optionalMissing = requirements.filter((requirement) => requirement.required === false && !(secrets[requirement.key] || '').trim()).length

  let status: SecretReadinessSummary['status'] = 'ready'
  if (missingRequired > 0) status = 'missing'
  else if (present < total) status = 'partial'

  return {
    total,
    required,
    present,
    missingRequired,
    optionalMissing,
    status,
  }
}
