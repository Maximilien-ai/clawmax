/**
 * Tracks which (runtime, agent, scoped session) triples have an established CLI-side session,
 * so callers know whether to pass a "resume" flag or a "create" flag on the next turn.
 *
 * Used ONLY for the claude runtime today (first-turn-vs-resume). Droid's -s flag creates-or-resumes
 * on its own and openclaw has its own session store, so neither needs this file.
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

export function markRuntimeSession(rt: AgentRuntimeId, agentId: string, scopedSessionId: string): void {
  const key = keyOf(rt, agentId, scopedSessionId)
  const entries = readEntries().filter((e) => keyOf(e.runtime, e.agentId, e.scopedSessionId) !== key)
  entries.push({ runtime: rt, agentId, scopedSessionId, markedAt: Date.now() })
  // FIFO cap: drop the oldest entries first once we're over the limit.
  const capped = entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries
  writeEntries(capped)
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
