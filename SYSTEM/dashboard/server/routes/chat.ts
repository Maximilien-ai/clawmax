import { Router } from 'express'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { getAgentGatewayConfig, invalidateAgentStatusCache } from '../lib/workspace'
import { isGatewayConfigured } from '../lib/gateway-rpc'
import { traceAgentChat } from '../lib/opik'
import { userExecutionEnv } from '../lib/safe-env'
import { checkBudgetBlock } from '../lib/budget'
import { normalizeChatMessage } from '../lib/chat-normalization'
import { resolveAgentExecutionConfig, withTemporaryAgentAuthProfiles } from '../lib/agent-execution'

const router = Router()

/** Extract JSON object from a string that may contain non-JSON prefixed lines (e.g. stderr warnings) */
function extractJson(text: string): string {
  // Find first { and last } to extract JSON from mixed output
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1)
  }
  return ''
}

/**
 * GET /api/agents/:id/gateway
 * Returns gateway connection info (port, token, availability)
 */
router.get('/:id/gateway', (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const gatewayConfig = getAgentGatewayConfig(id)

  if (!gatewayConfig) {
    return res.status(404).json({
      error: 'Gateway not configured for this agent',
      available: false
    })
  }

  // Check if gateway is actually running by attempting a quick connection (no /rpc path)
  const ws = new WebSocket(`ws://127.0.0.1:${gatewayConfig.port}`, {
    headers: {
      'Origin': `http://localhost:${gatewayConfig.port}`
    }
  })
  const timeout = setTimeout(() => {
    ws.close()
    res.json({
      port: gatewayConfig.port,
      hasToken: !!gatewayConfig.token,
      available: false
    })
  }, 2000)

  ws.on('open', () => {
    clearTimeout(timeout)
    ws.close()
    res.json({
      port: gatewayConfig.port,
      hasToken: !!gatewayConfig.token,
      available: true
    })
  })

  ws.on('error', () => {
    clearTimeout(timeout)
    res.json({
      port: gatewayConfig.port,
      hasToken: !!gatewayConfig.token,
      available: false
    })
  })
})

/**
 * POST /api/agents/:id/chat
 * SSE proxy that spawns `openclaw agent` CLI to handle chat.
 * The CLI handles gateway auth, device identity, and agent routing.
 */
router.post('/:id/chat', (req, res) => {
  const { id } = req.params
  const { message, sessionId, byok } = req.body as {
    message?: string
    sessionId?: string
    byok?: { openai?: string; anthropic?: string }
  }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }

  // Check workspace budget
  const budgetBlock = checkBudgetBlock({ operation: 'agent' })
  if (budgetBlock) {
    return res.status(402).json({ error: budgetBlock })
  }

  const executionEnv = userExecutionEnv(byok)
  const resolvedAgent = resolveAgentExecutionConfig(id)
  const effectiveSessionId = sessionId || `dashboard-${id}-chat`

  // Validate API keys exist before starting chat
  if (!executionEnv.ANTHROPIC_API_KEY && !executionEnv.OPENAI_API_KEY) {
    return res.status(400).json({
      error: 'No execution API keys configured. Add USER_* defaults in SYSTEM/dashboard/.env or configure BYOK preview keys.'
    })
  }

  console.log(`[Chat Route] Starting CLI chat for agent ${id}`)

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  res.flushHeaders()

  const send = (type: string, data: any) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
    }
  }

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 2000)

  // Use plain-text mode so stdout can stream deltas to the UI in real time.
  // History/persistence is handled by the explicit session id and the CLI itself.
  const useLocal = !isGatewayConfigured()
  const args = ['agent', '--agent', id, '--session-id', effectiveSessionId, '--message', message, ...(useLocal ? ['--local'] : [])]
  console.log(`[Chat Route] Spawning: openclaw ${args.join(' ')}`)

  let procExited = false
  let proc: ReturnType<typeof spawn> | null = null
  let fullOutput = ''
  let stderrOutput = ''

  withTemporaryAgentAuthProfiles(id, {
    openai: executionEnv.OPENAI_API_KEY,
    anthropic: executionEnv.ANTHROPIC_API_KEY,
  }, resolvedAgent.model, resolvedAgent.provider, async () => {
    await new Promise<void>((resolve) => {
      const spawned = spawn('openclaw', args, {
        env: executionEnv,
        stdio: ['pipe', 'pipe', 'pipe']
      })
      proc = spawned

      send('start', { sessionId: effectiveSessionId })
      invalidateAgentStatusCache(id)

      spawned.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        fullOutput += text
        send('delta', { text })
      })

      spawned.stderr.on('data', (chunk: Buffer) => {
        stderrOutput += chunk.toString()
      })

      spawned.on('exit', () => { procExited = true })

      spawned.on('close', (code) => {
        console.log(`[Chat Route] CLI exited for agent ${id} with code ${code}`)
        clearInterval(keepalive)

        if (stderrOutput) {
          console.error(`[Chat Route] stderr for ${id}:`, stderrOutput.slice(0, 500))
        }

        const normalizedText = normalizeChatMessage(fullOutput.trim())

        if (normalizedText) {
          traceAgentChat(id, message, normalizedText, {
            model: resolvedAgent.model,
            provider: resolvedAgent.provider || undefined,
            sessionId: effectiveSessionId,
          })
        }

        if (!normalizedText && code !== 0) {
          send('error', stderrOutput.slice(0, 300) || 'Agent failed. Check that API keys are configured.')
        }
        send('complete', {})
        if (!res.writableEnded) {
          res.end()
        }
        resolve()
      })

      spawned.on('error', (err) => {
        console.error(`[Chat Route] CLI spawn error for ${id}:`, err)
        clearInterval(keepalive)
        send('error', `Failed to start agent: ${err.message}`)
        if (!res.writableEnded) {
          res.end()
        }
        resolve()
      })
    })
  }).catch((err) => {
    console.error(`[Chat Route] Auth profile prep error for ${id}:`, err)
    clearInterval(keepalive)
    send('error', `Failed to prepare agent execution: ${err.message}`)
    if (!res.writableEnded) {
      res.end()
    }
  })

  const timeout = setTimeout(() => {
    clearInterval(keepalive)
    proc?.kill()
    send('error', 'Agent timeout (3 minutes)')
    if (!res.writableEnded) {
      res.end()
    }
  }, 180000) // 3 minutes to handle cold starts

  // Handle client disconnect — only kill if process hasn't exited yet
  req.on('close', () => {
    console.log(`[Chat Route] Client disconnected for agent ${id}, procExited=${procExited}`)
    clearTimeout(timeout)
    clearInterval(keepalive)
    // Don't kill process immediately — let it finish if it's close to done
    // Only kill after a grace period
    if (!procExited) {
      setTimeout(() => {
        if (!procExited) {
          console.log(`[Chat Route] Killing agent process for ${id} after grace period`)
          proc?.kill()
        }
      }, 30000) // 30s grace period
    }
  })
})

export default router
