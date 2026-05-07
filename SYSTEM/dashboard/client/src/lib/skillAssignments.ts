export function getSkillAssignmentBuckets(
  skillName: string,
  allAgentIds: string[],
  agentSkillMap: Map<string, string[]>
): { assignedAgentIds: string[]; unassignedAgentIds: string[] } {
  const assignedAgentIds: string[] = []
  const unassignedAgentIds: string[] = []

  for (const agentId of allAgentIds) {
    const skills = agentSkillMap.get(agentId) || []
    if (skills.includes(skillName)) {
      assignedAgentIds.push(agentId)
    } else {
      unassignedAgentIds.push(agentId)
    }
  }

  assignedAgentIds.sort((a, b) => a.localeCompare(b))
  unassignedAgentIds.sort((a, b) => a.localeCompare(b))

  return { assignedAgentIds, unassignedAgentIds }
}
