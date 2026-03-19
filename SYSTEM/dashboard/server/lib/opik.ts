/**
 * Opik tracing for ClawMax agent interactions.
 * Uses Opik REST API (not OTLP) for trace logging.
 * Tracks token usage, costs, and latency per agent and workflow.
 */

import https from 'https'

let apiKey = ''
let workspace = ''
let projectName = ''
let enabled = false

// Estimated cost per 1K tokens (USD)
const COST_PER_1K: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(COST_PER_1K).find(k => model.includes(k)) || ''
  const rates = COST_PER_1K[key]
  if (!rates) return 0
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output
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
  apiKey = (process.env.OPIK_API_KEY || '').replace(/"/g, '')
  workspace = (process.env.OPIK_WORKSPACE || 'default').replace(/"/g, '')
  projectName = (process.env.OPIK_PROJECT_NAME || 'clawmax').replace(/"/g, '')

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
    sessionId?: string
  }
): void {
  if (!enabled) return

  const now = new Date().toISOString()
  const startTime = meta.durationMs
    ? new Date(Date.now() - meta.durationMs).toISOString()
    : now

  const cost = estimateCost(
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
      model: meta.model || 'unknown',
      provider: meta.provider || 'unknown',
      tokens_input: meta.inputTokens || 0,
      tokens_output: meta.outputTokens || 0,
      tokens_cache_read: meta.cacheReadTokens || 0,
      tokens_total: (meta.inputTokens || 0) + (meta.outputTokens || 0),
      duration_ms: meta.durationMs || 0,
      estimated_cost_usd: Math.round(cost * 10000) / 10000,
      session_id: meta.sessionId || '',
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
  }
): void {
  if (!enabled) return

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
