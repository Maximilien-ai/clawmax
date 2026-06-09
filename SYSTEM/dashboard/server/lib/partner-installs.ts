export interface CuratedPartnerInstaller {
  commandId: string
  pluginId: string
  label: string
  installCommand: string[]
  uninstallCommand: string[]
  source: 'openclaw'
}

const CURATED_PARTNER_INSTALLERS: Record<string, CuratedPartnerInstaller> = {
  'cognee-openclaw': {
    commandId: 'cognee-openclaw',
    pluginId: 'cognee-openclaw',
    label: 'Install Cognee OpenClaw plugin',
    installCommand: ['openclaw', 'plugins', 'install', '@cognee/cognee-openclaw@latest'],
    uninstallCommand: ['openclaw', 'plugins', 'uninstall', 'cognee-openclaw', '--force'],
    source: 'openclaw',
  },
}

export function getCuratedPartnerInstaller(commandId: string): CuratedPartnerInstaller | null {
  return CURATED_PARTNER_INSTALLERS[commandId] || null
}

export function listCuratedPartnerInstallers(): CuratedPartnerInstaller[] {
  return Object.values(CURATED_PARTNER_INSTALLERS)
}
