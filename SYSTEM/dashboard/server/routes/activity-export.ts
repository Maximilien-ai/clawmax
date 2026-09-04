import { Router } from 'express'
import { randomUUID } from 'crypto'
import { getAuthenticatedSession } from '../lib/github-auth'
import { getWorkspacePath } from '../lib/workspace'
import { getResolvedWorkspaceIntegrationConfig, readWorkspaceIntegrationSecrets } from '../lib/workspace-integrations'
import {
  ACTIVITY_EXPORT_VERSION,
  appendActivityExportEventsForActiveConsents,
  enqueueActivityExportPurge,
  getActivityExportConsent,
  getActivityExportEnrollment,
  getOpaqueActivityUserId,
  getOpaqueActivityWorkspaceId,
  flushActivityExportOutbox,
  listActivityExportConsents,
  recordActivityExportPurgeResult,
  listActivityExportOutbox,
  listReceivedActivityExportEvents,
  receiveActivityExportBatch,
  revokeActivityExportConsent,
  revokeActivityExportDestinationConsent,
  revokeActivityExportEnrollment,
  saveActivityExportConsent,
  saveActivityExportEnrollment,
  type ActivityExportScope,
} from '../lib/activity-export'
import { flushActivityExportWorker, getActivityExportWorkerStatus } from '../lib/activity-export-worker'
import {
  AGENTFORGE_DESTINATION_ID,
  AGENTFORGE_PURPOSE,
  AGENTFORGE_RETENTION_DAYS,
  AGENTFORGE_SUPPORTED_SCOPES,
  exchangeAgentForgeEnrollment,
  getAgentForgeRuntimeConfig,
  registerAgentForgeConsent,
  revokeAgentForgeConsent,
} from '../lib/agentforge-activity-export'

const router = Router()
const ALLOWED_DESTINATIONS = new Set(['clawmax-ai', 'digo', AGENTFORGE_DESTINATION_ID])
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
  const worker = getActivityExportWorkerStatus()
  const agentForgeConfig = getAgentForgeRuntimeConfig()
  const agentForgeEnrollment = getActivityExportEnrollment(userId, workspaceId, AGENTFORGE_DESTINATION_ID)
  const retrySummary = outbox.reduce((summary, entry: any) => {
    if (entry.attempts > 0) summary.attempts += entry.attempts
    if (entry.lastError && !summary.lastError) summary.lastError = entry.lastError
    return summary
  }, { attempts: 0, lastError: undefined as string | undefined })
  res.json({
    version: ACTIVITY_EXPORT_VERSION,
    sharing: consent ? { destinationId: consent.destinationId, scopes: consent.scopes, consentedAt: consent.consentedAt } : null,
    destinations: destinations.map((entry) => ({ destinationId: entry.destinationId, scopes: entry.scopes, consentedAt: entry.consentedAt, expiresAt: entry.expiresAt })),
    queuedEvents: outbox.length,
    agentforge: {
      configured: Boolean(agentForgeConfig),
      connected: Boolean(agentForgeEnrollment),
      enrollmentId: agentForgeEnrollment?.enrollmentId,
      purpose: AGENTFORGE_PURPOSE,
      privacyUrl: agentForgeConfig?.privacyUrl,
      retentionDays: AGENTFORGE_RETENTION_DAYS,
      supportedScopes: AGENTFORGE_SUPPORTED_SCOPES,
    },
    delivery: { worker: { running: worker.running, startedAt: worker.startedAt, lastAttemptAt: worker.lastAttemptAt, lastResult: worker.lastResult, lastError: worker.lastError, intervalMs: worker.intervalMs, configured: worker.configured }, retry: retrySummary },
  })
})

router.post('/agentforge/enrollment', async (req, res) => {
  const { userId, workspaceId } = actor(req)
  const connectionCode = typeof req.body?.connectionCode === 'string' ? req.body.connectionCode.trim().toUpperCase() : ''
  if (!connectionCode) return res.status(400).json({ error: 'Enter the single-use connection code created in AgentForge.' })
  if (!getAgentForgeRuntimeConfig()) return res.status(503).json({ error: 'The operator has not configured AgentForge delivery.' })
  const externalWorkspaceId = getOpaqueActivityWorkspaceId(workspaceId)
  const externalUserId = getOpaqueActivityUserId(userId, workspaceId, AGENTFORGE_DESTINATION_ID)
  try {
    const remote = await exchangeAgentForgeEnrollment({ connectionCode, workspaceId: externalWorkspaceId, userId: externalUserId })
    const enrollment = saveActivityExportEnrollment({
      enrollmentId: remote.enrollmentId,
      destinationId: AGENTFORGE_DESTINATION_ID,
      workspaceId,
      userId,
      externalWorkspaceId,
      externalUserId,
      status: 'active',
      connectedAt: new Date().toISOString(),
    })
    return res.status(201).json({ ok: true, enrollment: { enrollmentId: enrollment.enrollmentId, status: enrollment.status } })
  } catch (error: any) {
    return res.status(502).json({ error: error?.message || 'AgentForge enrollment could not be connected.' })
  }
})

router.delete('/agentforge/enrollment', (req, res) => {
  const { userId, workspaceId } = actor(req)
  const revokedConsent = revokeActivityExportDestinationConsent(userId, workspaceId, AGENTFORGE_DESTINATION_ID)
  const revokedEnrollment = revokeActivityExportEnrollment(userId, workspaceId, AGENTFORGE_DESTINATION_ID)
  res.json({ ok: true, revokedConsent, revokedEnrollment })
})

router.post('/consent', async (req, res) => {
  const { userId, workspaceId } = actor(req)
  const destinationId = String(req.body?.destinationId || '').trim()
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.filter((scope: unknown): scope is ActivityExportScope => typeof scope === 'string' && ALLOWED_SCOPES.has(scope as ActivityExportScope)) : []
  if (!ALLOWED_DESTINATIONS.has(destinationId)) return res.status(400).json({ error: 'Unsupported Activity Export destination.' })
  if (destinationId === 'digo' && !listActivityExportConsents(userId, workspaceId).some((entry) => entry.destinationId === 'clawmax-ai')) {
    return res.status(400).json({ error: 'Enable ClawMax.ai Activity Export sharing before adding Digo as a destination.' })
  }
  if (destinationId === 'digo') {
    const config = getResolvedWorkspaceIntegrationConfig()
    const apiUrl = config.partners?.digo?.apiUrl
    const apiKey = readWorkspaceIntegrationSecrets().partners?.digo?.apiKey
    if (typeof apiUrl !== 'string' || !/^https:\/\//i.test(apiUrl) || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(400).json({ error: 'Configure the Digo HTTPS ingestion URL and server-managed API key before enabling activity sharing.' })
    }
  }
  if (destinationId === AGENTFORGE_DESTINATION_ID) {
    if (!getAgentForgeRuntimeConfig()) return res.status(400).json({ error: 'The operator must configure the AgentForge API, privacy URL, and Partner API key first.' })
    const unsupported = scopes.filter((scope: ActivityExportScope) => !(AGENTFORGE_SUPPORTED_SCOPES as readonly string[]).includes(scope))
    if (unsupported.length > 0) return res.status(400).json({ error: `AgentForge does not support the selected launch scope: ${unsupported.join(', ')}.` })
    const enrollment = getActivityExportEnrollment(userId, workspaceId, AGENTFORGE_DESTINATION_ID)
    if (!enrollment) return res.status(400).json({ error: 'Connect your AgentForge enrollment before enabling activity sharing.' })
    if (scopes.length === 0) return res.status(400).json({ error: 'Select at least one activity scope.' })
    const consentedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + AGENTFORGE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const receiptId = `consent_${randomUUID()}`
    try {
      await registerAgentForgeConsent({
        receiptId,
        enrollmentId: enrollment.enrollmentId,
        workspaceId: enrollment.externalWorkspaceId,
        userId: enrollment.externalUserId,
        scopes,
        consentedAt,
        expiresAt,
      })
    } catch (error: any) {
      return res.status(502).json({ error: error?.message || 'AgentForge could not register the consent receipt.' })
    }
    const config = getAgentForgeRuntimeConfig()!
    const consent = saveActivityExportConsent({
      receiptId,
      version: ACTIVITY_EXPORT_VERSION,
      destinationId,
      workspaceId,
      userId,
      scopes: [...new Set(scopes)] as ActivityExportScope[],
      active: true,
      consentedAt,
      expiresAt,
      enrollmentId: enrollment.enrollmentId,
      purpose: AGENTFORGE_PURPOSE,
      privacyUrl: config.privacyUrl,
      retentionUntil: expiresAt,
    })
    return res.status(201).json({ ok: true, consent: { receiptId: consent.receiptId, destinationId: consent.destinationId, scopes: consent.scopes, consentedAt: consent.consentedAt, expiresAt: consent.expiresAt } })
  }
  if (scopes.length === 0) return res.status(400).json({ error: 'Select at least one activity scope.' })
  const consent = saveActivityExportConsent({ receiptId: `consent_${randomUUID()}`, version: ACTIVITY_EXPORT_VERSION, destinationId, workspaceId, userId, scopes: [...new Set(scopes)] as ActivityExportScope[], active: true, consentedAt: new Date().toISOString() })
  res.status(201).json({ ok: true, consent: { receiptId: consent.receiptId, destinationId: consent.destinationId, scopes: consent.scopes, consentedAt: consent.consentedAt } })
})

router.delete('/consent', async (req, res) => {
  const { userId, workspaceId } = actor(req)
  const destinationId = typeof req.body?.destinationId === 'string' ? req.body.destinationId.trim() : ''
  const remoteConsent = destinationId === AGENTFORGE_DESTINATION_ID
    ? listActivityExportConsents(userId, workspaceId).find((entry) => entry.destinationId === AGENTFORGE_DESTINATION_ID)
    : undefined
  if (remoteConsent) enqueueActivityExportPurge(remoteConsent.receiptId, AGENTFORGE_DESTINATION_ID)
  const revoked = destinationId
    ? revokeActivityExportDestinationConsent(userId, workspaceId, destinationId)
    : revokeActivityExportConsent(userId, workspaceId)
  if (remoteConsent) {
    try {
      const remote = await revokeAgentForgeConsent(remoteConsent.receiptId)
      recordActivityExportPurgeResult(remoteConsent.receiptId, AGENTFORGE_DESTINATION_ID, { completed: true })
      return res.status(202).json({ ok: true, revoked, remote })
    } catch (error: any) {
      recordActivityExportPurgeResult(remoteConsent.receiptId, AGENTFORGE_DESTINATION_ID, { completed: false, error: error?.message || 'AgentForge purge request failed.' })
      return res.status(202).json({ ok: true, revoked, remote: { purgeStatus: 'needs-retry', error: error?.message || 'AgentForge purge request failed.' } })
    }
  }
  res.json({ ok: true, revoked })
})

router.post('/events', (req, res) => {
  const { userId, workspaceId } = actor(req)
  if (listActivityExportConsents(userId, workspaceId).length === 0) return res.status(403).json({ error: 'Activity sharing is not enabled for this user and workspace.' })
  const source = req.body?.source as ActivityExportScope
  if (!ALLOWED_SCOPES.has(source)) return res.status(400).json({ error: 'Unsupported activity scope.' })
  const events = appendActivityExportEventsForActiveConsents({ source, workspaceId, userId, sessionId: typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined, subjectId: typeof req.body?.subjectId === 'string' ? req.body.subjectId : undefined, content: typeof req.body?.content === 'string' ? req.body.content : undefined, metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : undefined })
  if (events.length === 0) return res.status(400).json({ error: 'Event was rejected by consent or validation.' })
  // Do not make the activity-producing request wait on a remote receiver. The
  // worker keeps retrying, while this best-effort trigger avoids a five-minute
  // delay for newly consented deployments.
  void flushActivityExportWorker().catch(() => {})
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
