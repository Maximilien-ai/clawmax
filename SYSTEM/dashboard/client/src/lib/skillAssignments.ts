export async function toggleSkillAssignment(
  agentId: string,
  skillName: string,
  currentSkills: string[],
  persist: (agentId: string, skills: string[]) => Promise<void>,
  notify: (message: string) => void,
): Promise<boolean> {
  if (!agentId) throw new Error('Select an agent before assigning a skill.')
  const added = !currentSkills.includes(skillName)
  const nextSkills = added
    ? [...currentSkills, skillName]
    : currentSkills.filter(skill => skill !== skillName)
  await persist(agentId, nextSkills)
  notify(added
    ? `Assigned ${skillName} to ${agentId}.`
    : `Removed ${skillName} from ${agentId}.`)
  return added
}

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
