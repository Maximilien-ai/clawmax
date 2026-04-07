import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'

export interface WorkspaceIntegrationConfig {
  preferredModel?: string
  githubDefaultRepo?: string
  sensoContextLabel?: string
  ollamaBaseUrl?: string
  ollamaDefaultModel?: string
  opikWorkspace?: string
  opikProject?: string
  enabledPartners?: string[]
  partners?: Record<string, Record<string, string | boolean | undefined>>
  updatedAt?: string
}

function getWorkspaceIntegrationsPath(): string {
  return path.join(getWorkspacePath(), 'SYSTEM', 'integrations.json')
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
    githubDefaultRepo: input.githubDefaultRepo?.trim() || undefined,
    sensoContextLabel: input.sensoContextLabel?.trim() || undefined,
    ollamaBaseUrl: input.ollamaBaseUrl?.trim() || undefined,
    ollamaDefaultModel: input.ollamaDefaultModel?.trim() || undefined,
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
