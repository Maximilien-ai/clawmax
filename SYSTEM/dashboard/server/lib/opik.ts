/**
 * Opik/OpenTelemetry integration for ClawMax agent tracing.
 * Tracks token usage, costs, and latency per agent and workflow execution.
 *
 * Uses OTLP HTTP exporter to send traces to Opik (Comet) platform,
 * following the same pattern as weave-cli.
 */

import { trace, SpanStatusCode, Span, Tracer } from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { resourceFromAttributes } from '@opentelemetry/resources'

let provider: NodeTracerProvider | null = null
let tracer: Tracer | null = null
let enabled = false

// Estimated cost per 1K tokens (USD) — rough averages
const COST_PER_1K: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6': { input: 0.015, output: 0.075 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Normalize model name
  const key = Object.keys(COST_PER_1K).find(k => model.includes(k)) || ''
  const rates = COST_PER_1K[key]
  if (!rates) return 0
  return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output
}

export function initOpikTracing(): boolean {
  const apiKey = process.env.OPIK_API_KEY
  const workspace = process.env.OPIK_WORKSPACE || 'default'
  const projectName = process.env.OPIK_PROJECT_NAME || 'clawmax'

  if (!apiKey) {
    console.log('[Opik] No OPIK_API_KEY — tracing disabled')
    return false
  }

  try {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      'https://www.comet.com/opik/api/v1/private/otel/v1/traces'

    const exporter = new OTLPTraceExporter({
      url: endpoint,
      headers: {
        'Authorization': apiKey,
        'Comet-Workspace': workspace,
        'projectName': projectName,
      },
    })

    provider = new NodeTracerProvider({
      resource: resourceFromAttributes({
        'service.name': 'clawmax',
        'service.version': '1.1.3',
      }),
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    })

    provider.register()
    tracer = trace.getTracer('clawmax', '1.1.3')
    enabled = true

    console.log(`[Opik] Tracing enabled — workspace: ${workspace}, project: ${projectName}`)
    return true
  } catch (err) {
    console.error('[Opik] Failed to initialize:', err)
    return false
  }
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
  if (!tracer || !enabled) return

  const span = tracer.startSpan('agent.chat', {
    attributes: {
      'agent.id': agentId,
      'agent.model': meta.model || 'unknown',
      'agent.provider': meta.provider || 'unknown',
      'chat.message': message.slice(0, 500),
      'chat.response': response.slice(0, 500),
      'chat.session_id': meta.sessionId || '',
      'tokens.input': meta.inputTokens || 0,
      'tokens.output': meta.outputTokens || 0,
      'tokens.cache_read': meta.cacheReadTokens || 0,
      'tokens.total': (meta.inputTokens || 0) + (meta.outputTokens || 0),
      'duration_ms': meta.durationMs || 0,
      'cost.estimated_usd': estimateCost(
        meta.model || '',
        meta.inputTokens || 0,
        meta.outputTokens || 0
      ),
    },
  })
  span.setStatus({ code: SpanStatusCode.OK })
  span.end()
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
  if (!tracer || !enabled) return

  const totalInputTokens = participants.reduce((s, p) => s + (p.inputTokens || 0), 0)
  const totalOutputTokens = participants.reduce((s, p) => s + (p.outputTokens || 0), 0)

  const span = tracer.startSpan('workflow.execution', {
    attributes: {
      'workflow.id': workflowId,
      'workflow.name': workflowName,
      'workflow.trigger_type': meta.triggerType,
      'workflow.status': meta.status,
      'workflow.participant_count': participants.length,
      'workflow.success_count': participants.filter(p => p.status === 'completed').length,
      'workflow.failure_count': participants.filter(p => p.status === 'failed').length,
      'tokens.input': totalInputTokens,
      'tokens.output': totalOutputTokens,
      'tokens.total': totalInputTokens + totalOutputTokens,
      'duration_ms': meta.totalDurationMs,
    },
  })

  // Add per-participant child spans
  for (const p of participants) {
    const childSpan = tracer.startSpan(`agent.${p.agentId}`, {
      attributes: {
        'agent.id': p.agentId,
        'agent.status': p.status,
        'agent.model': p.model || 'unknown',
        'tokens.input': p.inputTokens || 0,
        'tokens.output': p.outputTokens || 0,
        'duration_ms': p.durationMs || 0,
        'cost.estimated_usd': estimateCost(
          p.model || '',
          p.inputTokens || 0,
          p.outputTokens || 0
        ),
      },
    })
    childSpan.setStatus({
      code: p.status === 'completed' ? SpanStatusCode.OK : SpanStatusCode.ERROR,
    })
    childSpan.end()
  }

  span.setStatus({
    code: meta.status === 'completed' ? SpanStatusCode.OK : SpanStatusCode.ERROR,
  })
  span.end()
}

/**
 * Shutdown tracing (flush pending spans)
 */
export async function shutdownOpik(): Promise<void> {
  if (provider) {
    await provider.shutdown()
    console.log('[Opik] Tracing shutdown')
  }
}
