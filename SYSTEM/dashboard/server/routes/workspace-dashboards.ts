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
            members: group.members,
            messageCount: messages.length,
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
            members: community.members,
            messageCount: messages.length,
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
          kickoffSummary: latest?.logs?.[0] || null,
          resultSummary: latest?.logs?.slice(-2) || [],
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
