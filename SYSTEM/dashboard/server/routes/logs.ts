import { Router } from 'express'
import WebSocket from 'ws'
import { randomUUID } from 'crypto'
import { getAgentGatewayConfig } from '../lib/workspace'

const router = Router()

/**
 * GET /api/agents/:id/status
 * Returns gateway status (port, uptime, connection info, health)
 */
router.get('/:id/status', async (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const gatewayConfig = getAgentGatewayConfig(id)

  if (!gatewayConfig) {
    return res.status(404).json({
      error: 'Gateway not configured for this agent',
      code: 'gateway_not_configured',
      available: false
    })
  }

  // Connect to gateway and request status
  return new Promise<void>((resolve) => {
    const ws = new WebSocket(gatewayConfig.wsUrl || `ws://127.0.0.1:${gatewayConfig.port}`, {
      headers: {
        'Origin': gatewayConfig.httpUrl || `http://localhost:${gatewayConfig.port}`
      }
    })
    const requestId = randomUUID()
    let authenticated = false
    let connectNonce: string | null = null
    let connectSent = false

    const timeout = setTimeout(() => {
      ws.close()
      res.status(503).json({ error: 'Gateway timed out while reporting status', code: 'gateway_timeout', available: false })
      resolve()
    }, 10000)

    const sendConnect = () => {
      if (connectSent) return
      connectSent = true

      const connectMessage = {
        type: 'req',
        id: randomUUID(),
        method: 'connect',
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: 'openclaw-control-ui',  // Use Control UI client ID for scope permissions
            displayName: 'Dashboard Status',
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
      ws.send(JSON.stringify(connectMessage))
    }

    ws.on('open', () => {
      // Wait for connect.challenge
    })

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())

        // Handle connect.challenge
        if (message.event === 'connect.challenge') {
          const nonce = message.payload?.nonce
          if (nonce) {
            connectNonce = nonce
            sendConnect()
          }
          return
        }

        // Handle connect response
        if (message.type === 'res' && !authenticated) {
          if (message.ok) {
            authenticated = true
            // Send status request
            const statusRequest = {
              type: 'req',
              id: requestId,
              method: 'status',
              params: {}
            }
            ws.send(JSON.stringify(statusRequest))
          } else {
            clearTimeout(timeout)
            ws.close()
            res.status(401).json({ error: 'Gateway authentication failed', code: 'gateway_auth_failed', available: false })
            resolve()
          }
          return
        }

        // Handle status response
        if (message.type === 'res' && message.id === requestId) {
          clearTimeout(timeout)
          ws.close()

          if (message.error) {
            res.status(500).json({ error: message.error.message || 'Gateway status request failed', code: 'gateway_status_error', available: false })
          } else {
            res.json({
              available: true,
              port: gatewayConfig.port,
              status: message.payload
            })
          }
          resolve()
        }
      } catch (err) {
        console.error('Error parsing status message:', err)
      }
    })

    ws.on('error', () => {
      clearTimeout(timeout)
      res.status(503).json({ error: 'Gateway connection failed', code: 'gateway_connection_error', available: false })
      resolve()
    })

    ws.on('close', () => {
      clearTimeout(timeout)
      if (!res.headersSent) {
        res.status(503).json({ error: 'Gateway connection closed before status completed', code: 'gateway_connection_closed', available: false })
      }
      resolve()
    })
  })
})

/**
 * GET /api/agents/:id/logs
 * SSE endpoint for tailing agent logs via Gateway RPC
 */
router.get('/:id/logs', (req, res) => {
  const { id } = req.params
  const lines = parseInt(req.query.lines as string) || 100

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
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
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
    }
  }

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 2000)

  const cleanup = () => clearInterval(keepalive)

  // Open WebSocket connection to gateway
  const ws = new WebSocket(gatewayConfig.wsUrl || `ws://127.0.0.1:${gatewayConfig.port}`, {
    headers: {
      'Origin': gatewayConfig.httpUrl || `http://localhost:${gatewayConfig.port}`
    }
  })
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
  }, 60000)

  const sendConnect = () => {
    if (connectSent) return
    connectSent = true

    const connectMessage = {
      type: 'req',
      id: randomUUID(),
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-control-ui',  // Use Control UI client ID for scope permissions
          displayName: 'Dashboard Logs',
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
    ws.send(JSON.stringify(connectMessage))
  }

  ws.on('open', () => {
    // Wait for connect.challenge
  })

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString())

      // Handle connect.challenge
      if (message.event === 'connect.challenge') {
        const nonce = message.payload?.nonce
        if (nonce) {
          connectNonce = nonce
          sendConnect()
        }
        return
      }

      // Handle connect response
      if (message.type === 'res' && !authenticated) {
        if (message.ok) {
          authenticated = true
          // Send logs.tail request
          const logsRequest = {
            type: 'req',
            id: requestId,
            method: 'logs.tail',
            params: { lines }
          }
          ws.send(JSON.stringify(logsRequest))
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

      // Handle logs.tail response
      if (message.type === 'res' && message.id === requestId) {
        if (message.error) {
          clearTimeout(timeout)
          cleanup()
          send('error', message.error.message || 'Logs error')
          ws.close()
          if (!res.writableEnded) {
            res.end()
          }
        } else if (message.payload) {
          // Initial logs payload
          send('logs', message.payload)
        }
        return
      }

      // Handle log events (streaming log lines)
      if (message.event === 'log' || message.event === 'logs') {
        send('log', message.payload)
      }

    } catch (err) {
      console.error('Error parsing logs message:', err)
    }
  })

  ws.on('error', (err) => {
    console.error(`[Logs Route] WebSocket error for agent ${id}:`, err)
    clearTimeout(timeout)
    cleanup()
    send('error', `WebSocket error: ${err.message}`)
    if (!res.writableEnded) {
      res.end()
    }
  })

  ws.on('close', () => {
    clearTimeout(timeout)
    cleanup()
    if (!res.writableEnded) {
      res.end()
    }
  })

  // Handle client disconnect
  req.on('close', () => {
    clearTimeout(timeout)
    cleanup()
    if (ws.readyState === WebSocket.OPEN) {
      ws.close()
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.terminate() // Force close if still connecting
    }
  })
})

export default router
