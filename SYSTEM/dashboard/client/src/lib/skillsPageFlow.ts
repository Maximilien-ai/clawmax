import { normalizeRuntimePlatform, type RuntimePlatform } from './skillPlatform'

export function buildSkillsPageCountLabel(filteredCount: number, totalCount: number): string {
  return `Showing ${filteredCount} of ${totalCount} skills`
}

type SkillListEntry = {
  name: string
  source: 'bundled' | 'managed' | 'workspace'
}

export function partitionSkillsBySection<T extends SkillListEntry>(
  skills: T[],
  partnerSkillNames: Iterable<string>
): { userSkills: T[]; partnerSkills: T[]; builtInSkills: T[] } {
  const partnerSet = new Set(partnerSkillNames)
  const userSkills: T[] = []
  const partnerSkills: T[] = []
  const builtInSkills: T[] = []

  for (const skill of skills) {
    if (skill.source === 'bundled') {
      builtInSkills.push(skill)
    } else if (partnerSet.has(skill.name)) {
      partnerSkills.push(skill)
    } else {
      userSkills.push(skill)
    }
  }

  return { userSkills, partnerSkills, builtInSkills }
}

export function buildRegistryCompatibilityNote(runtimePlatform: string | null | undefined): string | null {
  const normalized = normalizeRuntimePlatform(runtimePlatform as RuntimePlatform | string | null | undefined)
  if (normalized === 'darwin') return 'Showing skills compatible with this macOS runtime.'
  if (normalized === 'linux') return 'Showing skills compatible with this Linux runtime.'
  return null
}
