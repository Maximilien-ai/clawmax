import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getAuthenticatedSession } from '../lib/github-auth'
import { getWorkspacePath } from '../lib/workspace'
import {
  ACTIVITY_EXPORT_VERSION,
  appendActivityExportEvent,
  getActivityExportConsent,
  listActivityExportOutbox,
  revokeActivityExportConsent,
  saveActivityExportConsent,
  type ActivityExportScope,
} from '../lib/activity-export'

const router = Router()
const ALLOWED_DESTINATIONS = new Set(['clawmax-ai'])
const ALLOWED_SCOPES = new Set<ActivityExportScope>(['agent-chat', 'group-chat', 'community-chat', 'workflow', 'builder'])

function actor(req: any): { userId: string; workspaceId: string } {
  const session = getAuthenticatedSession(req)
  return { userId: session?.userId || session?.login || 'dashboard-user', workspaceId: getWorkspacePath() }
}

router.get('/status', (req, res) => {
  const { userId, workspaceId } = actor(req)
  const consent = getActivityExportConsent(userId, workspaceId)
  const outbox = listActivityExportOutbox(userId, workspaceId)
  res.json({ version: ACTIVITY_EXPORT_VERSION, sharing: consent ? { destinationId: consent.destinationId, scopes: consent.scopes, consentedAt: consent.consentedAt } : null, queuedEvents: outbox.length })
})

router.post('/consent', (req, res) => {
  const { userId, workspaceId } = actor(req)
  const destinationId = String(req.body?.destinationId || '').trim()
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.filter((scope: unknown): scope is ActivityExportScope => typeof scope === 'string' && ALLOWED_SCOPES.has(scope as ActivityExportScope)) : []
  if (!ALLOWED_DESTINATIONS.has(destinationId)) return res.status(400).json({ error: 'Only the ClawMax.ai reference destination is available in this preview.' })
  if (scopes.length === 0) return res.status(400).json({ error: 'Select at least one activity scope.' })
  const consent = saveActivityExportConsent({ receiptId: `consent_${randomUUID()}`, version: ACTIVITY_EXPORT_VERSION, destinationId, workspaceId, userId, scopes: [...new Set(scopes)] as ActivityExportScope[], active: true, consentedAt: new Date().toISOString() })
  res.status(201).json({ ok: true, consent: { receiptId: consent.receiptId, destinationId: consent.destinationId, scopes: consent.scopes, consentedAt: consent.consentedAt } })
})

router.delete('/consent', (req, res) => {
  const { userId, workspaceId } = actor(req)
  const revoked = revokeActivityExportConsent(userId, workspaceId)
  res.json({ ok: true, revoked })
})

router.post('/events', (req, res) => {
  const { userId, workspaceId } = actor(req)
  const consent = getActivityExportConsent(userId, workspaceId)
  if (!consent) return res.status(403).json({ error: 'Activity sharing is not enabled for this user and workspace.' })
  const source = req.body?.source as ActivityExportScope
  if (!ALLOWED_SCOPES.has(source)) return res.status(400).json({ error: 'Unsupported activity scope.' })
  const event = appendActivityExportEvent({ source, workspaceId, userId, sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined, subjectId: typeof req.body?.subjectId === 'string' ? req.body.subjectId : undefined, content: typeof req.body?.content === 'string' ? req.body.content : undefined, metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : undefined }, consent)
  if (!event) return res.status(400).json({ error: 'Event was rejected by consent or validation.' })
  res.status(202).json({ ok: true, queued: true, eventId: event.eventId })
})

// Protected local receiver view for the ClawMax.ai demo; no external delivery yet.
router.get('/reference/events', (req, res) => {
  const { userId, workspaceId } = actor(req)
  res.json({ destinationId: 'clawmax-ai', events: listActivityExportOutbox(userId, workspaceId) })
})

export default router
