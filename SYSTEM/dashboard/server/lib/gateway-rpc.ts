import WebSocket from 'ws'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import { execSync } from 'child_process'
import { safeEnv } from './safe-env'

interface GatewayConfig {
  port: number
  auth: {
    mode: string
    token: string
  }
}

function parseGatewayConfig(config: any): GatewayConfig | null {
  const port = config?.gateway?.port
  const token = config?.gateway?.auth?.token || config?.gateway?.remote?.token
  if (!port || !token) {
    return null
  }

  return {
    port,
    auth: {
      mode: config?.gateway?.auth?.mode || 'token',
      token,
    },
  }
}

function loadGatewayConfigFromDisk(): GatewayConfig | null {
  try {
    const configPath = path.join(os.homedir(), '.openclaw', 'openclaw.json')
    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    return parseGatewayConfig(config)
  } catch {
    return null
  }
}

export const __test = {
  parseGatewayConfig,
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
    const config = loadGatewayConfigFromDisk()
    if (!config) {
      throw new Error('Failed to load gateway configuration')
    }
    return config
  }

  /**
   * Call a Gateway RPC method
   */
  async call<T = any>(method: string, params?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestId = randomUUID()
      const ws = new WebSocket(this.gatewayUrl)
      let responseReceived = false
      let authenticated = false
      let connectNonce: string | null = null
      let connectSent = false

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          ws.close()
          reject(new Error(`Gateway RPC timeout for method: ${method}`))
        }
      }, 30000) // 30 second timeout

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
              id: 'cli',  // Must use approved client ID from GATEWAY_CLIENT_IDS
              displayName: 'Dashboard RPC Client',
              version: '1.0.0',
              platform: process.platform,
              mode: 'cli'  // Must use approved mode from GATEWAY_CLIENT_MODES
            },
            caps: [],
            auth: { token: this.authToken },
            role: 'operator',
            scopes: ['operator.admin']
          }
        }
        ws.send(JSON.stringify(connectMessage))
      }

      ws.on('open', () => {
        // Wait for connect.challenge event
      })

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString())

          // Handle connect.challenge event
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
              // Send actual RPC request
              const request = {
                type: 'req',
                id: requestId,
                method,
                params
              }
              ws.send(JSON.stringify(request))
            } else {
              clearTimeout(timeout)
              ws.close()
              reject(new Error(`Gateway auth failed: ${message.error?.message || 'unknown'}`))
            }
            return
          }

          // Handle RPC response
          if (message.type === 'res' && message.id === requestId) {
            responseReceived = true
            clearTimeout(timeout)

            if (message.error) {
              ws.close()
              reject(new Error(`Gateway RPC error: ${message.error.message}`))
            } else {
              ws.close()
              resolve(message.payload as T)
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
   * Uses config.patch with merge patch algorithm to update agent skills array
   */
  async updateAgentSkills(agentId: string, skills: string[]): Promise<void> {
    try {
      // Get current config to obtain the baseHash for optimistic locking
      const configData = await this.call('config.get')
      const baseHash = configData.hash

      // Use config.patch to update the agent's skills array
      // The merge patch algorithm will find the agent by ID and update only the skills field
      const patch = {
        agents: {
          list: [
            {
              id: agentId,
              skills
            }
          ]
        }
      }

      await this.call('config.patch', {
        raw: JSON.stringify(patch),
        baseHash
      })
    } catch (err: any) {
      console.error(`Gateway RPC config.patch failed:`, err)
      throw new Error(`Failed to update skills via gateway: ${err.message}`)
    }
  }

  /**
   * Patch config via Gateway RPC
   * Uses merge patch logic with full validation
   */
  async patchConfig(patch: any): Promise<void> {
    try {
      await this.call('config.patch', {
        raw: JSON.stringify(patch)
      })
    } catch (err: any) {
      console.error(`Gateway RPC config.patch failed:`, err)
      throw new Error(`Failed to patch config via gateway: ${err.message}`)
    }
  }

  /**
   * Get config via Gateway RPC
   * Returns the full response including { config, resolved, hash, valid, issues, warnings }
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
   * Uses merge patch algorithm to append to agents.list array
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
      // Get current config to check if agent exists and get baseHash
      const configData = await this.getConfig()
      const config = configData.resolved || configData.config
      const baseHash = configData.hash
      const agentsList = config.agents?.list || []

      // Check if agent already exists
      if (agentsList.find((a: any) => a.id === agent.id)) {
        throw new Error(`Agent ${agent.id} already exists`)
      }

      // Create new agent entry (only include defined fields)
      const newAgent: any = {
        id: agent.id,
        name: agent.name,
        workspace: agent.workspace,
        agentDir: agent.agentDir
      }
      if (agent.model) newAgent.model = agent.model
      if (agent.skills) newAgent.skills = agent.skills

      // Use config.patch to append the new agent
      // Merge patch algorithm will append to the list array
      const patch = {
        agents: {
          list: [...agentsList, newAgent]
        }
      }

      await this.call('config.patch', {
        raw: JSON.stringify(patch),
        baseHash
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
    try {
      gatewayClient = new GatewayRPCClient()
    } catch (err: any) {
      // Gateway not configured — expected on fresh installs
      throw new Error(`Gateway not available: ${err.message}`)
    }
  }
  return gatewayClient
}

export function isGatewayConfigured(): boolean {
  return !!loadGatewayConfigFromDisk()
}

export function getConfiguredGatewayPort(): number | null {
  return loadGatewayConfigFromDisk()?.port ?? null
}

export function isGatewayRunning(): { running: boolean; port: number | null } {
  const port = getConfiguredGatewayPort()
  if (!port) return { running: false, port: null }

  try {
    execSync(`lsof -ti:${port}`, { stdio: 'pipe', env: safeEnv() })
    return { running: true, port }
  } catch {
    try {
      // Minimal Linux images often omit `lsof`; probe the TCP port directly as a fallback.
      execSync(`bash -lc 'exec 3<>/dev/tcp/127.0.0.1/${port}'`, {
        stdio: 'pipe',
        timeout: 1500,
        env: safeEnv(),
      })
      return { running: true, port }
    } catch {
      return { running: false, port }
    }
  }
}

export async function probeGatewayResponsive(timeoutMs = 3000): Promise<{ running: boolean; port: number | null; error?: string }> {
  const config = loadGatewayConfigFromDisk()
  if (!config) return { running: false, port: null }

  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${config.port}`)
    const timer = setTimeout(() => {
      try { ws.close() } catch {}
      resolve({ running: false, port: config.port, error: 'Gateway timed out during authenticated probe' })
    }, timeoutMs)

    const cleanup = (result: { running: boolean; port: number | null; error?: string }) => {
      clearTimeout(timer)
      try { ws.close() } catch {}
      resolve(result)
    }

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())

        if (message.event === 'connect.challenge') {
          ws.send(JSON.stringify({
            type: 'req',
            id: randomUUID(),
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: {
                id: 'openclaw-control-ui',
                displayName: 'Dashboard Probe',
                version: '1.0.0',
                platform: process.platform,
                mode: 'ui',
              },
              caps: [],
              auth: { token: config.auth.token },
              role: 'operator',
              scopes: ['operator.read'],
            },
          }))
          return
        }

        if (message.type === 'res') {
          if (message.ok) {
            cleanup({ running: true, port: config.port })
          } else {
            cleanup({
              running: false,
              port: config.port,
              error: message.error?.message || 'Gateway authentication failed during probe',
            })
          }
        }
      } catch {
        cleanup({ running: false, port: config.port, error: 'Gateway returned an invalid probe response' })
      }
    })

    ws.on('error', (err: Error) => cleanup({ running: false, port: config.port, error: err.message || 'Gateway connection error' }))
    ws.on('close', () => cleanup({ running: false, port: config.port, error: 'Gateway connection closed before authenticated probe completed' }))
  })
}
