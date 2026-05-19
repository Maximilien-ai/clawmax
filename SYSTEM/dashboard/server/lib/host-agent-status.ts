import fs from 'fs'
import os from 'os'
import path from 'path'

export interface HostAgentStatus {
  state: 'unauthorized' | 'unreachable' | 'warning'
  title: string
  detail: string
  hint: string
  sourcePath?: string
}

type HostStateShape = {
  connected?: boolean
  status?: string
  state?: string
  connectivity?: string | { state?: string; connected?: boolean; last_error?: string; lastError?: string }
  last_error?: string
  lastError?: string
  error?: string
  message?: string
}

function candidatePaths(): string[] {
  const home = process.env.HOME || os.homedir() || ''
  return [
    (process.env.OPENCLAW_HOST_AGENT_STATE_PATH || '').trim(),
    home ? path.join(home, '.openclaw', 'host-agent-state.json') : '',
    home ? path.join(home, '.openclaw', 'device-agent-state.json') : '',
    home ? path.join(home, '.openclaw', 'openclaw.json') : '',
  ].filter(Boolean)
}

function readJson(candidatePath: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(candidatePath, 'utf-8'))
  } catch {
    return null
  }
}

function asObject(value: any): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function extractCandidateSections(raw: any): HostStateShape[] {
  const root = asObject(raw)
  if (!root) return []
  const sections = [
    root.hostAgent,
    root.host_agent,
    root.deviceAgent,
    root.device_agent,
    root.state?.hostAgent,
    root.state?.host_agent,
    root.meta?.hostAgent,
    root.meta?.host_agent,
    root,
  ]
  return sections.map((section) => asObject(section) as HostStateShape | null).filter(Boolean) as HostStateShape[]
}

function extractLastError(section: HostStateShape): string {
  const connectivity = asObject(section.connectivity)
  return String(
    section.last_error ||
    section.lastError ||
    connectivity?.last_error ||
    connectivity?.lastError ||
    section.error ||
    section.message ||
    '',
  ).trim()
}

function extractConnected(section: HostStateShape): boolean | null {
  if (typeof section.connected === 'boolean') return section.connected
  const connectivity = asObject(section.connectivity)
  if (typeof connectivity?.connected === 'boolean') return connectivity.connected

  const raw = String(
    section.status ||
    section.state ||
    (typeof section.connectivity === 'string' ? section.connectivity : connectivity?.state) ||
    '',
  ).trim().toLowerCase()
  if (!raw) return null
  if (['connected', 'healthy', 'ok', 'ready'].includes(raw)) return true
  if (['unauthorized', 'unreachable', 'disconnected', 'offline', 'error'].includes(raw)) return false
  return null
}

function buildStatus(section: HostStateShape, sourcePath: string): HostAgentStatus | null {
  const detail = extractLastError(section)
  const connected = extractConnected(section)
  const lowerDetail = detail.toLowerCase()
  const unauthorized = /unauthorized|token mismatch|refresh local agent credentials|reconnect this mac/i.test(detail)

  if (unauthorized) {
    return {
      state: 'unauthorized',
      title: 'Reconnect Required',
      detail: detail || 'The local host agent rejected dashboard actions with an authorization error.',
      hint: 'Reconnect this Mac from the dashboard to refresh local agent credentials.',
      sourcePath,
    }
  }

  if (connected === false) {
    return {
      state: 'unreachable',
      title: 'Host Agent Unreachable',
      detail: detail || 'The local host agent is not currently reachable from the dashboard runtime.',
      hint: 'Check the local host agent process and reconnect this Mac if the problem persists.',
      sourcePath,
    }
  }

  if (detail && /error|failed|timeout|unreachable|offline|disconnected/i.test(lowerDetail)) {
    return {
      state: 'warning',
      title: 'Host Agent Warning',
      detail,
      hint: 'Review local host agent health and reconnect this Mac if actions stop applying.',
      sourcePath,
    }
  }

  return null
}

export function getHostAgentStatus(): HostAgentStatus | null {
  for (const candidatePath of candidatePaths()) {
    const raw = readJson(candidatePath)
    if (!raw) continue
    for (const section of extractCandidateSections(raw)) {
      const status = buildStatus(section, candidatePath)
      if (status) return status
    }
  }
  return null
}
