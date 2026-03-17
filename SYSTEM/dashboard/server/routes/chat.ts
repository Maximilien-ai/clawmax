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

  proc.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    fullOutput += text

    // Try to parse as JSON lines (openclaw --json output)
    const lines = text.split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const event = JSON.parse(line)
        if (event.type === 'delta' || event.event === 'delta') {
          send('delta', { text: event.text || event.data || '' })
        } else if (event.type === 'complete' || event.event === 'complete') {
          send('complete', {})
        } else if (event.type === 'error') {
          send('error', event.message || event.error || 'Agent error')
        }
      } catch {
        // Not JSON — treat as plain text delta
        send('delta', { text: line })
      }
    }
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    console.error(`[Chat Route] stderr for ${id}:`, chunk.toString())
  })

  proc.on('close', (code) => {
    console.log(`[Chat Route] CLI exited for agent ${id} with code ${code}`)
    clearInterval(keepalive)
    if (code !== 0 && !fullOutput) {
      send('error', `Agent process exited with code ${code}`)
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

  // Handle client disconnect
  req.on('close', () => {
    console.log(`[Chat Route] Client disconnected for agent ${id}`)
    clearTimeout(timeout)
    clearInterval(keepalive)
    proc.kill()
  })
})

export default router
