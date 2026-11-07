import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { getWorkspacePath } from './workspace'

/**
 * Which conversation the dashboard chat with an agent continues, and which ones the user ended.
 *
 * A dashboard chat turn runs `openclaw agent --session-id <id>`, where the id is derived from a seed.
 * OpenClaw has no offline way to reset or delete a session: only a running Gateway can, and its reset
 * keeps the session id, leaves the transcript in place, and copies the old chat into memory files.
 * So ClawMax ends a conversation by moving on to a new seed, hence a new session the agent starts
 * with no memory of the old one. Nothing in the runtime's store is modified or deleted: the ended
 * session stays there, this record lists it in History, and Continue resumes it by its exact id.
 */
export interface EndedDashboardConversation {
  sessionId: string
  seed: string
  endedAt: number
  title?: string
}

export interface DashboardChatConversations {
  /** Seed of the conversation new turns go to. */
  activeSeed: string
  /** Set while a resumed conversation is active: its exact session id, whatever the model is now. */
  activeSessionId?: string
  /** Newest first. */
  ended: EndedDashboardConversation[]
}

/** The seed the browser sends for "the dashboard chat with this agent", and the first conversation's. */
export function defaultDashboardChatSeed(agentId: string): string {
  return `agent:${agentId}:dashboard-chat`
}

// Session ids end up in file paths (`<id>.jsonl`). The ones this module writes come from the runtime
// and the dashboard and are always plain; a record that was edited or imported must not smuggle in
// a path.
const SESSION_ID_RE = /^(?!.*\.\.)[A-Za-z0-9_.-]+$/

function conversationsPath(agentId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) throw new Error('Invalid agent id')
  return path.join(getWorkspacePath(), 'SYSTEM', 'dashboard-chat', `${agentId}.json`)
}

/**
 * Throws when the record exists but cannot be read: falling back to the first conversation would
 * quietly bring back a chat the user cleared.
 */
export function readDashboardChatConversations(agentId: string): DashboardChatConversations {
  const file = conversationsPath(agentId)
  if (!fs.existsSync(file)) return { activeSeed: defaultDashboardChatSeed(agentId), ended: [] }
  let parsed: any
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (err) {
    throw new Error(`The dashboard chat record for ${agentId} could not be read: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (
    typeof parsed?.activeSeed !== 'string' || !parsed.activeSeed || !Array.isArray(parsed.ended)
    || (parsed.activeSessionId !== undefined && (typeof parsed.activeSessionId !== 'string' || !SESSION_ID_RE.test(parsed.activeSessionId)))
  ) {
    throw new Error(`The dashboard chat record for ${agentId} is malformed`)
  }
  return {
    activeSeed: parsed.activeSeed,
    ...(parsed.activeSessionId ? { activeSessionId: parsed.activeSessionId } : {}),
    ended: parsed.ended.filter((entry: any) => typeof entry?.sessionId === 'string' && SESSION_ID_RE.test(entry.sessionId) && typeof entry?.seed === 'string' && typeof entry?.endedAt === 'number'),
  }
}

function writeDashboardChatConversations(agentId: string, conversations: DashboardChatConversations): void {
  const file = conversationsPath(agentId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  // Write-then-rename: a crash mid-write must not leave a record that brings a cleared chat back.
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(conversations, null, 2))
  fs.renameSync(temporary, file)
}

function withEnded(list: EndedDashboardConversation[], ended: Omit<EndedDashboardConversation, 'endedAt'> | undefined): EndedDashboardConversation[] {
  if (!ended) return list
  return [{ ...ended, endedAt: Date.now() }, ...list.filter((entry) => entry.sessionId !== ended.sessionId)]
}

/** Ends the current conversation (recorded in `ended` when it has messages) and starts a new one. */
export function startNewDashboardConversation(agentId: string, ended?: Omit<EndedDashboardConversation, 'endedAt'>): DashboardChatConversations {
  const current = readDashboardChatConversations(agentId)
  const next: DashboardChatConversations = {
    activeSeed: `${defaultDashboardChatSeed(agentId)}:${Date.now().toString(36)}${randomBytes(3).toString('hex')}`,
    ended: withEnded(current.ended, ended),
  }
  writeDashboardChatConversations(agentId, next)
  return next
}

/** Makes an ended conversation current again; the conversation it replaces is ended in turn. */
export function resumeDashboardConversation(
  agentId: string,
  sessionId: string,
  ended?: Omit<EndedDashboardConversation, 'endedAt'>,
): DashboardChatConversations | undefined {
  const current = readDashboardChatConversations(agentId)
  const target = current.ended.find((entry) => entry.sessionId === sessionId)
  if (!target) return undefined
  const next: DashboardChatConversations = {
    activeSeed: target.seed,
    activeSessionId: target.sessionId,
    ended: withEnded(current.ended.filter((entry) => entry.sessionId !== sessionId), ended),
  }
  writeDashboardChatConversations(agentId, next)
  return next
}

/** Drops an ended conversation from History. The runtime's own copy of the session is untouched. */
export function forgetEndedDashboardConversation(agentId: string, sessionId: string): boolean {
  const current = readDashboardChatConversations(agentId)
  const ended = current.ended.filter((entry) => entry.sessionId !== sessionId)
  if (ended.length === current.ended.length) return false
  writeDashboardChatConversations(agentId, { ...current, ended })
  return true
}

export function setEndedDashboardConversationTitle(agentId: string, sessionId: string, title: string): void {
  const current = readDashboardChatConversations(agentId)
  if (!current.ended.some((entry) => entry.sessionId === sessionId)) return
  writeDashboardChatConversations(agentId, {
    ...current,
    ended: current.ended.map((entry) => (entry.sessionId === sessionId ? { ...entry, title } : entry)),
  })
}
