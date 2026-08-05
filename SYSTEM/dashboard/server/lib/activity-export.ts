/**
 * Public Activity Export contract primitives.
 *
 * These helpers deliberately do not persist or deliver data. Callers must
 * provide an active, destination-bound consent receipt before creating an
 * event; the durable outbox will be added on top of this contract.
 */

import { createHash, randomUUID } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const ACTIVITY_EXPORT_VERSION = 'activity-export/v1'
export const ACTIVITY_EXPORT_EVENT_LIMIT = 256 * 1024
export const ACTIVITY_EXPORT_BATCH_LIMIT = 50

export function getOpaqueActivityWorkspaceId(workspaceId: string): string {
  return `ws_${createHash('sha256').update(String(workspaceId)).digest('hex').slice(0, 24)}`
}

export type ActivityExportScope = 'agent-chat' | 'group-chat' | 'community-chat' | 'workflow' | 'builder'

export interface ActivityExportConsent {
  receiptId: string
  version: typeof ACTIVITY_EXPORT_VERSION
  destinationId: string
  workspaceId: string
  userId: string
  scopes: ActivityExportScope[]
  active: boolean
  consentedAt: string
  expiresAt?: string
}

export interface ActivityExportEventInput {
  eventId?: string
  source: ActivityExportScope
  occurredAt?: string
  workspaceId: string
  userId: string
  sessionId?: string
  subjectId?: string
  content?: string
  metadata?: Record<string, string | number | boolean | null>
}

export interface ActivityExportEvent extends ActivityExportEventInput {
  eventId: string
  version: typeof ACTIVITY_EXPORT_VERSION
  destinationId: string
  consentReceiptId: string
  occurredAt: string
  content?: string
}

interface ActivityExportState {
  consents: Record<string, ActivityExportConsent>
  outbox: ActivityExportQueueEntry[]
  received: Record<string, ActivityExportEvent>
}

export interface ActivityExportQueueEntry extends ActivityExportEvent {
  attempts: number
  lastError?: string
  deliveredAt?: string
}

export function getActivityExportStatePath(): string {
  return process.env.CLAWMAX_ACTIVITY_EXPORT_STATE_PATH?.trim() || path.join(os.homedir(), '.openclaw', 'activity-export.json')
}

function readState(): ActivityExportState {
  try {
    const parsed = JSON.parse(fs.readFileSync(getActivityExportStatePath(), 'utf8'))
    return {
      consents: parsed?.consents && typeof parsed.consents === 'object' ? parsed.consents : {},
      outbox: Array.isArray(parsed?.outbox) ? parsed.outbox.map((entry: ActivityExportEvent & Partial<ActivityExportQueueEntry>) => ({
        ...entry,
        attempts: typeof entry.attempts === 'number' ? entry.attempts : 0,
      })) : [],
      received: parsed?.received && typeof parsed.received === 'object' ? parsed.received : {},
    }
  } catch {
    return { consents: {}, outbox: [], received: {} }
  }
}

function writeState(state: ActivityExportState): void {
  const filePath = getActivityExportStatePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
  try { fs.chmodSync(filePath, 0o600) } catch {}
}

export function getActivityExportConsent(userId: string, workspaceId: string): ActivityExportConsent | null {
  return listActivityExportConsents(userId, workspaceId)[0] || null
}

export function listActivityExportConsents(userId: string, workspaceId: string): ActivityExportConsent[] {
  return Object.values(readState().consents).filter((consent) => consent.userId === userId && consent.workspaceId === workspaceId && consent.active)
}

export function saveActivityExportConsent(consent: ActivityExportConsent): ActivityExportConsent {
  const state = readState()
  state.consents[consent.receiptId] = consent
  writeState(state)
  return consent
}

export function revokeActivityExportConsent(userId: string, workspaceId: string): boolean {
  const state = readState()
  const receipts = Object.values(state.consents).filter((entry) => entry.userId === userId && entry.workspaceId === workspaceId && entry.active)
  if (receipts.length === 0) return false
  const receiptIds = new Set(receipts.map((consent) => consent.receiptId))
  receipts.forEach((consent) => { consent.active = false })
  state.outbox = state.outbox.filter((event) => !receiptIds.has(event.consentReceiptId))
  writeState(state)
  return true
}

export function revokeActivityExportDestinationConsent(userId: string, workspaceId: string, destinationId: string): boolean {
  const state = readState()
  const receipts = Object.values(state.consents).filter((entry) => entry.userId === userId && entry.workspaceId === workspaceId && entry.destinationId === destinationId && entry.active)
  if (receipts.length === 0) return false
  const receiptIds = new Set(receipts.map((consent) => consent.receiptId))
  receipts.forEach((consent) => { consent.active = false })
  state.outbox = state.outbox.filter((event) => !receiptIds.has(event.consentReceiptId))
  writeState(state)
  return true
}

export function appendActivityExportEvent(input: ActivityExportEventInput, consent: ActivityExportConsent): ActivityExportEvent | null {
  const event = createActivityExportEvent(input, consent)
  if (!event) return null
  const state = readState()
  if (state.outbox.some((entry) => entry.eventId === event.eventId)) return null
  state.outbox.push({ ...event, attempts: 0 })
  writeState(state)
  return event
}

export function appendActivityExportEventsForActiveConsents(input: ActivityExportEventInput): ActivityExportEvent[] {
  return listActivityExportConsents(input.userId, input.workspaceId)
    .map((consent) => appendActivityExportEvent(input, consent))
    .filter((event): event is ActivityExportEvent => event !== null)
}

export function listActivityExportOutbox(userId: string, workspaceId: string): ActivityExportEvent[] {
  const opaqueWorkspaceId = getOpaqueActivityWorkspaceId(workspaceId)
  return readState().outbox.filter((event) => event.userId === userId && event.workspaceId === opaqueWorkspaceId)
}

export function listAllActivityExportOutbox(): ActivityExportEvent[] {
  return readState().outbox
}

export interface ActivityExportReceiveResult {
  accepted: number
  duplicates: number
}

/** Store an authenticated receiver batch idempotently for the local reference destination. */
export function receiveActivityExportBatch(events: ActivityExportEvent[]): ActivityExportReceiveResult {
  const validation = validateActivityExportBatch(events)
  if (!validation.ok) throw new Error(validation.error)
  const state = readState()
  let accepted = 0
  let duplicates = 0
  for (const event of events) {
    if (state.received[event.eventId]) duplicates += 1
    else {
      state.received[event.eventId] = event
      accepted += 1
    }
  }
  writeState(state)
  return { accepted, duplicates }
}

export function listReceivedActivityExportEvents(userId: string, workspaceId: string): ActivityExportEvent[] {
  const opaqueWorkspaceId = getOpaqueActivityWorkspaceId(workspaceId)
  return Object.values(readState().received).filter((event) => event.userId === userId && event.workspaceId === opaqueWorkspaceId)
}

export interface ActivityExportFlushResult {
  attempted: number
  delivered: number
  remaining: number
  error?: string
}

/** Deliver at most one bounded batch and retain failed entries for retry. */
export async function flushActivityExportOutbox(
  options: {
    userId?: string
    workspaceId?: string
    destinationId?: string
    maxEvents?: number
    endpoint?: string
    token?: string
    fetchImpl?: typeof fetch
  } = {},
): Promise<ActivityExportFlushResult> {
  const state = readState()
  const maxEvents = Math.max(1, Math.min(options.maxEvents || ACTIVITY_EXPORT_BATCH_LIMIT, ACTIVITY_EXPORT_BATCH_LIMIT))
  const candidates = state.outbox.filter((entry) =>
    !entry.deliveredAt &&
    (!options.userId || entry.userId === options.userId) &&
    (!options.workspaceId || entry.workspaceId === getOpaqueActivityWorkspaceId(options.workspaceId)) &&
    (!options.destinationId || entry.destinationId === options.destinationId),
  ).slice(0, maxEvents)
  if (candidates.length === 0) return { attempted: 0, delivered: 0, remaining: state.outbox.filter((entry) => !entry.deliveredAt).length }

  const result = await deliverActivityExportBatch(candidates, options)
  if (result.delivered) {
    const deliveredIds = new Set(candidates.map((entry) => entry.eventId))
    state.outbox = state.outbox.filter((entry) => !deliveredIds.has(entry.eventId))
    writeState(state)
    return { attempted: candidates.length, delivered: candidates.length, remaining: state.outbox.length }
  }

  const failedIds = new Set(candidates.map((entry) => entry.eventId))
  state.outbox = state.outbox.map((entry) => failedIds.has(entry.eventId)
    ? { ...entry, attempts: entry.attempts + 1, lastError: result.error || `HTTP ${result.status || 'unknown'}` }
    : entry)
  writeState(state)
  return {
    attempted: candidates.length,
    delivered: 0,
    remaining: state.outbox.filter((entry) => !entry.deliveredAt).length,
    error: result.error || `HTTP ${result.status || 'unknown'}`,
  }
}

const SECRET_PATTERNS = [
  /\b(?:bearer\s+)?[a-z0-9_-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:sk|ghp|gho|github_pat|xai|AIza)[a-z0-9_-]{8,}\b/gi,
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/gi,
  /\b(?:authorization|proxy-authorization)\s*:\s*[^\s,;]+/gi,
]

const DIRECT_PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /(?<!\w)\+?\d[\d .()/-]{7,}\d(?!\w)/g,
]

export function redactActivityText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return value
  let redacted = value
  for (const pattern of SECRET_PATTERNS) redacted = redacted.replace(pattern, '[REDACTED]')
  for (const pattern of DIRECT_PII_PATTERNS) redacted = redacted.replace(pattern, '[REDACTED]')
  return redacted.length > 12000 ? `${redacted.slice(0, 12000)}… [TRUNCATED]` : redacted
}

function redactActivityMetadata(metadata: ActivityExportEventInput['metadata']): ActivityExportEventInput['metadata'] {
  if (!metadata) return metadata
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [key, typeof value === 'string' ? (redactActivityText(value) || '') : value])) as ActivityExportEventInput['metadata']
}

function hasActiveConsent(consent: ActivityExportConsent, input: ActivityExportEventInput): boolean {
  if (!consent.active || consent.version !== ACTIVITY_EXPORT_VERSION) return false
  if (consent.destinationId.length === 0 || consent.receiptId.length === 0) return false
  if (consent.workspaceId !== input.workspaceId || consent.userId !== input.userId) return false
  if (!consent.scopes.includes(input.source)) return false
  if (consent.expiresAt && Date.parse(consent.expiresAt) <= Date.now()) return false
  return true
}

export function createActivityExportEvent(input: ActivityExportEventInput, consent: ActivityExportConsent): ActivityExportEvent | null {
  if (!hasActiveConsent(consent, input)) return null
  const occurredAt = input.occurredAt || new Date().toISOString()
  if (Number.isNaN(Date.parse(occurredAt))) return null
  return {
    ...input,
    eventId: input.eventId || `activity_${randomUUID()}`,
    version: ACTIVITY_EXPORT_VERSION,
    destinationId: consent.destinationId,
    consentReceiptId: consent.receiptId,
    occurredAt,
    workspaceId: getOpaqueActivityWorkspaceId(input.workspaceId),
    content: redactActivityText(input.content),
    metadata: redactActivityMetadata({
      ...(input.metadata || {}),
      ...(process.env.DASHBOARD_DEPLOYMENT_KIND ? { deploymentKind: process.env.DASHBOARD_DEPLOYMENT_KIND } : {}),
      ...(process.env.CLAWMAX_INSTANCE_KEY ? { instanceKey: process.env.CLAWMAX_INSTANCE_KEY } : {}),
    }),
  }
}

export function validateActivityExportBatch(events: ActivityExportEvent[]): { ok: true } | { ok: false; error: string } {
  if (!Array.isArray(events) || events.length === 0) return { ok: false, error: 'At least one activity event is required.' }
  if (events.length > ACTIVITY_EXPORT_BATCH_LIMIT) return { ok: false, error: `A batch cannot contain more than ${ACTIVITY_EXPORT_BATCH_LIMIT} events.` }
  const ids = new Set<string>()
  for (const event of events) {
    if (event.version !== ACTIVITY_EXPORT_VERSION || !event.eventId || !event.destinationId || !event.consentReceiptId) {
      return { ok: false, error: 'Each activity event must include its version, eventId, destination, and consent receipt.' }
    }
    if (ids.has(event.eventId)) return { ok: false, error: `Duplicate eventId: ${event.eventId}` }
    ids.add(event.eventId)
    if (JSON.stringify(event).length > ACTIVITY_EXPORT_EVENT_LIMIT) return { ok: false, error: `Event ${event.eventId} exceeds the size limit.` }
  }
  return { ok: true }
}

export interface ActivityExportDeliveryResult {
  delivered: boolean
  status?: number
  error?: string
}

export async function deliverActivityExportBatch(
  events: ActivityExportEvent[],
  options: { endpoint?: string; token?: string; fetchImpl?: typeof fetch } = {},
): Promise<ActivityExportDeliveryResult> {
  const validation = validateActivityExportBatch(events)
  if (!validation.ok) return { delivered: false, error: validation.error }
  const endpoint = (options.endpoint || process.env.CLAWMAX_ACTIVITY_EXPORT_ENDPOINT || '').trim()
  const token = (options.token || process.env.CLAWMAX_ACTIVITY_EXPORT_TOKEN || '').trim()
  if (!endpoint || !token) return { delivered: false, error: 'Activity Export delivery is not configured.' }
  const batchId = `batch_${events[0].eventId}_${events[events.length - 1].eventId}`
  try {
    const response = await (options.fetchImpl || fetch)(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': batchId,
        'X-ClawMax-Schema-Version': ACTIVITY_EXPORT_VERSION,
      },
      body: JSON.stringify({ batchId, destinationId: events[0].destinationId, sentAt: new Date().toISOString(), events }),
    })
    if (!response.ok) return { delivered: false, status: response.status, error: `Reference receiver rejected the batch (${response.status}).` }
    return { delivered: true, status: response.status }
  } catch (error: any) {
    return { delivered: false, error: error?.message || 'Activity Export delivery failed.' }
  }
}
