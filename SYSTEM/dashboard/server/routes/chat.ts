import { Router } from 'express'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { getAgentGatewayConfig, invalidateAgentStatusCache } from '../lib/workspace'
import { traceAgentChat } from '../lib/opik'
import { userExecutionEnv } from '../lib/safe-env'
import { checkBudgetBlock } from '../lib/budget'
import { resolveAgentExecutionConfig, withTemporaryAgentAuthProfiles } from '../lib/agent-execution'

const router = Router()

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
    byok?: { openai?: string; anthropic?: string; nebius?: string }
  }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }

  // Check workspace budget
  const budgetBlock = checkBudgetBlock()
  if (budgetBlock) {
    return res.status(402).json({ error: budgetBlock })
  }

  const executionEnv = userExecutionEnv(byok)
  const resolvedAgent = resolveAgentExecutionConfig(id)

  // Validate API keys exist before starting chat
  if (!executionEnv.ANTHROPIC_API_KEY && !executionEnv.OPENAI_API_KEY && !executionEnv.NEBIUS_API_KEY) {
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

  // Spawn openclaw agent CLI
  const args = ['agent', '--agent', id, '--message', message, '--json']
  if (resolvedAgent.model) {
    args.push('--model', resolvedAgent.model)
  }
  console.log(`[Chat Route] Spawning: openclaw ${args.join(' ')}`)

  let procExited = false
  let proc: ReturnType<typeof spawn> | null = null
  let fullOutput = ''
  let stderrOutput = ''

  withTemporaryAgentAuthProfiles(id, {
    openai: executionEnv.OPENAI_API_KEY,
    anthropic: executionEnv.ANTHROPIC_API_KEY,
    nebius: executionEnv.NEBIUS_API_KEY,
  }, resolvedAgent.provider, async () => {
    const spawned = spawn('openclaw', args, {
      env: executionEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    proc = spawned

    send('start', { sessionId: sessionId || `cli-${Date.now()}` })
    invalidateAgentStatusCache(id)

    spawned.stdout.on('data', (chunk: Buffer) => {
      fullOutput += chunk.toString()
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

    // Try to parse --json output
    let replied = false
    if (fullOutput.trim()) {
      try {
        const result = JSON.parse(fullOutput)
        console.log(`[Chat Route] Parsed JSON for ${id}:`, JSON.stringify(result.result?.payloads || result.payloads || [], null, 2).slice(0, 500))
        const payloads = result.result?.payloads || result.payloads || []
        const text = payloads.map((p: any) => p.text).join('\n') || ''
        if (text) {
          send('delta', { text })
          replied = true

          // Trace to Opik
          const meta = result.result?.meta || result.meta || {}
          const agentMeta = meta.agentMeta || {}
          traceAgentChat(id, message, text, {
            model: agentMeta.model,
            provider: agentMeta.provider,
            inputTokens: agentMeta.usage?.input || agentMeta.promptTokens,
            outputTokens: agentMeta.usage?.output,
            cacheReadTokens: agentMeta.usage?.cacheRead,
            durationMs: meta.durationMs,
            sessionId: sessionId || agentMeta.sessionId,
          })
        } else {
          console.log(`[Chat Route] Empty payloads for ${id}, status: ${result.status}, summary: ${result.summary}`)
        }
      } catch (err) {
        console.log(`[Chat Route] JSON parse error for ${id}:`, err)
        // Not JSON — send as plain text
        const text = fullOutput.trim()
        if (text) {
          send('delta', { text })
          replied = true
        }
      }
    }

    if (!replied && code !== 0) {
      send('error', `Agent failed. Check that API keys are configured.`)
    }
    send('complete', {})
    if (!res.writableEnded) {
      res.end()
    }
  })

    spawned.on('error', (err) => {
    console.error(`[Chat Route] CLI spawn error for ${id}:`, err)
    clearInterval(keepalive)
    send('error', `Failed to start agent: ${err.message}`)
    if (!res.writableEnded) {
      res.end()
    }
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
