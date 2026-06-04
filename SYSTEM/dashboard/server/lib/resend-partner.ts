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

export type ResendChatContextMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ResendChatEmailRequest = {
  to: string
  subject: string
  text?: string
  mode: 'direct' | 'post-chat'
  agentPrompt?: string
  attachmentPaths?: string[]
  guidance?: string
}

export type ResendEmailAttachment = {
  filename: string
  content: string
}

type FetchLike = typeof fetch

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails'
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig
const EXACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ATTACHMENT_PATH_RE = /\b(?:AGENTS|WORKFLOWS|SYSTEM|ORG|DOCS|SKILLS)\/[^\s,;:()]+/ig
const ATTACHMENT_FILE_RE = /\b([A-Z0-9][A-Z0-9._-]*\.(?:md|txt|json|csv|pdf|png|jpg|jpeg|gif|docx|xlsx|pptx|html))\b/ig
const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024
const RESEND_AGENT_SEND_COOLDOWN_MS = 30_000
const RESEND_AGENT_SEND_HOURLY_LIMIT = 20
const resendSendHistory = new Map<string, number[]>()

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

function extractAttachmentPaths(message: string): string[] {
  const explicit = message.match(ATTACHMENT_PATH_RE) || []
  const bareFiles = [...message.matchAll(ATTACHMENT_FILE_RE)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => !!value && !EXACT_EMAIL_RE.test(value))
  return [...new Set([...explicit, ...bareFiles].map((value) => value.trim().replace(/[.]+$/, '')))]
}

export function hasResendEmailCapability(skillIds: string[]): boolean {
  return skillIds.some((skillId) => ['clawmax-resend', 'resend', 'resend-cli', 'react-email'].includes(String(skillId || '').trim()))
}

function latestAssistantMessage(contextMessages: ResendChatContextMessage[]): string | undefined {
  return [...contextMessages]
    .reverse()
    .find((entry) => entry?.role === 'assistant' && trim(entry.content))?.content
}

function inferEmailSubject(message: string, agentId: string): string {
  return /\bstatus\b/i.test(message) ? `${agentId} status` : `Message from ${agentId}`
}

function shouldSendAfterFreshAgentReply(message: string, previousAssistant?: string): boolean {
  if (previousAssistant) return false
  if (/\b(then|after|once|when)\b/i.test(message)) return true
  return /\b(who are you|give me|what is|what's|write|draft|summarize|analyze|review|look up|find|create|generate|explain|tell me|prepare)\b/i.test(message)
}

function stripEmailDeliveryInstruction(message: string): string {
  const withoutRecipient = message.replace(EMAIL_RE, '').trim()
  const withoutAttachments = withoutRecipient.replace(ATTACHMENT_PATH_RE, '').trim()
  const patterns = [
    /\b(?:and|then|please)?\s*send(?:ing)?(?:\s+the)?(?:\s+(?:result|response|status|summary|report|draft|findings|plan))?\s+(?:(?:as|in|via)\s+)?an?\s+email\b.*$/i,
    /\b(?:and|then|please)?\s*email(?:\s+the)?(?:\s+(?:result|response|status|summary|report|draft|findings|plan))?\b.*$/i,
    /\b(?:and|then|please)?\s*mail(?:\s+the)?(?:\s+(?:result|response|status|summary|report|draft|findings|plan))?\b.*$/i,
    /\b(?:and|then|please)?\s*(?:send|email|mail)\b.*$/i,
  ]
  const stripped = patterns.reduce((current, pattern) => current.replace(pattern, '').trim(), withoutAttachments)
  return stripped
    .replace(/[,\s]+$/, '')
    .replace(/\b(?:and|then)\s*$/i, '')
    .replace(/[,\s]+$/, '')
    .trim()
}

export function buildResendChatEmailRequest(
  message: string,
  contextMessages: ResendChatContextMessage[] = [],
  agentId = 'agent',
): ResendChatEmailRequest | null {
  const normalized = trim(message)
  if (!normalized) return null
  const attachmentPaths = extractAttachmentPaths(normalized)
  const hasSendVerb = /\b(send|email|mail)\b/i.test(normalized)
  const hasEmailVerb = /\b(email|mail)\b/i.test(normalized)
  if (!hasSendVerb) return null

  const to = extractRecipientEmail(normalized)
  if (!to) return null
  if (!hasEmailVerb && attachmentPaths.length === 0) return null

  const previousAssistant = latestAssistantMessage(contextMessages)
  const refersToPrevious = /\b(that|this|previous|last|status|result|response|summary|report|draft|findings|plan)\b/i.test(normalized)
  if (refersToPrevious && shouldSendAfterFreshAgentReply(normalized, previousAssistant)) {
    const agentPrompt = stripEmailDeliveryInstruction(normalized)
    return {
      to,
      subject: inferEmailSubject(normalized, agentId),
      mode: 'post-chat',
      agentPrompt: agentPrompt || normalized,
      attachmentPaths,
    }
  }
  const text = stripMarkdown(
    refersToPrevious && previousAssistant
      ? previousAssistant
      : normalized
        .replace(EMAIL_RE, '')
        .replace(ATTACHMENT_PATH_RE, '')
        .replace(/\b(send|email|mail|attach|attached|attachment|to|that|this|please)\b/ig, ' ')
        .replace(/\s+/g, ' ')
        .trim()
  )

  if (!text) {
    if (shouldSendAfterFreshAgentReply(normalized, previousAssistant)) {
      const agentPrompt = stripEmailDeliveryInstruction(normalized)
      return {
        to,
        subject: inferEmailSubject(normalized, agentId),
        mode: 'post-chat',
        agentPrompt: agentPrompt || normalized,
        attachmentPaths,
      }
    }
    return null
  }

  return {
    to,
    subject: inferEmailSubject(normalized, agentId),
    text,
    mode: 'direct',
    attachmentPaths,
  }
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
    const relativePath = requestedPath.trim().replace(/^\/+/, '')
    let absolutePath = ''
    if (relativePath.includes('/')) {
      absolutePath = path.resolve(workspaceRoot, relativePath)
    } else {
      const searchRoots = [...preferredRoots, workspaceRoot]
      const candidatePaths = searchRoots
        .filter(Boolean)
        .map((root) => path.join(root, relativePath))
        .filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      if (candidatePaths.length > 0) {
        absolutePath = candidatePaths[0]
      } else {
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
