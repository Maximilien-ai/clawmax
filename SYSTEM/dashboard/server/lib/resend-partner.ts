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

type FetchLike = typeof fetch

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails'

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

function summarizeResendProviderError(status: number, payload: any): string {
  const message = trim(payload?.message) || trim(payload?.error?.message) || trim(payload?.error)
  const name = trim(payload?.name) || trim(payload?.error?.name)
  const prefix = name ? `${name}: ` : ''
  return `${prefix}${message || `Resend rejected the email request with HTTP ${status}`}`
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
