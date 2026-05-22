export type StarterPromptAgent = {
  id: string
  name?: string
  skills?: string[]
  tags?: string[]
  groups?: Array<{ name: string }>
  communities?: Array<{ name: string }>
}

export type StarterPromptSkill = {
  name: string
}

export type StarterPromptWorkflow = {
  id: string
  name: string
  description?: string
}

export type StarterPromptTemplate = {
  name: string
  slug?: string
}

export type BuilderStarterPromptContext = {
  workspaceName?: string
  workspaceTags?: string[]
  userName?: string
  recentPrompts?: string[]
  agents: StarterPromptAgent[]
  skills: StarterPromptSkill[]
  workflows: StarterPromptWorkflow[]
  templates: {
    agents: StarterPromptTemplate[]
    organizations: StarterPromptTemplate[]
  }
  otherWorkspaceNames?: string[]
}

const DEFAULT_STARTER_PROMPTS = [
  'Design a competitor research assistant for this workspace.',
  'Design a customer support escalation team with clean handoffs.',
  'Refine an existing agent by adding the right skills and integrations.',
  'Design a multi-role planning team for a new project.',
]

const WORKSPACE_HINTS: Array<{ pattern: RegExp; prompts: string[] }> = [
  {
    pattern: /\bpersonal|home|family\b/i,
    prompts: [
      'Design a personal operations assistant that keeps this workspace organized around my real priorities.',
      'Design a small personal planning team for errands, follow-ups, and weekly reviews.',
    ],
  },
  {
    pattern: /\bresearch|lab|analysis\b/i,
    prompts: [
      'Design a research workflow for this workspace that captures sources, synthesis, and final recommendations.',
      'Build a focused analyst agent for the core research work happening in this workspace.',
    ],
  },
  {
    pattern: /\btravel\b/i,
    prompts: [
      'Design a travel planning assistant that helps compare itineraries, costs, and next actions.',
    ],
  },
]

function trimPrompt(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function canonicalPromptText(value: string): string {
  return trimPrompt(value)
    .replace(/^turn this into the best next build for [^:]+:\s*/i, '')
    .trim()
}

function promptTokens(value: string): string[] {
  return Array.from(new Set(
    canonicalPromptText(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  ))
}

function isNearDuplicatePrompt(a: string, b: string): boolean {
  const aTokens = promptTokens(a)
  const bTokens = promptTokens(b)
  if (aTokens.length === 0 || bTokens.length === 0) {
    return canonicalPromptText(a).toLowerCase() === canonicalPromptText(b).toLowerCase()
  }
  const overlap = aTokens.filter((token) => bTokens.includes(token)).length
  const ratio = overlap / Math.max(Math.min(aTokens.length, bTokens.length), 1)
  return ratio >= 0.6
}

function uniquePrompts(prompts: string[]): string[] {
  const next: string[] = []
  for (const prompt of prompts.map(trimPrompt).filter(Boolean)) {
    if (next.some((existing) => isNearDuplicatePrompt(existing, prompt))) continue
    next.push(prompt)
  }
  return next
}

function seedFromText(value: string): number {
  return Array.from(value).reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) >>> 0, 7)
}

function pickSeeded<T>(items: T[], seedText: string, count: number): T[] {
  if (items.length <= count) return items.slice()
  const seed = seedFromText(seedText)
  const picked: T[] = []
  const working = items.slice()
  let cursor = seed
  while (working.length > 0 && picked.length < count) {
    const index = cursor % working.length
    picked.push(working.splice(index, 1)[0])
    cursor = ((cursor * 1103515245) + 12345) >>> 0
  }
  return picked
}

function normalizeRecentPrompts(prompts: string[] | undefined): string[] {
  return uniquePrompts((prompts || []).map(trimPrompt)).slice(0, 4)
}

function countByName(values: string[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const value of values.map(trimPrompt).filter(Boolean)) {
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function inferAgentClusterPrompts(context: BuilderStarterPromptContext): string[] {
  if (context.agents.length < 2) return []

  const prompts: string[] = []
  const workspaceName = trimPrompt(context.workspaceName || 'this workspace')
  const namedAgents = context.agents.map((agent) => trimPrompt(agent.name || agent.id)).filter(Boolean)
  const skillCounts = countByName(context.agents.flatMap((agent) => agent.skills || []))
  const tagCounts = countByName(context.agents.flatMap((agent) => agent.tags || []))
  const groupCounts = countByName(context.agents.flatMap((agent) => (agent.groups || []).map((group) => group.name)))
  const communityCounts = countByName(context.agents.flatMap((agent) => (agent.communities || []).map((community) => community.name)))

  const sharedSkill = skillCounts.find((entry) => entry.count >= 2)
  const sharedTag = tagCounts.find((entry) => entry.count >= 2)
  const sharedGroup = groupCounts.find((entry) => entry.count >= 2)
  const sharedCommunity = communityCounts.find((entry) => entry.count >= 2)

  if (sharedGroup) {
    prompts.push(`See whether the agents already working in ${sharedGroup.name} should be turned into a clearer operating team in ${workspaceName}.`)
  } else if (sharedCommunity) {
    prompts.push(`Design a better team structure for the agents already collaborating in ${sharedCommunity.name}.`)
  }

  if (sharedSkill) {
    prompts.push(`Use the agents that already rely on ${sharedSkill.name} to design a focused team with cleaner handoffs and ownership.`)
  }

  if (sharedTag) {
    prompts.push(`See whether the agents tagged ${sharedTag.name} should become a dedicated team instead of staying loosely connected.`)
  }

  const topNamedAgents = namedAgents.slice(0, 3)
  if (topNamedAgents.length >= 2) {
    prompts.push(`Figure out whether ${topNamedAgents.join(', ')} should stay separate agents or become a coordinated team in ${workspaceName}.`)
  }

  return prompts.slice(0, 2)
}

function inferSkillStrategyPrompts(context: BuilderStarterPromptContext): string[] {
  const prompts: string[] = []
  const workspaceName = trimPrompt(context.workspaceName || 'this workspace')
  const skillNames = context.skills.map((skill) => trimPrompt(skill.name)).filter(Boolean)
  if (skillNames.length === 0) return prompts

  const topSkills = skillNames.slice(0, 3)
  if (topSkills.length >= 2) {
    prompts.push(`Design the best agent or team setup in ${workspaceName} for using ${topSkills.slice(0, 2).join(' and ')} together.`)
  }
  if (topSkills.length >= 3) {
    prompts.push(`Decide whether ${topSkills.join(', ')} belong on one strong operator or across multiple specialist agents.`)
  }

  return prompts
}

export function normalizeStarterPromptList(prompts: string[]): string[] {
  return uniquePrompts(prompts).slice(0, 4)
}

export function buildWorkspaceStarterPrompts(context: BuilderStarterPromptContext): string[] {
  const highSignalPrompts: string[] = []
  const mediumSignalPrompts: string[] = []
  const lowSignalPrompts: string[] = []
  const workspaceName = trimPrompt(context.workspaceName || '')
  const userName = trimPrompt(context.userName || '')
  const recentPrompts = normalizeRecentPrompts(context.recentPrompts)
  const firstAgent = context.agents[0]
  const firstAgentSkill = firstAgent?.skills?.[0]
  const firstSkill = context.skills[0]
  const firstWorkflow = context.workflows[0]
  const firstAgentTemplate = context.templates.agents[0]
  const firstOrganizationTemplate = context.templates.organizations[0]
  const isEmptyWorkspace = !recentPrompts.length && context.agents.length === 0 && context.workflows.length === 0
  const inferredTeamPrompts = inferAgentClusterPrompts(context)
  const inferredSkillPrompts = inferSkillStrategyPrompts(context)
  const hasStrongLocalStructure = inferredTeamPrompts.length > 0 || inferredSkillPrompts.length > 0 || context.workflows.length > 0
  const agentNames = context.agents.map((agent) => trimPrompt(agent.name || agent.id)).filter(Boolean)
  const skillNames = context.skills.map((skill) => trimPrompt(skill.name)).filter(Boolean)
  const lowerSkillNames = skillNames.map((skill) => skill.toLowerCase())

  for (const recentPrompt of recentPrompts) {
    highSignalPrompts.push(recentPrompt)
    const lowerPrompt = recentPrompt.toLowerCase()
    const matchedAgentName = agentNames.find((agentName) => lowerPrompt.includes(agentName.toLowerCase()))
    const matchedSkills = skillNames.filter((skillName, index) => lowerPrompt.includes(lowerSkillNames[index]))
    if (matchedAgentName && matchedSkills.length > 0) {
      highSignalPrompts.push(`Add ${matchedSkills.slice(0, 2).join(' and ')} to ${matchedAgentName} and test the first real task.`)
    } else if (matchedSkills.length > 0) {
      highSignalPrompts.push(`Find the best agent in ${workspaceName || 'this workspace'} to use ${matchedSkills.slice(0, 2).join(' and ')} effectively.`)
    } else if (matchedAgentName) {
      highSignalPrompts.push(`Improve ${matchedAgentName} so it is ready for the next real task in ${workspaceName || 'this workspace'}.`)
    }
  }

  if (workspaceName && !hasStrongLocalStructure) {
    for (const hint of WORKSPACE_HINTS) {
      if (hint.pattern.test(workspaceName)) {
        lowSignalPrompts.push(...hint.prompts)
      }
    }
  }

  highSignalPrompts.push(...inferredTeamPrompts)
  highSignalPrompts.push(...inferredSkillPrompts)

  if (firstAgent) {
    mediumSignalPrompts.push(`Help me improve ${firstAgent.name || firstAgent.id} for the next real task in ${workspaceName || 'this workspace'}.`)
  }
  if (firstAgent && firstAgentSkill) {
    mediumSignalPrompts.push(`Check whether ${firstAgent.name || firstAgent.id} needs better ${firstAgentSkill} setup or other missing skills.`)
  } else if (firstSkill) {
    mediumSignalPrompts.push(`Find the best agent in ${workspaceName || 'this workspace'} to use ${firstSkill.name} effectively.`)
  }
  if (firstWorkflow) {
    highSignalPrompts.push(`Review whether ${firstWorkflow.name} should stay a workflow, become a team handoff, or be redesigned.`)
  }
  if (!isEmptyWorkspace && firstOrganizationTemplate) {
    mediumSignalPrompts.push(`See whether the ${firstOrganizationTemplate.name} team template fits ${workspaceName || 'this workspace'} better than starting from scratch.`)
  }
  if (!isEmptyWorkspace && firstAgentTemplate) {
    mediumSignalPrompts.push(`Use the ${firstAgentTemplate.name} agent template if it is a better fit than my current agents.`)
  }

  if (isEmptyWorkspace) {
    const seededOrganizationTemplates = pickSeeded(context.templates.organizations, workspaceName || 'workspace', 1)
    const seededAgentTemplates = pickSeeded(context.templates.agents, `${workspaceName || 'workspace'}-agents`, 1)
    const seededOtherWorkspaces = pickSeeded((context.otherWorkspaceNames || []).filter(Boolean), `${workspaceName || 'workspace'}-other`, 1)

    for (const otherWorkspaceName of seededOtherWorkspaces) {
      lowSignalPrompts.push(`Suggest a strong starter for ${workspaceName || 'this workspace'} based on patterns from my ${otherWorkspaceName} workspace.`)
    }
    for (const template of seededOrganizationTemplates) {
      lowSignalPrompts.push(`Would the ${template.name} team template be a good starting point for ${workspaceName || 'this workspace'}?`)
    }
    for (const template of seededAgentTemplates) {
      lowSignalPrompts.push(`Use the ${template.name} agent template if it matches what ${workspaceName || 'this workspace'} needs first.`)
    }
  }

  if (workspaceName && userName) {
    lowSignalPrompts.push(`Design the best first builder task for ${userName} in the ${workspaceName} workspace.`)
  }

  const prioritized = normalizeStarterPromptList([
    ...highSignalPrompts,
    ...mediumSignalPrompts,
  ])
  if (prioritized.length >= 4) return prioritized.slice(0, 4)

  const lowSignalPool = normalizeStarterPromptList([
    ...lowSignalPrompts,
    ...DEFAULT_STARTER_PROMPTS,
  ])
  const remaining = 4 - prioritized.length
  const seededLowSignal = pickSeeded(
    lowSignalPool,
    [workspaceName, userName, ...recentPrompts].join('|') || 'workspace',
    remaining,
  )

  return normalizeStarterPromptList([
    ...prioritized,
    ...seededLowSignal,
  ])
}
