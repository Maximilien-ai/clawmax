import type { OpenClawSkill, SkillSetupRequirement } from '../types'

export interface SkillSetupHint {
  label: string
  message: string
  commands?: string[]
  actionLabel?: string
  successMessage?: string
  inputs?: SkillSetupRequirement['inputs']
}

const DEFAULT_SETUP_REQUIREMENTS: Record<string, SkillSetupRequirement> = {
  gog: {
    label: 'Needs setup',
    message: 'gog needs Google Workspace auth/account setup before an agent can actually use Gmail, Calendar, Drive, Docs, or Sheets.',
    commands: [
      'gog auth credentials /path/to/client_secret.json',
      'gog auth add you@gmail.com --services gmail,calendar,drive,contacts,docs,sheets',
      'gog auth list',
    ],
    actionId: 'gog-google-workspace-auth',
    actionLabel: 'Complete Setup',
    successMessage: 'Setup flow completed. If gog opened a browser, finish the consent flow there and then retry the agent.',
    inputs: [
      {
        key: 'clientSecretPath',
        label: 'Client Secret JSON',
        kind: 'path',
        required: true,
        placeholder: '/path/to/client_secret.json',
      },
      {
        key: 'accountEmail',
        label: 'Google Account Email',
        kind: 'email',
        required: true,
        placeholder: 'you@gmail.com',
      },
    ],
  },
}

const DASHBOARD_RUNNABLE_SETUP_ACTIONS = new Set([
  'gog-google-workspace-auth',
])

function resolveSkillSetupRequirement(skill: Pick<OpenClawSkill, 'name' | 'setupRequirements'>): SkillSetupRequirement | null {
  const defaults = DEFAULT_SETUP_REQUIREMENTS[skill.name]
  if (!defaults && !skill.setupRequirements) return null
  return {
    ...(defaults || {}),
    ...(skill.setupRequirements || {}),
    inputs: skill.setupRequirements?.inputs || defaults?.inputs,
    commands: skill.setupRequirements?.commands || defaults?.commands,
  }
}

export function getSkillSetupHint(skill: Pick<OpenClawSkill, 'name' | 'setupRequirements'>): SkillSetupHint | null {
  const requirement = resolveSkillSetupRequirement(skill)
  if (!requirement?.message) return null
  return {
    label: requirement.label || 'Needs setup',
    message: requirement.message,
    commands: requirement.commands || [],
    actionLabel: requirement.actionLabel,
    successMessage: requirement.successMessage,
    inputs: requirement.inputs || [],
  }
}

export function supportsDashboardSkillSetup(skill: Pick<OpenClawSkill, 'name' | 'setupRequirements'>): boolean {
  const actionId = resolveSkillSetupRequirement(skill)?.actionId
  return !!actionId && DASHBOARD_RUNNABLE_SETUP_ACTIONS.has(actionId)
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
