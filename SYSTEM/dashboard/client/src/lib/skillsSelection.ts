import type { OpenClawSkill } from '../types'

export function toggleItemSelection(current: Set<string>, item: string): Set<string> {
  const next = new Set(current)
  if (next.has(item)) {
    next.delete(item)
  } else {
    next.add(item)
  }
  return next
}

export function toggleVisibleSelections(current: Set<string>, visibleItems: string[]): Set<string> {
  const next = new Set(current)
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => next.has(item))

  for (const item of visibleItems) {
    if (allVisibleSelected) {
      next.delete(item)
    } else {
      next.add(item)
    }
  }

  return next
}

export function filterAssignableAgents(agentIds: string[], query: string): string[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return [...agentIds].sort((a, b) => a.localeCompare(b))
  }
  return agentIds
    .filter((agentId) => agentId.toLowerCase().includes(normalized))
    .sort((a, b) => a.localeCompare(b))
}

export function isUserSkill(skill: OpenClawSkill): boolean {
  return skill.source !== 'bundled' || Boolean(skill.variantOf)
}

export function partitionSkillsBySource(skills: OpenClawSkill[]): {
  userSkills: OpenClawSkill[]
  builtInSkills: OpenClawSkill[]
} {
  const userSkills: OpenClawSkill[] = []
  const builtInSkills: OpenClawSkill[] = []

  for (const skill of skills) {
    if (isUserSkill(skill)) {
      userSkills.push(skill)
    } else {
      builtInSkills.push(skill)
    }
  }

  return { userSkills, builtInSkills }
}
