/**
 * Metering data from Opik traces.
 * Fetches and aggregates token usage, costs, and call counts
 * per agent, per workflow, and for the workspace.
 */

import https from 'https'
import path from 'path'
import { getWorkspaceManager } from './workspace-manager'

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
  byAgent: AgentMetering[]
  byWorkflow: WorkflowMetering[]
  period: string
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

export async function getWorkspaceMetering(workspaceId?: string): Promise<WorkspaceMetering> {
  const config = getOpikConfig()
  const workspaceIds = new Set(getWorkspaceTraceIds(workspaceId))
  const traces = (await fetchOpikTraces(config.projectName)).filter((trace) => {
    const workspaceId = trace.metadata?.workspace_id
    return !workspaceId || workspaceIds.has(String(workspaceId))
  })

  const agentMap = new Map<string, AgentMetering>()
  const workflowMap = new Map<string, WorkflowMetering>()

  let totalInput = 0
  let totalOutput = 0

  for (const trace of traces) {
    const meta = trace.metadata || {}

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
      existing.estimatedCostUsd += meta.estimated_cost_usd || 0
      existing.avgDurationMs = ((existing.avgDurationMs * (existing.totalCalls - 1)) + (meta.duration_ms || 0)) / existing.totalCalls
      if (!existing.lastActivity || trace.start_time > existing.lastActivity) {
        existing.lastActivity = trace.start_time
      }
      const model: string = meta.model || 'unknown'
      ;(existing.models as Record<string, number>)[model] = ((existing.models as Record<string, number>)[model] || 0) + 1

      totalInput += meta.tokens_input || 0
      totalOutput += meta.tokens_output || 0

      agentMap.set(agentId, existing)
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
      existing.avgDurationMs = ((existing.avgDurationMs * (existing.totalRuns - 1)) + (meta.duration_ms || 0)) / existing.totalRuns
      if (!existing.lastRun || trace.start_time > existing.lastRun) {
        existing.lastRun = trace.start_time
      }

      workflowMap.set(workflowId, existing)
    }
  }

  const byAgent = Array.from(agentMap.values()).sort((a, b) => b.totalTokens - a.totalTokens)
  const byWorkflow = Array.from(workflowMap.values()).sort((a, b) => b.totalRuns - a.totalRuns)

  const totalCost = byAgent.reduce((s, a) => s + a.estimatedCostUsd, 0)

  return {
    totalTraces: traces.length,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalTokens: totalInput + totalOutput,
    estimatedCostUsd: Math.round(totalCost * 10000) / 10000,
    byAgent,
    byWorkflow,
    period: 'all',
  }
}
