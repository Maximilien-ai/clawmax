import WebSocket from 'ws'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'
import { execFile, execSync } from 'child_process'
import { promisify } from 'util'
import { safeEnv } from './safe-env'
import { materializeDashboardAgentList } from './openclaw-config'
import { resolveOpenClawCliPath } from './openclaw-cli'

export const GATEWAY_PROTOCOL_VERSION = 4
const execFileAsync = promisify(execFile)

interface GatewayConfig {
  port: number
  host?: string
  httpUrl?: string
  wsUrl?: string
  auth: {
    mode: string
    token: string
  }
}

function getGatewayOrigin(config: GatewayConfig): string {
  return config.httpUrl || `http://localhost:${config.port}`
}

function normalizeGatewayHttpUrl(raw: string): string | null {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function parseGatewayConfig(config: any): GatewayConfig | null {
  const port = config?.gateway?.port
  const token = config?.gateway?.auth?.token || config?.gateway?.remote?.token
  if (!port || !token) {
    return null
  }

  const overrideUrl = normalizeGatewayHttpUrl(process.env.OPENCLAW_GATEWAY_URL || '')
  if (overrideUrl) {
    const parsed = new URL(overrideUrl)
    const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:'
    return {
      port: Number(parsed.port) || port,
      host: parsed.hostname,
      httpUrl: overrideUrl,
      wsUrl: `${protocol}//${parsed.host}`,
      auth: {
        mode: config?.gateway?.auth?.mode || 'token',
        token,
      },
    }
  }

  return {
    port,
    host: '127.0.0.1',
    httpUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
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

function buildGatewayCliCallArgs(method: string, params?: any): string[] {
  const args = ['gateway', 'call', method, '--json', '--timeout', '120000']
  if (params !== undefined) args.push('--params', JSON.stringify(params))
  return args
}

function shouldFallbackConfigCallToCli(error: unknown): boolean {
  const message = String((error as any)?.message || error || '')
  return /missing scope:|Gateway RPC timeout|Gateway WebSocket error|Gateway connection closed/i.test(message)
}

export const __test = {
  parseGatewayConfig,
  normalizeGatewayHttpUrl,
  getGatewayOrigin,
  loadGatewayConfigFromDisk,
  GATEWAY_PROTOCOL_VERSION,
  buildGatewayProbeClient,
  buildGatewayProbeConnectParams,
  buildGatewayCliCallArgs,
  shouldFallbackConfigCallToCli,
}

function buildGatewayProbeClient() {
  return {
    id: 'openclaw-dashboard',
    displayName: 'Dashboard Probe',
    version: '1.0.0',
    platform: process.platform,
    mode: 'operator',
  }
}

function buildGatewayProbeConnectParams(token: string) {
  return {
    minProtocol: GATEWAY_PROTOCOL_VERSION,
    maxProtocol: GATEWAY_PROTOCOL_VERSION,
    client: buildGatewayProbeClient(),
    caps: [],
    auth: { token },
    role: 'operator',
    scopes: ['operator.read'],
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
    this.gatewayUrl = config.wsUrl || `ws://127.0.0.1:${config.port}`
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
      const config = this.loadGatewayConfig()
      const ws = new WebSocket(this.gatewayUrl, {
        headers: {
          Origin: getGatewayOrigin(config),
        },
      })
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
            minProtocol: GATEWAY_PROTOCOL_VERSION,
            maxProtocol: GATEWAY_PROTOCOL_VERSION,
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
            scopes: ['operator.read', 'operator.admin']
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

  private async callConfig<T = any>(method: string, params?: any): Promise<T> {
    try {
      return await this.call<T>(method, params)
    } catch (err: any) {
      if (!shouldFallbackConfigCallToCli(err)) throw err

      // OpenClaw 2.0.2 limits token-only WebSocket clients even when they ask
      // for operator scopes. Its own CLI supplies the paired device identity,
      // so use that canonical transport for config methods only.
      const cliPath = resolveOpenClawCliPath()
      if (!cliPath) throw err
      const { stdout } = await execFileAsync(cliPath, buildGatewayCliCallArgs(method, params), {
        encoding: 'utf-8',
        env: safeEnv(),
        maxBuffer: 10 * 1024 * 1024,
      })
      const result = JSON.parse(stdout || '{}')
      if (result?.ok === false) {
        throw new Error(result?.error?.message || result?.error || `OpenClaw CLI ${method} failed`)
      }
      return result as T
    }
  }

  /**
   * Update agent skills via Gateway RPC
   * Uses config.patch with merge patch algorithm to update agent skills array
   */
  async updateAgentSkills(agentId: string, skills: string[]): Promise<void> {
    try {
      // Get current config to obtain the baseHash for optimistic locking
      const configData = await this.callConfig('config.get')
      const baseHash = configData.hash

      // Use config.patch to update the agent's skills array
      // The merge patch algorithm will find the agent by ID and update only the skills field
      const patch = {
        agents: {
          entries: {
            [agentId]: { skills },
          },
        }
      }

      await this.callConfig('config.patch', {
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
      await this.callConfig('config.patch', {
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
      return await this.callConfig('config.get')
    } catch (err: any) {
      console.error(`Gateway RPC config.get failed:`, err)
      throw new Error(`Failed to get config via gateway: ${err.message}`)
    }
  }

  /**
   * Register a new agent via config.patch
   * Uses merge patch to add a canonical keyed agent entry.
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
      const agentsList = materializeDashboardAgentList(config)

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

      agentsList.push(newAgent)

      // Keyed entries are independently merge-patchable in OpenClaw 2.0.2.
      // Keep the payload scoped so large installations do not exceed CLI argv limits.
      const patch = {
        agents: {
          entries: {
            [agent.id]: Object.fromEntries(Object.entries(newAgent).filter(([key]) => key !== 'id')),
          },
        }
      }

      await this.callConfig('config.patch', {
        raw: JSON.stringify(patch),
        baseHash
      })
    } catch (err: any) {
      console.error(`Gateway RPC registerAgent failed:`, err)
      throw new Error(`Failed to register agent via gateway: ${err.message}`)
    }
  }

  /**
   * Create or replace an agent registration in the Gateway's live config.
   *
   * Template imports may intentionally reuse an agent id for a different
   * workspace. Going through config.patch ensures the running Gateway reloads
   * that registration instead of leaving its in-memory roster stale after a
   * direct config-file write.
   */
  async upsertAgent(agent: {
    id: string
    name: string
    workspace: string
    agentDir: string
    model?: string
    skills?: string[]
  }): Promise<void> {
    try {
      const configData = await this.getConfig()
      const config = configData.resolved || configData.config || {}
      const baseHash = configData.hash
      const agentsList = materializeDashboardAgentList(config)
      const existingIndex = agentsList.findIndex((entry: any) => entry.id === agent.id)
      const entry: any = {
        ...(existingIndex >= 0 ? agentsList[existingIndex] : {}),
        id: agent.id,
        name: agent.name,
        workspace: agent.workspace,
        agentDir: agent.agentDir,
      }
      if (agent.model) entry.model = agent.model
      if (agent.skills) entry.skills = agent.skills

      if (existingIndex >= 0) agentsList[existingIndex] = entry
      else agentsList.push(entry)
      const keyedEntry = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'id'))

      await this.callConfig('config.patch', {
        raw: JSON.stringify({ agents: { entries: { [agent.id]: keyedEntry } } }),
        baseHash,
      })
    } catch (err: any) {
      console.error('Gateway RPC upsertAgent failed:', err)
      throw new Error(`Failed to synchronize agent via gateway: ${err.message}`)
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
  const config = loadGatewayConfigFromDisk()
  const port = config?.port ?? null
  if (!port || !config) return { running: false, port: null }

  try {
    if (config.host === '127.0.0.1') {
      execSync(`lsof -ti:${port}`, { stdio: 'pipe', env: safeEnv() })
      return { running: true, port }
    }
  } catch {}

  try {
    // Minimal Linux images often omit `lsof`; probe the configured TCP host directly as a fallback.
    execSync(`bash -lc 'exec 3<>/dev/tcp/${config.host || '127.0.0.1'}/${port}'`, {
      stdio: 'pipe',
      timeout: 1500,
      env: safeEnv(),
    })
    return { running: true, port }
  } catch {
    return { running: false, port }
  }
}

export function shouldTreatGatewayAsRunning(responsive: boolean, processRunning: boolean): boolean {
  // OpenClaw 2026.8.2 refuses `agent --local` whenever this state directory already owns a
  // Gateway process. A temporarily busy Gateway can miss the authenticated readiness deadline, so
  // process ownership is sufficient to keep execution on the Gateway path instead of issuing a
  // local command that the CLI will reject before the model runs.
  return responsive || processRunning
}

export async function probeGatewayResponsive(timeoutMs = 3000): Promise<{ running: boolean; port: number | null; error?: string }> {
  const config = loadGatewayConfigFromDisk()
  if (!config) return { running: false, port: null }

  return new Promise((resolve) => {
    const ws = new WebSocket(config.wsUrl || `ws://127.0.0.1:${config.port}`, {
      headers: {
        Origin: getGatewayOrigin(config),
      },
    })
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
            params: buildGatewayProbeConnectParams(config.auth.token),
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

export async function waitForGatewayResponsive(timeoutMs = 8000, pollMs = 500): Promise<{ running: boolean; port: number | null; error?: string }> {
  const deadline = Date.now() + Math.max(0, timeoutMs)
  let last = await probeGatewayResponsive(Math.min(3000, Math.max(1000, pollMs * 2)))
  if (last.running || timeoutMs <= 0) return last

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs))
    last = await probeGatewayResponsive(Math.min(3000, Math.max(1000, pollMs * 2)))
    if (last.running) return last
  }

  return last
}
