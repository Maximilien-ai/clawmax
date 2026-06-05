import type { OpenClawSkill } from '../types'

export function getSelectedSkillForExport(skills: OpenClawSkill[], selectedSkillIds: Set<string>): OpenClawSkill | null {
  if (selectedSkillIds.size !== 1) return null
  return skills.find((skill) => selectedSkillIds.has(skill.name)) || null
}

export function buildSkillExportFilename(skillName: string): string {
  return `${skillName}.skill.md`
}
