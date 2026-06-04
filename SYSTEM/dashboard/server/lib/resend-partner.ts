import { readWorkspaceIntegrationConfig, readWorkspaceIntegrationSecrets } from './workspace-integrations'

export type ResendTestEmailInput = {
  apiKey?: string
  from?: string
  replyTo?: string
  to?: string
  subject?: string
  text?: string
  html?: string
}

export type ResendTestEmailResult = {
  id?: string
  message: string
}

export type ResendChatContextMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ResendChatEmailRequest = {
  to: string
  subject: string
  text: string
  guidance?: string
}

type FetchLike = typeof fetch

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails'
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig
const EXACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type ResendSenderPolicy = {
  from: string
  fromEmail: string
  fromName?: string
  replyTo?: string
}

function formatFromAddress(email: string, name?: string): string {
  const trimmedEmail = trim(email)
  const trimmedName = trim(name)
  if (!trimmedName) return trimmedEmail
  return `${trimmedName} <${trimmedEmail}>`
}

export function getWorkspaceResendSenderPolicy(): ResendSenderPolicy {
  const partnerConfig = readWorkspaceIntegrationConfig().partners?.resend || {}
  const fromEmail = trim(partnerConfig.fromEmail)
    || trim(process.env.RESEND_DEFAULT_FROM)
    || trim(process.env.OTP_FROM_EMAIL)
    || trim(process.env.SIGNUP_FROM_EMAIL)
    || 'agent@send.clawmax.ai'
  const fromName = trim(partnerConfig.fromName)
    || trim(process.env.RESEND_DEFAULT_FROM_NAME)
    || 'ClawMax Agent'
  const replyTo = trim(partnerConfig.replyTo)
    || trim(process.env.RESEND_DEFAULT_REPLY_TO)
    || ''

  return {
    from: formatFromAddress(fromEmail, fromName),
    fromEmail,
    fromName: fromName || undefined,
    replyTo: replyTo || undefined,
  }
}

export function getWorkspaceResendApiKey(): string | undefined {
  const apiKey = readWorkspaceIntegrationSecrets().partners?.resend?.apiKey?.trim()
  return apiKey || process.env.RESEND_API_KEY?.trim() || undefined
}

export function renderClawmaxAgentEmailHtml(input: {
  subject: string
  text: string
  agentId?: string
  workspaceLabel?: string
}): string {
  const subject = escapeHtml(trim(input.subject) || 'ClawMax email')
  const agentId = escapeHtml(trim(input.agentId) || 'agent')
  const workspaceLabel = escapeHtml(trim(input.workspaceLabel) || 'ClawMax workspace')
  const paragraphs = (trim(input.text) || '')
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p style="margin:0 0 16px 0;line-height:1.65;color:#0f172a;font-size:15px;">${escapeHtml(chunk).replace(/\n/g, '<br/>')}</p>`)
    .join('')

  return [
    '<!doctype html>',
    '<html>',
    '<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#0f172a;">',
    '<div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,0.08);">',
    '<div style="padding:24px 28px;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#ffffff;">',
    '<div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;opacity:0.75;margin-bottom:8px;">ClawMax Agent Email</div>',
    `<div style="font-size:28px;font-weight:700;line-height:1.2;margin:0 0 10px 0;">${subject}</div>`,
    `<div style="font-size:14px;opacity:0.85;">Sent by <strong>${agentId}</strong> from <strong>${workspaceLabel}</strong></div>`,
    '</div>',
    '<div style="padding:28px;">',
    paragraphs || '<p style="margin:0;color:#0f172a;font-size:15px;line-height:1.65;">No message body was provided.</p>',
    '</div>',
    '<div style="padding:18px 28px;border-top:1px solid #e5e7eb;background:#f8fafc;color:#475569;font-size:12px;line-height:1.6;">',
    'This email was sent by a ClawMax agent through the configured Resend bridge.',
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ].join('')
}

export function resolveResendTestRecipient(input: {
  requestedTo?: string | null
  actorEmail?: string | null
  actorLogin?: string | null
  allowCustomRecipient?: boolean
}): string {
  if (input.allowCustomRecipient) {
    return trim(input.requestedTo)
  }

  const actorEmail = trim(input.actorEmail)
  if (EXACT_EMAIL_RE.test(actorEmail)) return actorEmail

  const actorLogin = trim(input.actorLogin)
  if (EXACT_EMAIL_RE.test(actorLogin)) return actorLogin

  return trim(input.requestedTo)
}

function summarizeResendProviderError(status: number, payload: any): string {
  const message = trim(payload?.message) || trim(payload?.error?.message) || trim(payload?.error)
  const name = trim(payload?.name) || trim(payload?.error?.name)
  const prefix = name ? `${name}: ` : ''
  return `${prefix}${message || `Resend rejected the email request with HTTP ${status}`}`
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/<([^>\s]+@[^>\s]+)>/g, '$1')
    .trim()
}

function extractRecipientEmail(message: string): string | undefined {
  const matches = message.match(EMAIL_RE) || []
  return matches[0]?.trim()
}

export function hasResendEmailCapability(skillIds: string[]): boolean {
  return skillIds.some((skillId) => ['clawmax-resend', 'resend', 'resend-cli', 'react-email'].includes(String(skillId || '').trim()))
}

function latestAssistantMessage(contextMessages: ResendChatContextMessage[]): string | undefined {
  return [...contextMessages]
    .reverse()
    .find((entry) => entry?.role === 'assistant' && trim(entry.content))?.content
}

export function buildResendChatEmailRequest(
  message: string,
  contextMessages: ResendChatContextMessage[] = [],
  agentId = 'agent',
): ResendChatEmailRequest | null {
  const normalized = trim(message)
  if (!normalized) return null
  if (!/\b(send|email|mail)\b/i.test(normalized)) return null
  if (!/\b(email|mail)\b/i.test(normalized)) return null

  const to = extractRecipientEmail(normalized)
  if (!to) return null

  const previousAssistant = latestAssistantMessage(contextMessages)
  const refersToPrevious = /\b(that|this|previous|last|status)\b/i.test(normalized)
  const asksForFreshStatus = /\b(who are you|give me a status|what is your status|current status)\b/i.test(normalized)
  if (refersToPrevious && asksForFreshStatus && !previousAssistant) {
    return {
      to,
      subject: `${agentId} status`,
      text: '',
      guidance: 'Ask the agent for status first, then send a second message like "send that status in an email to you@example.com". Direct Resend email uses the latest completed assistant reply as the email body.',
    }
  }
  const text = stripMarkdown(
    refersToPrevious && previousAssistant
      ? previousAssistant
      : normalized.replace(EMAIL_RE, '').replace(/\b(send|email|mail|to|that|this|please)\b/ig, ' ').replace(/\s+/g, ' ').trim()
  )

  if (!text) return null

  return {
    to,
    subject: /\bstatus\b/i.test(normalized) ? `${agentId} status` : `Message from ${agentId}`,
    text,
  }
}

async function parseResendResponse(response: Response): Promise<any> {
  const text = await response.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.trim() }
  }
}

export async function sendResendTestEmail(
  input: ResendTestEmailInput,
  fetchImpl: FetchLike = fetch,
): Promise<ResendTestEmailResult> {
  const apiKey = trim(input.apiKey)
  const to = trim(input.to)
  const senderPolicy = getWorkspaceResendSenderPolicy()
  const from = trim(input.from) || senderPolicy.from
  const replyTo = trim(input.replyTo) || senderPolicy.replyTo
  const subject = trim(input.subject) || 'ClawMax Resend test email'
  const text = trim(input.text) || 'This is a ClawMax Resend integration test email.'
  const html = trim(input.html)

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured for this workspace.')
  }
  if (!to) {
    throw new Error('Recipient email is required.')
  }
  if (!from) {
    throw new Error('Sender email is required.')
  }

  const response = await fetchImpl(RESEND_EMAILS_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  })

  const payload = await parseResendResponse(response)
  if (!response.ok) {
    throw new Error(summarizeResendProviderError(response.status, payload))
  }

  return {
    id: trim(payload?.id) || trim(payload?.data?.id) || undefined,
    message: 'Resend accepted the test email.',
  }
}
