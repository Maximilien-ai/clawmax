import { Router } from 'express'
import { getWorkspaceDashboardByToken } from '../lib/workspace-dashboards'
import { getWorkspaceManager } from '../lib/workspace-manager'
import { listAgents, parseGroups, parseGroupsWithMembers } from '../lib/workspace'
import { getBudgetStatus } from '../lib/budget'
import { getWorkspaceMetering } from '../lib/metering'
import { getActiveNotifications } from '../lib/notifications'
import { listWorkflows, listExecutions, resolveWorkflowInputRefs } from '../lib/workflows'
import { getNextCronRun } from '../lib/cron-next-run'
import { getMessages } from '../lib/messages'
import { listTeams, type Team } from '../lib/teams'
import fs from 'fs'
import path from 'path'

const router = Router()
const URL_REGEX = /https?:\/\/[^\s)>\]]+/g
const FILE_PATH_REGEX = /\/[^\s"'<>]+?\.(md|txt|pdf|json|csv|png|jpg|jpeg|gif|html)/gi

export interface WorkspaceDashboardCompanyOption {
  kind: 'workspace' | 'team' | 'prefix'
  value: string | null
  label: string
}

function normalizeCompanyKey(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function getWorkflowCompanyPrefix(name: string | null | undefined): string | null {
  const trimmed = String(name || '').trim()
  const match = trimmed.match(/^(.*?)\s+·\s+/)
  return match?.[1]?.trim() || null
}

function getWorkflowTeamLabel(name: string | null | undefined): string | null {
  const trimmed = String(name || '').trim()
  const withoutPrefix = trimmed.replace(/^(.*?)\s+·\s+/, '')
  const segment = withoutPrefix.split('/')[0]?.trim()
  return segment || null
}

export function inferWorkspaceDashboardCompanies(input: {
  teams: Team[]
  workflows: Array<{ name?: string | null }>
}): WorkspaceDashboardCompanyOption[] {
  const options: WorkspaceDashboardCompanyOption[] = [{
    kind: 'workspace',
    value: null,
    label: 'Whole workspace',
  }]
  const seen = new Set<string>(['workspace:'])

  const topTeams = (input.teams || [])
    .filter((team) => !team.parentTeamId)
    .sort((a, b) => a.name.localeCompare(b.name))

  for (const team of topTeams) {
    const key = `team:${normalizeCompanyKey(team.id)}`
    if (seen.has(key)) continue
    seen.add(key)
    options.push({
      kind: 'team',
      value: team.id,
      label: team.name,
    })
  }

  const prefixes = Array.from(new Set(
    (input.workflows || [])
      .map((workflow) => getWorkflowCompanyPrefix(workflow.name))
      .filter((value): value is string => !!value)
  )).sort((a, b) => a.localeCompare(b))

  const knownLabels = new Set(options.map((option) => normalizeCompanyKey(option.label)))
  for (const prefix of prefixes) {
    if (knownLabels.has(normalizeCompanyKey(prefix))) continue
    const key = `prefix:${normalizeCompanyKey(prefix)}`
    if (seen.has(key)) continue
    seen.add(key)
    options.push({
      kind: 'prefix',
      value: prefix,
      label: prefix,
    })
  }

  return options
}

function collectTeamSubtreeIds(rootTeamId: string, teams: Team[]): Set<string> {
  const childMap = new Map<string, Team[]>()
  for (const team of teams) {
    if (!team.parentTeamId) continue
    childMap.set(team.parentTeamId, [...(childMap.get(team.parentTeamId) || []), team])
  }
  const ids = new Set<string>()
  const stack = [rootTeamId]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (ids.has(current)) continue
    ids.add(current)
    for (const child of childMap.get(current) || []) stack.push(child.id)
  }
  return ids
}

function getTeamAgentIds(team: Pick<Team, 'leaderAgentId' | 'memberAgentIds'>): string[] {
  return Array.from(new Set([team.leaderAgentId, ...(team.memberAgentIds || [])].filter(Boolean) as string[]))
}

function normalizeGroupName(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

export function summarizeSentence(value: string, maxLength = 220): string {
  const trimmed = value.replace(/\s+/g, ' ').trim()
  if (!trimmed) return ''
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

export function extractProjectConfigurationLines(content: string): string[] {
  const lines = content.split('\n')
  const startIndex = lines.findIndex((line) => /^##\s+Project Configuration\b/i.test(line.trim()))
  if (startIndex === -1) return []

  const collected: string[] = []
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue
    if (/^##\s+/.test(line)) break
    if (/^>\s*\*\*Customize/i.test(line)) continue
    if (/^-\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      collected.push(line.replace(/^[-\d.\s]+/, '').trim())
    }
  }
  return collected.slice(0, 6)
}

export function extractParticipantResponses(execution: any): string[] {
  const participants: any[] = Array.isArray(execution?.participants) ? execution.participants : []
  return participants
    .map((participant: any) => participant?.response || participant?.result?.text || participant?.result?.response || '')
    .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
}

export function extractLinks(values: Array<string | null | undefined>, limit = 6): string[] {
  const seen = new Set<string>()
  for (const value of values) {
    if (!value) continue
    for (const match of value.match(URL_REGEX) || []) {
      const normalized = match.replace(/[.,;!?]+$/, '')
      if (!seen.has(normalized)) {
        seen.add(normalized)
        if (seen.size >= limit) return Array.from(seen)
      }
    }
  }
  return Array.from(seen)
}

export function extractWorkspaceFilePaths(values: Array<string | null | undefined>, workspacePath: string, limit = 6): string[] {
  const seen = new Set<string>()
  for (const value of values) {
    if (!value) continue
    for (const match of value.match(FILE_PATH_REGEX) || []) {
      if (!match.startsWith(workspacePath)) continue
      if (!fs.existsSync(match)) continue
      if (!seen.has(match)) {
        seen.add(match)
        if (seen.size >= limit) return Array.from(seen)
      }
    }
  }
  return Array.from(seen)
}

export function normalizeResultArtifacts(input: {
  links: string[]
  filePaths: string[]
  workspacePath: string
}): Array<{ kind: 'link' | 'file'; label: string; url?: string; relativePath?: string }> {
  const artifacts: Array<{ kind: 'link' | 'file'; label: string; url?: string; relativePath?: string }> = []

  for (const link of input.links) {
    try {
      const parsed = new URL(link)
      const pathName = parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname
      artifacts.push({
        kind: 'link',
        label: summarizeSentence(`${parsed.hostname} / ${pathName}`, 64),
        url: link,
      })
    } catch {
      artifacts.push({
        kind: 'link',
        label: summarizeSentence(link, 64),
        url: link,
      })
    }
  }

  for (const filePath of input.filePaths) {
    const relativePath = path.relative(input.workspacePath, filePath)
    artifacts.push({
      kind: 'file',
      label: path.basename(filePath),
      relativePath,
    })
  }

  return artifacts.slice(0, 8)
}

function buildFocusedCompanyScope(input: {
  focusKind: 'workspace' | 'team' | 'prefix'
  focusValue: string | null
  focusLabel: string | null
  teams: Team[]
  workflows: any[]
  groups: any[]
  communities: any[]
}): null | {
  label: string
  kind: 'team' | 'prefix'
  teamIds: Set<string>
  agentIds: Set<string>
  workflowIds: Set<string>
  groupNames: Set<string>
  communityNames: Set<string>
  topTeams: Team[]
} {
  if (input.focusKind === 'workspace' || !input.focusValue) return null

  if (input.focusKind === 'team') {
    const rootTeam = input.teams.find((team) => team.id === input.focusValue)
    if (!rootTeam) return null
    const teamIds = collectTeamSubtreeIds(rootTeam.id, input.teams)
    const scopedTeams = input.teams.filter((team) => teamIds.has(team.id))
    const agentIds = new Set(scopedTeams.flatMap((team) => getTeamAgentIds(team)))
    const groupNameKeys = new Set(scopedTeams.flatMap((team) => [normalizeGroupName(team.id), normalizeGroupName(team.name)]))
    const selectedWorkflows = input.workflows.filter((workflow) => {
      const targeting = workflow.targeting || {}
      return (
        (workflow.owner && agentIds.has(workflow.owner)) ||
        (targeting.agents || []).some((agentId: string) => agentIds.has(agentId)) ||
        (targeting.teamIds || []).some((teamId: string) => teamIds.has(teamId)) ||
        (targeting.groups || []).some((groupName: string) => groupNameKeys.has(normalizeGroupName(groupName)))
      )
    })
    const workflowIds = new Set(selectedWorkflows.map((workflow) => workflow.id).filter(Boolean))
    const groupNames = new Set(
      (input.groups || [])
        .filter((group: any) => {
          const memberIds = (group.members || []).map((member: any) => member.id)
          return groupNameKeys.has(normalizeGroupName(group.name))
            || (memberIds.length > 0 && memberIds.every((memberId: string) => agentIds.has(memberId)))
        })
        .map((group: any) => group.name)
    )
    const communityNames = new Set(
      (input.communities || [])
        .filter((community: any) => {
          const memberIds = (community.members || []).map((member: any) => member.id)
          return memberIds.length > 0 && memberIds.every((memberId: string) => agentIds.has(memberId))
        })
        .map((community: any) => community.name)
    )
    return {
      label: input.focusLabel || rootTeam.name,
      kind: 'team',
      teamIds,
      agentIds,
      workflowIds,
      groupNames,
      communityNames,
      topTeams: input.teams.filter((team) => team.parentTeamId === rootTeam.id),
    }
  }

  const focusPrefix = normalizeCompanyKey(input.focusValue)
  const selectedWorkflows = input.workflows.filter((workflow) => normalizeCompanyKey(getWorkflowCompanyPrefix(workflow.name)) === focusPrefix)
  if (selectedWorkflows.length === 0) return null
  const teamIds = new Set<string>(selectedWorkflows.flatMap((workflow) => workflow.targeting?.teamIds || []))
  const workflowIds = new Set(selectedWorkflows.map((workflow) => workflow.id).filter(Boolean))
  const groupNames = new Set<string>(selectedWorkflows.flatMap((workflow) => workflow.targeting?.groups || []))
  const agentIds = new Set<string>(selectedWorkflows.flatMap((workflow) => [workflow.owner, ...(workflow.targeting?.agents || [])].filter(Boolean)))
  const matchingTeams = input.teams.filter((team) =>
    teamIds.has(team.id)
    || normalizeCompanyKey(team.id).startsWith(focusPrefix)
    || normalizeCompanyKey(team.name) === focusPrefix
  )
  for (const team of matchingTeams) {
    for (const id of getTeamAgentIds(team)) agentIds.add(id)
    teamIds.add(team.id)
  }
  const matchedGroups = (input.groups || []).filter((group: any) => {
    const normalized = normalizeCompanyKey(group.name)
    const memberIds = (group.members || []).map((member: any) => member.id)
    return groupNames.has(group.name)
      || normalized.startsWith(focusPrefix)
      || (memberIds.length > 0 && memberIds.every((memberId: string) => agentIds.has(memberId)))
  })
  for (const group of matchedGroups) groupNames.add(group.name)
  const communityNames = new Set(
    (input.communities || [])
      .filter((community: any) => {
        const memberIds = (community.members || []).map((member: any) => member.id)
        return memberIds.length > 0 && memberIds.every((memberId: string) => agentIds.has(memberId))
      })
      .map((community: any) => community.name)
  )
  return {
    label: input.focusLabel || input.focusValue,
    kind: 'prefix',
    teamIds,
    agentIds,
    workflowIds,
    groupNames,
    communityNames,
    topTeams: matchingTeams.filter((team) => !team.parentTeamId || !teamIds.has(team.parentTeamId)),
  }
}

router.get('/:token', async (req, res) => {
  try {
    const dashboard = getWorkspaceDashboardByToken(req.params.token)
    if (!dashboard) {
      return res.status(404).json({ error: 'Workspace dashboard not found' })
    }

    const workspaceManager = getWorkspaceManager()
    const workspace = workspaceManager.getWorkspace(dashboard.workspaceId)
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' })
    }

    const payload = await workspaceManager.withWorkspace(dashboard.workspaceId, async () => {
      const agents = listAgents()
      const teams = listTeams()
      const budget = await getBudgetStatus(dashboard.workspaceId)
      const metering = await getWorkspaceMetering(dashboard.workspaceId)
      const notifications = getActiveNotifications()
      const workflows = listWorkflows()
      const groupsPath = path.join(workspace.path, 'ORG', 'GROUPS.md')
      const communitiesPath = path.join(workspace.path, 'ORG', 'COMMUNITIES.md')
      const groupsFile = fs.existsSync(groupsPath) ? fs.readFileSync(groupsPath, 'utf-8') : ''
      const communitiesFile = fs.existsSync(communitiesPath) ? fs.readFileSync(communitiesPath, 'utf-8') : ''
      const parsedGroupsWithMembers = groupsFile ? parseGroupsWithMembers(groupsFile).groups : []
      const parsedCommunitiesWithMembers = communitiesFile ? parseGroupsWithMembers(communitiesFile).communities : []
      const parsedGroupsFallback = groupsFile ? parseGroups(groupsFile).groups : []
      const parsedCommunitiesFallback = communitiesFile ? parseGroups(communitiesFile).communities : []

      const groups = parsedGroupsWithMembers.length > 0
        ? parsedGroupsWithMembers
        : parsedGroupsFallback.map((group) => ({ ...group, members: [] }))
      const communities = parsedCommunitiesWithMembers.length > 0
        ? parsedCommunitiesWithMembers
        : parsedCommunitiesFallback.map((community) => ({ ...community, members: [] }))

      const companyScope = buildFocusedCompanyScope({
        focusKind: dashboard.companyFocusKind,
        focusValue: dashboard.companyFocusValue,
        focusLabel: dashboard.companyFocusLabel,
        teams,
        workflows: listWorkflows(),
        groups,
        communities,
      })

      const groupChats = [
        ...groups.map((group) => {
          const messages = getMessages('group', group.name)
          const latest = messages[messages.length - 1]
          return {
            type: 'group' as const,
            name: group.name,
            community: group.community,
            channels: group.channels,
            members: group.members,
            messageCount: messages.length,
            recentMessages: messages.slice(-5).map((message) => ({
              from: message.from,
              content: message.content,
              timestamp: message.timestamp,
            })),
            latestMessage: latest ? {
              from: latest.from,
              content: latest.content,
              timestamp: latest.timestamp,
            } : null,
          }
        }),
        ...communities.map((community) => {
          const messages = getMessages('community', community.name)
          const latest = messages[messages.length - 1]
          return {
            type: 'community' as const,
            name: community.name,
            community: null,
            channels: community.channels,
            members: community.members,
            messageCount: messages.length,
            recentMessages: messages.slice(-5).map((message) => ({
              from: message.from,
              content: message.content,
              timestamp: message.timestamp,
            })),
            latestMessage: latest ? {
              from: latest.from,
              content: latest.content,
              timestamp: latest.timestamp,
            } : null,
          }
        }),
      ].sort((a, b) => (b.latestMessage?.timestamp || 0) - (a.latestMessage?.timestamp || 0))

      const scopedAgents = companyScope
        ? agents.filter((agent) => companyScope.agentIds.has(agent.id))
        : agents
      const scopedChats = companyScope
        ? groupChats.filter((chat) => companyScope.groupNames.has(chat.name) || companyScope.communityNames.has(chat.name))
        : groupChats
      const scopedWorkflows = companyScope
        ? workflows.filter((workflow) => companyScope.workflowIds.has(workflow.id))
        : workflows
      const scopedTeams = companyScope
        ? teams.filter((team) => companyScope.teamIds.has(team.id))
        : teams
      const scopedNotifications = companyScope
        ? notifications.filter((notification) => {
            if (notification.entityType === 'agent') return !!notification.entityId && companyScope.agentIds.has(notification.entityId)
            if (notification.entityType === 'workflow') return !!notification.workflowId && companyScope.workflowIds.has(notification.workflowId)
            return true
          })
        : notifications

      const workflowSummaries = scopedWorkflows.map((workflow) => {
        const executions = listExecutions(workflow.id, 5)
        const latest = executions[0] || null
        const kickoffLines = extractProjectConfigurationLines(workflow.content || '')
        const participantResponses = extractParticipantResponses(latest)
        const resultLinks = extractLinks([
          workflow.description,
          workflow.content,
          ...participantResponses,
          ...(latest?.logs || []),
        ])
        const resultFilePaths = extractWorkspaceFilePaths([
          workflow.description,
          workflow.content,
          ...participantResponses,
          ...(latest?.logs || []),
        ], workspace.path)
        const normalizedKickoff = kickoffLines.length > 0
          ? kickoffLines.map((line) => summarizeSentence(line, 160))
          : (latest?.logs?.[0] ? [summarizeSentence(latest.logs[0], 160)] : [])
        const normalizedResults = participantResponses.length > 0
          ? participantResponses.slice(0, 3).map((response) => summarizeSentence(response, 220))
          : (latest?.logs?.slice(-2) || []).map((line: string) => summarizeSentence(line, 220))
        return {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          enabled: workflow.enabled,
          schedule: workflow.schedule,
          targetingTeamIds: workflow.targeting?.teamIds || [],
          inputRefs: workflow.inputRefs || [],
          nextRunAt: workflow.enabled ? getNextCronRun(workflow.schedule)?.toISOString() || null : null,
          status: workflow.status || latest?.status || 'idle',
          latestExecution: latest ? {
            id: latest.id,
            startedAt: latest.startedAt,
            completedAt: latest.completedAt,
            status: latest.status,
            triggerType: latest.triggerType,
            logsPreview: latest.logs?.slice(0, 5) || [],
          } : null,
          executionHistory: executions.slice(0, 5).map((execution) => ({
            id: execution.id,
            startedAt: execution.startedAt,
            completedAt: execution.completedAt,
            status: execution.status,
            triggerType: execution.triggerType,
          })),
          kickoffSummary: normalizedKickoff[0] || null,
          kickoffItems: normalizedKickoff,
          resultSummary: normalizedResults,
          resultLinks,
          resultArtifacts: normalizeResultArtifacts({
            links: resultLinks,
            filePaths: resultFilePaths,
            workspacePath: workspace.path,
          }),
        }
      })

      const companyMeteringByAgent = companyScope
        ? metering.byAgent.filter((entry) => companyScope.agentIds.has(entry.agentId))
        : metering.byAgent
      const companyMeteringByWorkflow = companyScope
        ? metering.byWorkflow.filter((entry) => companyScope.workflowIds.has(entry.workflowId))
        : metering.byWorkflow
      const companyTotalCostUsd = companyMeteringByAgent.reduce((sum, entry) => sum + (entry.estimatedCostUsd || 0), 0)
      const normalizedCompanyGroupNames = new Set(Array.from(companyScope?.groupNames || []).map((name) => normalizeGroupName(name)))
      const groupDerivedTeams = companyScope
        ? (groups || [])
            .filter((group: any) => {
              const normalizedGroupName = normalizeGroupName(group.name)
              const memberIds = (group.members || []).map((member: any) => member.id)
              return normalizedCompanyGroupNames.has(normalizedGroupName)
                || normalizeCompanyKey(group.name).startsWith(normalizeCompanyKey(companyScope.label))
                || (memberIds.length > 0 && memberIds.every((memberId: string) => companyScope.agentIds.has(memberId)))
            })
            .map((group: any) => {
              const memberIds = Array.from(new Set((group.members || []).map((member: any) => member.id).filter(Boolean)))
              const normalizedGroup = normalizeCompanyKey(group.name)
              const matchingWorkflow = workflowSummaries.find((workflow: any) =>
                normalizeCompanyKey(workflow.name).includes(normalizedGroup) ||
                ((workflow as any).targetingTeamIds || []).some((teamId: string) => normalizeCompanyKey(teamId) === normalizedGroup)
              )
              const leaderId = memberIds[0] || null
              return {
                id: group.name,
                name: group.name.replace(new RegExp(`^${companyScope.label}-`, 'i'), ''),
                purpose: group.description || '',
                leaderAgentId: leaderId,
                leaderName: leaderId ? (scopedAgents.find((agent) => agent.id === leaderId)?.name || leaderId) : null,
                memberCount: memberIds.length,
                parentTeamId: null,
                workflowCount: matchingWorkflow ? 1 : 0,
              }
            })
        : []
      const workflowDerivedTeams = companyScope
        ? Array.from(
            scopedWorkflows.reduce((map, workflow: any) => {
              const label = getWorkflowTeamLabel(workflow.name)
              if (!label) return map
              const key = normalizeCompanyKey(label)
              const existing = map.get(key)
              if (existing) {
                existing.workflowCount += 1
                return map
              }
              const ownerId = workflow.owner || null
              map.set(key, {
                id: key || label,
                name: label,
                purpose: workflow.description || '',
                leaderAgentId: ownerId,
                leaderName: ownerId ? (scopedAgents.find((agent) => agent.id === ownerId)?.name || ownerId) : null,
                memberCount: ownerId ? 1 : 0,
                parentTeamId: null,
                workflowCount: 1,
              })
              return map
            }, new Map<string, {
              id: string
              name: string
              purpose: string
              leaderAgentId: string | null
              leaderName: string | null
              memberCount: number
              parentTeamId: string | null
              workflowCount: number
            }>())
          ).map(([, value]) => value)
        : []
      const companyDisplayTeams = companyScope
        ? (scopedTeams.length > 0
            ? scopedTeams.map((team) => ({
                id: team.id,
                name: team.name,
                purpose: team.purpose || '',
                leaderAgentId: team.leaderAgentId || null,
                leaderName: team.leaderAgentId ? (scopedAgents.find((agent) => agent.id === team.leaderAgentId)?.name || team.leaderAgentId) : null,
                memberCount: getTeamAgentIds(team).length,
                parentTeamId: team.parentTeamId || null,
                workflowCount: workflowSummaries.filter((workflow: any) => (workflow as any).targetingTeamIds?.includes(team.id)).length,
              }))
            : groupDerivedTeams.length > 0
              ? groupDerivedTeams
              : workflowDerivedTeams)
        : []
      const companyHandoffs = workflowSummaries
        .flatMap((workflow) => {
          const resolvedRefs = resolveWorkflowInputRefs(
            { inputRefs: Array.isArray((workflow as any).inputRefs) ? (workflow as any).inputRefs : [] },
            (workflowId) => listExecutions(workflowId, 1)[0] || null
          )
          return resolvedRefs.map((inputRef) => ({
            workflowId: workflow.id,
            workflowName: workflow.name,
            upstreamWorkflowId: inputRef.workflowId,
            label: inputRef.label || inputRef.outputKey,
            outputKey: inputRef.outputKey,
            summary: inputRef.summary,
            artifactPath: inputRef.artifactPath,
            missing: inputRef.missing,
          }))
        })
        .slice(0, 12)

      return {
        refreshedAt: new Date().toISOString(),
        dashboard,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          color: workspace.color || '#3B82F6',
          lastUpdatedAt: new Date().toISOString(),
        },
        overview: {
          totalAgents: scopedAgents.length,
          onlineAgents: scopedAgents.filter(a => a.status === 'online' && !a.paused).length,
          pausedAgents: scopedAgents.filter(a => a.paused).length,
          failingAgents: scopedNotifications.filter(n => n.entityType === 'agent' && n.severity === 'critical').length,
          activeNotifications: scopedNotifications.length,
          runningWorkflows: workflowSummaries.filter(w => w.status === 'running').length,
        },
        company: companyScope ? {
          kind: companyScope.kind,
          label: companyScope.label,
          teamCount: companyDisplayTeams.length,
          workflowCount: workflowSummaries.length,
          agentCount: scopedAgents.length,
          teams: companyDisplayTeams,
          orgCards: ((companyScope.topTeams.length > 0
            ? companyScope.topTeams.map((team) => ({
                id: team.id,
                name: team.name,
                purpose: team.purpose || '',
                leaderAgentId: team.leaderAgentId || null,
                memberCount: getTeamAgentIds(team).length,
                workflowCount: workflowSummaries.filter((workflow: any) => (workflow as any).targetingTeamIds?.includes(team.id)).length,
              }))
            : companyDisplayTeams.length > 0 ? companyDisplayTeams : workflowDerivedTeams)).slice(0, 8).map((team: any) => ({
            id: team.id,
            name: team.name,
            purpose: team.purpose || '',
            leaderAgentId: team.leaderAgentId || null,
            memberCount: typeof team.memberCount === 'number' ? team.memberCount : getTeamAgentIds(team).length,
            workflowCount: typeof team.workflowCount === 'number' ? team.workflowCount : workflowSummaries.filter((workflow: any) => (workflow as any).targetingTeamIds?.includes(team.id)).length,
          })),
          handoffs: companyHandoffs,
        } : null,
        costs: {
          budget,
          metering: {
            totalCostUsd: companyScope ? companyTotalCostUsd : metering.estimatedCostUsd,
            totalTraces: metering.totalTraces,
            dailyCost: metering.dailyCost,
            costSummary: metering.costSummary,
            byAgent: companyMeteringByAgent.slice(0, 10),
            byWorkflow: companyMeteringByWorkflow.slice(0, 10),
          },
        },
        agents: scopedAgents.map((agent) => {
          const metered = metering.byAgent.find(entry => entry.agentId === agent.id)
          return {
            id: agent.id,
            name: agent.name,
            status: agent.status,
            paused: !!agent.paused,
            archived: !!agent.archived,
            lastHeartbeat: agent.lastHeartbeat,
            costUsd: metered?.estimatedCostUsd || 0,
          }
        }),
        notifications: scopedNotifications.slice(0, 20),
        workflows: workflowSummaries,
        groupChats: scopedChats.slice(0, 20),
      }
    })

    res.json(payload)
  } catch (err: any) {
    console.error('Error building workspace dashboard payload:', err)
    res.status(500).json({ error: err.message || 'Failed to load workspace dashboard' })
  }
})

export default router
