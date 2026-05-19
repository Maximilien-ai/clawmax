import fs from 'fs'
import os from 'os'
import path from 'path'

export interface HostAgentStatus {
  state: 'unauthorized' | 'unreachable' | 'warning'
  title: string
  detail: string
  hint: string
  summary?: string
  sourcePath?: string
  lastSeenAt?: string
}

type HostAgentStateFile = {
  instance_key?: string
  api_url?: string
  worker_key?: string
  refresh_token?: string
  desired_state?: string
  runtime_target?: string
  last_seen_at?: string
  last_action?: string
  last_reconcile_at?: string
  last_reconcile_result?: string
  last_successful_at?: string
  last_error?: string
  last_status_summary?: string
  last_dashboard_url?: string
  last_workspace_path?: string
  machine_id?: string
}

const STALE_MS = 5 * 60 * 1000

function candidatePaths(): string[] {
  const home = process.env.HOME || os.homedir() || ''
  return [
    (process.env.OPENCLAW_HOST_AGENT_STATE_PATH || '').trim(),
    home ? path.join(home, '.clawmax', 'agent', 'state.json') : '',
    home ? path.join(home, '.openclaw', 'host-agent-state.json') : '',
  ].filter(Boolean)
}

function readStateFile(candidatePath: string): HostAgentStateFile | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf-8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as HostAgentStateFile : null
  } catch {
    return null
  }
}

function normalize(value?: string): string {
  return String(value || '').trim()
}

function toMs(value?: string): number | null {
  const raw = normalize(value)
  if (!raw) return null
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : null
}

function isUnauthorizedError(lastError: string): boolean {
  return /status writeback unauthorized|action polling unauthorized|refresh local agent credentials|reconnect this mac/i.test(lastError)
}

function isStale(desiredState: string, lastSeenAt: string, nowMs: number = Date.now()): boolean {
  if (desiredState.toLowerCase() !== 'running') return false
  const lastSeenMs = toMs(lastSeenAt)
  if (!lastSeenMs) return true
  return nowMs - lastSeenMs > STALE_MS
}

function buildStatus(state: HostAgentStateFile, sourcePath: string): HostAgentStatus | null {
  const lastError = normalize(state.last_error)
  const lastStatusSummary = normalize(state.last_status_summary)
  const desiredState = normalize(state.desired_state)
  const lastReconcileResult = normalize(state.last_reconcile_result).toLowerCase()
  const lastSeenAt = normalize(state.last_seen_at)

  if (isUnauthorizedError(lastError)) {
    return {
      state: 'unauthorized',
      title: 'Reconnect Required',
      detail: lastError,
      hint: 'Reconnect this Mac from the dashboard to refresh local agent credentials.',
      summary: lastStatusSummary || undefined,
      sourcePath,
      lastSeenAt: lastSeenAt || undefined,
    }
  }

  if (isStale(desiredState, lastSeenAt)) {
    return {
      state: 'unreachable',
      title: 'Host Agent Unreachable',
      detail: lastError || 'The local host agent has stopped checking in while it is still supposed to be running.',
      hint: 'Check the local host agent process on this Mac and reconnect it from the dashboard if needed.',
      summary: lastStatusSummary || undefined,
      sourcePath,
      lastSeenAt: lastSeenAt || undefined,
    }
  }

  if (lastReconcileResult === 'failed') {
    return {
      state: 'warning',
      title: 'Host Agent Degraded',
      detail: lastError || 'The local host agent reported a failed reconcile.',
      hint: 'Inspect local host-agent health and reconnect this Mac if actions stop applying cleanly.',
      summary: lastStatusSummary || undefined,
      sourcePath,
      lastSeenAt: lastSeenAt || undefined,
    }
  }

  return null
}

export function getHostAgentStatus(): HostAgentStatus | null {
  for (const candidatePath of candidatePaths()) {
    const state = readStateFile(candidatePath)
    if (!state) continue
    const status = buildStatus(state, candidatePath)
    if (status) return status
  }
  return null
}
