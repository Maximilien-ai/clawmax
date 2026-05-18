/**
 * Opik tracing for ClawMax agent interactions.
 * Uses Opik REST API (not OTLP) for trace logging.
 * Tracks token usage, costs, and latency per agent and workflow.
 */

import https from 'https'
import path from 'path'
import { getWorkspaceManager } from './workspace-manager'
import { estimateModelCostUsd } from './model-pricing'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'

let apiKey = ''
let workspace = ''
let projectName = ''
let enabled = false

export interface OpikRuntimeConfig {
  apiKey: string
  workspace: string
  projectName: string
}

export interface RuntimeInstanceIdentity {
  instanceKey: string
  machineId: string
  machineName: string
}

function normalizeDashboardInstanceId(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase()
}

function normalizeRuntimeIdentityValue(value: string | undefined | null): string {
  return String(value || '').trim()
}

export function getConfiguredDashboardInstanceId(): string {
  const configured = (process.env.DASHBOARD_PUBLIC_URL || '').trim()
  if (!configured) return ''
  return normalizeDashboardInstanceId(configured)
}

export function getRequestDashboardInstanceId(req?: {
  protocol?: string
  headers?: Record<string, string | string[] | undefined>
} | null): string {
  if (!req) return getConfiguredDashboardInstanceId()
  const forwardedProto = req.headers?.['x-forwarded-proto']
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto || req.protocol || 'https'
  const forwardedHost = req.headers?.['x-forwarded-host']
  const host = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers?.host || ''
  if (!host) return getConfiguredDashboardInstanceId()
  return normalizeDashboardInstanceId(`${proto}://${host}`)
}

export function getRuntimeInstanceIdentity(): RuntimeInstanceIdentity {
  return {
    instanceKey: normalizeRuntimeIdentityValue(process.env.CLAWMAX_INSTANCE_KEY),
    machineId: normalizeRuntimeIdentityValue(process.env.CLAWMAX_MACHINE_ID),
    machineName: normalizeRuntimeIdentityValue(process.env.CLAWMAX_MACHINE_NAME),
  }
}

function getWorkspaceId(): string {
  try {
    return getWorkspaceManager().getActiveWorkspaceId()
  } catch {
    try {
      const wsPath = process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME || '', '.openclaw', 'workspace')
      return path.basename(wsPath)
    } catch {
      return 'default'
    }
  }
}

export function resolveOpikRuntimeConfig(): OpikRuntimeConfig {
  const integrationConfig = readWorkspaceIntegrationConfig()
  const envApiKey = (process.env.OPIK_API_KEY || '').replace(/"/g, '')
  const envWorkspace = (process.env.OPIK_WORKSPACE || '').replace(/"/g, '')
  const envProjectName = (process.env.OPIK_PROJECT_NAME || '').replace(/"/g, '')

  return {
    apiKey: envApiKey,
    workspace: envWorkspace || integrationConfig.opikWorkspace || 'default',
    projectName: envProjectName || integrationConfig.opikProject || 'clawmax',
  }
}

/** Generate UUIDv7 (timestamp-based, required by Opik) */
function uuidv7(): string {
  const now = BigInt(Date.now())
  const bytes = new Uint8Array(16)
  // Fill with random
  crypto.getRandomValues(bytes)
  // Timestamp in first 48 bits (6 bytes)
  const ts = now & BigInt('0xFFFFFFFFFFFF')
  bytes[0] = Number((ts >> 40n) & 0xFFn)
  bytes[1] = Number((ts >> 32n) & 0xFFn)
  bytes[2] = Number((ts >> 24n) & 0xFFn)
  bytes[3] = Number((ts >> 16n) & 0xFFn)
  bytes[4] = Number((ts >> 8n) & 0xFFn)
  bytes[5] = Number(ts & 0xFFn)
  // Version 7
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  // Variant
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

/** Send a single trace to Opik REST API */
function sendTrace(traceData: any): void {
  if (!enabled) return

  const body = JSON.stringify({
    project_name: projectName,
    ...traceData,
  })

  const req = https.request({
    hostname: 'www.comet.com',
    path: '/opik/api/v1/private/traces',
    method: 'POST',
    headers: {
      'Authorization': apiKey,
      'Comet-Workspace': workspace,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, (res) => {
    if (res.statusCode && res.statusCode >= 400) {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        console.error(`[Opik] Trace failed (${res.statusCode}):`, data.slice(0, 200))
      })
    }
    // Drain response
    res.on('data', () => {})
  })

  req.on('error', (err) => {
    console.error('[Opik] Request error:', err.message)
  })

  req.write(body)
  req.end()
}

export function initOpikTracing(): boolean {
  const resolved = resolveOpikRuntimeConfig()
  apiKey = resolved.apiKey
  workspace = resolved.workspace
  projectName = resolved.projectName

  if (!apiKey) {
    console.log('[Opik] No OPIK_API_KEY — tracing disabled')
    return false
  }

  enabled = true
  console.log(`[Opik] Tracing enabled — workspace: ${workspace}, project: ${projectName}`)
  return true
}

export function isOpikEnabled(): boolean {
  return enabled
}

/**
 * Trace an agent chat interaction
 */
export function traceAgentChat(
  agentId: string,
  message: string,
  response: string,
  meta: {
    model?: string
    provider?: string
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    durationMs?: number
    estimatedCostUsd?: number
    sessionId?: string
    workflowId?: string
    workflowName?: string
    actorUserId?: string
    actorLogin?: string
    actorEmail?: string | null
    dashboardInstanceId?: string
  }
): void {
  if (!enabled) return
  const runtimeIdentity = getRuntimeInstanceIdentity()

  const now = new Date().toISOString()
  const startTime = meta.durationMs
    ? new Date(Date.now() - meta.durationMs).toISOString()
    : now

  const cost = typeof meta.estimatedCostUsd === 'number'
    ? meta.estimatedCostUsd
    : estimateModelCostUsd(
      meta.model || '',
      meta.inputTokens || 0,
      meta.outputTokens || 0
    )

  sendTrace({
    id: uuidv7(),
    name: `agent.chat.${agentId}`,
    start_time: startTime,
    end_time: now,
    input: { message: message.slice(0, 1000) },
    output: { response: response.slice(0, 1000) },
    metadata: {
      agent_id: agentId,
      workspace_id: getWorkspaceId(),
      user_id: meta.actorUserId || (meta.sessionId ? 'session' : 'system'),
      user_login: meta.actorLogin || '',
      user_email: meta.actorEmail || '',
      dashboard_instance_id: meta.dashboardInstanceId || getConfiguredDashboardInstanceId(),
      instance_key: runtimeIdentity.instanceKey,
      machine_id: runtimeIdentity.machineId,
      machine_name: runtimeIdentity.machineName,
      model: meta.model || 'unknown',
      provider: meta.provider || 'unknown',
      tokens_input: meta.inputTokens || 0,
      tokens_output: meta.outputTokens || 0,
      tokens_cache_read: meta.cacheReadTokens || 0,
      tokens_total: (meta.inputTokens || 0) + (meta.outputTokens || 0),
      duration_ms: meta.durationMs || 0,
      estimated_cost_usd: Math.round(cost * 10000) / 10000,
      session_id: meta.sessionId || '',
      workflow_id: meta.workflowId || '',
      workflow_name: meta.workflowName || '',
    },
  })
}

/**
 * Trace a workflow execution
 */
export function traceWorkflowExecution(
  workflowId: string,
  workflowName: string,
  participants: Array<{
    agentId: string
    status: string
    durationMs?: number
    model?: string
    inputTokens?: number
    outputTokens?: number
  }>,
  meta: {
    triggerType: string
    totalDurationMs: number
    status: string
    actorUserId?: string
    actorLogin?: string
    actorEmail?: string | null
    dashboardInstanceId?: string
  }
): void {
  if (!enabled) return
  const runtimeIdentity = getRuntimeInstanceIdentity()

  const now = new Date().toISOString()
  const startTime = new Date(Date.now() - meta.totalDurationMs).toISOString()

  const totalInput = participants.reduce((s, p) => s + (p.inputTokens || 0), 0)
  const totalOutput = participants.reduce((s, p) => s + (p.outputTokens || 0), 0)

  sendTrace({
    id: uuidv7(),
    name: `workflow.${workflowId}`,
    start_time: startTime,
    end_time: now,
    input: { workflow: workflowName, trigger: meta.triggerType },
    output: {
      status: meta.status,
      participants: participants.length,
      succeeded: participants.filter(p => p.status === 'completed').length,
    },
    metadata: {
      workflow_id: workflowId,
      workflow_name: workflowName,
      workspace_id: getWorkspaceId(),
      user_id: meta.actorUserId || 'system',
      user_login: meta.actorLogin || '',
      user_email: meta.actorEmail || '',
      dashboard_instance_id: meta.dashboardInstanceId || getConfiguredDashboardInstanceId(),
      instance_key: runtimeIdentity.instanceKey,
      machine_id: runtimeIdentity.machineId,
      machine_name: runtimeIdentity.machineName,
      trigger_type: meta.triggerType,
      participant_count: participants.length,
      tokens_input: totalInput,
      tokens_output: totalOutput,
      tokens_total: totalInput + totalOutput,
      duration_ms: meta.totalDurationMs,
    },
  })
}

export async function shutdownOpik(): Promise<void> {
  // No-op for REST API (no buffering)
  console.log('[Opik] Shutdown')
}
