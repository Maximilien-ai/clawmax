import type { OpenClawSkill } from '../types'

export function getSelectedSkillForExport(skills: OpenClawSkill[], selectedSkillIds: Set<string>): OpenClawSkill | null {
  if (selectedSkillIds.size !== 1) return null
  return skills.find((skill) => selectedSkillIds.has(skill.name)) || null
}

export function buildSkillExportFilename(skillName: string): string {
  return `${skillName}.skill.md`
}

export async function readSkillExport(response: Response): Promise<string> {
  const data = await response.json().catch(() => null)
  if (!response.ok || typeof data?.content !== 'string') {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Could not read the skill. Please try exporting again.')
  }
  return data.content
}
