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
import { resolveOpikRuntimeConfig } from './opik'

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
  instanceKey?: string | null
  machineId?: string | null
  machineName?: string | null
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
  return resolveOpikRuntimeConfig()
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

const METERING_CACHE_TTL_MS = 30_000

interface MeteringCacheEntry {
  data: WorkspaceMetering
  fetchedAt: number
  refreshPromise?: Promise<WorkspaceMetering>
}

const meteringCache = new Map<string, MeteringCacheEntry>()

function getViewerCacheKey(viewer?: MeteringViewer): string {
  if (!viewer) return 'viewer:public'
  return [
    `user:${viewer.userId || ''}`,
    `login:${viewer.login || ''}`,
    `email:${viewer.email || ''}`,
    `dashboard:${viewer.dashboardInstanceId || ''}`,
    `instance:${viewer.instanceKey || ''}`,
    `machine:${viewer.machineId || ''}`,
    `machine_name:${viewer.machineName || ''}`,
  ].join('|')
}

function getMeteringCacheKey(workspaceId?: string, viewer?: MeteringViewer): string {
  return `${workspaceId || 'active'}::${getViewerCacheKey(viewer)}`
}

export function mergeWorkspaceMetering(previous: WorkspaceMetering, next: WorkspaceMetering): WorkspaceMetering {
  const mergedDailyCost = new Map<string, { date: string; estimatedCostUsd: number; traceCount: number }>()
  for (const entry of previous.dailyCost || []) {
    mergedDailyCost.set(entry.date, { ...entry })
  }
  for (const entry of next.dailyCost || []) {
    const existing = mergedDailyCost.get(entry.date)
    mergedDailyCost.set(entry.date, {
      date: entry.date,
      estimatedCostUsd: Math.max(existing?.estimatedCostUsd || 0, entry.estimatedCostUsd || 0),
      traceCount: Math.max(existing?.traceCount || 0, entry.traceCount || 0),
    })
  }

  const mergedAgents = new Map<string, AgentMetering>()
  for (const entry of previous.byAgent || []) {
    mergedAgents.set(entry.agentId, { ...entry, models: { ...(entry.models || {}) } })
  }
  for (const entry of next.byAgent || []) {
    const existing = mergedAgents.get(entry.agentId)
    if (!existing) {
      mergedAgents.set(entry.agentId, { ...entry, models: { ...(entry.models || {}) } })
      continue
    }
    const mergedModels = { ...(existing.models || {}) }
    for (const [model, count] of Object.entries(entry.models || {})) {
      mergedModels[model] = Math.max(mergedModels[model] || 0, count || 0)
    }
    mergedAgents.set(entry.agentId, {
      ...existing,
      totalCalls: Math.max(existing.totalCalls || 0, entry.totalCalls || 0),
      totalInputTokens: Math.max(existing.totalInputTokens || 0, entry.totalInputTokens || 0),
      totalOutputTokens: Math.max(existing.totalOutputTokens || 0, entry.totalOutputTokens || 0),
      totalTokens: Math.max(existing.totalTokens || 0, entry.totalTokens || 0),
      estimatedCostUsd: Math.max(existing.estimatedCostUsd || 0, entry.estimatedCostUsd || 0),
      avgDurationMs: Math.max(existing.avgDurationMs || 0, entry.avgDurationMs || 0),
      lastActivity: [existing.lastActivity, entry.lastActivity].filter(Boolean).sort().slice(-1)[0] || '',
      models: mergedModels,
    })
  }

  const mergedWorkflows = new Map<string, WorkflowMetering>()
  for (const entry of previous.byWorkflow || []) {
    mergedWorkflows.set(entry.workflowId, { ...entry })
  }
  for (const entry of next.byWorkflow || []) {
    const existing = mergedWorkflows.get(entry.workflowId)
    if (!existing) {
      mergedWorkflows.set(entry.workflowId, { ...entry })
      continue
    }
    mergedWorkflows.set(entry.workflowId, {
      ...existing,
      workflowName: entry.workflowName || existing.workflowName,
      totalRuns: Math.max(existing.totalRuns || 0, entry.totalRuns || 0),
      totalTokens: Math.max(existing.totalTokens || 0, entry.totalTokens || 0),
      estimatedCostUsd: Math.max(existing.estimatedCostUsd || 0, entry.estimatedCostUsd || 0),
      avgDurationMs: Math.max(existing.avgDurationMs || 0, entry.avgDurationMs || 0),
      lastRun: [existing.lastRun, entry.lastRun].filter(Boolean).sort().slice(-1)[0] || '',
    })
  }

  const dailyCost = Array.from(mergedDailyCost.values()).sort((a, b) => a.date.localeCompare(b.date))
  const byAgent = Array.from(mergedAgents.values()).sort((a, b) => (b.estimatedCostUsd || 0) - (a.estimatedCostUsd || 0))
  const byWorkflow = Array.from(mergedWorkflows.values()).sort((a, b) => (b.estimatedCostUsd || 0) - (a.estimatedCostUsd || 0))

  return {
    totalTraces: Math.max(previous.totalTraces || 0, next.totalTraces || 0),
    totalInputTokens: Math.max(previous.totalInputTokens || 0, next.totalInputTokens || 0),
    totalOutputTokens: Math.max(previous.totalOutputTokens || 0, next.totalOutputTokens || 0),
    totalTokens: Math.max(previous.totalTokens || 0, next.totalTokens || 0),
    estimatedCostUsd: Math.max(previous.estimatedCostUsd || 0, next.estimatedCostUsd || 0),
    dailyCost,
    costSummary: summarizeCostWindows(dailyCost),
    byAgent,
    byWorkflow,
    period: next.period || previous.period || 'all',
  }
}

function isLocalDashboardInstanceId(value: string): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '::1'
      || hostname.endsWith('.local')
  } catch {
    return false
  }
}

const METERING_FETCH_ERROR_LOG_WINDOW_MS = 60_000
let meteringFetchFailureState: {
  message: string
  loggedAt: number
  suppressedCount: number
} | null = null

function clearMeteringFetchFailureState() {
  meteringFetchFailureState = null
}

export function recordMeteringFetchFailure(message: string, now: number = Date.now()): string | null {
  const previous = meteringFetchFailureState
  if (!previous) {
    meteringFetchFailureState = { message, loggedAt: now, suppressedCount: 0 }
    return message
  }

  if (previous.message !== message || now - previous.loggedAt >= METERING_FETCH_ERROR_LOG_WINDOW_MS) {
    const suffix = previous.suppressedCount > 0 && previous.message === message
      ? ` (suppressed ${previous.suppressedCount} similar failures)`
      : ''
    meteringFetchFailureState = { message, loggedAt: now, suppressedCount: 0 }
    return `${message}${suffix}`
  }

  previous.suppressedCount += 1
  return null
}

export function resetMeteringFetchFailureStateForTests() {
  clearMeteringFetchFailureState()
  meteringCache.clear()
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
          clearMeteringFetchFailureState()
          resolve(parsed.content || [])
        } catch {
          clearMeteringFetchFailureState()
          resolve([])
        }
      })
    })
    req.on('error', (err) => {
      const message = recordMeteringFetchFailure(err.message)
      if (message) {
        console.warn('[Metering] Failed to fetch traces:', message)
      }
      resolve([])
    })
    req.end()
  })
}

export function traceMatchesViewer(trace: TraceData, viewer?: MeteringViewer): boolean {
  if (
    !viewer?.userId &&
    !viewer?.login &&
    !viewer?.email &&
    !viewer?.dashboardInstanceId &&
    !viewer?.instanceKey &&
    !viewer?.machineId &&
    !viewer?.machineName
  ) return true
  const meta = trace.metadata || {}
  const traceInstanceKey = String(meta.instance_key || '').trim().toLowerCase()
  const viewerInstanceKey = String(viewer.instanceKey || '').trim().toLowerCase()
  if (viewerInstanceKey && traceInstanceKey && traceInstanceKey !== viewerInstanceKey) {
    return false
  }
  const traceMachineId = String(meta.machine_id || '').trim().toLowerCase()
  const viewerMachineId = String(viewer.machineId || '').trim().toLowerCase()
  if (viewerMachineId && traceMachineId && traceMachineId !== viewerMachineId) {
    return false
  }
  const traceMachineName = String(meta.machine_name || '').trim().toLowerCase()
  const viewerMachineName = String(viewer.machineName || '').trim().toLowerCase()
  if (!viewerInstanceKey && !viewerMachineId && viewerMachineName && traceMachineName && traceMachineName !== viewerMachineName) {
    return false
  }
  const traceDashboardInstanceId = String(meta.dashboard_instance_id || '').trim().toLowerCase()
  const viewerDashboardInstanceId = String(viewer.dashboardInstanceId || '').trim().toLowerCase()
  if (viewerDashboardInstanceId && traceDashboardInstanceId && traceDashboardInstanceId !== viewerDashboardInstanceId) {
    const bothLocalDashboards = isLocalDashboardInstanceId(viewerDashboardInstanceId) && isLocalDashboardInstanceId(traceDashboardInstanceId)
    if (!bothLocalDashboards) {
      return false
    }
  }
  if (viewer.userId && meta.user_id && String(meta.user_id) === String(viewer.userId)) return true
  if (viewer.login && meta.user_login && String(meta.user_login).toLowerCase() === String(viewer.login).toLowerCase()) return true
  if (viewer.email && meta.user_email && String(meta.user_email).toLowerCase() === String(viewer.email).toLowerCase()) return true
  if (viewer.userId || viewer.login || viewer.email) return false
  return true
}

export async function getWorkspaceMetering(workspaceId?: string, viewer?: MeteringViewer): Promise<WorkspaceMetering> {
  const cacheKey = getMeteringCacheKey(workspaceId, viewer)
  const cached = meteringCache.get(cacheKey)
  const now = Date.now()

  const fetchFresh = async (): Promise<WorkspaceMetering> => {
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
    const fresh = {
      ...aggregateWorkspaceMeteringFromTraces(traces),
      period: 'all',
    }
    const previous = meteringCache.get(cacheKey)?.data
    const merged = previous ? mergeWorkspaceMetering(previous, fresh) : fresh
    meteringCache.set(cacheKey, {
      data: merged,
      fetchedAt: Date.now(),
    })
    return merged
  }

  if (cached?.data) {
    if (!cached.refreshPromise && now - cached.fetchedAt >= METERING_CACHE_TTL_MS) {
      cached.refreshPromise = fetchFresh()
        .catch(() => cached.data)
        .finally(() => {
          const latest = meteringCache.get(cacheKey)
          if (latest) delete latest.refreshPromise
        })
    }
    return cached.data
  }

  return fetchFresh()
}
