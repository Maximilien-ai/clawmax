export interface CuratedPartnerInstaller {
  commandId: string
  label: string
  command: string[]
  source: 'npx'
}

const CURATED_PARTNER_INSTALLERS: Record<string, CuratedPartnerInstaller> = {
  'blaxel-agent-skills': {
    commandId: 'blaxel-agent-skills',
    label: 'Install Blaxel agent skills',
    command: ['npx', '-y', 'skills', 'add', 'blaxel-ai/agent-skills', '--yes', '--global'],
    source: 'npx',
  },
  'redis-agent-skills': {
    commandId: 'redis-agent-skills',
    label: 'Install Redis agent skills',
    command: ['npx', '-y', 'skills', 'add', 'redis/agent-skills', '--yes', '--global'],
    source: 'npx',
  },
}

export function getCuratedPartnerInstaller(commandId: string): CuratedPartnerInstaller | null {
  return CURATED_PARTNER_INSTALLERS[commandId] || null
}
