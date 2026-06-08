import fs from 'fs'
import path from 'path'
import { readWorkspaceIntegrationConfig, readWorkspaceIntegrationSecrets } from './workspace-integrations'

export type ResendTestEmailInput = {
  apiKey?: string
  from?: string
  replyTo?: string
  to?: string
  subject?: string
  text?: string
  html?: string
  attachments?: ResendEmailAttachment[]
  agentId?: string
  workspaceLabel?: string
}

export type ResendTestEmailResult = {
  id?: string
  message: string
}

export type ResendEmailAttachment = {
  filename: string
  content: string
}

type FetchLike = typeof fetch

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails'
const EXACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024
const RESEND_SEND_TIMEOUT_MS = 15_000
const RESEND_AGENT_SEND_COOLDOWN_MS = 30_000
const RESEND_AGENT_SEND_HOURLY_LIMIT = 20
const resendSendHistory = new Map<string, number[]>()
const AGENT_PROTECTED_ATTACHMENT_NAMES = new Set(['identity.md', 'soul.md', 'tools.md', 'heartbeat.md', 'user.md', 'agents.md'])

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

function renderInlineMarkdown(value: string): string {
  let html = escapeHtml(value)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.95em;background:#e2e8f0;padding:0 4px;border-radius:4px;">$1</code>')
  return html
}

function renderMarkdownEmailBlocks(text: string): string {
  const source = trim(text)
  if (!source) {
    return '<p style="margin:0;color:#0f172a;font-size:15px;line-height:1.65;">No message body was provided.</p>'
  }

  const lines = source.split('\n')
  const parts: string[] = []
  let paragraph: string[] = []
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    parts.push(`<p style="margin:0 0 16px 0;line-height:1.65;color:#0f172a;font-size:15px;">${paragraph.map((line) => renderInlineMarkdown(line)).join('<br/>')}</p>`)
    paragraph = []
  }

  const flushList = () => {
    if (listItems.length === 0) return
    const items = listItems
      .map((line) => line.replace(/^-\s+/, ''))
      .map((line) => `<li style="margin:0 0 8px 0;">${renderInlineMarkdown(line)}</li>`)
      .join('')
    parts.push(`<ul style="margin:0 0 16px 20px;padding:0;color:#0f172a;font-size:15px;line-height:1.65;">${items}</ul>`)
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trimRight()
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }

    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      parts.push(`<h3 style="margin:0 0 12px 0;color:#0f172a;font-size:18px;line-height:1.4;">${renderInlineMarkdown(headingMatch[1])}</h3>`)
      continue
    }

    if (/^-\s+/.test(trimmed)) {
      flushParagraph()
      listItems.push(trimmed)
      continue
    }

    flushList()
    paragraph.push(trimmed)
  }

  flushParagraph()
  flushList()
  return parts.join('') || '<p style="margin:0;color:#0f172a;font-size:15px;line-height:1.65;">No message body was provided.</p>'
}

type ResendSenderPolicy = {
  from: string
  fromEmail: string
  fromName?: string
  replyTo?: string
}

type ParsedSenderAddress = {
  email: string
  name?: string
}

function parseSenderAddress(value: string): ParsedSenderAddress {
  const trimmed = trim(value)
  if (!trimmed) {
    return { email: '' }
  }

  const formattedMatch = trimmed.match(/^(.*?)<([^<>@\s]+@[^<>@\s]+)>$/)
  if (formattedMatch) {
    const name = trim(formattedMatch[1]).replace(/^["']|["']$/g, '')
    const email = trim(formattedMatch[2])
    return { email, name: name || undefined }
  }

  return { email: trimmed }
}

function formatFromAddress(email: string, name?: string): string {
  const trimmedEmail = trim(email)
  const trimmedName = trim(name)
  if (!trimmedName) return trimmedEmail
  return `${trimmedName} <${trimmedEmail}>`
}

function humanizeAgentId(agentId: string): string {
  return agentId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function sanitizeSenderLocalPart(agentId: string): string {
  const sanitized = agentId.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return sanitized || 'agent'
}

export function getWorkspaceResendSenderPolicy(): ResendSenderPolicy {
  const partnerConfig = readWorkspaceIntegrationConfig().partners?.resend || {}
  const configuredSender = parseSenderAddress(
    trim(partnerConfig.fromEmail)
    || trim(process.env.RESEND_DEFAULT_FROM)
    || trim(process.env.OTP_FROM_EMAIL)
    || trim(process.env.SIGNUP_FROM_EMAIL)
    || 'agent@send.clawmax.ai'
  )
  const fromEmail = configuredSender.email || 'agent@send.clawmax.ai'
  const fromName = trim(partnerConfig.fromName)
    || trim(process.env.RESEND_DEFAULT_FROM_NAME)
    || configuredSender.name
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

export function getAgentScopedResendSender(agentId: string): string {
  const senderPolicy = getWorkspaceResendSenderPolicy()
  const domain = senderPolicy.fromEmail.split('@')[1] || 'send.clawmax.ai'
  const email = `${sanitizeSenderLocalPart(agentId)}@${domain}`
  const name = humanizeAgentId(agentId) || senderPolicy.fromName || 'ClawMax Agent'
  return formatFromAddress(email, name)
}

export function resetResendSendGuardrailsForTests(): void {
  resendSendHistory.clear()
}

function enforceAgentResendGuardrails(input: { agentId?: string; workspaceLabel?: string; to: string }): void {
  const agentId = trim(input.agentId)
  if (!agentId) return

  const workspaceLabel = trim(input.workspaceLabel) || 'workspace'
  const recipient = trim(input.to).toLowerCase()
  const now = Date.now()
  const key = `${workspaceLabel}:${agentId}:${recipient}`
  const history = (resendSendHistory.get(key) || []).filter((timestamp) => now - timestamp < 60 * 60 * 1000)
  const lastSentAt = history[history.length - 1]

  if (lastSentAt && now - lastSentAt < RESEND_AGENT_SEND_COOLDOWN_MS) {
    throw new Error(`Email rate limit: ${agentId} already emailed ${recipient} recently. Wait before sending again.`)
  }
  if (history.length >= RESEND_AGENT_SEND_HOURLY_LIMIT) {
    throw new Error(`Email rate limit: ${agentId} reached the hourly send limit for ${recipient}.`)
  }

  history.push(now)
  resendSendHistory.set(key, history)
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
  const bodyHtml = renderMarkdownEmailBlocks(input.text)

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
    bodyHtml,
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

function listWorkspaceFiles(root: string): string[] {
  const results: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile()) {
        results.push(fullPath)
      }
    }
  }
  return results
}

export function resolveWorkspaceEmailAttachments(workspaceRoot: string, requestedPaths: string[] = [], preferredRoots: string[] = []): ResendEmailAttachment[] {
  return requestedPaths.map((requestedPath) => {
    const trimmedPath = requestedPath.trim()
    const relativePath = trimmedPath.replace(/^\/+/, '')
    let absolutePath = ''
    if (path.isAbsolute(trimmedPath)) {
      absolutePath = path.resolve(trimmedPath)
    } else if (relativePath.includes('/')) {
      absolutePath = path.resolve(workspaceRoot, relativePath)
    } else {
      const searchRoots = [...preferredRoots, workspaceRoot]
      const candidatePaths = searchRoots
        .filter(Boolean)
        .map((root) => path.join(root, relativePath))
        .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (candidatePaths.length > 0) {
        absolutePath = candidatePaths[0]
      } else if (!AGENT_PROTECTED_ATTACHMENT_NAMES.has(relativePath.toLowerCase())) {
        const workspaceFiles = listWorkspaceFiles(workspaceRoot)
        const basenameMatches = workspaceFiles.filter((candidate) => path.basename(candidate).toLowerCase() === relativePath.toLowerCase())
        if (basenameMatches.length === 1) {
          absolutePath = basenameMatches[0]
        } else if (basenameMatches.length > 1) {
          throw new Error(`Attachment filename is ambiguous in this workspace: ${requestedPath}`)
        }
      }
    }
    if (!absolutePath) {
      throw new Error(`Attachment file not found: ${requestedPath}`)
    }
    const normalizedRoot = path.resolve(workspaceRoot)
    if (!absolutePath.startsWith(`${normalizedRoot}${path.sep}`) && absolutePath !== normalizedRoot) {
      throw new Error(`Attachment path must stay inside the workspace: ${requestedPath}`)
    }
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      throw new Error(`Attachment file not found: ${requestedPath}`)
    }
    const stats = fs.statSync(absolutePath)
    if (stats.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment is too large to email safely: ${requestedPath}`)
    }
    return {
      filename: path.basename(absolutePath),
      content: fs.readFileSync(absolutePath).toString('base64'),
    }
  })
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
  const from = trim(input.from) || (input.agentId ? getAgentScopedResendSender(input.agentId) : senderPolicy.from)
  const replyTo = trim(input.replyTo) || senderPolicy.replyTo
  const subject = trim(input.subject) || 'ClawMax Resend test email'
  const text = trim(input.text) || 'This is a ClawMax Resend integration test email.'
  const html = trim(input.html)
  const attachments = Array.isArray(input.attachments) ? input.attachments : []

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured for this workspace.')
  }
  if (!to) {
    throw new Error('Recipient email is required.')
  }
  if (!from) {
    throw new Error('Sender email is required.')
  }

  enforceAgentResendGuardrails({
    agentId: input.agentId,
    workspaceLabel: input.workspaceLabel,
    to,
  })

  const response = await fetchImpl(RESEND_EMAILS_ENDPOINT, {
    method: 'POST',
    signal: AbortSignal.timeout(RESEND_SEND_TIMEOUT_MS),
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
      ...(attachments.length > 0 ? { attachments } : {}),
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
