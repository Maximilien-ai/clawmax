import { Router } from 'express'
import {
  getActiveNotifications,
  dismissNotification,
  dismissAllNotifications,
} from '../lib/notifications'

const router = Router()

// GET /api/notifications — list active notifications
router.get('/', (_req, res) => {
  const notifications = getActiveNotifications()
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
  const ok = dismissNotification(id)
  if (!ok) return res.status(404).json({ error: 'Notification not found or already dismissed' })
  res.json({ ok: true })
})

// POST /api/notifications/dismiss-all — dismiss all active notifications
router.post('/dismiss-all', (_req, res) => {
  const count = dismissAllNotifications()
  res.json({ ok: true, dismissed: count })
})

export default router
