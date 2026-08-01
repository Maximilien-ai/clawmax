import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getWorkspacePath } from './workspace'

export type AgentLifecycleAuditEvent = {
  id: string
  agentId: string
  type: 'modified' | 'model'
  at: string
  title: string
  detail: string
  model?: string
}

function auditPath(agentId: string): string {
  return path.join(getWorkspacePath(), '.clawmax', 'lifecycle', 'agents', `${agentId}.jsonl`)
}

export function recordAgentLifecycleAuditEvent(
  agentId: string,
  event: Omit<AgentLifecycleAuditEvent, 'id' | 'agentId' | 'at'> & { at?: string },
): AgentLifecycleAuditEvent | null {
  if (!/^[a-z][a-z0-9_-]*$/.test(agentId)) return null
  const entry: AgentLifecycleAuditEvent = {
    id: crypto.randomUUID(),
    agentId,
    type: event.type,
    at: event.at || new Date().toISOString(),
    title: event.title,
    detail: event.detail,
    ...(event.model ? { model: event.model } : {}),
  }
  const filePath = auditPath(agentId)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf-8', mode: 0o600 })
  return entry
}

export function readAgentLifecycleAuditEvents(agentId: string): AgentLifecycleAuditEvent[] {
  if (!/^[a-z][a-z0-9_-]*$/.test(agentId)) return []
  try {
    return fs.readFileSync(auditPath(agentId), 'utf-8').split('\n').filter(Boolean).flatMap((line) => {
      try {
        const entry = JSON.parse(line) as AgentLifecycleAuditEvent
        return entry?.agentId === agentId && (entry.type === 'modified' || entry.type === 'model') ? [entry] : []
      } catch {
        return []
      }
    }).slice(-500)
  } catch {
    return []
  }
}
