import { summarizeAgentChatFailure } from './chatRuntimeErrors'
import { summarizeWorkflowParticipantFailure } from './workflowRuntimeErrors'

export interface NotificationAction {
  type: string
  label: string
  value?: string
}

export interface DashboardNotification {
  id: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  entityId?: string
  entityType?: 'agent' | 'workflow' | 'budget' | 'channel'
  createdAt: string
  actions?: NotificationAction[]
  blockerType?: 'choice' | 'approval' | 'input' | 'delegation' | 'waiting'
  blockerOptions?: string[]
  workflowId?: string
  executionId?: string
  progress?: number
  artifactPath?: string
  artifactUrl?: string
  grouped?: boolean
  groupedCount?: number
  groupedIds?: string[]
  groupedChildren?: DashboardNotification[]
  groupedEntityIds?: string[]
  conversationTarget?: string
  conversationTargetType?: 'group' | 'community'
}

export function getNotificationChannelTargetName(notification: DashboardNotification): string | null {
  if (notification.type !== 'channel-activity') return null
  const target = notification.entityId?.trim()
  return target || null
}

export const NOTIFICATION_CATEGORY_LABELS: Record<string, string> = {
  agent: 'Agents',
  workflow: 'Workflows',
  results: 'Results',
  budget: 'Budget',
  communication: 'Communication',
}

export const NOTIFICATION_CATEGORY_ORDER = ['results', 'agent', 'workflow', 'communication', 'budget']

export function getArtifactDisplayName(target?: string): string {
  if (!target) return 'Open file'
  const parts = target.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || target
}

export function getNotificationCategory(notification: DashboardNotification): string {
  if (notification.type === 'artifact-update') return 'results'
  if (
    notification.type.startsWith('agent-') ||
    notification.type === 'agent-error' ||
    notification.type === 'agent-offline' ||
    notification.type === 'agent-needs-feedback'
  ) return 'agent'
  if (notification.type.startsWith('workflow-')) return 'workflow'
  if (notification.type.startsWith('cost-')) return 'budget'
  if (notification.type === 'channel-activity') return 'communication'
  return notification.entityType || 'agent'
}

export function filterNotifications(notifications: DashboardNotification[], query: string): DashboardNotification[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return notifications

  return notifications.filter((notification) => {
    const groupedChildrenText = (notification.groupedChildren || []).flatMap((child) => [
      child.title,
      child.message,
      child.entityId || '',
      child.artifactPath || '',
    ])
    return [
      notification.title,
      notification.message,
      notification.entityId || '',
      notification.type,
      notification.artifactPath || '',
      ...groupedChildrenText,
    ].some(value => value.toLowerCase().includes(normalizedQuery))
  })
}

export function groupNotificationsByCategory(notifications: DashboardNotification[]): Record<string, DashboardNotification[]> {
  return NOTIFICATION_CATEGORY_ORDER.reduce<Record<string, DashboardNotification[]>>((acc, category) => {
    const items = notifications.filter(notification => getNotificationCategory(notification) === category)
    if (items.length > 0) acc[category] = items
    return acc
  }, {})
}

function isSharedRuntimeAuthFailure(notification: DashboardNotification): boolean {
  if (notification.grouped) return false
  if (!(notification.type === 'agent-error' || notification.entityType === 'agent' || notification.type.startsWith('workflow-') || notification.entityType === 'workflow')) {
    return false
  }
  const normalized = getNotificationDisplayMessage(notification).toLowerCase()
  return normalized.includes('runtime auth error while contacting the configured model provider')
}

export function collapseSharedRuntimeAuthNotifications(notifications: DashboardNotification[]): DashboardNotification[] {
  const authFailures = notifications.filter(isSharedRuntimeAuthFailure)
  const uniqueEntities = new Set(authFailures.map((notification) => String(notification.entityId || notification.title || '').trim()).filter(Boolean))
  if (authFailures.length < 3 || uniqueEntities.size < 2) return notifications

  const groupedIds = authFailures.map((notification) => notification.id)
  const groupedEntityIds = Array.from(uniqueEntities)
  const latestCreatedAt = authFailures
    .map((notification) => notification.createdAt)
    .filter(Boolean)
    .sort()
    .slice(-1)[0] || new Date().toISOString()
  const severity = authFailures.some((notification) => notification.severity === 'critical')
    ? 'critical'
    : authFailures.some((notification) => notification.severity === 'warning')
      ? 'warning'
      : 'info'
  const incident: DashboardNotification = {
    id: `shared-runtime-auth:${groupedIds.join('|')}`,
    type: 'agent-error',
    severity,
    title: 'Shared model provider auth incident',
    message: `${authFailures.length} agent/workflow failures are using the same runtime provider auth configuration. Check the shared provider key/configuration for this runtime.`,
    entityType: 'agent',
    createdAt: latestCreatedAt,
    grouped: true,
    groupedCount: authFailures.length,
    groupedIds,
    groupedChildren: [...authFailures].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    groupedEntityIds,
  }

  return [incident, ...notifications.filter((notification) => !groupedIds.includes(notification.id))]
}

export function notificationHasPrimaryOpenAction(notification: DashboardNotification): boolean {
  if (notification.grouped) return false
  if (notification.type === 'artifact-update') return Boolean(notification.artifactPath || notification.artifactUrl)
  if (notification.entityType === 'agent') return notification.blockerType === 'input'
  if (notification.entityId && !notification.blockerType) return true
  return notification.entityType === 'budget'
}

export function getNotificationFooterActionLabel(notification: DashboardNotification): string | null {
  if (notification.type === 'artifact-update' && (notification.artifactPath || notification.artifactUrl)) return 'Open file'
  if (notification.type === 'channel-activity' && getNotificationChannelTargetName(notification)) return 'View'
  if (notification.entityType === 'budget') return 'View budget'
  if (notification.entityId && !notification.blockerType && notification.entityType !== 'agent') return 'View'
  return null
}

export function getNotificationDisplayMessage(notification: DashboardNotification): string {
  const message = String(notification.message || '').trim()
  if (!message) return ''

  if (notification.type === 'agent-error' || notification.entityType === 'agent') {
    return summarizeAgentChatFailure(message)
  }

  if (notification.type.startsWith('workflow-') || notification.entityType === 'workflow') {
    return summarizeWorkflowParticipantFailure(message)
  }

  return message
}
