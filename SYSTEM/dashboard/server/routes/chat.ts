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

  console.log(`[Chat Route] Starting chat for agent ${id}, gateway port: ${gatewayConfig.port}`)

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

  const cleanup = () => {
    clearInterval(keepalive)
    if (completionCheckInterval) clearInterval(completionCheckInterval)
  }

  console.log(`[Chat Route] Creating WebSocket connection to ws://127.0.0.1:${gatewayConfig.port}`)

  // Open WebSocket connection to gateway (no /rpc path, just port)
  const ws = new WebSocket(`ws://127.0.0.1:${gatewayConfig.port}`, {
    headers: {
      'Origin': `http://localhost:${gatewayConfig.port}`
    }
  })

  console.log(`[Chat Route] WebSocket created for agent ${id}, initial state: ${ws.readyState}`)
  const requestId = randomUUID()
  let authenticated = false
  let connectNonce: string | null = null
  let connectSent = false

  const timeout = setTimeout(() => {
    cleanup()
    send('error', 'Gateway timeout')
    ws.close()
    if (!res.writableEnded) {
      res.end()
    }
  }, 120000) // 2 minute timeout

  let lastDeltaTime = Date.now()
  let completionCheckInterval: NodeJS.Timeout | null = null

  const sendConnect = () => {
    if (connectSent) return
    connectSent = true

    console.log(`[Chat Route] Sending connect for agent ${id}`)
    // Send connect request (simplified - no device auth for now, just token)
    const connectMessage = {
      type: 'req',
      id: randomUUID(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-control-ui',  // Use Control UI client ID for scope permissions
          displayName: 'Dashboard Chat',
          version: '1.0.0',
          platform: process.platform,
          mode: 'ui'  // UI mode for Control UI client
        },
        caps: [],
        auth: { token: gatewayConfig.token },
        role: 'operator',
        scopes: ['operator.admin', 'operator.write', 'operator.read']
      }
    }
    console.log(`[Chat Route] Connect message scopes:`, connectMessage.params.scopes)
    ws.send(JSON.stringify(connectMessage))
  }

  ws.on('open', () => {
    console.log(`[Chat Route] WebSocket opened for agent ${id}`)
    // Wait for connect.challenge event before sending connect
  })

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString())
      console.log(`[Chat Route] Received message for agent ${id}:`, message.event || message.type)

      // Handle connect.challenge event
      if (message.event === 'connect.challenge') {
        const nonce = message.payload?.nonce
        if (nonce) {
          connectNonce = nonce
          sendConnect()
        }
        return
      }

      // Handle connect response (type: 'res', method: 'connect')
      if (message.type === 'res' && !authenticated) {
        if (message.ok) {
          authenticated = true
          // Send chat.send request
          const chatRequest = {
            type: 'req',
            id: requestId,
            method: 'chat.send',
            params: {
              message: req.body.message,
              sessionKey: sessionId || `dashboard-chat-${id}`,
              idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`
            }
          }
          ws.send(JSON.stringify(chatRequest))
        } else {
          clearTimeout(timeout)
          cleanup()
          send('error', message.error?.message || 'Authentication failed')
          ws.close()
          if (!res.writableEnded) {
            res.end()
          }
        }
        return
      }

      // Handle chat.send response
      if (message.type === 'res' && message.id === requestId) {
        if (message.error) {
          clearTimeout(timeout)
          cleanup()
          send('error', message.error.message || 'Chat error')
          ws.close()
          if (!res.writableEnded) {
            res.end()
          }
        } else if (message.payload) {
          // Chat request accepted
          send('start', { sessionId: message.payload.sessionId })
        }
        return
      }

      // Handle event frames (chat deltas, completion, etc.)
      if (message.event) {
        // Handle agent assistant stream (chat deltas)
        if (message.event === 'agent' && message.payload?.stream === 'assistant') {
          const delta = message.payload?.data?.delta

          if (delta) {
            send('delta', { text: delta })
            lastDeltaTime = Date.now()

            // Start completion check interval after first delta
            if (!completionCheckInterval) {
              completionCheckInterval = setInterval(() => {
                const timeSinceLastDelta = Date.now() - lastDeltaTime
                // If no delta for 2 seconds, consider response complete
                if (timeSinceLastDelta > 2000) {
                  console.log(`[Chat Route] Auto-completing for agent ${id} after ${timeSinceLastDelta}ms without deltas`)
                  clearTimeout(timeout)
                  if (completionCheckInterval) clearInterval(completionCheckInterval)
                  cleanup()
                  send('complete', {})
                  ws.close()
                  if (!res.writableEnded) {
                    res.end()
                  }
                }
              }, 500) // Check every 500ms
            }
          }
          return
        }

        // Handle agent lifecycle events
        if (message.event === 'agent' && message.payload?.stream === 'lifecycle') {
          const phase = message.payload?.data?.phase
          if (phase === 'complete' || phase === 'error') {
            clearTimeout(timeout)
            cleanup()
            send('complete', { text: message.payload?.data?.text || '' })
            ws.close()
            if (!res.writableEnded) {
              res.end()
            }
          }
          return
        }

        // Handle other events
        send('event', { event: message.event, payload: message.payload })
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
    if (!res.writableEnded) {
      res.end()
    }
  })

  ws.on('close', (code, reason) => {
    console.log(`[Chat Route] WebSocket closed for agent ${id}: code=${code}, reason=${reason.toString()}`)
    clearTimeout(timeout)
    cleanup()
    if (!authenticated) {
      send('error', 'Connection closed before authentication')
    }
    if (!res.writableEnded) {
      res.end()
    }
  })

  // Handle client disconnect
  req.on('close', () => {
    console.log(`[Chat Route] Client disconnected for agent ${id}, WebSocket state: ${ws.readyState}`)
    clearTimeout(timeout)
    cleanup()
    // Only close WebSocket if it's actually open to avoid errors
    if (ws.readyState === WebSocket.OPEN) {
      ws.close()
    }
    // Don't call terminate() on CONNECTING sockets - let them fail naturally
  })
})

export default router
