import { getPartnerVaultKey } from './localSecrets'

type PartnerDefinition = {
  slug: string
  fields?: Array<{ key: string; secret?: boolean; storage?: 'browser' | 'server' }>
}

type PartnerSecretPresence = Record<string, Record<string, boolean>>

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
