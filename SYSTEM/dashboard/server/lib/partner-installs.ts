export interface CuratedPartnerInstaller {
  commandId: string
  label: string
  command: string[]
  source: 'npx'
}

const CURATED_PARTNER_INSTALLERS: Record<string, CuratedPartnerInstaller> = {
}

export function getCuratedPartnerInstaller(commandId: string): CuratedPartnerInstaller | null {
  return CURATED_PARTNER_INSTALLERS[commandId] || null
}
