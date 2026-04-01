import { Router } from 'express'
import { getWorkspaceDashboardByToken } from '../lib/workspace-dashboards'
import { getWorkspaceManager } from '../lib/workspace-manager'
import { listAgents, parseGroups, parseGroupsWithMembers } from '../lib/workspace'
import { getBudgetStatus } from '../lib/budget'
import { getWorkspaceMetering } from '../lib/metering'
import { getActiveNotifications } from '../lib/notifications'
import { listWorkflows, listExecutions } from '../lib/workflows'
import { getNextCronRun } from '../lib/cron-next-run'
import { getMessages } from '../lib/messages'
import fs from 'fs'
import path from 'path'

const router = Router()
const URL_REGEX = /https?:\/\/[^\s)>\]]+/g
const FILE_PATH_REGEX = /\/[^\s"'<>]+?\.(md|txt|pdf|json|csv|png|jpg|jpeg|gif|html)/gi

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

      const workflowSummaries = workflows.map((workflow) => {
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
          totalAgents: agents.length,
          onlineAgents: agents.filter(a => a.status === 'online' && !a.paused).length,
          pausedAgents: agents.filter(a => a.paused).length,
          failingAgents: notifications.filter(n => n.entityType === 'agent' && n.severity === 'critical').length,
          activeNotifications: notifications.length,
          runningWorkflows: workflowSummaries.filter(w => w.status === 'running').length,
        },
        costs: {
          budget,
          metering: {
            totalCostUsd: metering.estimatedCostUsd,
            totalTraces: metering.totalTraces,
            dailyCost: metering.dailyCost,
            byAgent: metering.byAgent.slice(0, 10),
            byWorkflow: metering.byWorkflow.slice(0, 10),
          },
        },
        agents: agents.map((agent) => {
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
        notifications: notifications.slice(0, 20),
        workflows: workflowSummaries,
        groupChats: groupChats.slice(0, 20),
      }
    })

    res.json(payload)
  } catch (err: any) {
    console.error('Error building workspace dashboard payload:', err)
    res.status(500).json({ error: err.message || 'Failed to load workspace dashboard' })
  }
})

export default router
