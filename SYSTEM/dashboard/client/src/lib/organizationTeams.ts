export interface OrganizationTeamAgent {
  id: string
  name: string
  groups?: Array<string | { name: string }>
}

export interface OrganizationTeamGroup {
  name: string
  members: Array<{ id: string }>
}

export interface OrganizationTeamWorkflow {
  id?: string
  owner?: string
  targeting?: {
    groups?: string[]
    agents?: string[]
    teamIds?: string[]
  }
}

export interface OrganizationTeamCommunity {
  name: string
  members: Array<{ id: string }>
}

export interface OrganizationDeletePlan {
  teamIds: string[]
  agentIds: string[]
  workflowIds: string[]
  groupNames: string[]
  communityNames: string[]
}

export interface OrganizationTeam {
  id: string
  name: string
  purpose?: string
  leaderAgentId?: string
  memberAgentIds: string[]
  parentTeamId?: string
  tags: string[]
}

function buildDerivedOrganizationDisplayTeams(args: {
  agents: OrganizationTeamAgent[]
  groups: OrganizationTeamGroup[]
  workflows?: OrganizationTeamWorkflow[]
  organizationName?: string
  organizationDescription?: string
}): OrganizationTeam[] {
  const activeAgents = (args.agents || []).filter((agent) => agent?.id)
  if (activeAgents.length === 0) return []

  const workflows = args.workflows || []
  const inferredCompanyLabel = inferDerivedWorkflowCompanyLabel(workflows)
  const namespacePrefix = inferredCompanyLabel ? normalizeNamespacePrefix(inferredCompanyLabel) : undefined
  const organizationName = inferredCompanyLabel || args.organizationName?.trim() || 'Workspace Org'
  const organizationDescription = args.organizationDescription?.trim() || undefined

  const groupedTeams = (args.groups || [])
    .map((group) => {
      const memberIds = dedupe(group.members.map((member) => member.id))
      if (memberIds.length === 0) return null
      const displayGroupName = stripNamespacePrefix(group.name, namespacePrefix)
      const leaderAgentId = inferTeamLeader(group.name, workflows, memberIds)
      return {
        id: slugifyTeamId(group.name),
        name: displayGroupName,
        purpose: `Derived from workspace group ${displayGroupName}`,
        leaderAgentId,
        memberAgentIds: memberIds.filter((memberId) => memberId !== leaderAgentId),
        parentTeamId: 'organization',
        tags: ['derived', 'group'],
      } satisfies OrganizationTeam
    })
    .filter(Boolean) as OrganizationTeam[]

  if (groupedTeams.length > 0) {
    const rootMemberIds = dedupe(groupedTeams.flatMap((team) => [team.leaderAgentId, ...team.memberAgentIds]))
    const rootTeam: OrganizationTeam = {
      id: 'organization',
      name: organizationName,
      purpose: organizationDescription || 'Derived from workspace structure',
      leaderAgentId: rootMemberIds[0],
      memberAgentIds: rootMemberIds.slice(1),
      tags: ['derived', 'organization'],
    }

    const eligibleStandaloneTeams = groupedTeams.filter((team) => (
      isLeadershipLikeGroup(team.name) || getTeamAgentIds(team).length >= 3
    ))
    const needsLayering = groupedTeams.length > 5 || eligibleStandaloneTeams.length !== groupedTeams.length

    if (!needsLayering) {
      return sanitizeOrganizationDisplayTeams([
        rootTeam,
        ...groupedTeams,
      ])
    }

    const laneMap = new Map<string, { id: string; name: string; teams: OrganizationTeam[] }>()
    for (const team of groupedTeams) {
      const lane = classifyGroupLane(team.name)
      const current = laneMap.get(lane.id) || { ...lane, teams: [] }
      current.teams.push(team)
      laneMap.set(lane.id, current)
    }

    const layeredTeams: OrganizationTeam[] = [rootTeam]
    for (const lane of Array.from(laneMap.values()).sort((a, b) => a.name.localeCompare(b.name))) {
      const laneMemberIds = dedupe(lane.teams.flatMap((team) => [team.leaderAgentId, ...team.memberAgentIds]))
      const laneId = lane.id
      const visibleChildTeams = lane.teams.filter((team) => (
        isLeadershipLikeGroup(team.name) || getTeamAgentIds(team).length >= 3
      ))
      layeredTeams.push({
        id: laneId,
        name: lane.name,
        purpose: `Derived lane for ${lane.teams.length} related teams and specialist roles`,
        leaderAgentId: laneMemberIds[0],
        memberAgentIds: laneMemberIds.slice(1),
        parentTeamId: 'organization',
        tags: ['derived', 'lane'],
      })
      for (const team of visibleChildTeams) {
        layeredTeams.push({
          ...team,
          parentTeamId: laneId,
        })
      }
    }

    return sanitizeOrganizationDisplayTeams(layeredTeams)
  }

  const fallbackMemberIds = dedupe(activeAgents.map((agent) => agent.id))
  const fallbackLeader = workflows.find((workflow) => workflow.owner)?.owner?.trim() || fallbackMemberIds[0]
  return sanitizeOrganizationDisplayTeams([{
    id: 'organization',
    name: organizationName,
    purpose: organizationDescription || 'Derived from applied organization template',
    leaderAgentId: fallbackLeader,
    memberAgentIds: fallbackMemberIds.filter((agentId) => agentId !== fallbackLeader),
    tags: ['derived', 'organization'],
  }])
}

function wrapPersistedTopLevelTeams(
  teams: OrganizationTeam[],
  workflows: OrganizationTeamWorkflow[],
): OrganizationTeam[] {
  const safeTeams = sanitizeOrganizationDisplayTeams(teams)
  const teamsById = new Map(safeTeams.map((team) => [team.id, team]))
  const childMap = new Map<string, OrganizationTeam[]>()
  for (const team of safeTeams) {
    if (!team.parentTeamId) continue
    childMap.set(team.parentTeamId, [...(childMap.get(team.parentTeamId) || []), team])
  }

  const subtreeIdsForRoot = (rootId: string): Set<string> => {
    const ids = new Set<string>()
    const stack = [rootId]
    while (stack.length > 0) {
      const current = stack.pop()!
      if (ids.has(current)) continue
      ids.add(current)
      for (const child of childMap.get(current) || []) stack.push(child.id)
    }
    return ids
  }

  const inferRootName = (topTeam: OrganizationTeam, subtreeIds: Set<string>): string => {
    const workflowNames = workflows
      .filter((workflow) => (workflow.targeting?.teamIds || []).some((teamId) => subtreeIds.has(teamId)))
      .map((workflow) => workflow.name || '')
    const companyPrefixes = workflowNames
      .map((name) => name.match(/^(.*?)\s+·\s+/)?.[1]?.trim())
      .filter((value): value is string => !!value)
    if (companyPrefixes.length > 0) return companyPrefixes[0]
    return topTeam.name
  }

  const nextTeams = safeTeams.map((team) => ({ ...team }))
  const mutableById = new Map(nextTeams.map((team) => [team.id, team]))
  const syntheticRoots: OrganizationTeam[] = []

  for (const topTeam of nextTeams.filter((team) => !team.parentTeamId)) {
    const isAlreadyRootLike = topTeam.tags.includes('organization')
      || topTeam.tags.includes('org-root')
      || topTeam.tags.includes('company')
      || topTeam.tags.includes('company-root')
      || /(organization|company|workspace org|org)$/i.test(topTeam.name)
    if (isAlreadyRootLike) continue

    const subtreeIds = subtreeIdsForRoot(topTeam.id)
    const subtreeTeams = Array.from(subtreeIds).map((id) => teamsById.get(id)).filter((team): team is OrganizationTeam => !!team)
    const rootMemberIds = dedupe(subtreeTeams.flatMap((team) => [team.leaderAgentId, ...team.memberAgentIds]))
    const rootId = `company-${topTeam.id}`
    syntheticRoots.push({
      id: rootId,
      name: inferRootName(topTeam, subtreeIds),
      purpose: `Imported company rooted at ${topTeam.name}`,
      leaderAgentId: rootMemberIds[0],
      memberAgentIds: rootMemberIds.slice(1),
      tags: ['derived', 'organization', 'company-root'],
    })

    const mutableTop = mutableById.get(topTeam.id)
    if (mutableTop) mutableTop.parentTeamId = rootId
  }

  return sanitizeOrganizationDisplayTeams([
    ...syntheticRoots,
    ...nextTeams,
  ])
}

export function sanitizeOrganizationDisplayTeams(inputTeams: OrganizationTeam[]): OrganizationTeam[] {
  const deduped: OrganizationTeam[] = []
  const seenIds = new Set<string>()

  for (const team of inputTeams) {
    const normalizedId = `${team.id || ''}`.trim()
    if (!normalizedId || seenIds.has(normalizedId)) continue
    seenIds.add(normalizedId)
    deduped.push({
      ...team,
      id: normalizedId,
      parentTeamId: team.parentTeamId?.trim() || undefined,
      memberAgentIds: dedupe(team.memberAgentIds || []),
      tags: dedupe(team.tags || []),
    })
  }

  const ids = new Set(deduped.map((team) => team.id))
  const teamsById = new Map(deduped.map((team) => [team.id, team]))

  const safeTeams = deduped.map((team) => {
    let parentTeamId = team.parentTeamId
    if (!parentTeamId || !ids.has(parentTeamId) || parentTeamId === team.id) {
      return { ...team, parentTeamId: parentTeamId && ids.has(parentTeamId) && parentTeamId !== team.id ? parentTeamId : undefined }
    }

    const ancestry = new Set<string>([team.id])
    let cursor = parentTeamId
    while (cursor) {
      if (ancestry.has(cursor)) {
        parentTeamId = undefined
        break
      }
      ancestry.add(cursor)
      const parent = teamsById.get(cursor)
      cursor = parent?.parentTeamId
    }

    return { ...team, parentTeamId }
  })

  return safeTeams
}

function slugifyTeamId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'team'
}

function dedupe(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => `${value || ''}`.trim()).filter(Boolean)))
}

function normalizeName(value: string): string {
  return `${value || ''}`.trim().toLowerCase()
}

function inferDerivedWorkflowCompanyLabel(workflows: OrganizationTeamWorkflow[]): string | undefined {
  const prefixes = Array.from(new Set(
    workflows
      .map((workflow) => workflow.id && typeof (workflow as any).name === 'string' ? String((workflow as any).name).match(/^(.*?)\s+·\s+/)?.[1]?.trim() : undefined)
      .filter((value): value is string => !!value)
  ))
  return prefixes.length === 1 ? prefixes[0] : undefined
}

function normalizeNamespacePrefix(value: string): string {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function humanizeDisplayName(value: string): string {
  const trimmed = `${value || ''}`.trim()
  if (!trimmed) return trimmed
  if (/[A-Z]/.test(trimmed) || /\s/.test(trimmed)) return trimmed
  return trimmed
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function stripNamespacePrefix(value: string, namespacePrefix?: string): string {
  const trimmed = `${value || ''}`.trim()
  if (!trimmed || !namespacePrefix) return humanizeDisplayName(trimmed)
  const pattern = new RegExp(`^${namespacePrefix}[-_\\s]+`, 'i')
  return humanizeDisplayName(trimmed.replace(pattern, ''))
}

function inferTeamLeader(groupName: string, workflows: OrganizationTeamWorkflow[], memberIds: string[]): string | undefined {
  const normalizedGroup = groupName.trim().toLowerCase()
  const workflowOwner = workflows.find((workflow) =>
    (workflow.targeting?.groups || []).some((group) => group.trim().toLowerCase() === normalizedGroup) && workflow.owner
  )?.owner?.trim()

  if (workflowOwner && memberIds.includes(workflowOwner)) return workflowOwner
  return memberIds[0]
}

function classifyGroupLane(groupName: string): { id: string; name: string } {
  const value = groupName.trim().toLowerCase()
  if (/(leadership|executive|strategy|founder|office-of|staff)/.test(value)) {
    return { id: 'lane-leadership-strategy', name: 'Leadership & Strategy' }
  }
  if (/(sales|marketing|growth|revenue|customer|outbound|partnership)/.test(value)) {
    return { id: 'lane-revenue-growth', name: 'Revenue & Growth' }
  }
  if (/(delivery|client|success|account|program|project)/.test(value)) {
    return { id: 'lane-client-delivery', name: 'Client Delivery' }
  }
  if (/(research|analysis|analytics|insight|intel|evidence)/.test(value)) {
    return { id: 'lane-research-intelligence', name: 'Research & Intelligence' }
  }
  if (/(ops|operations|finance|legal|hr|people|compliance|status)/.test(value)) {
    return { id: 'lane-operations-governance', name: 'Operations & Governance' }
  }
  return { id: 'lane-specialized-teams', name: 'Specialized Teams' }
}

function isLeadershipLikeGroup(groupName: string): boolean {
  return /(leadership|executive|strategy|founder|office-of|staff|ceo)/.test(groupName.trim().toLowerCase())
}

function getTeamAgentIds(team: Pick<OrganizationTeam, 'leaderAgentId' | 'memberAgentIds'>): string[] {
  return dedupe([team.leaderAgentId, ...(team.memberAgentIds || [])])
}

export function buildOrganizationDeletePlan(args: {
  rootTeamId: string
  teams: OrganizationTeam[]
  groups: OrganizationTeamGroup[]
  communities: OrganizationTeamCommunity[]
  workflows?: OrganizationTeamWorkflow[]
}): OrganizationDeletePlan {
  const teamsById = new Map((args.teams || []).map((team) => [team.id, team]))
  const rootTeam = teamsById.get(args.rootTeamId)
  if (!rootTeam) {
    return {
      teamIds: [],
      agentIds: [],
      workflowIds: [],
      groupNames: [],
      communityNames: [],
    }
  }

  const childMap = new Map<string, OrganizationTeam[]>()
  for (const team of args.teams || []) {
    if (!team.parentTeamId) continue
    childMap.set(team.parentTeamId, [...(childMap.get(team.parentTeamId) || []), team])
  }

  const orderedTeams: OrganizationTeam[] = []
  const visited = new Set<string>()
  const stack = [rootTeam]
  while (stack.length > 0) {
    const team = stack.pop()!
    if (visited.has(team.id)) continue
    visited.add(team.id)
    orderedTeams.push(team)
    const children = (childMap.get(team.id) || []).slice().sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children.reverse()) {
      stack.push(child)
    }
  }

  const teamIds = orderedTeams.map((team) => team.id)
  const teamIdSet = new Set(teamIds)
  const teamNameKeys = new Set(orderedTeams.flatMap((team) => [normalizeName(team.id), normalizeName(team.name)]))
  const agentIdSet = new Set(dedupe(orderedTeams.flatMap((team) => getTeamAgentIds(team))))
  const groupNames = new Set<string>()
  const workflowIds = new Set<string>()
  const communityNames = new Set<string>()

  let changed = true
  while (changed) {
    changed = false

    for (const workflow of args.workflows || []) {
      const targeting = workflow.targeting || {}
      const ownerMatch = !!workflow.owner && agentIdSet.has(workflow.owner)
      const agentMatch = (targeting.agents || []).some((agentId) => agentIdSet.has(agentId))
      const teamMatch = (targeting.teamIds || []).some((teamId) => teamIdSet.has(teamId))
      const groupMatch = (targeting.groups || []).some((groupName) => (
        groupNames.has(groupName) || teamNameKeys.has(normalizeName(groupName))
      ))
      if (!(ownerMatch || agentMatch || teamMatch || groupMatch)) continue

      if (workflow.id && !workflowIds.has(workflow.id)) {
        workflowIds.add(workflow.id)
        changed = true
      }
      if (workflow.owner && !agentIdSet.has(workflow.owner)) {
        agentIdSet.add(workflow.owner)
        changed = true
      }
      for (const agentId of targeting.agents || []) {
        if (!agentIdSet.has(agentId)) {
          agentIdSet.add(agentId)
          changed = true
        }
      }
      for (const groupName of targeting.groups || []) {
        if (!groupNames.has(groupName)) {
          groupNames.add(groupName)
          changed = true
        }
      }
    }

    for (const group of args.groups || []) {
      const memberIds = dedupe((group.members || []).map((member) => member.id))
      const matchesTeamName = teamNameKeys.has(normalizeName(group.name))
      const memberMatch = memberIds.some((memberId) => agentIdSet.has(memberId))
      const targetedMatch = groupNames.has(group.name)
      if (!(matchesTeamName || memberMatch || targetedMatch)) continue

      if (!groupNames.has(group.name)) {
        groupNames.add(group.name)
        changed = true
      }
      for (const memberId of memberIds) {
        if (!agentIdSet.has(memberId)) {
          agentIdSet.add(memberId)
          changed = true
        }
      }
    }

    for (const community of args.communities || []) {
      const memberIds = dedupe((community.members || []).map((member) => member.id))
      const membersContained = memberIds.length > 0 && memberIds.every((memberId) => agentIdSet.has(memberId))
      const attachedGroups = (args.groups || []).filter((group: any) => (
        (group as any).community === community.name && groupNames.has(group.name)
      ))
      if (!(membersContained || attachedGroups.length > 0)) continue

      if (!communityNames.has(community.name)) {
        communityNames.add(community.name)
        changed = true
      }
      for (const memberId of memberIds) {
        if (!agentIdSet.has(memberId)) {
          agentIdSet.add(memberId)
          changed = true
        }
      }
    }
  }

  return {
    teamIds,
    agentIds: Array.from(agentIdSet),
    workflowIds: Array.from(workflowIds),
    groupNames: Array.from(groupNames),
    communityNames: Array.from(communityNames),
  }
}

export function buildOrganizationDisplayTeams(args: {
  persistedTeams?: OrganizationTeam[]
  agents: OrganizationTeamAgent[]
  groups: OrganizationTeamGroup[]
  workflows?: OrganizationTeamWorkflow[]
  organizationName?: string
  organizationDescription?: string
}): OrganizationTeam[] {
  const persistedTeams = args.persistedTeams || []
  const workflows = args.workflows || []
  const derivedTeams = buildDerivedOrganizationDisplayTeams(args)
  if (persistedTeams.length === 0) return derivedTeams

  const wrappedPersistedTeams = wrapPersistedTopLevelTeams(persistedTeams, workflows)
  const coveredKeys = new Set(wrappedPersistedTeams.flatMap((team) => [normalizeName(team.id), normalizeName(team.name)]))
  const coveredAgentIds = new Set(wrappedPersistedTeams.flatMap((team) => getTeamAgentIds(team)))
  const coveredTeamIds = new Set(wrappedPersistedTeams.map((team) => team.id))
  const coveredWorkflowIds = new Set(workflows
    .filter((workflow) => {
      const targeting = workflow.targeting || {}
      const ownerMatch = !!workflow.owner && coveredAgentIds.has(workflow.owner)
      const agentMatch = (targeting.agents || []).some((agentId) => coveredAgentIds.has(agentId))
      const teamMatch = (targeting.teamIds || []).some((teamId) => coveredTeamIds.has(teamId))
      const groupMatch = (targeting.groups || []).some((groupName) => coveredKeys.has(normalizeName(groupName)))
      return ownerMatch || agentMatch || teamMatch || groupMatch
    })
    .map((workflow) => workflow.id)
    .filter(Boolean) as string[])
  const uncoveredAgents = (args.agents || []).filter((agent) => agent?.id && !coveredAgentIds.has(agent.id))
  const uncoveredAgentIds = new Set(uncoveredAgents.map((agent) => agent.id))
  const uncoveredGroups = (args.groups || [])
    .filter((group) => !coveredKeys.has(normalizeName(group.name)))
    .map((group) => ({
      ...group,
      members: (group.members || []).filter((member) => uncoveredAgentIds.has(member.id)),
    }))
    .filter((group) => group.members.length > 0)
  const uncoveredGroupNames = new Set(uncoveredGroups.map((group) => group.name))
  const uncoveredWorkflows = workflows.filter((workflow) => {
    if (workflow.id && coveredWorkflowIds.has(workflow.id)) return false
    const targeting = workflow.targeting || {}
    const ownerMatch = !!workflow.owner && uncoveredAgentIds.has(workflow.owner)
    const agentMatch = (targeting.agents || []).some((agentId) => uncoveredAgentIds.has(agentId))
    const groupMatch = (targeting.groups || []).some((groupName) => uncoveredGroupNames.has(groupName))
    return ownerMatch || agentMatch || groupMatch
  })
  const uncoveredDerivedTeams = buildDerivedOrganizationDisplayTeams({
    ...args,
    agents: uncoveredAgents,
    groups: uncoveredGroups,
    workflows: uncoveredWorkflows,
  })
  const persistedRootByName = new Map(
    wrappedPersistedTeams
      .filter((team) => !team.parentTeamId)
      .map((team) => [normalizeName(team.name), team.id])
  )
  const duplicateDerivedRoot = uncoveredDerivedTeams.find((team) => (
    team.id === 'organization' && persistedRootByName.has(normalizeName(team.name))
  ))
  const normalizedUncoveredDerivedTeams = duplicateDerivedRoot
    ? uncoveredDerivedTeams
        .filter((team) => team.id !== 'organization')
        .map((team) => team.parentTeamId === 'organization'
          ? { ...team, parentTeamId: persistedRootByName.get(normalizeName(duplicateDerivedRoot.name)) }
          : team)
    : uncoveredDerivedTeams

  const derivedExtras = normalizedUncoveredDerivedTeams.filter((team) => {
    if (team.id === 'organization') return true
    return !coveredKeys.has(normalizeName(team.id)) && !coveredKeys.has(normalizeName(team.name))
  })

  const derivedExtrasWithUncoveredAgents = derivedExtras.filter((team) =>
    getTeamAgentIds(team).some((agentId) => !coveredAgentIds.has(agentId))
  )
  const shouldIncludeDerivedRoot = derivedExtrasWithUncoveredAgents.some((team) => team.id !== 'organization')
  return sanitizeOrganizationDisplayTeams([
    ...wrappedPersistedTeams,
    ...(shouldIncludeDerivedRoot
      ? derivedExtrasWithUncoveredAgents
      : derivedExtrasWithUncoveredAgents.filter((team) => team.id !== 'organization')),
  ])
}
