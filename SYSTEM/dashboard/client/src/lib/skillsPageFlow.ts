import { normalizeRuntimePlatform, type RuntimePlatform } from './skillPlatform'

export function buildSkillsPageCountLabel(filteredCount: number, totalCount: number): string {
  return `Showing ${filteredCount} of ${totalCount} skills`
}

type SkillListEntry = {
  name: string
  source: 'bundled' | 'managed' | 'workspace'
}

type PartnerSkillMatcher = {
  items?: string[]
  matchNames?: string[]
  matchPrefixes?: string[]
}

function normalizePartnerSkillMatchers(partnerSkills: PartnerSkillMatcher[]): {
  exactNames: Set<string>
  prefixes: string[]
} {
  const exactNames = new Set<string>()
  const prefixes: string[] = []

  for (const skills of partnerSkills) {
    for (const name of skills.items || []) {
      if (name) exactNames.add(name.toLowerCase())
    }
    for (const name of skills.matchNames || []) {
      if (name) exactNames.add(name.toLowerCase())
    }
    for (const prefix of skills.matchPrefixes || []) {
      const normalized = prefix.trim().toLowerCase()
      if (normalized) prefixes.push(normalized)
    }
  }

  return { exactNames, prefixes }
}

export function partitionSkillsBySection<T extends SkillListEntry>(
  skills: T[],
  partnerMatchers: PartnerSkillMatcher[]
): { userSkills: T[]; partnerSkills: T[]; builtInSkills: T[] } {
  const { exactNames, prefixes } = normalizePartnerSkillMatchers(partnerMatchers)
  const userSkills: T[] = []
  const partnerSectionSkills: T[] = []
  const builtInSkills: T[] = []

  for (const skill of skills) {
    const normalizedName = skill.name.toLowerCase()
    if (skill.source === 'bundled') {
      builtInSkills.push(skill)
    } else if (exactNames.has(normalizedName) || prefixes.some((prefix) => normalizedName.startsWith(prefix))) {
      partnerSectionSkills.push(skill)
    } else {
      userSkills.push(skill)
    }
  }

  return { userSkills, partnerSkills: partnerSectionSkills, builtInSkills }
}

export function buildRegistryCompatibilityNote(runtimePlatform: string | null | undefined): string | null {
  const normalized = normalizeRuntimePlatform(runtimePlatform as RuntimePlatform | string | null | undefined)
  if (normalized === 'darwin') return 'Showing skills compatible with this macOS runtime.'
  if (normalized === 'linux') return 'Showing skills compatible with this Linux runtime.'
  return null
}
