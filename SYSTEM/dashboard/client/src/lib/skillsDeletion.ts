import type { OpenClawSkill } from '../types'

export type SkillDeleteImpactRow = {
  skillName: string
  assignedAgents: string[]
}

export type SkillDeleteImpactSummary = {
  rows: SkillDeleteImpactRow[]
  assignedSkillCount: number
  affectedAgentCount: number
  affectedAgents: string[]
}

export function summarizeSkillDeleteImpact(
  skills: OpenClawSkill[],
  skillUsage: Map<string, string[]>
): SkillDeleteImpactSummary {
  const rows = skills
    .map((skill) => ({
      skillName: skill.name,
      assignedAgents: [...(skillUsage.get(skill.name) || [])].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.skillName.localeCompare(b.skillName))

  const affectedAgents = Array.from(
    new Set(rows.flatMap((row) => row.assignedAgents))
  ).sort((a, b) => a.localeCompare(b))

  return {
    rows,
    assignedSkillCount: rows.filter((row) => row.assignedAgents.length > 0).length,
    affectedAgentCount: affectedAgents.length,
    affectedAgents,
  }
}
