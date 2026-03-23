import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'

interface AgentState {
  paused: string[]
}

const STATE_PATH = path.join(getWorkspacePath(), 'SYSTEM', 'agent-state.json')

function loadState(): AgentState {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf-8')
    const parsed = JSON.parse(raw)
    return {
      paused: Array.isArray(parsed.paused) ? parsed.paused : []
    }
  } catch {
    return { paused: [] }
  }
}

function saveState(state: AgentState): void {
  const dir = path.dirname(STATE_PATH)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8')
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
