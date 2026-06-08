import fs from 'fs'
import path from 'path'
import {
  getWorkspaceResendApiKey,
  renderClawmaxAgentEmailHtml,
  resolveWorkspaceEmailAttachments,
  sendResendTestEmail,
} from './resend-partner'

export type ClawmaxResendSendOptions = {
  to: string
  subject: string
  body: string
  attachmentPaths: string[]
  agentId: string
  workspaceRoot: string
  workspaceLabel: string
}

type SendResult = Awaited<ReturnType<typeof sendResendTestEmail>>

export function shouldReadClawmaxResendStdin(argv: string[], stdinIsTty?: boolean): boolean {
  if (stdinIsTty) return false
  return !argv.some((arg) => arg === '--body' || arg === '--body-file' || arg === '--help' || arg === '-h')
}

export function parseClawmaxResendSendArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  stdinBody = '',
): ClawmaxResendSendOptions {
  let to = ''
  let subject = ''
  let body = ''
  let bodyFile = ''
  let agentId = String(env.CLAWMAX_AGENT_ID || '').trim()
  let workspaceRoot = String(env.OPENCLAW_WORKSPACE || process.cwd()).trim() || process.cwd()
  let workspaceLabel = ''
  const attachmentPaths: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[i + 1]
      if (!value) throw new Error(`Missing value for ${arg}`)
      i++
      return value
    }

    switch (arg) {
      case '--to':
        to = next().trim()
        break
      case '--subject':
        subject = next().trim()
        break
      case '--body':
        body = next()
        break
      case '--body-file':
        bodyFile = next()
        break
      case '--attach':
        attachmentPaths.push(next().trim())
        break
      case '--agent-id':
        agentId = next().trim()
        break
      case '--workspace-root':
        workspaceRoot = next().trim()
        break
      case '--workspace-label':
        workspaceLabel = next().trim()
        break
      case '--help':
      case '-h':
        throw new Error('HELP')
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (bodyFile) {
    body = fs.readFileSync(path.resolve(bodyFile), 'utf-8')
  } else if (!body.trim() && stdinBody.trim()) {
    body = stdinBody
  }

  if (!to) throw new Error('Missing required --to')
  if (!subject) throw new Error('Missing required --subject')
  if (!body.trim()) throw new Error('Missing email body. Provide --body, --body-file, or stdin.')

  workspaceRoot = path.resolve(workspaceRoot)
  if (!agentId) {
    agentId = 'agent'
  }
  if (!workspaceLabel) {
    workspaceLabel = path.basename(workspaceRoot) || 'workspace'
  }

  return {
    to,
    subject,
    body: body.trim(),
    attachmentPaths: attachmentPaths.filter(Boolean),
    agentId,
    workspaceRoot,
    workspaceLabel,
  }
}

export async function executeClawmaxResendSend(
  options: ClawmaxResendSendOptions,
  deps?: {
    sendEmail?: typeof sendResendTestEmail
    resolveAttachments?: typeof resolveWorkspaceEmailAttachments
    getApiKey?: typeof getWorkspaceResendApiKey
  },
): Promise<{ message: string; id?: string }> {
  const sendEmail = deps?.sendEmail || sendResendTestEmail
  const resolveAttachments = deps?.resolveAttachments || resolveWorkspaceEmailAttachments
  const getApiKey = deps?.getApiKey || getWorkspaceResendApiKey

  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured for this workspace/runtime.')
  }

  const attachments = resolveAttachments(options.workspaceRoot, options.attachmentPaths)
  const result: SendResult = await sendEmail({
    apiKey,
    agentId: options.agentId,
    workspaceLabel: options.workspaceLabel,
    to: options.to,
    subject: options.subject,
    text: options.body,
    html: renderClawmaxAgentEmailHtml({
      subject: options.subject,
      text: options.body,
      agentId: options.agentId,
      workspaceLabel: options.workspaceLabel,
    }),
    attachments,
  })

  return {
    id: result.id,
    message: result.id
      ? `Email sent to ${options.to} via Resend. Provider id: ${result.id}`
      : `Email sent to ${options.to} via Resend.`,
  }
}
