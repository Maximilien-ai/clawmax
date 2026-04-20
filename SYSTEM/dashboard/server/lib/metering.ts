/**
 * Metering data from Opik traces.
 * Fetches and aggregates token usage, costs, and call counts
 * per agent, per workflow, and for the workspace.
 */

import https from 'https'
import path from 'path'
import fs from 'fs'
import { getWorkspaceManager } from './workspace-manager'
import { listAgents } from './workspace'
import { estimateTraceCostUsd } from './model-pricing'

interface TraceData {
  id: string
  name: string
  start_time: string
  end_time: string
  metadata: Record<string, any>
}

export interface AgentMetering {
  agentId: string
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  avgDurationMs: number
  lastActivity: string
  models: Record<string, number> // model -> call count
}

export interface WorkflowMetering {
  workflowId: string
  workflowName: string
  totalRuns: number
  totalTokens: number
  estimatedCostUsd: number
  avgDurationMs: number
  lastRun: string
}

export interface WorkspaceMetering {
  totalTraces: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  dailyCost: Array<{ date: string; estimatedCostUsd: number; traceCount: number }>
  costSummary: {
    todayCostUsd: number
    last7dCostUsd: number
    avgDailyCostUsd: number
  }
  byAgent: AgentMetering[]
  byWorkflow: WorkflowMetering[]
  period: string
}

export interface MeteringViewer {
  userId?: string | null
  login?: string | null
  email?: string | null
  dashboardInstanceId?: string | null
}

export function aggregateWorkspaceMeteringFromTraces(traces: TraceData[]): Omit<WorkspaceMetering, 'period'> {
  const agentMap = new Map<string, AgentMetering>()
  const workflowMap = new Map<string, WorkflowMetering>()

  let totalInput = 0
  let totalOutput = 0

  for (const trace of traces) {
    const meta = trace.metadata || {}
    const traceCost = estimateTraceCostUsd(meta)

    if (trace.name.startsWith('agent.chat.')) {
      const agentId = meta.agent_id || trace.name.replace('agent.chat.', '')
      const existing = agentMap.get(agentId) || {
        agentId,
        totalCalls: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        avgDurationMs: 0,
        lastActivity: '',
        models: {},
      }

      existing.totalCalls++
      existing.totalInputTokens += meta.tokens_input || 0
      existing.totalOutputTokens += meta.tokens_output || 0
      existing.totalTokens += meta.tokens_total || 0
      existing.estimatedCostUsd += traceCost
      existing.avgDurationMs = ((existing.avgDurationMs * (existing.totalCalls - 1)) + (meta.duration_ms || 0)) / existing.totalCalls
      if (!existing.lastActivity || trace.start_time > existing.lastActivity) {
        existing.lastActivity = trace.start_time
      }
      const model: string = meta.model || 'unknown'
      ;(existing.models as Record<string, number>)[model] = ((existing.models as Record<string, number>)[model] || 0) + 1

      totalInput += meta.tokens_input || 0
      totalOutput += meta.tokens_output || 0
      agentMap.set(agentId, existing)

      if (meta.workflow_id) {
        const workflowId = String(meta.workflow_id)
        const workflowExisting = workflowMap.get(workflowId) || {
          workflowId,
          workflowName: meta.workflow_name || workflowId,
          totalRuns: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          avgDurationMs: 0,
          lastRun: '',
        }
        workflowExisting.totalTokens += meta.tokens_total || 0
        workflowExisting.estimatedCostUsd += traceCost
        if (!workflowExisting.lastRun || trace.start_time > workflowExisting.lastRun) {
          workflowExisting.lastRun = trace.start_time
        }
        workflowMap.set(workflowId, workflowExisting)
      }
    } else if (trace.name.startsWith('workflow.')) {
      const workflowId = meta.workflow_id || trace.name.replace('workflow.', '')
      const existing = workflowMap.get(workflowId) || {
        workflowId,
        workflowName: meta.workflow_name || workflowId,
        totalRuns: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        avgDurationMs: 0,
        lastRun: '',
      }

      existing.totalRuns++
      existing.totalTokens += meta.tokens_total || 0
      existing.estimatedCostUsd += traceCost
      existing.avgDurationMs = ((existing.avgDurationMs * (existing.totalRuns - 1)) + (meta.duration_ms || 0)) / existing.totalRuns
      if (!existing.lastRun || trace.start_time > existing.lastRun) {
        existing.lastRun = trace.start_time
      }

      workflowMap.set(workflowId, existing)
    }
  }

  const byAgent = Array.from(agentMap.values()).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
  const byWorkflow = Array.from(workflowMap.values()).sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
  const totalCost = byAgent.reduce((s, a) => s + a.estimatedCostUsd, 0)
  const dailyCost = buildDailyCostSeries(traces)

  return {
    totalTraces: traces.length,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
    dailyCost,
    costSummary: summarizeCostWindows(dailyCost),
    byAgent,
    byWorkflow,
  }
}

export function buildDailyCostSeries(traces: TraceData[], days = 7): Array<{ date: string; estimatedCostUsd: number; traceCount: number }> {
  const buckets = new Map<string, { date: string; estimatedCostUsd: number; traceCount: number }>()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - i)
    const isoDate = date.toISOString().slice(0, 10)
    buckets.set(isoDate, { date: isoDate, estimatedCostUsd: 0, traceCount: 0 })
  }

  for (const trace of traces) {
    const isoDate = String(trace.start_time || '').slice(0, 10)
    const bucket = buckets.get(isoDate)
    if (!bucket) continue
    bucket.estimatedCostUsd += estimateTraceCostUsd(trace.metadata || {})
    bucket.traceCount += 1
  }

  return Array.from(buckets.values()).map((entry) => ({
    ...entry,
    estimatedCostUsd: Math.round(entry.estimatedCostUsd * 10000) / 10000,
  }))
}

export function summarizeCostWindows(
  dailyCost: Array<{ date: string; estimatedCostUsd: number; traceCount: number }>
): { todayCostUsd: number; last7dCostUsd: number; avgDailyCostUsd: number } {
  const todayKey = new Date().toISOString().slice(0, 10)
  const todayEntry = dailyCost.find((entry) => entry.date === todayKey)
  const last7dCostUsd = dailyCost.reduce((sum, entry) => sum + Number(entry.estimatedCostUsd || 0), 0)
  const avgDailyCostUsd = dailyCost.length > 0 ? last7dCostUsd / dailyCost.length : 0
  return {
    todayCostUsd: Math.round(Number(todayEntry?.estimatedCostUsd || 0) * 10000) / 10000,
    last7dCostUsd: Math.round(last7dCostUsd * 10000) / 10000,
    avgDailyCostUsd: Math.round(avgDailyCostUsd * 10000) / 10000,
  }
}

function getOpikConfig() {
  return {
    apiKey: (process.env.OPIK_API_KEY || '').replace(/"/g, ''),
    workspace: (process.env.OPIK_WORKSPACE || 'default').replace(/"/g, ''),
    projectName: (process.env.OPIK_PROJECT_NAME || 'clawmax').replace(/"/g, ''),
  }
}

function getWorkspaceTraceIds(workspaceId?: string): string[] {
  try {
    const workspace = workspaceId
      ? getWorkspaceManager().getWorkspace(workspaceId)
      : getWorkspaceManager().getActiveWorkspace()
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`)
    }
    const ids = new Set<string>([workspace.id, path.basename(workspace.path)])
    return Array.from(ids).filter(Boolean)
  } catch {
    const wsPath = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || '', '.openclaw', 'workspace')
    return [path.basename(wsPath) || 'default']
  }
}

function getWorkspaceAgentAndWorkflowIds(workspaceId?: string): { agentIds: Set<string>; workflowIds: Set<string> } {
  try {
    if (!workspaceId) {
      const agentIds = new Set(listAgents().map((agent) => agent.id).filter(Boolean))
      const workflowDir = path.join(getWorkspaceManager().getActiveWorkspace().path, 'WORKFLOWS')
      const workflowIds = new Set<string>()
      try {
        for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.endsWith('.md')) continue
          workflowIds.add(entry.name.replace(/\.md$/, ''))
        }
      } catch {}
      return { agentIds, workflowIds }
    }

    const workspacePath = getWorkspaceManager().resolveWorkspacePath(workspaceId)
    const agentsDir = path.join(workspacePath, 'AGENTS')
    const workflowDir = path.join(workspacePath, 'WORKFLOWS')
    const agentIds = new Set<string>()
    const workflowIds = new Set<string>()

    try {
      for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        if (entry.name.startsWith('.') || entry.name.startsWith('_') || entry.name === 'archive') continue
        agentIds.add(entry.name)
      }
    } catch {}

    try {
      for (const entry of fs.readdirSync(workflowDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue
        workflowIds.add(entry.name.replace(/\.md$/, ''))
      }
    } catch {}

    return { agentIds, workflowIds }
  } catch {
    return { agentIds: new Set<string>(), workflowIds: new Set<string>() }
  }
}

function fetchOpikTraces(projectName: string, size: number = 100): Promise<TraceData[]> {
  const config = getOpikConfig()
  if (!config.apiKey) return Promise.resolve([])

  return new Promise((resolve, reject) => {
    const encodedProject = encodeURIComponent(projectName)
    const req = https.request({
      hostname: 'www.comet.com',
      path: `/opik/api/v1/private/traces?project_name=${encodedProject}&size=${size}`,
      method: 'GET',
      headers: {
        'Authorization': config.apiKey,
        'Comet-Workspace': config.workspace,
      },
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolve(parsed.content || [])
        } catch {
          resolve([])
        }
      })
    })
    req.on('error', (err) => {
      console.error('[Metering] Failed to fetch traces:', err.message)
      resolve([])
    })
    req.end()
  })
}

export function traceMatchesViewer(trace: TraceData, viewer?: MeteringViewer): boolean {
  if (!viewer?.userId && !viewer?.login && !viewer?.email && !viewer?.dashboardInstanceId) return true
  const meta = trace.metadata || {}
  const traceDashboardInstanceId = String(meta.dashboard_instance_id || '').trim().toLowerCase()
  const viewerDashboardInstanceId = String(viewer.dashboardInstanceId || '').trim().toLowerCase()
  if (viewerDashboardInstanceId && traceDashboardInstanceId && traceDashboardInstanceId !== viewerDashboardInstanceId) {
    return false
  }
  if (viewer.userId && meta.user_id && String(meta.user_id) === String(viewer.userId)) return true
  if (viewer.login && meta.user_login && String(meta.user_login).toLowerCase() === String(viewer.login).toLowerCase()) return true
  if (viewer.email && meta.user_email && String(meta.user_email).toLowerCase() === String(viewer.email).toLowerCase()) return true
  if (viewer.userId || viewer.login || viewer.email) return false
  return true
}

export async function getWorkspaceMetering(workspaceId?: string, viewer?: MeteringViewer): Promise<WorkspaceMetering> {
  const config = getOpikConfig()
  const workspaceIds = new Set(getWorkspaceTraceIds(workspaceId))
  const { agentIds, workflowIds } = getWorkspaceAgentAndWorkflowIds(workspaceId)
  const traces = (await fetchOpikTraces(config.projectName)).filter((trace) => {
    if (!traceMatchesViewer(trace, viewer)) {
      return false
    }
    const traceWorkspaceId = trace.metadata?.workspace_id
    if (traceWorkspaceId) {
      return workspaceIds.has(String(traceWorkspaceId))
    }

    // Older traces may lack workspace_id. Keep them only if they clearly map
    // to an agent or workflow that exists in the workspace being viewed.
    const meta = trace.metadata || {}
    if (trace.name.startsWith('agent.chat.')) {
      const agentId = String(meta.agent_id || trace.name.replace('agent.chat.', ''))
      return agentIds.has(agentId)
    }
    if (trace.name.startsWith('workflow.')) {
      const workflowId = String(meta.workflow_id || trace.name.replace('workflow.', ''))
      return workflowIds.has(workflowId)
    }
    return false
  })
  const aggregated = aggregateWorkspaceMeteringFromTraces(traces)

  return {
    ...aggregated,
    period: 'all',
  }
}
