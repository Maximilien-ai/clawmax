import type { OpenClawSkill, SkillSetupRequirement } from '../types'

export interface SkillSetupHint {
  label: string
  message: string
  commands?: string[]
  actionLabel?: string
  successMessage?: string
  inputs?: SkillSetupRequirement['inputs']
  mode?: SkillSetupSupportMode
}

export type SkillSetupSupportMode = 'guided' | 'interactive' | 'manual'
type SkillSetupContext = {
  availableSecretKeys?: Iterable<string>
}

const DEFAULT_SETUP_REQUIREMENTS: Record<string, SkillSetupRequirement> = {
  '1password': {
    label: 'Needs setup',
    message: '1Password CLI needs account sign-in/authorization before an agent can use it.',
    commands: [
      'op signin',
      'op whoami',
    ],
  },
  github: {
    label: 'Needs setup',
    message: 'GitHub CLI needs account authentication before an agent can use GitHub operations.',
    commands: [
      'gh auth login',
      'gh auth status',
    ],
  },
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
  gemini: {
    label: 'Needs setup',
    message: 'Gemini CLI may need an interactive login/auth flow before an agent can use it.',
    commands: [
      'gemini',
    ],
  },
  himalaya: {
    label: 'Needs setup',
    message: 'Himalaya needs an email account configured before an agent can use it. The dashboard can open the upstream account wizard in a constrained setup session for this skill.',
    commands: [
      'himalaya account configure <account-name>',
      'himalaya account list',
    ],
    actionId: 'himalaya-account-configure',
    actionLabel: 'Open Setup Session',
    successMessage: 'Himalaya setup session completed. Verify the account with `himalaya account list` if needed.',
    inputs: [
      {
        key: 'accountName',
        label: 'Account Name',
        kind: 'text',
        required: true,
        placeholder: 'work',
        help: 'This becomes the Himalaya account key in the config file.',
      },
      {
        key: 'configPath',
        label: 'Config File Path',
        kind: 'path',
        required: false,
        placeholder: '~/.config/himalaya/config.toml',
        help: 'Optional custom Himalaya config path. Leave empty to use the default runtime location.',
      },
    ],
  },
  wacli: {
    label: 'Needs setup',
    message: 'wacli needs WhatsApp authentication and an initial sync before an agent can use it.',
    commands: [
      'wacli auth',
      'wacli sync --follow',
      'wacli doctor',
    ],
  },
  eightctl: {
    label: 'Needs setup',
    message: 'eightctl needs Eight Sleep credentials/config before an agent can use it.',
    commands: [
      'export EIGHTCTL_EMAIL="you@example.com"',
      'export EIGHTCTL_PASSWORD="..."',
    ],
  },
}

const DASHBOARD_RUNNABLE_SETUP_ACTIONS = new Set([
  'gog-google-workspace-auth',
])

const DASHBOARD_INTERACTIVE_SETUP_ACTIONS = new Set([
  'himalaya-account-configure',
])

const DEFAULT_SKILL_SETUP_SUPPORT_MODES: Record<string, SkillSetupSupportMode> = {
  '1password': 'manual',
  github: 'manual',
  gog: 'guided',
  gemini: 'manual',
  himalaya: 'interactive',
  wacli: 'manual',
  eightctl: 'manual',
}

function resolveAvailableSecretKeys(context?: SkillSetupContext): Set<string> {
  return new Set(Array.from(context?.availableSecretKeys || []).filter(Boolean))
}

function buildGenericSetupRequirement(
  skill: Pick<OpenClawSkill, 'requires' | 'secretRequirements'>,
  context?: SkillSetupContext
): SkillSetupRequirement | null {
  const availableSecretKeys = resolveAvailableSecretKeys(context)
  const secretKeys = (skill.secretRequirements || []).map((entry) => entry.key).filter(Boolean)
  if (secretKeys.length > 0) {
    const missingSecretKeys = secretKeys.filter((key) => !availableSecretKeys.has(key))
    if (missingSecretKeys.length === 0) {
      return null
    }
    return {
      label: 'Needs setup',
      message: `This skill needs secrets or API keys configured before an agent can use it: ${missingSecretKeys.join(', ')}.`,
    }
  }

  const envKeys = (skill.requires?.env || []).filter(Boolean)
  if (envKeys.length > 0) {
    const missingEnvKeys = envKeys.filter((key) => !availableSecretKeys.has(key))
    if (missingEnvKeys.length === 0) {
      return null
    }
    return {
      label: 'Needs setup',
      message: `This skill needs environment variables or API keys configured before an agent can use it: ${missingEnvKeys.join(', ')}.`,
    }
  }

  const configKeys = (skill.requires?.config || []).filter(Boolean)
  if (configKeys.length > 0) {
    return {
      label: 'Needs setup',
      message: `This skill needs runtime configuration before an agent can use it: ${configKeys.join(', ')}.`,
    }
  }

  return null
}

function resolveSkillSetupRequirement(
  skill: Pick<OpenClawSkill, 'name' | 'setupRequirements' | 'requires' | 'secretRequirements'>,
  context?: SkillSetupContext
): SkillSetupRequirement | null {
  const defaults = DEFAULT_SETUP_REQUIREMENTS[skill.name]
  const generic = buildGenericSetupRequirement(skill, context)
  if (!defaults && !skill.setupRequirements && !generic) return null
  return {
    ...(generic || {}),
    ...(defaults || {}),
    ...(skill.setupRequirements || {}),
    inputs: skill.setupRequirements?.inputs || defaults?.inputs,
    commands: skill.setupRequirements?.commands || defaults?.commands,
  }
}

export function getSkillSetupHint(
  skill: Pick<OpenClawSkill, 'name' | 'setupRequirements' | 'requires' | 'secretRequirements'>,
  context?: SkillSetupContext
): SkillSetupHint | null {
  const requirement = resolveSkillSetupRequirement(skill, context)
  if (!requirement?.message) return null
  const mode = getSkillSetupSupportMode(skill)
  return {
    label: requirement.label || 'Needs setup',
    message: requirement.message,
    commands: requirement.commands || [],
    actionLabel: requirement.actionLabel,
    successMessage: requirement.successMessage,
    inputs: requirement.inputs || [],
    mode,
  }
}

export function supportsDashboardSkillSetup(skill: Pick<OpenClawSkill, 'name' | 'setupRequirements'>): boolean {
  const actionId = resolveSkillSetupRequirement(skill)?.actionId
  return !!actionId && DASHBOARD_RUNNABLE_SETUP_ACTIONS.has(actionId)
}

export function supportsDashboardInteractiveSkillSetup(skill: Pick<OpenClawSkill, 'name' | 'setupRequirements'>): boolean {
  const actionId = resolveSkillSetupRequirement(skill)?.actionId
  return !!actionId && DASHBOARD_INTERACTIVE_SETUP_ACTIONS.has(actionId)
}

export function getSkillSetupSupportMode(
  skill: Pick<OpenClawSkill, 'name' | 'setupRequirements' | 'requires' | 'secretRequirements'>
): SkillSetupSupportMode | null {
  const requirement = resolveSkillSetupRequirement(skill)
  if (!requirement?.message) return null
  if (supportsDashboardSkillSetup(skill)) return 'guided'
  if (supportsDashboardInteractiveSkillSetup(skill)) return 'interactive'
  return DEFAULT_SKILL_SETUP_SUPPORT_MODES[skill.name] || 'manual'
}

export function getSetupCatalogAuditEntries(): Array<{ skillName: string; mode: SkillSetupSupportMode }> {
  return Object.entries(DEFAULT_SKILL_SETUP_SUPPORT_MODES).map(([skillName, mode]) => ({ skillName, mode }))
}

export function skillNeedsSetup(skillName: string): boolean {
  return !!getSkillSetupHint({ name: skillName })
}

export function maybeWarnSkillSetup(
  showWarning: (message: string) => void,
  skills: Array<Pick<OpenClawSkill, 'name'> | string>,
  context?: SkillSetupContext
) {
  const messages = Array.from(new Set(
    skills
      .map((entry) => typeof entry === 'string' ? getSkillSetupHint({ name: entry }, context) : getSkillSetupHint(entry, context))
      .filter((hint): hint is SkillSetupHint => !!hint)
      .map((hint) => `${hint.message} ${hint.commands?.join(' · ') || ''}`.trim())
  ))
  if (messages.length > 0) {
    showWarning(messages.join(' '))
  }
}
