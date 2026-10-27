import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { sanitizeReviewLogLine } from './review-redaction'
import { getWorkspaceResendApiKey, getWorkspaceResendSenderPolicy, sendResendTestEmail } from './resend-partner'

export type ReviewSubmission = {
  id: string; release: string; recipient: string; reviewer: string; createdAt: string;
  status: 'queued' | 'sending' | 'accepted' | 'failed' | 'unknown';
  report: string; error?: string; providerId?: string;
}
const active = new Set<string>()
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const redact = (text: string) => text.split('\n').map(sanitizeReviewLogLine).join('\n')
const directory = (workspace: string) => path.join(workspace, 'SYSTEM', 'review-submissions')
function file(workspace: string, id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid submission ID')
  return path.join(directory(workspace), `${id}.json`)
}
function save(workspace: string, value: ReviewSubmission) {
  fs.mkdirSync(directory(workspace), { recursive: true, mode: 0o700 })
  const target = file(workspace, value.id)
  const temporary = `${target}.${randomUUID()}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 })
  fs.renameSync(temporary, target)
}
export function getReviewRecipient(workspace: string): string {
  const configured = process.env.CLAWMAX_REVIEW_RECIPIENT?.trim()
  if (configured && emailPattern.test(configured)) return configured
  const settings = path.join(workspace, 'SYSTEM', 'review-settings.json')
  if (!fs.existsSync(settings)) return ''
  try {
    const recipient = JSON.parse(fs.readFileSync(settings, 'utf8')).recipient
    return typeof recipient === 'string' && emailPattern.test(recipient) ? recipient : ''
  } catch { return '' }
}

export function readReviewSubmission(workspace: string, id: string): ReviewSubmission {
  const value = JSON.parse(fs.readFileSync(file(workspace, id), 'utf8')) as ReviewSubmission
  if (!active.has(file(workspace, id)) && (value.status === 'queued' || value.status === 'sending')) {
    value.status = value.status === 'sending' ? 'unknown' : 'failed'
    value.error = value.status === 'unknown' ? 'Delivery was interrupted. It may have been sent; check the receiving mailbox before submitting again.' : 'Delivery stopped before sending. Submit again when ready.'
    save(workspace, value)
  }
  return value
}
export function listReviewSubmissions(workspace: string): ReviewSubmission[] {
  if (!fs.existsSync(directory(workspace))) return []
  return fs.readdirSync(directory(workspace)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name)).map(name => readReviewSubmission(workspace, name.slice(0, -5))).sort((a,b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20)
}
export function queueReviewSubmission(workspace: string, input: any, options: {
  apiKey?: string; send?: typeof sendResendTestEmail; schedule?: (job: () => void) => void
} = {}): ReviewSubmission {
  if (input?.consent !== true) throw new Error('Confirm the recipient and report before sending.')
  if (typeof input.recipient !== 'string' || !emailPattern.test(input.recipient) || input.recipient.length > 254) throw new Error('Enter a valid recipient email.')
  if (typeof input.reviewer !== 'string' || !input.reviewer.trim() || input.reviewer.length > 200) throw new Error('Reviewer name is required.')
  if (typeof input.release !== 'string' || !input.release.trim() || input.release.length > 100) throw new Error('Release is required.')
  if (typeof input.report !== 'string' || !input.report.trim() || Buffer.byteLength(input.report) > 250000) throw new Error('Review report is empty or too large.')
  const apiKey = options.apiKey || getWorkspaceResendApiKey()
  if (!apiKey) throw new Error('Email is not configured. Configure Resend in Partners, or download the report and share it manually.')
  const sender = getWorkspaceResendSenderPolicy()
  const id = typeof input.id === 'string' ? input.id : randomUUID()
  const target = file(workspace, id)
  if (fs.existsSync(target)) {
    const existing = readReviewSubmission(workspace, id)
    if (existing.recipient !== input.recipient || existing.report !== redact(input.report) || existing.release !== redact(input.release.trim()) || existing.reviewer !== redact(input.reviewer.trim())) throw new Error('This submission ID belongs to a different report. Prepare a new email.')
    return existing
  }
  const value: ReviewSubmission = { id, recipient: input.recipient, reviewer: redact(input.reviewer.trim()), release: redact(input.release.trim()), report: redact(input.report), createdAt: new Date().toISOString(), status: 'queued' }
  save(workspace, value)
  active.add(target)
  const schedule = options.schedule || (job => setImmediate(job))
  schedule(() => {
    void (async () => {
      try {
        value.status = 'sending'; save(workspace, value)
        const result = await (options.send || sendResendTestEmail)({ apiKey, from: sender.from, replyTo: sender.replyTo, to: value.recipient, subject: `ClawMax ${value.release} review — ${value.reviewer}`, text: value.report, attachments: [{ filename: 'clawmax-review.md', content: Buffer.from(value.report).toString('base64') }] })
        value.status = 'accepted'; value.providerId = result.id
      } catch {
        value.status = 'unknown'
        value.error = 'The email provider did not confirm acceptance. Check the receiving mailbox before submitting again; the report remains available to download.'
      } finally {
        try { save(workspace, value) } catch { console.error('[Review] Could not persist submission status; delivery may be uncertain.') }
        active.delete(target)
      }
    })()
  })
  return value
}
