/**
 * Workspace notification center.
 * Stores notifications in WORKSPACE/SYSTEM/notifications.json.
 * Periodically monitors workspace for issues and creates/resolves notifications.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getWorkspacePath, listAgents, parseGroups } from './workspace'
import { listWorkflows, listExecutions, WorkflowExecution } from './workflows'
import { getBudgetStatus } from './budget'
import { getMessages } from './messages'
import { getAllAgentCostLimits, pauseAgents } from './agent-state'
import { getWorkspaceMetering } from './metering'

export type NotificationType =
  | 'agent-error'
  | 'agent-offline'
  | 'agent-needs-feedback'
  | 'agent-needs-decision'
  | 'workflow-failed'
  | 'workflow-stuck'
  | 'workflow-blocked'
  | 'workflow-progress'
  | 'cost-warning'
  | 'cost-critical'
  | 'cost-exceeded'
  | 'channel-activity'

export type NotificationSeverity = 'critical' | 'warning' | 'info'

export type NotificationActionType = 'approve' | 'reject' | 'choose' | 'input' | 'delegate' | 'pause' | 'restart' | 'view'

export interface NotificationAction {
  type: NotificationActionType
  label: string
  value?: string
  agentId?: string
}

export interface Notification {
  id: string
  type: NotificationType
  severity: NotificationSeverity
  title: string
  message: string
  entityId?: string
  entityType?: 'agent' | 'workflow' | 'budget' | 'channel'
  createdAt: string
  resolvedAt?: string
  dismissedAt?: string
  fingerprint: string
  // Blocker/action support
  actions?: NotificationAction[]
  blockerType?: 'choice' | 'approval' | 'input' | 'delegation' | 'waiting'
  blockerOptions?: string[]
  blockerResolution?: { action: string; value?: string; resolvedBy?: string; resolvedAt?: string }
  workflowId?: string
  progress?: number // 0-100 for workflow-progress type
}

const SEVERITY_MAP: Record<NotificationType, NotificationSeverity> = {
  'agent-error': 'critical',
  'agent-offline': 'info',
  'agent-needs-feedback': 'warning',
  'agent-needs-decision': 'warning',
  'workflow-failed': 'critical',
  'workflow-stuck': 'warning',
  'workflow-blocked': 'warning',
  'workflow-progress': 'info',
  'cost-warning': 'warning',
  'cost-critical': 'critical',
  'cost-exceeded': 'critical',
  'channel-activity': 'info',
}

// --- Storage ---

function getNotificationsPath(): string {
  return path.join(getWorkspacePath(), 'SYSTEM', 'notifications.json')
}

export function loadNotifications(): Notification[] {
  try {
    const raw = fs.readFileSync(getNotificationsPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function saveNotifications(notifications: Notification[]): void {
  const filePath = getNotificationsPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(notifications, null, 2), 'utf-8')
}

// --- CRUD ---

export function getActiveNotifications(): Notification[] {
  return loadNotifications()
    .filter(n => !n.dismissedAt && !n.resolvedAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export function createNotification(params: {
  type: NotificationType
  title: string
  message: string
  entityId?: string
  entityType?: 'agent' | 'workflow' | 'budget' | 'channel'
  fingerprint: string
  actions?: NotificationAction[]
  blockerType?: Notification['blockerType']
  blockerOptions?: string[]
  workflowId?: string
  progress?: number
}): Notification | null {
  const notifications = loadNotifications()

  // Dedup: skip if notification with same fingerprint is active or was dismissed (don't re-nag)
  const existing = notifications.find(n => n.fingerprint === params.fingerprint && !n.resolvedAt)
  if (existing) {
    // Update progress if it's a progress notification
    if (params.progress !== undefined && existing.progress !== params.progress) {
      existing.progress = params.progress
      saveNotifications(notifications)
    }
    return null
  }

  const notification: Notification = {
    id: crypto.randomUUID(),
    type: params.type,
    severity: SEVERITY_MAP[params.type],
    title: params.title,
    message: params.message,
    entityId: params.entityId,
    entityType: params.entityType,
    createdAt: new Date().toISOString(),
    fingerprint: params.fingerprint,
    actions: params.actions,
    blockerType: params.blockerType,
    blockerOptions: params.blockerOptions,
    workflowId: params.workflowId,
    progress: params.progress,
  }

  notifications.push(notification)
  saveNotifications(notifications)
  return notification
}

/**
 * Resolve a notification with an action (e.g., approve, reject, choose).
 * Used for blocker resolution and inline actions.
 */
export function resolveNotificationAction(id: string, action: string, value?: string, resolvedBy?: string): boolean {
  const notifications = loadNotifications()
  const n = notifications.find(n => n.id === id && !n.resolvedAt && !n.dismissedAt)
  if (!n) return false

  n.blockerResolution = {
    action,
    value,
    resolvedBy: resolvedBy || 'user',
    resolvedAt: new Date().toISOString(),
  }
  n.resolvedAt = new Date().toISOString()
  saveNotifications(notifications)
  return true
}

/**
 * Get unresolved blockers for a specific workflow.
 */
export function getWorkflowBlockers(workflowId: string): Notification[] {
  return getActiveNotifications().filter(n =>
    n.workflowId === workflowId && (n.type === 'workflow-blocked' || n.type === 'agent-needs-decision')
  )
}

export function dismissNotification(id: string): boolean {
  const notifications = loadNotifications()
  const n = notifications.find(n => n.id === id)
  if (!n || n.dismissedAt) return false
  n.dismissedAt = new Date().toISOString()
  saveNotifications(notifications)
  return true
}

export function dismissAllNotifications(): number {
  const notifications = loadNotifications()
  let count = 0
  for (const n of notifications) {
    if (!n.dismissedAt && !n.resolvedAt) {
      n.dismissedAt = new Date().toISOString()
      count++
    }
  }
  saveNotifications(notifications)
  return count
}

export function resolveByFingerprint(fingerprint: string): boolean {
  const notifications = loadNotifications()
  let resolved = false
  for (const n of notifications) {
    if (n.fingerprint === fingerprint && !n.dismissedAt && !n.resolvedAt) {
      n.resolvedAt = new Date().toISOString()
      resolved = true
    }
  }
  if (resolved) saveNotifications(notifications)
  return resolved
}

function pruneOldNotifications(): void {
  const notifications = loadNotifications()
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000 // 7 days
  const pruned = notifications.filter(n => {
    if (!n.dismissedAt && !n.resolvedAt) return true // keep active
    const ts = new Date(n.dismissedAt || n.resolvedAt || n.createdAt).getTime()
    return ts > cutoff
  })
  if (pruned.length < notifications.length) {
    saveNotifications(pruned)
  }
}

// --- Workspace Monitor ---

let monitorInterval: ReturnType<typeof setInterval> | null = null
const MONITOR_INTERVAL_MS = 60_000 // 60 seconds

// Track last-seen message counts to detect new activity
const lastSeenMessageCounts = new Map<string, number>()

async function runMonitorScan(): Promise<void> {
  try {
    // 1. Check agent health
    const agents = listAgents()
    const activeAgents = agents.filter(a => !a.archived)

    for (const agent of activeAgents) {
      const fp = `agent-offline:${agent.id}`
      if (agent.status === 'offline' && !agent.paused) {
        createNotification({
          type: 'agent-offline',
          title: `${agent.name} is offline`,
          message: `Agent ${agent.name} (${agent.id}) is not responding. It may need to be restarted.`,
          entityId: agent.id,
          entityType: 'agent',
          fingerprint: fp,
        })
      } else {
        resolveByFingerprint(fp)
      }
    }

    // 2. Check workflow health + agent execution errors
    const workflows = listWorkflows()
    for (const wf of workflows) {
      let executions: WorkflowExecution[] = []
      try {
        executions = listExecutions(wf.id, 3) // check last 3 executions
      } catch { continue }

      const latest = executions[0]
      if (!latest) continue

      const failFp = `workflow-failed:${wf.id}:${latest.id}`
      const stuckFp = `workflow-stuck:${wf.id}:${latest.id}`

      if (latest.status === 'failed') {
        createNotification({
          type: 'workflow-failed',
          title: `Workflow "${wf.name}" failed`,
          message: `Latest execution failed at ${latest.completedAt || latest.startedAt}.`,
          entityId: wf.id,
          entityType: 'workflow',
          fingerprint: failFp,
        })

        // Also create agent-error for each failed participant
        for (const p of latest.participants) {
          if (p.status === 'failed' && p.error) {
            const agentFp = `agent-error:${p.agentId}:${latest.id}`
            // Truncate error message for readability
            const shortError = p.error.length > 150 ? p.error.slice(0, 150) + '...' : p.error
            createNotification({
              type: 'agent-error',
              title: `${p.agentName || p.agentId} failed`,
              message: `Error in workflow "${wf.name}": ${shortError}`,
              entityId: p.agentId,
              entityType: 'agent',
              fingerprint: agentFp,
            })
          }
        }
      } else {
        resolveByFingerprint(failFp)
      }

      if (latest.status === 'running') {
        const elapsed = Date.now() - new Date(latest.startedAt).getTime()
        if (elapsed > 30 * 60 * 1000) { // 30 minutes
          createNotification({
            type: 'workflow-stuck',
            title: `Workflow "${wf.name}" may be stuck`,
            message: `Running for ${Math.round(elapsed / 60000)} minutes without completing.`,
            entityId: wf.id,
            entityType: 'workflow',
            fingerprint: stuckFp,
          })
        }
      } else {
        resolveByFingerprint(stuckFp)
      }
    }

    // 3. Check budget
    try {
      const budget = await getBudgetStatus()
      if (budget.level === 'exceeded') {
        createNotification({
          type: 'cost-exceeded',
          title: 'Budget exceeded',
          message: `Workspace spend reached $${budget.currentSpendUsd.toFixed(2)} against a $${budget.config.limitUsd.toFixed(2)} limit. New runs are blocked until you raise the budget or disable enforcement.`,
          entityType: 'budget',
          fingerprint: 'cost-exceeded',
        })
        resolveByFingerprint('cost-warning')
      } else if (budget.level === 'warning') {
        createNotification({
          type: 'cost-warning',
          title: 'Budget warning',
          message: `Workspace spend is at ${budget.usedPct.toFixed(0)}% of budget ($${budget.currentSpendUsd.toFixed(2)} / $${budget.config.limitUsd.toFixed(2)}). Expect runs to stop soon unless you raise the limit.`,
          entityType: 'budget',
          fingerprint: 'cost-warning',
        })
        resolveByFingerprint('cost-critical')
        resolveByFingerprint('cost-exceeded')
      } else {
        resolveByFingerprint('cost-warning')
        resolveByFingerprint('cost-critical')
        resolveByFingerprint('cost-exceeded')
      }
    } catch {}

    // 4. Check per-agent cost limits
    try {
      const costLimits = getAllAgentCostLimits()
      if (Object.keys(costLimits).length > 0) {
        const metering = await getWorkspaceMetering()
        const agentCostMap = new Map<string, number>()
        for (const a of metering.byAgent || []) {
          agentCostMap.set(a.agentId, a.estimatedCostUsd)
        }

        for (const [agentId, limit] of Object.entries(costLimits)) {
          const cost = agentCostMap.get(agentId) || 0
          const usedPct = limit > 0 ? (cost / limit) * 100 : 0
          const warningFp = `agent-cost-warning:${agentId}`
          const criticalFp = `agent-cost-critical:${agentId}`
          const fp = `agent-cost-exceeded:${agentId}`
          if (cost >= limit) {
            createNotification({
              type: 'cost-exceeded',
              title: `Agent cost limit exceeded`,
              message: `Agent "${agentId}" spent $${cost.toFixed(4)} exceeding its $${limit.toFixed(2)} limit. Agent auto-paused.`,
              entityId: agentId,
              entityType: 'agent',
              fingerprint: fp,
            })
            resolveByFingerprint(warningFp)
            resolveByFingerprint(criticalFp)
            // Auto-pause the agent
            pauseAgents([agentId])
          } else if (usedPct >= 95) {
            createNotification({
              type: 'cost-critical',
              title: 'Agent budget critical',
              message: `Agent "${agentId}" is at ${usedPct.toFixed(0)}% of its budget ($${cost.toFixed(4)} / $${limit.toFixed(2)}). Pause or raise the limit before it hard-stops.`,
              entityId: agentId,
              entityType: 'agent',
              fingerprint: criticalFp,
            })
            resolveByFingerprint(warningFp)
            resolveByFingerprint(fp)
          } else if (usedPct >= 80) {
            createNotification({
              type: 'cost-warning',
              title: 'Agent budget warning',
              message: `Agent "${agentId}" is at ${usedPct.toFixed(0)}% of its budget ($${cost.toFixed(4)} / $${limit.toFixed(2)}).`,
              entityId: agentId,
              entityType: 'agent',
              fingerprint: warningFp,
            })
            resolveByFingerprint(criticalFp)
            resolveByFingerprint(fp)
          } else {
            resolveByFingerprint(warningFp)
            resolveByFingerprint(criticalFp)
            resolveByFingerprint(fp)
          }
        }
      }
    } catch {}

    // 5. Check channel activity (unread messages)
    try {
      let groupsParsed: { communities: { name: string }[]; groups: { name: string }[] } = { communities: [], groups: [] }
      let commParsed: { communities: { name: string }[]; groups: { name: string }[] } = { communities: [], groups: [] }

      try {
        groupsParsed = parseGroups(fs.readFileSync(path.join(getWorkspacePath(), 'ORG', 'GROUPS.md'), 'utf-8'))
      } catch {}
      try {
        commParsed = parseGroups(fs.readFileSync(path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md'), 'utf-8'))
      } catch {}

      const allChannels: { type: 'group' | 'community'; name: string }[] = [
        ...groupsParsed.groups.map(g => ({ type: 'group' as const, name: g.name })),
        ...groupsParsed.communities.map(c => ({ type: 'community' as const, name: c.name })),
        ...commParsed.communities.map(c => ({ type: 'community' as const, name: c.name })),
      ]

      // Deduplicate
      const seen = new Set<string>()
      const channels = allChannels.filter(ch => {
        const key = `${ch.type}:${ch.name}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      for (const ch of channels) {
        const key = `${ch.type}:${ch.name}`
        const messages = getMessages(ch.type, ch.name)
        const count = messages.length
        const lastSeen = lastSeenMessageCounts.get(key)
        const fp = `channel-activity:${key}`

        if (count > 0 && (lastSeen === undefined || count > lastSeen)) {
          // On first scan or new messages: check for recent agent messages
          const checkCount = lastSeen !== undefined ? count - lastSeen : Math.min(count, 20)
          const recentMessages = messages.slice(-checkCount)
          const agentMessages = recentMessages.filter(m => m.from !== 'user' && m.from !== 'dr.max' && m.from !== 'User')
          if (agentMessages.length > 0) {
            createNotification({
              type: 'channel-activity',
              title: `New messages in ${ch.name}`,
              message: `${agentMessages.length} agent message${agentMessages.length !== 1 ? 's' : ''} in ${ch.type} "${ch.name}".`,
              entityId: ch.name,
              entityType: 'channel',
              fingerprint: fp,
            })
          }
        } else if (lastSeen !== undefined && count <= lastSeen) {
          resolveByFingerprint(fp)
        }

        lastSeenMessageCounts.set(key, count)
      }
    } catch {}

    // Prune old notifications
    pruneOldNotifications()
  } catch (err) {
    console.error('[NotificationMonitor] Scan failed:', err)
  }
}

export function startNotificationMonitor(): void {
  console.log('[NotificationMonitor] Starting workspace monitor (60s interval)...')
  // Run initial scan after a short delay to let server settle
  setTimeout(() => runMonitorScan(), 2000)
  monitorInterval = setInterval(runMonitorScan, MONITOR_INTERVAL_MS)
}

export function stopNotificationMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
}
