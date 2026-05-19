import type { Team } from './teams'

type TeamLike = Pick<Team, 'id' | 'name' | 'leaderAgentId' | 'memberAgentIds' | 'parentTeamId' | 'tags'>
type MemberLike = string | { id: string }

export interface OrganizationDeletePlanGroup {
  name: string
  community?: string | null
  members: MemberLike[]
}

export interface OrganizationDeletePlanCommunity {
  name: string
  members: MemberLike[]
}

export interface OrganizationDeletePlanWorkflow {
  id?: string
  owner?: string
  targeting?: {
    groups?: string[]
    agents?: string[]
    teamIds?: string[]
  }
}

export interface OrganizationDeletePlan {
  teamIds: string[]
  agentIds: string[]
  workflowIds: string[]
  groupNames: string[]
  communityNames: string[]
}

function dedupe(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.map((value) => `${value || ''}`.trim()).filter(Boolean)))
}

function normalizeName(value: string): string {
  return `${value || ''}`.trim().toLowerCase()
}

function getMemberId(member: MemberLike): string {
  if (typeof member === 'string') return member
  return member?.id || ''
}

function getTeamAgentIds(team: Pick<TeamLike, 'leaderAgentId' | 'memberAgentIds'>): string[] {
  return dedupe([team.leaderAgentId, ...(team.memberAgentIds || [])])
}

export function buildOrganizationDeletePlan(args: {
  rootTeamId: string
  teams: TeamLike[]
  groups: OrganizationDeletePlanGroup[]
  communities: OrganizationDeletePlanCommunity[]
  workflows?: OrganizationDeletePlanWorkflow[]
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

  const childMap = new Map<string, TeamLike[]>()
  for (const team of args.teams || []) {
    if (!team.parentTeamId) continue
    childMap.set(team.parentTeamId, [...(childMap.get(team.parentTeamId) || []), team])
  }

  const orderedTeams: TeamLike[] = []
  const visited = new Set<string>()
  const stack = [rootTeam]
  while (stack.length > 0) {
    const team = stack.pop()!
    if (visited.has(team.id)) continue
    visited.add(team.id)
    orderedTeams.push(team)
    const children = (childMap.get(team.id) || []).slice().sort((a, b) => a.name.localeCompare(b.name))
    for (const child of children.reverse()) stack.push(child)
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
      const memberIds = dedupe((group.members || []).map((member) => getMemberId(member)))
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
      const memberIds = dedupe((community.members || []).map((member) => getMemberId(member)))
      const membersContained = memberIds.length > 0 && memberIds.every((memberId) => agentIdSet.has(memberId))
      const attachedGroups = (args.groups || []).filter((group) => (
        group.community === community.name && groupNames.has(group.name)
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

export function findImpactedTopLevelTeamsForCommunityDelete(args: {
  communityName: string
  teams: TeamLike[]
  groups: OrganizationDeletePlanGroup[]
  communities: OrganizationDeletePlanCommunity[]
  workflows?: OrganizationDeletePlanWorkflow[]
}): OrganizationDeletePlan[] {
  const roots = (args.teams || []).filter((team) => !team.parentTeamId)
  return roots
    .map((root) => buildOrganizationDeletePlan({
      rootTeamId: root.id,
      teams: args.teams,
      groups: args.groups,
      communities: args.communities,
      workflows: args.workflows,
    }))
    .filter((plan) => plan.communityNames.includes(args.communityName) && plan.teamIds.length > 0)
}
