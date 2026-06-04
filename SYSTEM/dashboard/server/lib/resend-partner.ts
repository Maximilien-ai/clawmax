import { readWorkspaceIntegrationSecrets } from './workspace-integrations'

export type ResendTestEmailInput = {
  apiKey?: string
  from?: string
  to?: string
  subject?: string
  text?: string
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
}

type FetchLike = typeof fetch

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails'
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig
const EXACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function trim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getDefaultResendFrom(): string {
  return (
    process.env.RESEND_DEFAULT_FROM ||
    process.env.OTP_FROM_EMAIL ||
    process.env.SIGNUP_FROM_EMAIL ||
    'onboarding@resend.dev'
  ).trim()
}

export function getWorkspaceResendApiKey(): string | undefined {
  const apiKey = readWorkspaceIntegrationSecrets().partners?.resend?.apiKey?.trim()
  return apiKey || process.env.RESEND_API_KEY?.trim() || undefined
}

export function resolveResendTestRecipient(input: {
  requestedTo?: string | null
  actorEmail?: string | null
  actorLogin?: string | null
}): string {
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
  return skillIds.some((skillId) => ['resend', 'resend-cli', 'react-email'].includes(String(skillId || '').trim()))
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
  const from = trim(input.from) || getDefaultResendFrom()
  const subject = trim(input.subject) || 'ClawMax Resend test email'
  const text = trim(input.text) || 'This is a ClawMax Resend integration test email.'

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
      subject,
      text,
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
