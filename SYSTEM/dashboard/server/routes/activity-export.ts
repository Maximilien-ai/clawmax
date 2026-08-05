import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getAuthenticatedSession } from '../lib/github-auth'
import { getWorkspacePath } from '../lib/workspace'
import { getResolvedWorkspaceIntegrationConfig, readWorkspaceIntegrationSecrets } from '../lib/workspace-integrations'
import {
  ACTIVITY_EXPORT_VERSION,
  appendActivityExportEventsForActiveConsents,
  getActivityExportConsent,
  flushActivityExportOutbox,
  listActivityExportConsents,
  listActivityExportOutbox,
  listReceivedActivityExportEvents,
  receiveActivityExportBatch,
  revokeActivityExportConsent,
  revokeActivityExportDestinationConsent,
  saveActivityExportConsent,
  type ActivityExportScope,
} from '../lib/activity-export'

const router = Router()
const ALLOWED_DESTINATIONS = new Set(['clawmax-ai', 'digo'])
const ALLOWED_SCOPES = new Set<ActivityExportScope>(['agent-chat', 'group-chat', 'community-chat', 'workflow', 'builder'])

function actor(req: any): { userId: string; workspaceId: string } {
  const session = getAuthenticatedSession(req)
  return { userId: session?.userId || session?.login || 'dashboard-user', workspaceId: getWorkspacePath() }
}

router.get('/status', (req, res) => {
  const { userId, workspaceId } = actor(req)
  const consent = getActivityExportConsent(userId, workspaceId)
  const destinations = listActivityExportConsents(userId, workspaceId)
  const outbox = listActivityExportOutbox(userId, workspaceId)
  res.json({ version: ACTIVITY_EXPORT_VERSION, sharing: consent ? { destinationId: consent.destinationId, scopes: consent.scopes, consentedAt: consent.consentedAt } : null, destinations: destinations.map((entry) => ({ destinationId: entry.destinationId, scopes: entry.scopes, consentedAt: entry.consentedAt })), queuedEvents: outbox.length })
})

router.post('/consent', (req, res) => {
  const { userId, workspaceId } = actor(req)
  const destinationId = String(req.body?.destinationId || '').trim()
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.filter((scope: unknown): scope is ActivityExportScope => typeof scope === 'string' && ALLOWED_SCOPES.has(scope as ActivityExportScope)) : []
  if (!ALLOWED_DESTINATIONS.has(destinationId)) return res.status(400).json({ error: 'Unsupported Activity Export destination.' })
  if (destinationId === 'digo') {
    const config = getResolvedWorkspaceIntegrationConfig()
    const apiUrl = config.partners?.digo?.apiUrl
    const apiKey = readWorkspaceIntegrationSecrets().partners?.digo?.apiKey
    if (typeof apiUrl !== 'string' || !/^https:\/\//i.test(apiUrl) || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ error: 'Configure the Digo HTTPS ingestion URL and server-managed API key before enabling activity sharing.' })
    }
  }
  if (scopes.length === 0) return res.status(400).json({ error: 'Select at least one activity scope.' })
  const consent = saveActivityExportConsent({ receiptId: `consent_${randomUUID()}`, version: ACTIVITY_EXPORT_VERSION, destinationId, workspaceId, userId, scopes: [...new Set(scopes)] as ActivityExportScope[], active: true, consentedAt: new Date().toISOString() })
  res.status(201).json({ ok: true, consent: { receiptId: consent.receiptId, destinationId: consent.destinationId, scopes: consent.scopes, consentedAt: consent.consentedAt } })
})

router.delete('/consent', (req, res) => {
  const { userId, workspaceId } = actor(req)
  const destinationId = typeof req.body?.destinationId === 'string' ? req.body.destinationId.trim() : ''
  const revoked = destinationId
    ? revokeActivityExportDestinationConsent(userId, workspaceId, destinationId)
    : revokeActivityExportConsent(userId, workspaceId)
  res.json({ ok: true, revoked })
})

router.post('/events', (req, res) => {
  const { userId, workspaceId } = actor(req)
  if (listActivityExportConsents(userId, workspaceId).length === 0) return res.status(403).json({ error: 'Activity sharing is not enabled for this user and workspace.' })
  const source = req.body?.source as ActivityExportScope
  if (!ALLOWED_SCOPES.has(source)) return res.status(400).json({ error: 'Unsupported activity scope.' })
  const events = appendActivityExportEventsForActiveConsents({ source, workspaceId, userId, sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined, subjectId: typeof req.body?.subjectId === 'string' ? req.body.subjectId : undefined, content: typeof req.body?.content === 'string' ? req.body.content : undefined, metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : undefined })
  if (events.length === 0) return res.status(400).json({ error: 'Event was rejected by consent or validation.' })
  res.status(202).json({ ok: true, queued: true, eventIds: events.map((event) => event.eventId) })
})

router.post('/flush', async (req, res) => {
  const { userId, workspaceId } = actor(req)
  const result = await flushActivityExportOutbox({ userId, workspaceId, maxEvents: Number(req.body?.maxEvents) || undefined })
  res.status(result.error && result.delivered === 0 ? 502 : 200).json({ ok: !result.error, ...result })
})

router.post('/reference/ingest', (req, res) => {
  const expected = process.env.CLAWMAX_ACTIVITY_EXPORT_REFERENCE_TOKEN?.trim()
  const supplied = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length).trim()
    : ''
  if (!expected) return res.status(503).json({ error: 'Reference receiver is not configured.' })
  if (!supplied || supplied !== expected) return res.status(401).json({ error: 'Invalid reference receiver credential.' })
  const events = Array.isArray(req.body?.events) ? req.body.events : []
  try {
    const result = receiveActivityExportBatch(events)
    res.status(202).json({ ok: true, version: ACTIVITY_EXPORT_VERSION, ...result })
  } catch (error: any) {
    res.status(400).json({ error: error?.message || 'Invalid activity export batch.' })
  }
})

// Protected local receiver view for the ClawMax.ai demo; no external delivery yet.
router.get('/reference/events', (req, res) => {
  const { userId, workspaceId } = actor(req)
  res.json({ destinationId: 'clawmax-ai', events: listReceivedActivityExportEvents(userId, workspaceId), queuedEvents: listActivityExportOutbox(userId, workspaceId).length })
})

export default router
