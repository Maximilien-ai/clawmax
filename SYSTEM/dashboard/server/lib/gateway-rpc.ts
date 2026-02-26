import WebSocket from 'ws'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'

interface GatewayConfig {
  port: number
  auth: {
    mode: string
    token: string
  }
}

interface RPCRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: any
}

interface RPCResponse {
  jsonrpc: '2.0'
  id: string
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

interface RPCEvent {
  jsonrpc: '2.0'
  method: string
  params: any
}

/**
 * Gateway RPC Client for communicating with OpenClaw Gateway
 *
 * This client ensures all config modifications go through the official
 * Gateway RPC API, which provides:
 * - Full Zod schema validation
 * - Automatic metadata stamping
 * - Environment variable preservation
 * - Merge patch conflict resolution
 * - Audit logging
 * - Atomic writes with backups
 */
export class GatewayRPCClient {
  private gatewayUrl: string
  private authToken: string

  constructor() {
    const config = this.loadGatewayConfig()
    this.gatewayUrl = `ws://127.0.0.1:${config.port}`
    this.authToken = config.auth.token
  }

  private loadGatewayConfig(): GatewayConfig {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')

    try {
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)

      if (!config.gateway) {
        throw new Error('No gateway configuration found in openclaw.json')
      }

      if (!config.gateway.port) {
        throw new Error('Gateway port not configured')
      }

      if (!config.gateway.auth?.token) {
        throw new Error('Gateway auth token not configured')
      }

      return {
        port: config.gateway.port,
        auth: {
          mode: config.gateway.auth.mode || 'token',
          token: config.gateway.auth.token
        }
      }
    } catch (err) {
      console.error('Error loading gateway config:', err)
      throw new Error('Failed to load gateway configuration')
    }
  }

  /**
   * Call a Gateway RPC method
   */
  async call<T = any>(method: string, params?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = randomUUID()
      const ws = new WebSocket(this.gatewayUrl)
      let responseReceived = false

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          ws.close()
          reject(new Error(`Gateway RPC timeout for method: ${method}`))
        }
      }, 30000) // 30 second timeout

      ws.on('open', () => {
        // Send auth and request
        const authMessage = {
          jsonrpc: '2.0' as const,
          id: randomUUID(),
          method: 'auth',
          params: { token: this.authToken }
        }

        const request: RPCRequest = {
          jsonrpc: '2.0',
          id: requestId,
          method,
          params
        }

        ws.send(JSON.stringify(authMessage))
        ws.send(JSON.stringify(request))
      })

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as RPCResponse | RPCEvent

          // Handle RPC response
          if ('id' in message && message.id === requestId) {
            responseReceived = true
            clearTimeout(timeout)

            if (message.error) {
              ws.close()
              reject(new Error(`Gateway RPC error: ${message.error.message}`))
            } else {
              ws.close()
              resolve(message.result as T)
            }
          }
          // Ignore events and other responses
        } catch (err) {
          console.error('Error parsing gateway message:', err)
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        if (!responseReceived) {
          reject(new Error(`Gateway WebSocket error: ${err.message}`))
        }
      })

      ws.on('close', () => {
        clearTimeout(timeout)
        if (!responseReceived) {
          reject(new Error('Gateway connection closed before receiving response'))
        }
      })
    })
  }

  /**
   * Update agent skills via Gateway RPC
   * Uses the official skills.update method with full validation
   */
  async updateAgentSkills(agentId: string, skills: string[]): Promise<void> {
    try {
      await this.call('skills.update', {
        agentId,
        skills
      })
    } catch (err: any) {
      console.error(`Gateway RPC skills.update failed:`, err)
      throw new Error(`Failed to update skills via gateway: ${err.message}`)
    }
  }

  /**
   * Patch config via Gateway RPC
   * Uses merge patch logic with full validation
   */
  async patchConfig(patch: any): Promise<void> {
    try {
      await this.call('config.patch', { patch })
    } catch (err: any) {
      console.error(`Gateway RPC config.patch failed:`, err)
      throw new Error(`Failed to patch config via gateway: ${err.message}`)
    }
  }

  /**
   * Get config via Gateway RPC
   */
  async getConfig(): Promise<any> {
    try {
      return await this.call('config.get')
    } catch (err: any) {
      console.error(`Gateway RPC config.get failed:`, err)
      throw new Error(`Failed to get config via gateway: ${err.message}`)
    }
  }

  /**
   * Register a new agent via config.patch
   */
  async registerAgent(agent: {
    id: string
    name: string
    workspace: string
    agentDir: string
    model?: string
    skills?: string[]
  }): Promise<void> {
    try {
      // Get current config
      const config = await this.getConfig()
      const agentsList = config.agents?.list || []

      // Check if agent already exists
      if (agentsList.find((a: any) => a.id === agent.id)) {
        throw new Error(`Agent ${agent.id} already exists`)
      }

      // Add new agent to list
      const newAgentsList = [...agentsList, agent]

      // Patch config with new agents list
      await this.patchConfig({
        agents: {
          list: newAgentsList
        }
      })
    } catch (err: any) {
      console.error(`Gateway RPC registerAgent failed:`, err)
      throw new Error(`Failed to register agent via gateway: ${err.message}`)
    }
  }
}

/**
 * Singleton instance
 */
let gatewayClient: GatewayRPCClient | null = null

export function getGatewayClient(): GatewayRPCClient {
  if (!gatewayClient) {
    gatewayClient = new GatewayRPCClient()
  }
  return gatewayClient
}
