/**
 * Tracks which (runtime, agent, scoped session) triples have an established CLI-side session,
 * so callers know whether to pass a "resume" flag or a "create" flag on the next turn.
 *
 * Used by claude (first-turn `--session-id` vs `--resume`) and opencode (whose first turn must
 * let the CLI create the session, then resume the id the CLI reported). Droid's -s flag
 * creates-or-resumes on its own and openclaw has its own session store, so neither needs this file.
 */
import fs from 'fs'
import path from 'path'
import { getWorkspacePath } from './workspace'
import type { AgentRuntimeId } from './agent-runtime'

const MAX_ENTRIES = 2000

interface SessionEntry {
  runtime: AgentRuntimeId
  agentId: string
  scopedSessionId: string
  /**
   * The session id the CLI itself created, when the runtime does not accept a caller-supplied
   * id on the first turn (opencode). Absent for runtimes that derive the id deterministically.
   */
  sessionId?: string
  markedAt: number
}

function getRuntimeSessionsPath(): string {
  return path.join(getWorkspacePath(), 'SYSTEM', 'runtime-sessions.json')
}

function readEntries(): SessionEntry[] {
  try {
    const filePath = getRuntimeSessionsPath()
    if (!fs.existsSync(filePath)) return []
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return Array.isArray(parsed)
      ? parsed.filter((e): e is SessionEntry => !!e && typeof e === 'object' && typeof e.agentId === 'string')
      : []
  } catch {
    return []
  }
}

function writeEntries(entries: SessionEntry[]): void {
  const filePath = getRuntimeSessionsPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(entries), 'utf-8')
  fs.renameSync(tmpPath, filePath)
}

function keyOf(rt: AgentRuntimeId, agentId: string, scopedSessionId: string): string {
  return `${rt}:${agentId}:${scopedSessionId}`
}

export function hasRuntimeSession(rt: AgentRuntimeId, agentId: string, scopedSessionId: string): boolean {
  const key = keyOf(rt, agentId, scopedSessionId)
  return readEntries().some((e) => keyOf(e.runtime, e.agentId, e.scopedSessionId) === key)
}

export function markRuntimeSession(rt: AgentRuntimeId, agentId: string, scopedSessionId: string, sessionId?: string): void {
  const key = keyOf(rt, agentId, scopedSessionId)
  const existing = readEntries()
  // Keep an id the CLI reported earlier when a caller re-marks the same triple without one.
  const knownSessionId = sessionId || existing.find((e) => keyOf(e.runtime, e.agentId, e.scopedSessionId) === key)?.sessionId
  const entries = existing.filter((e) => keyOf(e.runtime, e.agentId, e.scopedSessionId) !== key)
  entries.push({
    runtime: rt,
    agentId,
    scopedSessionId,
    ...(knownSessionId ? { sessionId: knownSessionId } : {}),
    markedAt: Date.now(),
  })
  // FIFO cap: drop the oldest entries first once we're over the limit.
  const capped = entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries
  writeEntries(capped)
}

/**
 * The session id the CLI reported for this conversation, when it had to create one itself.
 * Callers that derive their own deterministic id can treat `undefined` as "no CLI session yet".
 */
export function getRuntimeSessionId(rt: AgentRuntimeId, agentId: string, scopedSessionId: string): string | undefined {
  const key = keyOf(rt, agentId, scopedSessionId)
  return readEntries().find((e) => keyOf(e.runtime, e.agentId, e.scopedSessionId) === key)?.sessionId
}

export function clearRuntimeSessions(agentId: string): void {
  writeEntries(readEntries().filter((e) => e.agentId !== agentId))
}

/**
 * Forget one conversation's session. Recovering a single wedged transcript must not drop resume
 * continuity for the agent's other conversations — an agent is shared across chat, channels and
 * workflows, and each has its own scoped session.
 */
export function clearRuntimeSession(rt: AgentRuntimeId, agentId: string, scopedSessionId: string): void {
  const key = keyOf(rt, agentId, scopedSessionId)
  writeEntries(readEntries().filter((e) => keyOf(e.runtime, e.agentId, e.scopedSessionId) !== key))
}
