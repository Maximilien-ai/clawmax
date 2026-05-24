import { getSkillSetupHint } from './skillSetup'

export function buildAgentSkillsScope(args: {
  agentId: string
  initialAgentId?: string
  assignedSkillNames: string[]
}) {
  const { agentId, initialAgentId, assignedSkillNames } = args
  const isAgentScoped = !!agentId
  const isInitialScoped = !!initialAgentId && initialAgentId === agentId
  const title = agentId ? `Skills for ${agentId}` : 'Skills'
  const subtitle = agentId
    ? `Review, add, and remove skills for ${agentId} without leaving the agent flow.`
    : 'Browse, import, and assign skills across agents in this workspace.'

  return {
    isAgentScoped,
    isInitialScoped,
    title,
    subtitle,
    assignedCountLabel: `${assignedSkillNames.length} assigned`,
  }
}

export function buildAssignedSkillBadges(skillNames: string[]) {
  return skillNames.map((skillName) => ({
    name: skillName,
    needsSetup: !!getSkillSetupHint({ name: skillName }),
  }))
}
