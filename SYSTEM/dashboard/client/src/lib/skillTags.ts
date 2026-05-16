import type { OpenClawSkill } from '../types'

export function collectSkillTags(skills: OpenClawSkill[]): string[] {
  return Array.from(
    new Set(
      skills.flatMap((skill) => (skill.tags || []).map((tag) => String(tag || '').trim()).filter(Boolean))
    )
  ).sort((a, b) => a.localeCompare(b))
}

export function matchesSelectedSkillTags(skill: OpenClawSkill, selectedTags: Set<string>): boolean {
  if (selectedTags.size === 0) return true
  const tags = new Set((skill.tags || []).map((tag) => String(tag || '').trim()))
  for (const tag of selectedTags) {
    if (tags.has(tag)) return true
  }
  return false
}
