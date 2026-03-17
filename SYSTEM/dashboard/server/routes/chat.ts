import { Router } from 'express'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { getAgentGatewayConfig, invalidateAgentStatusCache } from '../lib/workspace'

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
  const { message, sessionId } = req.body as { message?: string; sessionId?: string }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
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
  console.log(`[Chat Route] Spawning: openclaw ${args.join(' ')}`)

  const proc = spawn('openclaw', args, {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  })

  send('start', { sessionId: sessionId || `cli-${Date.now()}` })
  invalidateAgentStatusCache(id)

  let fullOutput = ''
  let stderrOutput = ''

  proc.stdout.on('data', (chunk: Buffer) => {
    fullOutput += chunk.toString()
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    stderrOutput += chunk.toString()
  })

  proc.on('close', (code) => {
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

  proc.on('error', (err) => {
    console.error(`[Chat Route] CLI spawn error for ${id}:`, err)
    clearInterval(keepalive)
    send('error', `Failed to start agent: ${err.message}`)
    if (!res.writableEnded) {
      res.end()
    }
  })

  const timeout = setTimeout(() => {
    clearInterval(keepalive)
    proc.kill()
    send('error', 'Agent timeout (2 minutes)')
    if (!res.writableEnded) {
      res.end()
    }
  }, 120000)

  // Handle client disconnect — only kill if process hasn't exited yet
  let procExited = false
  proc.on('exit', () => { procExited = true })

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
          proc.kill()
        }
      }, 30000) // 30s grace period
    }
  })
})

export default router
