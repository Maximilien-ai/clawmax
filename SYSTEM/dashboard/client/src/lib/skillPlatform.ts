export type RuntimePlatform = 'darwin' | 'linux' | 'win32' | 'unknown'

type RegistrySkillLike = {
  name?: string
  full_name?: string
  install_name?: string
  description?: string
  categories?: string[]
}

const KNOWN_MAC_ONLY_SKILLS = new Set([
  'apple-notes',
  'apple-reminders',
  'imsg',
  'things-mac',
  'mail-app',
  'calendar-app',
  'contacts-app',
])

export function normalizeRuntimePlatform(value?: string | null): RuntimePlatform {
  if (value === 'darwin' || value === 'linux' || value === 'win32') return value
  return 'unknown'
}

function buildRegistrySkillText(skill: RegistrySkillLike): string {
  return [
    skill.name,
    skill.full_name,
    skill.install_name,
    skill.description,
    ...(Array.isArray(skill.categories) ? skill.categories : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function isMacOnlyRegistrySkill(skill: RegistrySkillLike): boolean {
  const names = [skill.name, skill.full_name, skill.install_name]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())

  if (names.some((name) => KNOWN_MAC_ONLY_SKILLS.has(name))) {
    return true
  }

  const text = buildRegistrySkillText(skill)
  return (
    /\bmac[- ]only\b/.test(text) ||
    /\bmacos[- ]only\b/.test(text) ||
    /\bdarwin[- ]only\b/.test(text) ||
    /\bapple reminders\b/.test(text) ||
    /\bapple notes\b/.test(text) ||
    /\bimessage\b/.test(text)
  )
}

export function getRegistrySkillCompatibility(skill: RegistrySkillLike, runtimePlatform: RuntimePlatform): {
  compatible: boolean
  reason?: string
} {
  if (runtimePlatform === 'unknown') {
    return { compatible: true }
  }

  if (runtimePlatform !== 'darwin' && isMacOnlyRegistrySkill(skill)) {
    return {
      compatible: false,
      reason: 'This skill appears to be macOS-only and is hidden on non-macOS runtimes.',
    }
  }

  return { compatible: true }
}
