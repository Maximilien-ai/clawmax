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
type SharedSecretScope = 'global' | 'workspace'
export type SharedSecretRecord = Record<string, string>
export type PartnerFieldDefinition = {
  key: string
  label: string
  secret?: boolean
}

const ACTIVE_WORKSPACE_STORAGE_KEY = 'clawmax-active-workspace-id'
const SHARED_SECRET_STORAGE_KEY = 'clawmax-shared-secrets'
export const BROWSER_VAULT_UPDATED_EVENT = 'clawmax-browser-vault-updated'

function getSecretStorageKey(scope: SecretScope, subjectId: string) {
  return `clawmax-local-secrets:${scope}:${subjectId}`
}

export function normalizeSecrets(secrets: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(secrets).filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
  )
}

export function mergeSecretSources(
  globalSecrets: SharedSecretRecord,
  workspaceSecrets: SharedSecretRecord,
  localSecrets: SharedSecretRecord
): SharedSecretRecord {
  return {
    ...globalSecrets,
    ...workspaceSecrets,
    ...localSecrets,
  }
}

export function findManagedSecretConflicts(
  sharedSecrets: SharedSecretRecord,
  managedSecrets: SharedSecretRecord
): Array<{ key: string; sharedValue: string; managedValue: string }> {
  return Object.keys(sharedSecrets)
    .filter((key) => {
      const sharedValue = (sharedSecrets[key] || '').trim()
      const managedValue = (managedSecrets[key] || '').trim()
      return !!sharedValue && !!managedValue && sharedValue !== managedValue
    })
    .sort()
    .map((key) => ({
      key,
      sharedValue: sharedSecrets[key],
      managedValue: managedSecrets[key],
    }))
}

export function getPartnerVaultKey(slug: string, fieldKey: string) {
  const upperSlug = slug.replace(/[^a-z0-9]+/gi, '_').toUpperCase()
  const normalizedField = fieldKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-z0-9]+/gi, '_').toUpperCase()
  if (fieldKey === 'apiKey') return `${upperSlug}_API_KEY`
  if (fieldKey === 'defaultRepo') return `${upperSlug}_DEFAULT_REPO`
  if (fieldKey === 'defaultSandbox') return `${upperSlug}_DEFAULT_SANDBOX`
  if (fieldKey === 'projectId') return `${upperSlug}_PROJECT_ID`
  if (fieldKey === 'contextLabel') return `${upperSlug}_CONTEXT_LABEL`
  return `${upperSlug}_${normalizedField}`
}

export function readPartnerValuesFromSharedSecrets(
  slug: string,
  fields: PartnerFieldDefinition[] | undefined,
  sharedSecrets: SharedSecretRecord
): SharedSecretRecord {
  return Object.fromEntries(
    (fields || [])
      .map((field) => [field.key, sharedSecrets[getPartnerVaultKey(slug, field.key)] || ''] as const)
      .filter(([, value]) => !!value.trim())
  )
}

export function writePartnerValuesToSharedSecrets(
  slug: string,
  fields: PartnerFieldDefinition[] | undefined,
  currentSharedSecrets: SharedSecretRecord,
  partnerValues: SharedSecretRecord
): SharedSecretRecord {
  const next = { ...currentSharedSecrets }
  for (const field of fields || []) {
    const vaultKey = getPartnerVaultKey(slug, field.key)
    const value = (partnerValues[field.key] || '').trim()
    if (value) next[vaultKey] = value
    else delete next[vaultKey]
  }
  return normalizeSecrets(next)
}

export function parseEnvLikeSecrets(input: string): SharedSecretRecord {
  const parsed: SharedSecretRecord = {}
  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line
    const separatorIndex = withoutExport.indexOf('=')
    if (separatorIndex <= 0) continue
    const rawKey = withoutExport.slice(0, separatorIndex).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rawKey)) continue
    let rawValue = withoutExport.slice(separatorIndex + 1).trim()
    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      rawValue = rawValue.slice(1, -1)
    }
    if (!rawValue) continue
    parsed[rawKey] = rawValue
  }
  return normalizeSecrets(parsed)
}

function getActiveWorkspaceId() {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

type SharedSecretStore = {
  global?: Record<string, string>
  workspaces?: Record<string, Record<string, string>>
}

function readSharedSecretStore(): SharedSecretStore {
  try {
    return JSON.parse(localStorage.getItem(SHARED_SECRET_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeSharedSecretStore(store: SharedSecretStore) {
  try {
    localStorage.setItem(SHARED_SECRET_STORAGE_KEY, JSON.stringify(store))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(BROWSER_VAULT_UPDATED_EVENT))
    }
  } catch {}
}

export function readSharedSecrets(scope: SharedSecretScope = 'global', workspaceId?: string): Record<string, string> {
  const store = readSharedSecretStore()
  if (scope === 'workspace') {
    const resolvedWorkspaceId = workspaceId || getActiveWorkspaceId()
    if (!resolvedWorkspaceId) return {}
    return { ...(store.workspaces?.[resolvedWorkspaceId] || {}) }
  }
  return { ...(store.global || {}) }
}

export function writeSharedSecrets(
  secrets: Record<string, string>,
  options?: { scope?: SharedSecretScope; workspaceId?: string }
) {
  const scope = options?.scope || 'global'
  const store = readSharedSecretStore()
  const cleaned = normalizeSecrets(secrets)
  if (scope === 'workspace') {
    const resolvedWorkspaceId = options?.workspaceId || getActiveWorkspaceId()
    if (!resolvedWorkspaceId) return
    store.workspaces = {
      ...(store.workspaces || {}),
      [resolvedWorkspaceId]: cleaned,
    }
  } else {
    store.global = cleaned
  }
  writeSharedSecretStore(store)
}

export function setActiveWorkspaceSecretScope(workspaceId: string) {
  try {
    if (workspaceId) localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId)
  } catch {}
}

export function resolveSecretsWithSharedFallback(localSecrets: Record<string, string>): Record<string, string> {
  return mergeSecretSources(readSharedSecrets('global'), readSharedSecrets('workspace'), localSecrets)
}

export function readLocalSecrets(scope: SecretScope, subjectId: string): Record<string, string> {
  try {
    const localSecrets = JSON.parse(localStorage.getItem(getSecretStorageKey(scope, subjectId)) || '{}')
    return resolveSecretsWithSharedFallback(localSecrets)
  } catch {
    return resolveSecretsWithSharedFallback({})
  }
}

export function writeLocalSecrets(scope: SecretScope, subjectId: string, secrets: Record<string, string>) {
  try {
    const cleaned = normalizeSecrets(secrets)
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
