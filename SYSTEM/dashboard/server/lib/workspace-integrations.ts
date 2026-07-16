import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'
import { normalizeAgentRuntime } from './agent-runtime'

export interface WorkspaceIntegrationConfig {
  preferredModel?: string
  systemPreferredModel?: string
  // Keep as an inline string union (not the `AgentRuntimeId` type) to avoid a type-level
  // dependency on agent-runtime.ts, which already imports readWorkspaceIntegrationConfig from here.
  agentRuntime?: 'openclaw' | 'claude' | 'droid'
  // CLI runtimes enabled for this workspace (multi-select). OpenClaw is always available; these are
  // the non-openclaw CLIs an agent may be pinned to. Enabling one only makes it available per-agent.
  enabledRuntimes?: ('claude' | 'droid')[]
  githubDefaultRepo?: string
  sensoContextLabel?: string
  ollamaBaseUrl?: string
  ollamaDefaultModel?: string
  openaiCompatibleBaseUrl?: string
  openaiCompatibleDefaultModel?: string
  opikWorkspace?: string
  opikProject?: string
  enabledPartners?: string[]
  partners?: Record<string, Record<string, string | boolean | undefined>>
  updatedAt?: string
}

export interface WorkspaceIntegrationSecrets {
  partners?: Record<string, Record<string, string | undefined>>
  updatedAt?: string
}

export interface WorkspaceIntegrationSecretSummary {
  present: boolean
  preview?: string
}

function resolveRuntimeManagedSecret(slug: string, key: string): string | undefined {
  if (slug === 'resend' && key === 'apiKey') {
    return process.env.RESEND_API_KEY?.trim() || undefined
  }
  if (slug === 'github' && key === 'token') {
    return process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || undefined
  }
  if (slug === 'cognee' && key === 'apiKey') {
    return process.env.COGNEE_API_KEY?.trim() || undefined
  }
  return undefined
}

function resolveRuntimeManagedValue(slug: string, key: string): string | undefined {
  if (slug === 'cognee') {
    if (key === 'baseUrl') return process.env.COGNEE_BASE_URL?.trim() || undefined
    if (key === 'datasetName') return process.env.COGNEE_DATASET_NAME?.trim() || undefined
    if (key === 'searchType') return process.env.COGNEE_SEARCH_TYPE?.trim() || undefined
  }
  return undefined
}

const RUNTIME_MANAGED_SECRET_KEYS = [
  ['resend', 'apiKey'],
  ['github', 'token'],
  ['cognee', 'apiKey'],
] as const

const RUNTIME_MANAGED_VALUE_KEYS = [
  ['cognee', 'baseUrl'],
  ['cognee', 'datasetName'],
  ['cognee', 'searchType'],
] as const

function getWorkspaceIntegrationsPath(): string {
  return path.join(getWorkspacePath(), 'SYSTEM', 'integrations.json')
}

function getWorkspaceIntegrationSecretsPath(): string {
  return path.join(getWorkspacePath(), 'SYSTEM', 'integrations.secrets.json')
}

export function readWorkspaceIntegrationConfig(): WorkspaceIntegrationConfig {
  try {
    const filePath = getWorkspaceIntegrationsPath()
    if (!fs.existsSync(filePath)) return {}
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export function getResolvedWorkspaceIntegrationConfig(): WorkspaceIntegrationConfig {
  const config = readWorkspaceIntegrationConfig()
  const partners: Record<string, Record<string, string | boolean | undefined>> = { ...(config.partners || {}) }

  for (const [slug, key] of RUNTIME_MANAGED_VALUE_KEYS) {
    const runtimeValue = resolveRuntimeManagedValue(slug, key)
    if (!runtimeValue) continue
    const existing = partners[slug]?.[key]
    if (typeof existing === 'string' && existing.trim()) continue
    partners[slug] = { ...(partners[slug] || {}), [key]: runtimeValue }
  }

  return {
    ...config,
    partners: Object.keys(partners).length > 0 ? partners : config.partners,
  }
}

export function writeWorkspaceIntegrationConfig(input: WorkspaceIntegrationConfig): WorkspaceIntegrationConfig {
  const normalizedPartners = Object.fromEntries(
    Object.entries(input.partners || {})
      .map(([slug, values]) => [
        slug,
        Object.fromEntries(
          Object.entries(values || {})
            .map(([key, value]) => [key, typeof value === 'string' ? value.trim() || undefined : value])
            .filter(([, value]) => value !== undefined && value !== '')
        ),
      ])
      .filter(([, values]) => Object.keys(values).length > 0)
  )

  const next: WorkspaceIntegrationConfig = {
    preferredModel: input.preferredModel?.trim() || undefined,
    systemPreferredModel: input.systemPreferredModel?.trim() || undefined,
    agentRuntime: normalizeAgentRuntime(input.agentRuntime),
    enabledRuntimes: Array.isArray(input.enabledRuntimes)
      ? (Array.from(new Set(
          input.enabledRuntimes
            .map((item) => normalizeAgentRuntime(item))
            .filter((rt): rt is 'claude' | 'droid' => rt === 'claude' || rt === 'droid')
        )) as ('claude' | 'droid')[])
      : undefined,
    githubDefaultRepo: input.githubDefaultRepo?.trim() || undefined,
    sensoContextLabel: input.sensoContextLabel?.trim() || undefined,
    ollamaBaseUrl: input.ollamaBaseUrl?.trim() || undefined,
    ollamaDefaultModel: input.ollamaDefaultModel?.trim() || undefined,
    openaiCompatibleBaseUrl: input.openaiCompatibleBaseUrl?.trim() || undefined,
    openaiCompatibleDefaultModel: input.openaiCompatibleDefaultModel?.trim() || undefined,
    opikWorkspace: input.opikWorkspace?.trim() || undefined,
    opikProject: input.opikProject?.trim() || undefined,
    enabledPartners: Array.isArray(input.enabledPartners)
      ? Array.from(new Set(input.enabledPartners.map((item) => `${item || ''}`.trim()).filter(Boolean)))
      : undefined,
    partners: Object.keys(normalizedPartners).length > 0 ? normalizedPartners : undefined,
    updatedAt: new Date().toISOString(),
  }

  const filePath = getWorkspaceIntegrationsPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function readWorkspaceIntegrationSecrets(): WorkspaceIntegrationSecrets {
  try {
    const filePath = getWorkspaceIntegrationSecretsPath()
    if (!fs.existsSync(filePath)) return {}
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

export function writeWorkspaceIntegrationSecrets(input: WorkspaceIntegrationSecrets): WorkspaceIntegrationSecrets {
  const normalizedPartners = Object.fromEntries(
    Object.entries(input.partners || {})
      .map(([slug, values]) => [
        slug,
        Object.fromEntries(
          Object.entries(values || {})
            .map(([key, value]) => [key, typeof value === 'string' ? value.trim() || undefined : value])
            .filter(([, value]) => value !== undefined && value !== '')
        ),
      ])
      .filter(([, values]) => Object.keys(values).length > 0)
  )

  const next: WorkspaceIntegrationSecrets = {
    partners: Object.keys(normalizedPartners).length > 0 ? normalizedPartners : undefined,
    updatedAt: new Date().toISOString(),
  }

  const filePath = getWorkspaceIntegrationSecretsPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), { encoding: 'utf-8', mode: 0o600 })
  return next
}

export function getWorkspaceIntegrationSecretPresence(): Record<string, Record<string, boolean>> {
  const secrets = readWorkspaceIntegrationSecrets()
  return Object.fromEntries(
    Object.entries(secrets.partners || {}).map(([slug, values]) => [
      slug,
      Object.fromEntries(
        Object.entries(values || {}).map(([key, value]) => [key, !!`${value || ''}`.trim()])
      ),
    ])
  )
}

export function getResolvedWorkspaceIntegrationSecretPresence(): Record<string, Record<string, boolean>> {
  const stored = getWorkspaceIntegrationSecretPresence()
  const merged: Record<string, Record<string, boolean>> = { ...stored }

  for (const [slug, key] of RUNTIME_MANAGED_SECRET_KEYS) {
    const runtimeSecret = resolveRuntimeManagedSecret(slug, key)
    if (!runtimeSecret) continue
    merged[slug] = { ...(merged[slug] || {}), [key]: true }
  }

  return merged
}

function maskSecretPreview(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return '••••'
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`
}

export function getWorkspaceIntegrationSecretSummaries(): Record<string, Record<string, WorkspaceIntegrationSecretSummary>> {
  const secrets = readWorkspaceIntegrationSecrets()
  return Object.fromEntries(
    Object.entries(secrets.partners || {}).map(([slug, values]) => [
      slug,
      Object.fromEntries(
        Object.entries(values || {}).map(([key, value]) => {
          const trimmed = `${value || ''}`.trim()
          return [key, {
            present: !!trimmed,
            preview: trimmed ? maskSecretPreview(trimmed) : undefined,
          }]
        })
      ),
    ])
  )
}

export function getResolvedWorkspaceIntegrationSecretSummaries(): Record<string, Record<string, WorkspaceIntegrationSecretSummary>> {
  const stored = getWorkspaceIntegrationSecretSummaries()
  const merged: Record<string, Record<string, WorkspaceIntegrationSecretSummary>> = { ...stored }

  for (const [slug, key] of RUNTIME_MANAGED_SECRET_KEYS) {
    const runtimeSecret = resolveRuntimeManagedSecret(slug, key)
    if (!runtimeSecret) continue
    const existing = merged[slug]?.[key]
    if (existing?.present) continue
    merged[slug] = {
      ...(merged[slug] || {}),
      [key]: {
        present: true,
        preview: maskSecretPreview(runtimeSecret),
      },
    }
  }

  return merged
}

export function hasWorkspaceManagedPartnerSecrets(): boolean {
  return Object.values(getResolvedWorkspaceIntegrationSecretSummaries()).some((partnerSecrets) => (
    Object.values(partnerSecrets || {}).some((summary) => summary.present)
  ))
}

export function getWorkspaceGitHubToken(): string | undefined {
  const secrets = readWorkspaceIntegrationSecrets()
  const token = secrets.partners?.github?.token?.trim()
  return token || undefined
}
