import { getPartnerVaultKey } from './localSecrets'

type PartnerDefinition = {
  slug: string
  fields?: Array<{ key: string; secret?: boolean; storage?: 'browser' | 'server' }>
}

type PartnerSecretPresence = Record<string, Record<string, boolean>>
type PartnerSecretSummary = Record<string, Record<string, { present?: boolean; preview?: string }>>

export type SecretAvailabilityPresentation = {
  sourceLabel: 'Browser-local' | 'Runtime-managed'
  runtimeLabel: string
  agentRuntimeAvailable: boolean
}

export function getSecretAvailabilityPresentation(serverManaged: boolean): SecretAvailabilityPresentation {
  if (serverManaged) {
    return {
      sourceLabel: 'Runtime-managed',
      runtimeLabel: 'Configured integration runtime only; agent skills require an explicit grant',
      agentRuntimeAvailable: false,
    }
  }

  return {
    sourceLabel: 'Browser-local',
    runtimeLabel: 'Not available to agent runtime from this vault',
    agentRuntimeAvailable: false,
  }
}

export function listServerManagedIntegrationSecretKeys(
  partnerDefinitions: PartnerDefinition[],
  secretPresence: PartnerSecretPresence
): string[] {
  const keys = new Set<string>()

  for (const partner of partnerDefinitions) {
    for (const field of partner.fields || []) {
      if (!field.secret || field.storage !== 'server') continue
      if (secretPresence[partner.slug]?.[field.key]) {
        keys.add(getPartnerVaultKey(partner.slug, field.key))
      }
    }
  }

  return Array.from(keys).sort((a, b) => a.localeCompare(b))
}

export function buildServerManagedWorkspaceEntries(
  partnerDefinitions: PartnerDefinition[],
  secretSummaries: PartnerSecretSummary
): Record<string, string> {
  const entries: Record<string, string> = {}

  for (const partner of partnerDefinitions) {
    for (const field of partner.fields || []) {
      if (!field.secret || field.storage !== 'server') continue
      const summary = secretSummaries[partner.slug]?.[field.key]
      if (!summary?.present) continue
      entries[getPartnerVaultKey(partner.slug, field.key)] = summary.preview || '••••'
    }
  }

  return entries
}
