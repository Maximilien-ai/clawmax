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
