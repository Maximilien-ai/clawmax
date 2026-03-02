import { Router } from 'express'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { getAgentGatewayConfig } from '../lib/workspace'

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

  // Check if gateway is actually running by attempting a quick connection
  const ws = new WebSocket(`ws://127.0.0.1:${gatewayConfig.port}`)
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
 * SSE proxy that opens a WebSocket to the agent gateway,
 * sends a chat.send RPC call, and relays delta events back as SSE
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

  const gatewayConfig = getAgentGatewayConfig(id)

  if (!gatewayConfig) {
    return res.status(503).json({ error: 'Gateway not configured for this agent' })
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  res.flushHeaders()

  const send = (type: string, data: any) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
  }

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 2000)

  const cleanup = () => clearInterval(keepalive)

  // Open WebSocket connection to gateway
  const ws = new WebSocket(`ws://127.0.0.1:${gatewayConfig.port}/rpc`)
  const requestId = randomUUID()
  let authenticated = false

  const timeout = setTimeout(() => {
    cleanup()
    send('error', 'Gateway timeout')
    ws.close()
    res.end()
  }, 120000) // 2 minute timeout

  ws.on('open', () => {
    // Send auth message
    const authMessage = {
      jsonrpc: '2.0' as const,
      id: randomUUID(),
      method: 'auth',
      params: { token: gatewayConfig.token }
    }
    ws.send(JSON.stringify(authMessage))
  })

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString())

      // Handle auth response
      if (message.id && message.result?.authenticated) {
        authenticated = true
        // Send chat.send RPC call
        const chatRequest = {
          jsonrpc: '2.0' as const,
          id: requestId,
          method: 'chat.send',
          params: {
            message: req.body.message,
            sessionId: sessionId || `dashboard-chat-${id}-${Date.now()}`
          }
        }
        ws.send(JSON.stringify(chatRequest))
        return
      }

      // Handle RPC response
      if (message.id === requestId) {
        if (message.error) {
          clearTimeout(timeout)
          cleanup()
          send('error', message.error.message || 'Chat error')
          ws.close()
          res.end()
        } else if (message.result) {
          // Chat request accepted
          send('start', { sessionId: message.result.sessionId })
        }
        return
      }

      // Handle delta events (from chat.send streaming)
      if (message.method === 'chat.delta') {
        const delta = message.params
        send('delta', delta)
        return
      }

      // Handle completion event
      if (message.method === 'chat.complete') {
        clearTimeout(timeout)
        cleanup()
        send('complete', message.params)
        ws.close()
        res.end()
        return
      }

      // Handle other events
      if (message.method) {
        send('event', { method: message.method, params: message.params })
      }

    } catch (err) {
      console.error('Error parsing gateway message:', err)
    }
  })

  ws.on('error', (err) => {
    console.error(`[Chat Route] WebSocket error for agent ${id}:`, err)
    clearTimeout(timeout)
    cleanup()
    send('error', `WebSocket error: ${err.message}`)
    res.end()
  })

  ws.on('close', (code, reason) => {
    console.log(`[Chat Route] WebSocket closed for agent ${id}: code=${code}, reason=${reason.toString()}`)
    clearTimeout(timeout)
    cleanup()
    if (!authenticated) {
      send('error', 'Connection closed before authentication')
    }
    res.end()
  })

  // Handle client disconnect
  req.on('close', () => {
    clearTimeout(timeout)
    cleanup()
    ws.close()
  })
})

export default router
