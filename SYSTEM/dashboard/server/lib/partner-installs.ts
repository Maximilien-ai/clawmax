export interface CuratedPartnerInstaller {
  commandId: string
  label: string
  command: string[]
  source: 'npx'
}

const CURATED_PARTNER_INSTALLERS: Record<string, CuratedPartnerInstaller> = {
  'cognee-openclaw': {
    commandId: 'cognee-openclaw',
    label: 'Install Cognee OpenClaw plugin',
    command: ['npx', '-y', '@cognee/cognee-openclaw'],
    source: 'npx',
  },
}

export function getCuratedPartnerInstaller(commandId: string): CuratedPartnerInstaller | null {
  return CURATED_PARTNER_INSTALLERS[commandId] || null
}
