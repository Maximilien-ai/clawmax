import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'

interface AgentState {
  paused: string[]
  costLimits: Record<string, number> // agentId -> USD limit
}

function getStatePath(): string {
  return path.join(getWorkspacePath(), 'SYSTEM', 'agent-state.json')
}

function loadState(): AgentState {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      paused: Array.isArray(parsed.paused) ? parsed.paused : [],
      costLimits: parsed.costLimits && typeof parsed.costLimits === 'object' ? parsed.costLimits : {},
    }
  } catch {
    return { paused: [], costLimits: {} }
  }
}

function saveState(state: AgentState): void {
  const statePath = getStatePath()
  const dir = path.dirname(statePath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8')
}

export function getPausedAgents(): Set<string> {
  const state = loadState()
  return new Set(state.paused)
}

export function pauseAgents(agentIds: string[]): Set<string> {
  const state = loadState()
  const next = new Set(state.paused)
  for (const id of agentIds) next.add(id)
  state.paused = Array.from(next)
  saveState(state)
  return next
}

export function resumeAgents(agentIds: string[]): Set<string> {
  const state = loadState()
  const next = new Set(state.paused)
  for (const id of agentIds) next.delete(id)
  state.paused = Array.from(next)
  saveState(state)
  return next
}

// --- Per-agent cost limits ---

export function getAgentCostLimits(): Record<string, number> {
  return loadState().costLimits
}

export function getAgentCostLimit(agentId: string): number | null {
  const limits = loadState().costLimits
  return limits[agentId] ?? null
}

export function setAgentCostLimit(agentId: string, limitUsd: number | null): void {
  const state = loadState()
  if (limitUsd === null || limitUsd <= 0) {
    delete state.costLimits[agentId]
  } else {
    state.costLimits[agentId] = limitUsd
  }
  saveState(state)
}

export function getAllAgentCostLimits(): Record<string, number> {
  return loadState().costLimits
}
