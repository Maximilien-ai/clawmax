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
  degraded: number
  missingLabels: string[]
  degradedLabels: string[]
  optionalMissingLabels: string[]
  status: 'ready' | 'degraded' | 'missing'
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
  const normalizedValue = (value: string) => value.trim().toLowerCase()
  const looksPlaceholder = (requirement: SecretRequirement, rawValue: string) => {
    const value = normalizedValue(rawValue)
    if (!value) return false
    if (/^\[[^\]]*\]$/.test(value)) return true
    if (value === '...' || value === '…' || value === 'changeme' || value === 'replace-me' || value === 'replace_me') return true
    if (value.startsWith('your-') || value.startsWith('your_')) return true
    if (value.includes('example')) return true
    if ((requirement.kind === 'api_key' || requirement.kind === 'token') && value.length < 8) return true
    if (requirement.kind === 'url') {
      if (!/^https?:\/\//.test(value) && !/^redis:\/\//.test(value)) return true
    }
    return false
  }

  const present = requirements.filter((requirement) => (secrets[requirement.key] || '').trim().length > 0).length
  const missingRequiredLabels = requirements
    .filter((requirement) => requirement.required !== false && !(secrets[requirement.key] || '').trim())
    .map((requirement) => requirement.label)
  const optionalMissingLabels = requirements
    .filter((requirement) => requirement.required === false && !(secrets[requirement.key] || '').trim())
    .map((requirement) => requirement.label)
  const degradedLabels = requirements
    .filter((requirement) => {
      const value = (secrets[requirement.key] || '').trim()
      return !!value && looksPlaceholder(requirement, value)
    })
    .map((requirement) => requirement.label)

  const missingRequired = missingRequiredLabels.length
  const optionalMissing = optionalMissingLabels.length
  const degraded = degradedLabels.length

  let status: SecretReadinessSummary['status'] = 'ready'
  if (missingRequired > 0) status = 'missing'
  else if (degraded > 0 || optionalMissing > 0) status = 'degraded'

  return {
    total,
    required,
    present,
    missingRequired,
    optionalMissing,
    degraded,
    missingLabels: missingRequiredLabels,
    degradedLabels,
    optionalMissingLabels,
    status,
  }
}
