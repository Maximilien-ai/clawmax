import type { OpenClawSkill } from '../types'

export interface SkillSetupHint {
  label: string
  message: string
  commands?: string[]
}

export function getSkillSetupHint(skill: Pick<OpenClawSkill, 'name'>): SkillSetupHint | null {
  if (skill.name === 'gog') {
    return {
      label: 'Needs setup',
      message: 'gog needs Google Workspace auth/account setup before an agent can actually use Gmail, Calendar, Drive, Docs, or Sheets.',
      commands: [
        'gog auth credentials /path/to/client_secret.json',
        'gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets',
        'gog auth list',
      ],
    }
  }
  return null
}

export function skillNeedsSetup(skillName: string): boolean {
  return !!getSkillSetupHint({ name: skillName })
}

export function maybeWarnSkillSetup(
  showWarning: (message: string) => void,
  skills: Array<Pick<OpenClawSkill, 'name'> | string>
) {
  const messages = Array.from(new Set(
    skills
      .map((entry) => typeof entry === 'string' ? getSkillSetupHint({ name: entry }) : getSkillSetupHint(entry))
      .filter((hint): hint is SkillSetupHint => !!hint)
      .map((hint) => `${hint.message} ${hint.commands?.join(' · ') || ''}`.trim())
  ))
  if (messages.length > 0) {
    showWarning(messages.join(' '))
  }
}
