import { Router } from 'express'
import {
  getGroupedActiveNotifications,
  dismissNotification,
  dismissAllNotifications,
  resolveNotificationAction,
  getWorkflowBlockers,
} from '../lib/notifications'

const router = Router()

// GET /api/notifications — list active notifications
router.get('/', (_req, res) => {
  const notifications = getGroupedActiveNotifications()
  const criticalCount = notifications.filter(n => n.severity === 'critical').length
  const warningCount = notifications.filter(n => n.severity === 'warning').length

  res.json({
    notifications,
    activeCount: notifications.length,
    criticalCount,
    warningCount,
  })
})

// POST /api/notifications/dismiss — dismiss a single notification
router.post('/dismiss', (req, res) => {
  const { id } = req.body
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing notification id' })
  }
  const groupedIds = Array.isArray(req.body.groupedIds) ? req.body.groupedIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0) : []
  const ok = groupedIds.length > 0
    ? groupedIds.map(dismissNotification).some(Boolean)
    : dismissNotification(id)
  if (!ok) return res.status(404).json({ error: 'Notification not found or already dismissed' })
  res.json({ ok: true })
})

// POST /api/notifications/dismiss-all — dismiss all active notifications
router.post('/dismiss-all', (_req, res) => {
  const count = dismissAllNotifications()
  res.json({ ok: true, dismissed: count })
})

// POST /api/notifications/:id/action — resolve a notification with an action
router.post('/:id/action', (req, res) => {
  const { id } = req.params
  const { action, value } = req.body

  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'Missing action' })
  }

  const ok = resolveNotificationAction(id, action, value, 'user')
  if (!ok) return res.status(404).json({ error: 'Notification not found or already resolved' })
  res.json({ ok: true })
})

// GET /api/notifications/blockers/:workflowId — get unresolved blockers for a workflow
router.get('/blockers/:workflowId', (req, res) => {
  const blockers = getWorkflowBlockers(req.params.workflowId)
  res.json({ blockers, count: blockers.length })
})

export default router
