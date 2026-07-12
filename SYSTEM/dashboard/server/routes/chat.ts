import { Router } from 'express'
import WebSocket from 'ws'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { getAgentGatewayConfig, getWorkspacePath, invalidateAgentStatusCache } from '../lib/workspace'
import { waitForGatewayResponsive } from '../lib/gateway-rpc'
import { getRequestDashboardInstanceId, traceAgentChat } from '../lib/opik'
import { hasWorkspaceManagedPartnerSecrets, readWorkspaceIntegrationConfig } from '../lib/workspace-integrations'
import { userExecutionEnv } from '../lib/safe-env'
import { checkBudgetBlock } from '../lib/budget'
import { normalizeChatMessage, stripBenignChatRuntimeWarnings } from '../lib/chat-normalization'
import { resolveOpenClawCliPath } from '../lib/openclaw-cli'
import { getAgentSkills, getAssignedSkillPromptNotes, getSkillById } from '../lib/skills'
import { executeClawmaxResendSend } from '../lib/clawmax-resend-command'
import {
  deriveWorkspaceRootFromAgentWorkspace,
  providerFromModel,
  readLatestAssistantUsageFromPersistedSession,
  readLatestAssistantTextFromPersistedSession,
  resolveAgentExecutionConfig,
  resolvePersistedAgentSessionId,
  runExclusiveAgentExecution,
  shouldUseExplicitBackupModelRetry,
  scopeSessionIdToModel,
  toExecutionModelOverride,
  withTemporaryAgentAuthProfiles,
} from '../lib/agent-execution'
import { getAuthenticatedSession } from '../lib/github-auth'

const router = Router()
type ChatProvider = 'openai' | 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama' | null | undefined
type ChatByokPayload = {
  openai?: string
  anthropic?: string
  gemini?: string
  ollamaBaseUrl?: string
  openaiCompatibleApiKey?: string
  openaiCompatibleBaseUrl?: string
  openaiCompatibleDefaultModel?: string
}
type ChatContextMessage = {
  role: 'user' | 'assistant'
  content: string
}
type AssignedChatSkill = {
  id: string
  filePath?: string
}

const DIRECT_AGENT_ATTACHMENT_FILES = [
  'IDENTITY.md',
  'SOUL.md',
  'TOOLS.md',
  'HEARTBEAT.md',
  'USER.md',
  'AGENTS.md',
] as const

type ManagedResendDispatch = {
  to: string
  subject: string
  body: string
  attachmentPaths: string[]
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PROTECTED_AGENT_FILE_BY_NAME = new Map<string, string>(
  DIRECT_AGENT_ATTACHMENT_FILES.flatMap((fileName) => {
    const lower = fileName.toLowerCase()
    return [
      [lower, fileName],
      [lower.replace(/\.md$/, ''), fileName],
    ]
  })
)

function readTextFileIfPresent(filePath: string): string {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile()
      ? fs.readFileSync(filePath, 'utf-8').trim()
      : ''
  } catch {
    return ''
  }
}

function buildAgentStatusEmailBody(input: {
  agentId: string
  agentWorkspaceDir: string
  model?: string
  provider?: ChatProvider
  contextMessages?: ChatContextMessage[]
  request: string
}): string {
  const recentAssistant = (input.contextMessages || [])
    .filter((entry) => entry?.role === 'assistant' && String(entry.content || '').trim())
    .slice(-2)
    .map((entry) => String(entry.content).trim())

  if (recentAssistant.length > 0 && /\b(that|this|both|responses?|previous|above)\b/i.test(input.request)) {
    return recentAssistant.join('\n\n---\n\n')
  }

  const identity = readTextFileIfPresent(path.join(input.agentWorkspaceDir, 'IDENTITY.md'))
  const lines = [
    `Agent: ${input.agentId}`,
    input.model ? `Model: ${input.model}` : '',
    input.provider ? `Provider: ${input.provider}` : '',
    '',
    identity || `Status requested for ${input.agentId}.`,
  ].filter((line) => line !== '')
  return lines.join('\n')
}

export function buildManagedResendDispatch(input: {
  message: string
  agentId: string
  agentWorkspaceDir: string
  model?: string
  provider?: ChatProvider
  contextMessages?: ChatContextMessage[]
  assignedSkillIds: string[]
}): ManagedResendDispatch | null {
  if (!input.assignedSkillIds.includes('clawmax-resend')) return null
  const message = input.message.trim()
  const to = message.match(EMAIL_RE)?.[0]
  if (!to || !/\b(send|email|mail)\b/i.test(message)) return null

  const attachmentPaths: string[] = []
  for (const [token, fileName] of PROTECTED_AGENT_FILE_BY_NAME) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(message)) {
      const filePath = path.join(input.agentWorkspaceDir, fileName)
      if (!fs.existsSync(filePath)) {
        throw new Error(`Attachment file not found in current agent workspace: ${fileName}`)
      }
      if (!attachmentPaths.includes(filePath)) attachmentPaths.push(filePath)
    }
  }

  const explicitFileMatches = message.match(/\b[\w.-]+\.(?:md|txt|json|csv|pdf)\b/gi) || []
  for (const match of explicitFileMatches) {
    const normalized = match.toLowerCase()
    if (PROTECTED_AGENT_FILE_BY_NAME.has(normalized)) continue
    const filePath = path.join(input.agentWorkspaceDir, match)
    if (!fs.existsSync(filePath)) {
      throw new Error(`Attachment file not found in current agent workspace: ${match}`)
    }
    if (!attachmentPaths.includes(filePath)) attachmentPaths.push(filePath)
  }

  const body = buildAgentStatusEmailBody({
    agentId: input.agentId,
    agentWorkspaceDir: input.agentWorkspaceDir,
    model: input.model,
    provider: input.provider,
    contextMessages: input.contextMessages,
    request: message,
  })

  return {
    to,
    subject: attachmentPaths.length > 0
      ? `${input.agentId} file update`
      : `${input.agentId} status update`,
    body,
    attachmentPaths,
  }
}

export function shouldAttemptManagedResendDispatch(skillIds: string[]): boolean {
  return skillIds.includes('clawmax-resend')
}

function hasText(value?: string): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

export function hasByokExecutionPathForProvider(provider: ChatProvider, byok?: ChatByokPayload): boolean {
  if (!byok) return false
  switch (provider) {
    case 'openai':
      return hasText(byok.openai)
    case 'anthropic':
      return hasText(byok.anthropic)
    case 'gemini':
      return hasText(byok.gemini)
    case 'ollama':
      return hasText(byok.ollamaBaseUrl)
    case 'openai-compatible':
      return hasText(byok.openaiCompatibleBaseUrl) || hasText(byok.openaiCompatibleApiKey)
    default:
      return false
  }
}

export function resolveByokChatFallbackModel(byok?: ChatByokPayload): string | undefined {
  if (!byok) return undefined
  if (hasText(byok.openai)) return 'openai/gpt-5'
  if (hasText(byok.anthropic)) return 'anthropic/claude-sonnet-4-20250514'
  if (hasText(byok.gemini)) return 'google/gemini-2.5-flash'
  if (hasText(byok.openaiCompatibleBaseUrl)) {
    const configuredModel = byok.openaiCompatibleDefaultModel?.trim().replace(/^openai-compatible\//, '')
    return configuredModel ? `openai-compatible/${configuredModel}` : undefined
  }
  return undefined
}

export function shouldUseLocalChatExecution(input: {
  provider: ChatProvider
  byok?: ChatByokPayload
  gatewayRunning: boolean
  hasWorkspaceManagedSecrets?: boolean
}): boolean {
  if (input.provider === 'ollama' || input.provider === 'openai-compatible') return true
  if (input.hasWorkspaceManagedSecrets) return true
  if (hasByokExecutionPathForProvider(input.provider, input.byok)) return !input.gatewayRunning
  return !input.gatewayRunning
}

export function shouldUseManagedSecretStatelessChatSession(_input: {
  useLocal: boolean
  hasWorkspaceManagedSecrets: boolean
}): boolean {
  // Normal dashboard chat must preserve a stable session so replies and history
  // can be recovered consistently from the same explicit/local session path.
  return false
}

export function buildManagedSecretStatelessChatMessage(
  message: string,
  contextMessages: ChatContextMessage[] = [],
  assignedSkills: AssignedChatSkill[] = [],
  agentWorkspaceDir?: string,
): string {
  const recentContext = contextMessages
    .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant'))
    .map((entry) => ({
      role: entry.role,
      content: String(entry.content || '').trim(),
    }))
    .filter((entry) => entry.content)
    .slice(-6)

  const sections: string[] = []

  if (recentContext.length > 0) {
    const transcript = recentContext
      .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
      .join('\n\n')
    sections.push('Conversation context for this single-turn execution:', transcript, '')
  }

  if (assignedSkills.length > 0) {
    const promptNotes = getAssignedSkillPromptNotes(assignedSkills.map((skill) => skill.id))
    const directAttachmentLines = agentWorkspaceDir
      ? [
          'Current agent file paths you may attach directly with `clawmax-resend-send --attach`:',
          ...DIRECT_AGENT_ATTACHMENT_FILES.map((fileName) => `- ${fileName}: ${path.join(agentWorkspaceDir, fileName)}`),
          '- For these current-agent files, do not use gateway file_fetch first. Pass the file path directly to `clawmax-resend-send --attach`.',
          '',
        ]
      : []
    sections.push(
      'Assigned skills for this turn:',
      ...assignedSkills.map((skill) => `- ${skill.id}${skill.filePath ? ` (${skill.filePath})` : ''}`),
      '',
      'These are local skills/capabilities for this agent, not agents, channels, or session targets.',
      'Do not use sessions_send, sessions_spawn, or agent-to-agent messaging with a skill name.',
      ...(promptNotes.length > 0 ? ['Assigned skill usage notes:', ...promptNotes, ''] : []),
      ...directAttachmentLines,
      'If the request matches one of these assigned skills, read that SKILL.md first and follow it before using generic tools like message or exec.',
      '',
    )
  }

  if (sections.length === 0) return message
  sections.push(`Latest user request: ${message}`)
  return sections.join('\n')
}

/** Extract JSON object from a string that may contain non-JSON prefixed lines (e.g. stderr warnings) */
function extractJson(text: string): string {
  // Find first { and last } to extract JSON from mixed output
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1)
  }
  return ''
}

function buildDashboardChatSeed(agentId: string, agentWorkspaceDir?: string): string {
  let stamp = 'chat'
  const identityPath = agentWorkspaceDir ? path.join(agentWorkspaceDir, 'IDENTITY.md') : ''
  if (identityPath && fs.existsSync(identityPath)) {
    try {
      stamp = Math.floor(fs.statSync(identityPath).mtimeMs).toString(36)
    } catch {}
  }
  return `dashboard-${agentId}-${stamp}-chat`
}

export async function retryAssistantTextLookup(
  reader: () => { sessionId?: string; content?: string } | null,
  attempts = 4,
  delayMs = 250
): Promise<{ sessionId?: string; content?: string } | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const latest = reader()
    if (latest?.content) {
      return latest
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return reader()
}

async function readLatestAssistantTextWithRetry(
  agentId: string,
  sessionKey: string,
  preferredSessionId: string,
  attempts = 4,
  delayMs = 250
): Promise<{ sessionId?: string; content?: string } | null> {
  return retryAssistantTextLookup(
    () => readLatestAssistantTextFromPersistedSession(agentId, sessionKey, preferredSessionId),
    attempts,
    delayMs
  )
}

export function deriveChatError(raw: string, provider?: ChatProvider): string {
  const text = raw.trim()
  if (!text) return 'No reply from agent.'
  if (/FsSafeError: directory changed during operation/i.test(text)) {
    return 'The agent runtime changed files while this chat was running and the request could not complete. Retry once. If it keeps happening, restart the runtime or disable unstable runtime plugins before retrying.'
  }
  if (/n_keep:\s*\d+\s*>=\s*n_ctx:\s*\d+/i.test(text)) {
    if (provider === 'openai-compatible') {
      return 'LM Studio rejected this prompt because the model is loaded with too little context. Increase the LM Studio context length for this model to at least 32768 tokens, reload the model, and try again.'
    }
    return 'The local model runtime rejected this prompt because the loaded model context is too small. Increase the model context length, reload the model, and try again.'
  }
  if (/Unknown model:/i.test(text)) {
    return 'This agent is configured with a model that the current runtime does not support. Choose a different model for the agent and try again.'
  }
  if (/No API key found for provider/i.test(text)) {
    return 'No model provider credentials are configured for this chat. Add the missing API key or auth profile in BYOK, runtime settings, or the agent auth store and retry.'
  }
  if (/Incorrect API key provided/i.test(text)) {
    return 'The configured model provider API key was rejected. Update the API key or runtime auth profile for this agent and try again.'
  }
  if (/has auth issue \(skipping all models\)/i.test(text)) {
    return 'This runtime is currently marked with a provider auth issue, usually because a prior request failed authentication. Refresh the API key or auth profile for this runtime and retry after the auth state clears.'
  }
  if (/insufficient_quota|quota exceeded|rate limit|too many requests|429\b/i.test(text)) {
    return 'The model provider rejected this request because the account hit a quota or rate limit. Wait a moment and retry, or update the provider billing/usage limits for this runtime.'
  }
  if (/is in cooldown \(suspending lanes\)/i.test(text)) {
    return 'The model provider is temporarily cooling down after a timeout. Wait a moment and retry, or switch to a faster fallback model.'
  }
  if (/EmbeddedAttemptSessionTakeoverError|session file changed while embedded prompt lock was released/i.test(text)) {
    return 'OpenClaw reported an embedded session conflict while a tool was running. Reset the chat session and retry once; if this was a Resend email test, use the Resend partner test-email action to validate delivery without the agent chat session.'
  }
  if (/All models failed/i.test(text) && /Unknown model:/i.test(text)) {
    return 'This agent is configured with an unsupported model, and fallback providers could not authenticate. Choose a supported model for the agent and try again.'
  }
  if (/gateway/i.test(text)) return 'Agent chat could not reach the gateway runtime.'
  if (/timeout/i.test(text)) return 'Agent chat timed out before a reply was produced. Retry once, or switch this agent to a faster model if the issue persists.'
  if (/No API keys available|No execution path configured/i.test(text)) {
    return 'No model execution path is configured for this chat. Add hosted provider keys or configure a local runtime in BYOK / workspace integrations.'
  }
  if (/api key|ollama runtime/i.test(text)) return text
  return text
}

function evaluateChatExecutionReadiness(
  agentId: string,
  byok?: { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
) {
  const integrationConfig = readWorkspaceIntegrationConfig()
  const baseResolvedAgent = resolveAgentExecutionConfig(agentId)
  const fallbackModel = resolveByokChatFallbackModel({
    ...byok,
    openaiCompatibleDefaultModel: byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel,
  })
  const resolvedAgent = !baseResolvedAgent.model && fallbackModel
    ? {
        ...baseResolvedAgent,
        model: fallbackModel,
        provider: (fallbackModel.split('/')[0] as ChatProvider) || baseResolvedAgent.provider,
      }
    : baseResolvedAgent
  const effectiveWorkspaceRoot = deriveWorkspaceRootFromAgentWorkspace(resolvedAgent.workspace) || getWorkspacePath()
  const useOpenAiCompatible = resolvedAgent.provider === 'openai-compatible'
  const executionEnv = userExecutionEnv({
    openai: useOpenAiCompatible ? undefined : byok?.openai,
    anthropic: byok?.anthropic,
    gemini: byok?.gemini,
    ollamaBaseUrl: byok?.ollamaBaseUrl || integrationConfig.ollamaBaseUrl,
    openaiCompatibleApiKey: useOpenAiCompatible ? byok?.openaiCompatibleApiKey : undefined,
    openaiCompatibleBaseUrl: useOpenAiCompatible ? (byok?.openaiCompatibleBaseUrl || integrationConfig.openaiCompatibleBaseUrl) : undefined,
    openaiCompatibleDefaultModel: useOpenAiCompatible ? (byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel) : undefined,
  })
  executionEnv.OPENCLAW_WORKSPACE = effectiveWorkspaceRoot
  const hasResolvedExecutionPath = (provider: ChatProvider | undefined) => {
    if (!provider) return false
    const hasHostedKeys = !!(executionEnv.ANTHROPIC_API_KEY || executionEnv.OPENAI_API_KEY || executionEnv.GEMINI_API_KEY)
    const hasOllamaPath = !!(executionEnv.OLLAMA_BASE_URL || integrationConfig.ollamaDefaultModel)
    const hasOpenAiCompatiblePath = !!(executionEnv.OPENAI_BASE_URL || integrationConfig.openaiCompatibleBaseUrl)

    if (provider === 'openai') return !!executionEnv.OPENAI_API_KEY
    if (provider === 'anthropic') return !!executionEnv.ANTHROPIC_API_KEY
    if (provider === 'gemini') return !!executionEnv.GEMINI_API_KEY
    if (provider === 'ollama') return hasOllamaPath || hasHostedKeys
    if (provider === 'openai-compatible') return hasOpenAiCompatiblePath
    return hasHostedKeys || hasOllamaPath || hasOpenAiCompatiblePath
  }
  if (!resolvedAgent.model || resolvedAgent.model.trim().toLowerCase() === 'unknown') {
    return {
      available: false,
      error: `Agent ${agentId} has no model configured. Choose a model for this agent before chatting.`,
      resolvedAgent,
    }
  }
  const hasHostedKeys = !!(executionEnv.ANTHROPIC_API_KEY || executionEnv.OPENAI_API_KEY || executionEnv.GEMINI_API_KEY)
  const hasOllamaPath = !!(executionEnv.OLLAMA_BASE_URL || integrationConfig.ollamaDefaultModel)
  const hasOpenAiCompatiblePath = !!(executionEnv.OPENAI_BASE_URL || integrationConfig.openaiCompatibleBaseUrl)

  if (resolvedAgent.provider === 'ollama' && !hasOllamaPath && !hasHostedKeys && !hasResolvedExecutionPath(resolvedAgent.backupProvider)) {
    return {
      available: false,
      error: `Agent ${agentId} is configured for ${resolvedAgent.model || 'ollama'}, but no Ollama runtime is configured. Add an Ollama base URL in BYOK or workspace integrations.`,
      resolvedAgent,
    }
  }
  if (resolvedAgent.provider === 'openai-compatible' && !hasOpenAiCompatiblePath && !hasResolvedExecutionPath(resolvedAgent.backupProvider)) {
    return {
      available: false,
      error: `Agent ${agentId} is configured for ${resolvedAgent.model || 'openai-compatible'}, but no OpenAI-compatible Base URL is configured. Add one in BYOK or workspace integrations.`,
      resolvedAgent,
    }
  }
  if (
    (resolvedAgent.provider === 'openai' && !executionEnv.OPENAI_API_KEY) ||
    (resolvedAgent.provider === 'anthropic' && !executionEnv.ANTHROPIC_API_KEY) ||
    (resolvedAgent.provider === 'gemini' && !executionEnv.GEMINI_API_KEY)
  ) {
    if (!hasResolvedExecutionPath(resolvedAgent.backupProvider)) {
      return {
        available: false,
        error: `Agent ${agentId} is configured for ${resolvedAgent.model}, but no ${resolvedAgent.provider} credential is available. Add the matching key in BYOK or choose a configured model provider.`,
        resolvedAgent,
      }
    }
  }
  if (!hasHostedKeys && !hasOllamaPath && !hasOpenAiCompatiblePath) {
    return {
      available: false,
      error: 'No execution path configured. Add hosted provider keys, configure Ollama, or add an OpenAI-compatible endpoint in BYOK / workspace integrations.',
      resolvedAgent,
    }
  }

  return {
    available: true,
    resolvedAgent,
  }
}

function persistDashboardChatSession(agentId: string, sessionId: string) {
  try {
    const homeDir = process.env.HOME || ''
    const sessionKey = `agent:${agentId}:dashboard-chat`
    const resolvedSessionId = resolvePersistedAgentSessionId(agentId, sessionKey, sessionId, homeDir) || sessionId
    const sessionsDir = path.join(homeDir, '.openclaw', 'agents', agentId, 'sessions')
    const sessionsPath = path.join(sessionsDir, 'sessions.json')
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true })
    }
    const sessions = fs.existsSync(sessionsPath)
      ? JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
      : {}
    sessions[sessionKey] = { sessionId: resolvedSessionId, updatedAt: Date.now() }
    fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2))
  } catch (err) {
    console.warn(`[Chat Route] Failed to persist dashboard chat session for ${agentId}:`, err)
  }
}

/**
 * GET /api/agents/:id/gateway
 * Returns gateway connection info (port, token, availability)
 */
router.get('/:id/gateway', (req, res) => {
  const { id } = req.params

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const gatewayConfig = getAgentGatewayConfig(id)

  if (!gatewayConfig) {
    return res.status(404).json({
      error: 'Gateway not configured for this agent',
      available: false
    })
  }

  // Check if gateway is actually running by attempting a quick connection (no /rpc path)
  const ws = new WebSocket(gatewayConfig.wsUrl || `ws://127.0.0.1:${gatewayConfig.port}`, {
    headers: {
      'Origin': gatewayConfig.httpUrl || `http://localhost:${gatewayConfig.port}`
    }
  })
  const timeout = setTimeout(() => {
    ws.close()
    res.json({
      port: gatewayConfig.port,
      hasToken: !!gatewayConfig.token,
      available: false
    })
  }, 2000)

  ws.on('open', () => {
    clearTimeout(timeout)
    ws.close()
    res.json({
      port: gatewayConfig.port,
      hasToken: !!gatewayConfig.token,
      available: true
    })
  })

  ws.on('error', () => {
    clearTimeout(timeout)
    res.json({
      port: gatewayConfig.port,
      hasToken: !!gatewayConfig.token,
      available: false
    })
  })
})

router.post('/:id/chat/readiness', (req, res) => {
  const { id } = req.params
  const { byok } = req.body as {
    byok?: { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string }
  }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  const readiness = evaluateChatExecutionReadiness(id, byok)
  if (!readiness.available) {
    return res.status(200).json(readiness)
  }
  return res.json(readiness)
})

/**
 * POST /api/agents/:id/chat
 * SSE proxy that spawns `openclaw agent` CLI to handle chat.
 * The CLI handles gateway auth, device identity, and agent routing.
 */
router.post('/:id/chat', async (req, res) => {
  const { id } = req.params
  const { message, sessionId, byok } = req.body as {
    message?: string
    sessionId?: string
    contextMessages?: ChatContextMessage[]
    byok?: { openai?: string; anthropic?: string; gemini?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
  }

  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' })
  }

  // Check workspace budget
  const budgetBlock = checkBudgetBlock({ operation: 'agent' })
  if (budgetBlock) {
    return res.status(402).json({ error: budgetBlock })
  }

  const session = getAuthenticatedSession(req)
  const readiness = evaluateChatExecutionReadiness(id, byok)
  if (!readiness.available) {
    return res.status(400).json({ error: readiness.error })
  }
  const resolvedAgent = readiness.resolvedAgent
  const useOpenAiCompatible = resolvedAgent.provider === 'openai-compatible'
  const integrationConfig = readWorkspaceIntegrationConfig()
  const effectiveWorkspaceRoot = deriveWorkspaceRootFromAgentWorkspace(resolvedAgent.workspace) || getWorkspacePath()
  const executionEnv = userExecutionEnv({
    openai: useOpenAiCompatible ? undefined : byok?.openai,
    anthropic: byok?.anthropic,
    gemini: byok?.gemini,
    ollamaBaseUrl: byok?.ollamaBaseUrl || integrationConfig.ollamaBaseUrl,
    openaiCompatibleApiKey: useOpenAiCompatible ? byok?.openaiCompatibleApiKey : undefined,
    openaiCompatibleBaseUrl: useOpenAiCompatible ? (byok?.openaiCompatibleBaseUrl || integrationConfig.openaiCompatibleBaseUrl) : undefined,
    openaiCompatibleDefaultModel: useOpenAiCompatible ? (byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel) : undefined,
  })
  executionEnv.OPENCLAW_WORKSPACE = effectiveWorkspaceRoot
  executionEnv.CLAWMAX_AGENT_ID = id
  const sessionSeed = sessionId || buildDashboardChatSeed(id, resolvedAgent.workspace)

  console.log(`[Chat Route] Starting CLI chat for agent ${id}`)

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })
  res.flushHeaders()

  const send = (type: string, data: any) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`)
    }
  }

  const keepalive = setInterval(() => {
    try { res.write(': keepalive\n\n') } catch {}
  }, 2000)
  const chatStartedAt = Date.now()
  const dashboardSessionKey = `agent:${id}:dashboard-chat`
  let currentSessionId = scopeSessionIdToModel(sessionSeed, resolvedAgent.model)

  // Use plain-text mode so stdout can stream deltas to the UI in real time.
  // History/persistence is handled by the explicit session id and the CLI itself.
  const gatewayRunning = (
    resolvedAgent.provider === 'ollama' || resolvedAgent.provider === 'openai-compatible'
  )
    ? false
    : (await waitForGatewayResponsive()).running

  const useLocal = shouldUseLocalChatExecution({
    provider: resolvedAgent.provider,
    byok,
    gatewayRunning,
    hasWorkspaceManagedSecrets: hasWorkspaceManagedPartnerSecrets(),
  })
  const useManagedSecretStatelessSession = shouldUseManagedSecretStatelessChatSession({
    useLocal,
    hasWorkspaceManagedSecrets: hasWorkspaceManagedPartnerSecrets(),
  })
  const agentSkillIds = getAgentSkills(id)
  const allAssignedSkills = agentSkillIds.map((skillId) => {
    const skill = getSkillById(skillId)
    return {
      id: skillId,
      filePath: skill?.filePath,
    }
  })
  const assignedSkills = useManagedSecretStatelessSession ? allAssignedSkills : []
  const currentAgentWorkspaceDir = path.join(effectiveWorkspaceRoot, 'AGENTS', id)
  let managedResendDispatch: ManagedResendDispatch | null = null
  if (shouldAttemptManagedResendDispatch(agentSkillIds)) {
    try {
      managedResendDispatch = buildManagedResendDispatch({
        message,
        agentId: id,
        agentWorkspaceDir: currentAgentWorkspaceDir,
        model: resolvedAgent.model,
        provider: resolvedAgent.provider,
        contextMessages: (req.body as any).contextMessages,
        assignedSkillIds: agentSkillIds,
      })
    } catch (err: any) {
      clearInterval(keepalive)
      send('start', { sessionId: currentSessionId })
      send('error', err?.message || 'Unable to prepare ClawMax Resend send.')
      send('complete', { text: '' })
      if (!res.writableEnded) res.end()
      return
    }
  }

  if (managedResendDispatch) {
    send('start', { sessionId: currentSessionId })
    invalidateAgentStatusCache(id)
    try {
      const result = await executeClawmaxResendSend({
        to: managedResendDispatch.to,
        subject: managedResendDispatch.subject,
        body: managedResendDispatch.body,
        attachmentPaths: managedResendDispatch.attachmentPaths,
        agentId: id,
        workspaceRoot: effectiveWorkspaceRoot,
        workspaceLabel: path.basename(effectiveWorkspaceRoot) || 'workspace',
      })
      const completionText = result.message
      send('delta', { text: completionText })
      send('complete', { text: completionText })
    } catch (err: any) {
      send('error', err?.message || 'ClawMax Resend send failed.')
      send('complete', { text: '' })
    } finally {
      clearInterval(keepalive)
      if (!res.writableEnded) res.end()
    }
    return
  }

  const executionMessage = useManagedSecretStatelessSession
    ? buildManagedSecretStatelessChatMessage(message, (req.body as any).contextMessages, assignedSkills, currentAgentWorkspaceDir)
    : message
  const openclawCli = resolveOpenClawCliPath()

  let procExited = false
  let proc: ReturnType<typeof spawn> | null = null
  let activeAttemptTimer: NodeJS.Timeout | null = null

  const runChatAttempt = async (attemptModel: string | undefined, attemptProvider: ChatProvider | undefined) => {
    const executionSessionId = scopeSessionIdToModel(sessionSeed, attemptModel)
    currentSessionId = executionSessionId
    const attemptUseOpenAiCompatible = attemptProvider === 'openai-compatible'
    const attemptExecutionModel = toExecutionModelOverride(attemptModel, attemptProvider)
    const args = [
      'agent',
      '--agent', id,
      '--session-id', executionSessionId,
      '--message', executionMessage,
      ...(attemptExecutionModel ? ['--model', attemptExecutionModel] : []),
      ...(attemptUseOpenAiCompatible || attemptProvider === 'ollama' ? ['--local'] : (useLocal ? ['--local'] : [])),
    ]
    console.log(`[Chat Route] Spawning: ${openclawCli || 'openclaw'} ${args.join(' ')}`)

    return await withTemporaryAgentAuthProfiles(id, {
      openai: attemptUseOpenAiCompatible ? undefined : executionEnv.OPENAI_API_KEY,
      anthropic: executionEnv.ANTHROPIC_API_KEY,
      gemini: executionEnv.GEMINI_API_KEY,
      ollamaBaseUrl: executionEnv.OLLAMA_BASE_URL,
      openaiCompatibleApiKey: attemptUseOpenAiCompatible ? executionEnv.OPENAI_API_KEY : undefined,
      openaiCompatibleBaseUrl: attemptUseOpenAiCompatible ? executionEnv.OPENAI_BASE_URL : undefined,
      openaiCompatibleDefaultModel: attemptUseOpenAiCompatible ? (byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel || attemptModel) : undefined,
    }, attemptModel, attemptProvider, async () => {
      return await new Promise<{
        completionText: string
        rawError: string
        usage: ReturnType<typeof readLatestAssistantUsageFromPersistedSession>
        persistedAssistant: Awaited<ReturnType<typeof readLatestAssistantTextWithRetry>>
        hadVisibleOutput: boolean
        sessionId: string
        model?: string
        provider?: ChatProvider
      }>((resolve, reject) => {
        if (!openclawCli) {
          reject(new Error('OpenClaw CLI is not available in this runtime. Install or bundle the CLI, or set OPENCLAW_BIN to the executable path.'))
          return
        }

        let fullOutput = ''
        let stderrOutput = ''
        let hadVisibleOutput = false
        const spawned = spawn(openclawCli, args, {
          env: executionEnv,
          stdio: ['pipe', 'pipe', 'pipe']
        })
        proc = spawned
        procExited = false

        send('start', { sessionId: executionSessionId })
        invalidateAgentStatusCache(id)

        activeAttemptTimer = setTimeout(() => {
          spawned.kill()
          reject(new Error('Agent timeout (3 minutes)'))
        }, 180000)

        spawned.stdout.on('data', (chunk: Buffer) => {
          const text = stripBenignChatRuntimeWarnings(chunk.toString())
          if (!text) return
          fullOutput += text
          hadVisibleOutput = true
          send('delta', { text })
        })

        spawned.stderr.on('data', (chunk: Buffer) => {
          stderrOutput += chunk.toString()
        })

        spawned.on('exit', () => { procExited = true })

        spawned.on('close', async (code) => {
          if (activeAttemptTimer) {
            clearTimeout(activeAttemptTimer)
            activeAttemptTimer = null
          }
          console.log(`[Chat Route] CLI exited for agent ${id} with code ${code}`)

          if (stderrOutput) {
            console.error(`[Chat Route] stderr for ${id}:`, stderrOutput.slice(0, 500))
          }

          const normalizedText = normalizeChatMessage(fullOutput.trim())
          const persistedAssistant = !normalizedText
            ? await readLatestAssistantTextWithRetry(id, dashboardSessionKey, executionSessionId)
            : null
          const completionText = normalizedText || normalizeChatMessage(persistedAssistant?.content || '') || ''
          const usage = completionText
            ? readLatestAssistantUsageFromPersistedSession(id, dashboardSessionKey, executionSessionId)
            : null

          persistDashboardChatSession(id, executionSessionId)

          resolve({
            completionText,
            rawError: stderrOutput || (code !== 0 ? 'Agent failed.' : 'No reply from agent.'),
            usage,
            persistedAssistant,
            hadVisibleOutput,
            sessionId: executionSessionId,
            model: attemptModel,
            provider: attemptProvider,
          })
        })

        spawned.on('error', (err) => {
          if (activeAttemptTimer) {
            clearTimeout(activeAttemptTimer)
            activeAttemptTimer = null
          }
          console.error(`[Chat Route] CLI spawn error for ${id}:`, err)
          reject(err)
        })
      })
    }, { persistAuthProfiles: true, skipModelConfigMutation: true })
  }

  runExclusiveAgentExecution(id, async () => {
    const primaryResult = await runChatAttempt(resolvedAgent.model, resolvedAgent.provider)
    const fallbackModel = resolvedAgent.backupModel
    const fallbackProvider = resolvedAgent.backupProvider
    if (!shouldUseExplicitBackupModelRetry({
      completionText: primaryResult.completionText,
      backupModel: fallbackModel,
      backupProvider: fallbackProvider,
      hadVisibleOutput: primaryResult.hadVisibleOutput,
      rawError: primaryResult.rawError,
    })) {
      return primaryResult
    }
    console.log(`[Chat Route] Retrying agent ${id} with fallback model ${fallbackModel}`)
    return await runChatAttempt(fallbackModel, fallbackProvider)
  }).then((attemptResult) => {
    clearInterval(keepalive)
    if (attemptResult.completionText) {
      traceAgentChat(id, message, attemptResult.completionText, {
        model: attemptResult.usage?.model || attemptResult.model,
        provider: attemptResult.usage?.provider || attemptResult.provider || undefined,
        inputTokens: attemptResult.usage?.inputTokens,
        outputTokens: attemptResult.usage?.outputTokens,
        cacheReadTokens: attemptResult.usage?.cacheReadTokens,
        durationMs: Math.max(0, Date.now() - chatStartedAt),
        estimatedCostUsd: attemptResult.usage?.estimatedCostUsd,
        sessionId: attemptResult.usage?.sessionId || attemptResult.persistedAssistant?.sessionId || attemptResult.sessionId,
        actorUserId: session?.userId,
        actorLogin: session?.login,
        actorEmail: session?.email,
        dashboardInstanceId: getRequestDashboardInstanceId(req),
      })
    } else {
      send('error', deriveChatError(attemptResult.rawError, attemptResult.provider))
    }
    send('complete', { text: attemptResult.completionText })
    if (!res.writableEnded) {
      res.end()
    }
  }).catch((err) => {
    console.error(`[Chat Route] Auth profile prep error for ${id}:`, err)
    clearInterval(keepalive)
    send('error', deriveChatError(err?.message || String(err), resolvedAgent.provider))
    send('complete', { text: '' })
    if (!res.writableEnded) {
      res.end()
    }
  })

  // Handle client disconnect — only kill if process hasn't exited yet
  req.on('close', () => {
    console.log(`[Chat Route] Client disconnected for agent ${id}, procExited=${procExited}`)
    if (activeAttemptTimer) {
      clearTimeout(activeAttemptTimer)
      activeAttemptTimer = null
    }
    clearInterval(keepalive)
    // Don't kill process immediately — let it finish if it's close to done
    // Only kill after a grace period
    if (!procExited) {
      setTimeout(() => {
        if (!procExited) {
          console.log(`[Chat Route] Killing agent process for ${id} after grace period`)
          proc?.kill()
        }
      }, 30000) // 30s grace period
    }
  })
})

export default router
