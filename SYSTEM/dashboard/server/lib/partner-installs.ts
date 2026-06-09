export interface CuratedPartnerInstaller {
  commandId: string
  label: string
  command: string[]
  source: 'openclaw'
}

const CURATED_PARTNER_INSTALLERS: Record<string, CuratedPartnerInstaller> = {
  'cognee-openclaw': {
    commandId: 'cognee-openclaw',
    label: 'Install Cognee OpenClaw plugin',
    command: ['openclaw', 'plugins', 'install', '@cognee/cognee-openclaw@latest'],
    source: 'openclaw',
  },
}

export function getCuratedPartnerInstaller(commandId: string): CuratedPartnerInstaller | null {
  return CURATED_PARTNER_INSTALLERS[commandId] || null
}
