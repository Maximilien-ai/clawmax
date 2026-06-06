type AgentTemplateLike = {
  name: string
  description?: string
  author?: string
  tags?: string[]
  agents: Array<{
    id: string
    name?: string
    role: string
    tags?: string[]
  }>
  metadata?: Record<string, unknown>
}

type OrganizationTemplateLike = {
  name: string
  description?: string
  author?: string
  kind?: string
  tags?: string[]
  agents: Array<{ id: string; role: string; tags?: string[] }>
  teams?: Array<{
    id: string
    name: string
    purpose?: string
    leaderAgentId?: string
    memberAgentIds?: string[]
    parentTeamId?: string
    tags?: string[]
  }>
  communities?: Array<{ name: string }>
  groups?: Array<{ name: string }>
  workflows?: Array<{
    id: string
    name: string
    description?: string
    content?: string
    schedule?: string
    owner?: string
    targeting?: {
      communities?: string[]
      groups?: string[]
      tags?: string[]
      agents?: string[]
    }
  }>
  metadata?: Record<string, unknown>
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

function containsQuery(value: unknown, query: string): boolean {
  return typeof value === 'string' && value.toLowerCase().includes(query)
}

function stringifyForSearch(value: unknown): string {
  try {
    return JSON.stringify(value).toLowerCase()
  } catch {
    return ''
  }
}

export function matchesAgentTemplateSearch(template: AgentTemplateLike, query: string): boolean {
  const normalized = normalizeQuery(query)
  if (!normalized) return true

  if (
    containsQuery(template.name, normalized)
    || containsQuery(template.description, normalized)
    || containsQuery(template.author, normalized)
    || template.tags?.some((tag) => containsQuery(tag, normalized))
    || template.agents.some((agent) =>
      containsQuery(agent.id, normalized)
      || containsQuery(agent.name, normalized)
      || containsQuery(agent.role, normalized)
      || agent.tags?.some((tag) => containsQuery(tag, normalized))
    )
  ) {
    return true
  }

  return stringifyForSearch({
    metadata: template.metadata,
  }).includes(normalized)
}

export function matchesOrganizationTemplateSearch(template: OrganizationTemplateLike, query: string): boolean {
  const normalized = normalizeQuery(query)
  if (!normalized) return true

  if (
    containsQuery(template.name, normalized)
    || containsQuery(template.description, normalized)
    || containsQuery(template.author, normalized)
    || containsQuery(template.kind, normalized)
    || template.tags?.some((tag) => containsQuery(tag, normalized))
    || template.agents.some((agent) =>
      containsQuery(agent.id, normalized)
      || containsQuery(agent.role, normalized)
      || agent.tags?.some((tag) => containsQuery(tag, normalized))
    )
    || template.teams?.some((team) =>
      containsQuery(team.id, normalized)
      || containsQuery(team.name, normalized)
      || containsQuery(team.purpose, normalized)
      || containsQuery(team.leaderAgentId, normalized)
      || team.memberAgentIds?.some((memberId) => containsQuery(memberId, normalized))
      || team.tags?.some((tag) => containsQuery(tag, normalized))
    )
    || template.communities?.some((community) => containsQuery(community.name, normalized))
    || template.groups?.some((group) => containsQuery(group.name, normalized))
    || template.workflows?.some((workflow) =>
      containsQuery(workflow.id, normalized)
      || containsQuery(workflow.name, normalized)
      || containsQuery(workflow.description, normalized)
      || containsQuery(workflow.content, normalized)
      || containsQuery(workflow.schedule, normalized)
      || containsQuery(workflow.owner, normalized)
      || workflow.targeting?.communities?.some((community) => containsQuery(community, normalized))
      || workflow.targeting?.groups?.some((group) => containsQuery(group, normalized))
      || workflow.targeting?.tags?.some((tag) => containsQuery(tag, normalized))
      || workflow.targeting?.agents?.some((agent) => containsQuery(agent, normalized))
    )
  ) {
    return true
  }

  return stringifyForSearch({
    metadata: template.metadata,
  }).includes(normalized)
}
