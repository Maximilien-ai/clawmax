/**
 * Public Activity Export contract primitives.
 *
 * These helpers deliberately do not persist or deliver data. Callers must
 * provide an active, destination-bound consent receipt before creating an
 * event; the durable outbox will be added on top of this contract.
 */

import { randomUUID } from 'crypto'

export const ACTIVITY_EXPORT_VERSION = 'activity-export/v1'
export const ACTIVITY_EXPORT_EVENT_LIMIT = 256 * 1024
export const ACTIVITY_EXPORT_BATCH_LIMIT = 50

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

const SECRET_PATTERNS = [
  /\b(?:bearer\s+)?[a-z0-9_-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/gi,
  /\b(?:sk|ghp|gho|github_pat|xai|AIza)[a-z0-9_-]{8,}\b/gi,
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/gi,
  /\b(?:authorization|proxy-authorization)\s*:\s*[^\s,;]+/gi,
]

export function redactActivityText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return value
  let redacted = value
  for (const pattern of SECRET_PATTERNS) redacted = redacted.replace(pattern, '[REDACTED]')
  return redacted.length > 12000 ? `${redacted.slice(0, 12000)}… [TRUNCATED]` : redacted
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
    content: redactActivityText(input.content),
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
