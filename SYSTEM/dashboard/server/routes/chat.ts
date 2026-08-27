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
import { createStreamingWarningFilter, normalizeChatMessage, stripBenignChatRuntimeWarnings } from '../lib/chat-normalization'
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
  isOpenClawSessionLockError,
  runExclusiveAgentExecution,
  shouldUseExplicitBackupModelRetry,
  scopeSessionIdToModel,
  toExecutionModelOverride,
  withTemporaryAgentAuthProfiles,
} from '../lib/agent-execution'
import { buildRuntimePlan, executeAgentRuntimeTurn, readAgentIdentitySystemPrompt, isRuntimeCancelledError, isRuntimeRunawayOutputError } from '../lib/agent-runtime'
import { cancelTurn, cancelTurnsForAgent, listActiveTurns, withRegisteredTurn } from '../lib/agent-turns'
import { hasRuntimeSession } from '../lib/runtime-sessions'
import { appendRuntimeTranscriptExchange } from '../lib/runtime-transcripts'
import { getAuthenticatedSession } from '../lib/github-auth'
import { createBrokerCapabilityToken } from '../lib/skill-secret-broker'
import { appendActivityExportEventsForActiveConsents } from '../lib/activity-export'
import { appendBoundedOutput } from '../lib/stream-bounds'
import { cancelProcessTree, detachProcessStreams, terminateProcessTree } from '../lib/process-tree'

const router = Router()
const MAX_RETAINED_CHAT_OUTPUT = 2 * 1024 * 1024
const MAX_RETAINED_CHAT_STDERR = 64 * 1024
const MAX_TOTAL_CHAT_OUTPUT = 64 * 1024 * 1024
type ChatProvider = 'openai' | 'openai-compatible' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama' | null | undefined
type ChatByokPayload = {
  openai?: string
  anthropic?: string
  gemini?: string
  openrouter?: string
  xai?: string
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
    case 'openrouter':
      return hasText(byok.openrouter)
    case 'xai':
      return hasText(byok.xai)
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
  if (hasText(byok.openai)) return 'openai/gpt-5.4-mini'
  if (hasText(byok.anthropic)) return 'anthropic/claude-sonnet-4-20250514'
  if (hasText(byok.gemini)) return 'google/gemini-2.5-flash'
  if (hasText(byok.openrouter)) return 'openrouter/auto'
  if (hasText(byok.xai)) return 'xai/grok-3'
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

export function shouldRecoverPersistedAssistant(normalizedText: string): boolean {
  return normalizedText.trim().length === 0
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

export interface ChatErrorContext {
  agentId?: string
  model?: string
  /** Set for claude/droid so runtime-specific branches name the CLI that failed. */
  runtimeLabel?: string
}

function extractUnsupportedModel(raw: string): string | undefined {
  const match = raw.match(/(?:Unknown|Unsupported) model:\s*([^\s,;)\]}]+)/i)
  return match?.[1]?.trim()
}

function formatUnsupportedModelError(raw: string, context?: ChatErrorContext): string {
  const model = context?.model?.trim() || extractUnsupportedModel(raw)
  const modelDetail = model ? `: \`${model}\`` : '.'
  const runtimeName = context?.runtimeLabel ? `${context.runtimeLabel} CLI` : 'installed OpenClaw runtime'
  const cause = `The model identifier is not recognized by the ${runtimeName}. It may have been removed or renamed, or it may belong to a provider that is not available in this deployment.`
  const action = 'Choose a model listed by a configured provider, save the agent, and retry.'
  const editLink = context?.agentId
    ? ` [Edit agent model](/agents?agent=${encodeURIComponent(context.agentId)}&action=edit)`
    : ''
  return `This agent is configured with a model that the current runtime does not support${modelDetail} ${cause} ${action}${editLink}`
}

// Display labels for the runtime-specific deriveChatError() messages below. openclaw never
// reaches these branches (its errors are classified by the generic patterns further down).
const RUNTIME_CHAT_LABELS: Record<'claude' | 'droid', string> = {
  claude: 'Claude Code',
  droid: 'Factory Droid',
}

// A missing/falsy runtime (e.g. an older resolvedAgent shape) defaults to openclaw, matching
// resolveAgentRuntime()'s own default — never treat "unset" as "non-openclaw".
function isNonOpenclawChatRuntime(runtime: unknown): runtime is 'claude' | 'droid' {
  return runtime === 'claude' || runtime === 'droid'
}

export function deriveChatError(raw: string, provider?: ChatProvider, context?: ChatErrorContext): string {
  const runtimeLabel = context?.runtimeLabel
  const text = raw.trim()
  if (!text) return 'No reply from agent.'
  // "Log the CLI in" is impossible in a container: that flow needs a browser and a loopback OAuth
  // callback. Point at the credential an operator can actually set instead. A bad or expired token
  // reports differently from a missing one (an authentication_error rather than "not logged in"),
  // so both shapes are matched here or the bad-token case falls through to the generic branch.
  const notAuthenticated = /Please run \/login|not logged in/i.test(text)
  // A rejected credential reports as an authentication_error rather than "not logged in", so it
  // needs its own shape or it falls through to the generic branch. Gated on runtimeLabel: without
  // one this is a hosted-provider failure (e.g. an OpenAI 401), which the provider branch below
  // already explains in provider terms.
  const runtimeCredentialRejected = !!runtimeLabel
    && /authentication_error|invalid[ _-]?(api[ _-]?key|token)|unauthorized/i.test(text)
  if (notAuthenticated || runtimeCredentialRejected) {
    const label = runtimeLabel ? `${runtimeLabel} CLI` : 'agent runtime CLI'
    // Deliberately does NOT say "log the CLI in": that flow needs a browser and a loopback OAuth
    // callback, so it is impossible inside a container and sends the operator down a dead end.
    const remedy = runtimeLabel === 'Claude Code'
      ? 'Set CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`) or ANTHROPIC_API_KEY on the server, then recreate the container.'
      : runtimeLabel === 'Factory Droid'
        ? 'Set FACTORY_API_KEY on the server, or mount a host Droid login, then recreate the container.'
        : 'Set ANTHROPIC_API_KEY / FACTORY_API_KEY on the server, then recreate the container.'
    return runtimeCredentialRejected && !notAuthenticated
      ? `${label} is not authenticated: its credential was rejected as invalid or expired. ${remedy}`
      : `${label} is not authenticated on this server. ${remedy}`
  }
  if (/is already in use|No conversation found with session ID/i.test(text)) {
    return 'This chat session is out of sync with the agent runtime. Retry once, or reset the chat session if the issue persists.'
  }
  if (/Invalid model:|There's an issue with the selected model/i.test(text)) {
    return runtimeLabel
      ? `This agent is configured with a model that the ${runtimeLabel} CLI cannot use. Choose a different model for this agent or switch its runtime.`
      : 'This agent is configured with a model that the current runtime does not support. Choose a different model for the agent and try again.'
  }
  if (/FsSafeError: directory changed during operation/i.test(text)) {
    return 'The agent runtime changed files while this chat was running and the request could not complete. Retry once. If it keeps happening, restart the runtime or disable unstable runtime plugins before retrying.'
  }
  if (/n_keep:\s*\d+\s*>=\s*n_ctx:\s*\d+/i.test(text)) {
    if (provider === 'openai-compatible') {
      return 'LM Studio rejected this prompt because the model is loaded with too little context. Increase the LM Studio context length for this model to at least 32768 tokens, reload the model, and try again.'
    }
    return 'The local model runtime rejected this prompt because the loaded model context is too small. Increase the model context length, reload the model, and try again.'
  }
  if (/(?:Unknown|Unsupported) model:/i.test(text)) {
    return formatUnsupportedModelError(text, context)
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
    return 'OpenClaw reported an embedded session conflict while a tool was running. ClawMax already retried once with a fresh chat session. Wait for any other request using this agent to finish, then retry; reset the chat session if the conflict continues.'
  }
  if (/Agent couldn't generate a response|incomplete turn detected|hasLastAssistant=no/i.test(text)) {
    return 'The agent used tools but did not produce a final reply. Some tool actions may already have completed. Verify the requested results, then retry or reset this chat session.'
  }
  if (/All models failed/i.test(text) && /Unknown model:/i.test(text)) {
    return formatUnsupportedModelError(text, context)
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
  byok?: { openai?: string; anthropic?: string; gemini?: string; openrouter?: string; xai?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
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
    openrouter: byok?.openrouter,
    xai: byok?.xai,
    ollamaBaseUrl: byok?.ollamaBaseUrl || integrationConfig.ollamaBaseUrl,
    openaiCompatibleApiKey: useOpenAiCompatible ? byok?.openaiCompatibleApiKey : undefined,
    openaiCompatibleBaseUrl: useOpenAiCompatible ? (byok?.openaiCompatibleBaseUrl || integrationConfig.openaiCompatibleBaseUrl) : undefined,
    openaiCompatibleDefaultModel: useOpenAiCompatible ? (byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel) : undefined,
  })
  executionEnv.OPENCLAW_WORKSPACE = effectiveWorkspaceRoot
  if (isNonOpenclawChatRuntime(resolvedAgent.runtime)) {
    // Non-openclaw runtimes authenticate via their own CLI (ANTHROPIC_API_KEY / FACTORY_API_KEY /
    // CLI login) — the hosted-key / Ollama / OpenAI-compatible BYOK checks below don't apply, and
    // neither does the blanket "no model configured" gate below: both CLIs run without an
    // explicit model — droid picks its own default and claude falls back to the runtime default
    // when the configured model is not one it can run (see runtimeModelArg). Checking
    // model-presence before this branch would reject valid modelless agents.
    try {
      const plan = buildRuntimePlan({
        runtime: resolvedAgent.runtime,
        mode: 'chat',
        agentId,
        scopedSessionId: 'readiness-check',
        message: '',
        model: resolvedAgent.model,
        agentDir: path.join(effectiveWorkspaceRoot, 'AGENTS', agentId),
        resume: false,
      })
      if (!plan.cliPath) {
        return { available: false, error: plan.missingCliError, resolvedAgent }
      }
    } catch (err: any) {
      return {
        available: false,
        error: err?.message || `Agent ${agentId}'s runtime cannot execute the configured model.`,
        resolvedAgent,
      }
    }
    return { available: true, resolvedAgent }
  }

  const hasResolvedExecutionPath = (provider: ChatProvider | undefined) => {
    if (!provider) return false
    const hasHostedKeys = !!(executionEnv.ANTHROPIC_API_KEY || executionEnv.OPENAI_API_KEY || executionEnv.GEMINI_API_KEY || executionEnv.OPENROUTER_API_KEY || executionEnv.XAI_API_KEY)
    const hasOllamaPath = !!(executionEnv.OLLAMA_BASE_URL || integrationConfig.ollamaDefaultModel)
    const hasOpenAiCompatiblePath = !!(executionEnv.OPENAI_BASE_URL || integrationConfig.openaiCompatibleBaseUrl)

    if (provider === 'openai') return !!executionEnv.OPENAI_API_KEY
    if (provider === 'anthropic') return !!executionEnv.ANTHROPIC_API_KEY
    if (provider === 'gemini') return !!executionEnv.GEMINI_API_KEY
    if (provider === 'openrouter') return !!executionEnv.OPENROUTER_API_KEY
    if (provider === 'xai') return !!executionEnv.XAI_API_KEY
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
  const hasHostedKeys = !!(executionEnv.ANTHROPIC_API_KEY || executionEnv.OPENAI_API_KEY || executionEnv.GEMINI_API_KEY || executionEnv.OPENROUTER_API_KEY || executionEnv.XAI_API_KEY)
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
    || (resolvedAgent.provider === 'openrouter' && !executionEnv.OPENROUTER_API_KEY)
    || (resolvedAgent.provider === 'xai' && !executionEnv.XAI_API_KEY)
  ) {
    if (!hasResolvedExecutionPath(resolvedAgent.backupProvider)) {
      return {
        available: false,
        error: resolvedAgent.disabledPinnedRuntime
          // The agent asked for a CLI runtime that is switched off, so it silently fell back to
          // OpenClaw and then failed on provider keys. Report the real cause, not the symptom.
          ? `Agent ${agentId} is pinned to the ${(RUNTIME_CHAT_LABELS as Record<string, string>)[resolvedAgent.disabledPinnedRuntime] || resolvedAgent.disabledPinnedRuntime} CLI, which is not enabled for this workspace, so it fell back to OpenClaw — which has no ${resolvedAgent.provider} credential. Enable that CLI in BYOK → “Run via CLI”, or give the agent a model whose provider key is configured.`
          : `Agent ${agentId} is configured for ${resolvedAgent.model}, but no ${resolvedAgent.provider} credential is available. Add the matching key in BYOK or choose a configured model provider.`,
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

export function buildDashboardChatRetrySeed(sessionSeed: string, retryAttempt = 0): string {
  if (retryAttempt <= 0) return sessionSeed
  return scopeSessionIdToModel(`${sessionSeed}-recovery-${retryAttempt}`)
}

export function throwIfChatAttemptNeedsSessionRetry(result: {
  completionText?: string
  rawError?: string
  hadVisibleOutput?: boolean
}): void {
  if (result.hadVisibleOutput) return
  if (isOpenClawSessionLockError(result.rawError || '')) {
    throw new Error(result.rawError)
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
    byok?: ChatByokPayload
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
    byok?: { openai?: string; anthropic?: string; gemini?: string; openrouter?: string; xai?: string; ollamaBaseUrl?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
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
    openrouter: byok?.openrouter,
    xai: byok?.xai,
    ollamaBaseUrl: byok?.ollamaBaseUrl || integrationConfig.ollamaBaseUrl,
    openaiCompatibleApiKey: useOpenAiCompatible ? byok?.openaiCompatibleApiKey : undefined,
    openaiCompatibleBaseUrl: useOpenAiCompatible ? (byok?.openaiCompatibleBaseUrl || integrationConfig.openaiCompatibleBaseUrl) : undefined,
    openaiCompatibleDefaultModel: useOpenAiCompatible ? (byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel) : undefined,
  })
  executionEnv.OPENCLAW_WORKSPACE = effectiveWorkspaceRoot
  executionEnv.CLAWMAX_AGENT_ID = id
  const brokerCapability = createBrokerCapabilityToken(id, effectiveWorkspaceRoot)
  if (brokerCapability) {
    executionEnv.CLAWMAX_SECRET_BROKER_TOKEN = brokerCapability
    executionEnv.CLAWMAX_SECRET_BROKER_URL = `http://127.0.0.1:${process.env.DASHBOARD_PORT || '3001'}/api/runtime/skill-broker/execute`
    executionEnv.CLAWMAX_MAIL_BROKER_TOKEN = brokerCapability
    executionEnv.CLAWMAX_MAIL_BROKER_URL = `http://127.0.0.1:${process.env.DASHBOARD_PORT || '3001'}/api/runtime/mail`
  }
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
  let chatSessionRetryAttempt = 0

  // Use plain-text mode so stdout can stream deltas to the UI in real time.
  // History/persistence is handled by the explicit session id and the CLI itself.
  // Gateway + --local are openclaw-only concepts; non-openclaw runtimes spawn their own CLI directly.
  const gatewayRunning = isNonOpenclawChatRuntime(resolvedAgent.runtime)
    ? false
    : (
        resolvedAgent.provider === 'ollama' || resolvedAgent.provider === 'openai-compatible'
      )
      ? false
      : (await waitForGatewayResponsive()).running

  const useLocal = isNonOpenclawChatRuntime(resolvedAgent.runtime)
    ? false
    : shouldUseLocalChatExecution({
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
    const dispatch = managedResendDispatch
    send('start', { sessionId: currentSessionId })
    invalidateAgentStatusCache(id)
    // Registered like every other chat turn so a send in flight shows up in GET /turns/active and
    // is reachable by /chat/cancel -- this branch has no CLI process to signal (resend-partner.ts's
    // own 15s network bound is what actually stops it), but skipping registerTurn entirely, as
    // this branch used to, made it invisible to both.
    await withRegisteredTurn(id, async () => {
      try {
        const result = await executeClawmaxResendSend({
          to: dispatch.to,
          subject: dispatch.subject,
          body: dispatch.body,
          attachmentPaths: dispatch.attachmentPaths,
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
      }
    })
    clearInterval(keepalive)
    if (!res.writableEnded) res.end()
    return
  }

  const executionMessage = useManagedSecretStatelessSession
    ? buildManagedSecretStatelessChatMessage(message, (req.body as any).contextMessages, assignedSkills, currentAgentWorkspaceDir)
    : message

  let procExited = false
  let proc: ReturnType<typeof spawn> | null = null
  // Set synchronously by withRegisteredTurn below (registerTurn runs before its callback's first
  // await), so it's already correct by the time req.on('close') is wired up a few lines down.
  let turnId = ''

  // withRegisteredTurn's `finally` is the actual fix here: this route used to call releaseTurn()
  // by hand on each exit path, and missed the far more common success path in the openclaw branch
  // below plus the missingCliError early return in the claude/droid branch -- both leaked their
  // turn in the registry forever. A wrapper that releases no matter how the callback ends removes
  // the chance to forget it on whatever exit path gets added next.
  withRegisteredTurn(id, async (turn) => {
    turnId = turn.turnId

    // No route-level deadline. Every previous bound measured silence, and silence is what a working
    // agent produces while it thinks and runs tools -- a measured research turn went quiet for 316s
    // and finished fine at 21 minutes. The turn ends when the CLI exits or the user cancels it.

    if (isNonOpenclawChatRuntime(resolvedAgent.runtime)) {
      // Claude Code / Factory Droid: spawn via the shared runtime adapter instead of the openclaw
      // CLI. No gateway, no --local, no persisted openclaw session store, and no backup-model retry
      // (see runChatAttempt in the openclaw branch below) — see agent-runtime.ts.
      const runtime = resolvedAgent.runtime
      const runtimeLabel = RUNTIME_CHAT_LABELS[runtime]
      // This branch never retries against a backup model, so the session id is fixed to the
      // already-resolved primary model computed above.
      const executionSessionId = currentSessionId

      await runExclusiveAgentExecution(id, async () => {
        const { text, errorText, missingCliError } = await executeAgentRuntimeTurn({
          runtime,
          agentId: id,
          agentDir: currentAgentWorkspaceDir,
          message: executionMessage,
          scopedSessionId: executionSessionId,
          model: resolvedAgent.model,
          mode: 'chat',
          env: executionEnv,
          // The turn's only stop condition. Nothing here is time-based.
          signal: turn.signal,
          onDelta: (delta) => {
            turn.touch()
            // Unfiltered by design. createClaudeStreamDeltaTransformer only emits text blocks from
            // parsed `assistant` events, so a CLI warning -- which is not JSON, let alone an
            // assistant event -- can never reach here. Line-buffering this stream would delay
            // ordinary prose for no benefit, since assistant text is not newline-terminated.
            send('delta', { text: delta })
          },
          // Tool calls and thinking never become visible text, so liveness fed only by deltas would
          // read a legitimately busy agent as idle. Any CLI output counts as alive.
          onActivity: () => turn.touch(),
          onPlan: (plan) => {
            console.log(`[Chat Route] Spawning: ${plan.cliPath || runtime} ${plan.args.join(' ')}`)
            send('start', { sessionId: executionSessionId, turnId: turn.turnId })
            invalidateAgentStatusCache(id)
          },
        })
        if (missingCliError) {
          procExited = true
          clearInterval(keepalive)
          send('error', missingCliError)
          send('complete', { text: '' })
          if (!res.writableEnded) res.end()
          return
        }
        procExited = true
        clearInterval(keepalive)

        const completionText = normalizeChatMessage(text.trim())
        // OpenClaw's own CLI persists its turns to a JSONL session file the dashboard already reads
        // (see readChatSessionMessages in routes/agents.ts); claude/droid have no such dashboard-local
        // record, so this is the only place a non-openclaw dashboard chat turn gets persisted for
        // refresh / archive / clear-history to find later.
        appendRuntimeTranscriptExchange(id, executionSessionId, message, completionText)
        if (completionText) {
          // Mirror the openclaw branch's consented activity export so a chat is captured the same way
          // whichever runtime answered it; otherwise pinning an agent to claude/droid would silently
          // drop it out of activity export.
          appendActivityExportEventsForActiveConsents({
            source: 'agent-chat',
            // The turn ran against effectiveWorkspaceRoot (see agentDir / OPENCLAW_WORKSPACE above),
            // which is not always the active workspace when the agent resolves elsewhere. Consent is
            // matched on exact userId + workspaceId, so recording the active workspace here would
            // check consent against a workspace that did not run the turn.
            workspaceId: effectiveWorkspaceRoot,
            userId: session?.userId || session?.login || 'dashboard-user',
            sessionId: executionSessionId,
            subjectId: id,
            content: `User:\n${message}\n\nAssistant:\n${completionText}`,
            metadata: { agentId: id, model: resolvedAgent.model || null },
          })
        }
        if (isRuntimeRunawayOutputError(errorText)) {
          // Reported whether or not partial text survived: the text is usually the repetition
          // itself, so showing it without saying what happened reads as a broken answer.
          send('error', 'The agent produced far more output than a reply should contain and was stopped. This usually means it got stuck repeating itself.')
        } else if (!completionText) {
          send('error', isRuntimeCancelledError(errorText)
            ? 'Stopped. The agent was still working, so anything it had not finished was discarded.'
            : deriveChatError(errorText || 'No reply from agent.', resolvedAgent.provider, { agentId: id, model: resolvedAgent.model, runtimeLabel }))
        }
        send('complete', { text: completionText })
        if (!res.writableEnded) {
          res.end()
        }
      }).catch((err) => {
        console.error(`[Chat Route] Auth profile prep error for ${id}:`, err)
        clearInterval(keepalive)
        send('error', `Failed to prepare agent execution: ${err.message}`)
        if (!res.writableEnded) {
          res.end()
        }
      })
    } else {
      const openclawCli = resolveOpenClawCliPath()

      const runChatAttempt = async (attemptModel: string | undefined, attemptProvider: ChatProvider | undefined) => {
        const attemptSessionSeed = buildDashboardChatRetrySeed(sessionSeed, chatSessionRetryAttempt)
        const executionSessionId = scopeSessionIdToModel(
          attemptSessionSeed,
          attemptModel,
        )
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

        type ChatAttemptResult = {
          completionText: string
          rawError: string
          usage: ReturnType<typeof readLatestAssistantUsageFromPersistedSession>
          persistedAssistant: Awaited<ReturnType<typeof readLatestAssistantTextWithRetry>>
          hadVisibleOutput: boolean
          incompleteReason?: string
          sessionId: string
          model?: string
          provider?: ChatProvider
        }

        return await withTemporaryAgentAuthProfiles(id, {
          openai: attemptUseOpenAiCompatible ? undefined : executionEnv.OPENAI_API_KEY,
          anthropic: executionEnv.ANTHROPIC_API_KEY,
          gemini: executionEnv.GEMINI_API_KEY,
          openrouter: executionEnv.OPENROUTER_API_KEY,
          xai: executionEnv.XAI_API_KEY,
          ollamaBaseUrl: executionEnv.OLLAMA_BASE_URL,
          openaiCompatibleApiKey: attemptUseOpenAiCompatible ? executionEnv.OPENAI_API_KEY : undefined,
          openaiCompatibleBaseUrl: attemptUseOpenAiCompatible ? executionEnv.OPENAI_BASE_URL : undefined,
          openaiCompatibleDefaultModel: attemptUseOpenAiCompatible ? (byok?.openaiCompatibleDefaultModel || integrationConfig.openaiCompatibleDefaultModel || attemptModel) : undefined,
        }, attemptModel, attemptProvider, async () => {
          return await new Promise<ChatAttemptResult>((resolve, reject) => {
            if (!openclawCli) {
              reject(new Error('OpenClaw CLI is not available in this runtime. Install or bundle the CLI, or set OPENCLAW_BIN to the executable path.'))
              return
            }

            let fullOutput = ''
            let stderrOutput = ''
            let totalOutputBytes = 0
            let hadVisibleOutput = false
            let incompleteReason: string | undefined
            let attemptSettled = false
            let killEscalation: NodeJS.Timeout | undefined
            // Own process group: openclaw spawns its own children, and signalling only this direct
            // child leaves those grandchildren alive holding the stdout pipe open (see
            // killAttemptTree below -- the same reason runOnce in agent-runtime.ts detaches).
            const attemptDeltaFilter = createStreamingWarningFilter()
            const spawned = spawn(openclawCli, args, {
              env: executionEnv,
              stdio: ['pipe', 'pipe', 'pipe'],
              detached: process.platform !== 'win32',
            })
            proc = spawned
            procExited = false

            send('start', { sessionId: executionSessionId, resumeSessionId: attemptSessionSeed, turnId: turn.turnId })
            invalidateAgentStatusCache(id)

            /**
             * Release the held final line into fullOutput and the stream.
             *
             * MUST run before a settlement path builds its result. A runtime that does not
             * newline-terminate its last line has that line sitting in the filter, and every
             * caller evaluates `completionText: normalizeChatMessage(fullOutput...)` as an
             * argument -- so flushing inside resolveAttempt streamed the tail as a delta and then
             * sent a `complete` without it, and the client replaces the bubble with `complete`'s
             * text. The user watched the last line appear and then vanish.
             *
             * Idempotent: the filter returns nothing once drained.
             */
            const flushStreamTail = () => {
              const tail = attemptDeltaFilter.flush()
              if (!tail) return
              fullOutput = appendBoundedOutput(fullOutput, tail, MAX_RETAINED_CHAT_OUTPUT)
              hadVisibleOutput = true
              send('delta', { text: tail })
            }

            const resolveAttempt = (result: ChatAttemptResult) => {
              if (attemptSettled) return
              attemptSettled = true
              turn.signal.removeEventListener('abort', onAttemptCancel)
              if (killEscalation) clearTimeout(killEscalation)
              // Mirrors settle() in agent-runtime.ts's runOnce: without this, the 'data' listeners
              // below outlive the promise, so a grandchild that escaped the process group keeps
              // writing to the still-open pipe forever, re-entering this closure to grow
              // fullOutput/stderrOutput and hold this process's own end of the pipe open long after
              // the caller has moved on.
              detachProcessStreams(spawned)
              resolve(result)
            }

            // No deadline here either. OpenClaw turns do the same open-ended work, and a quiet
            // stretch is what an agent running tools looks like. Cancellation is the stop condition
            // for silence; a runaway output volume (see recordOutputBytes below) is the other one.
            function onAttemptCancel() {
              if (attemptSettled) return
              // SIGTERM, then an unconditional group SIGKILL, then settle -- see cancelProcessTree.
              killEscalation = cancelProcessTree(spawned, () => {
              // Settle here rather than trusting 'close': close needs every stdio pipe closed, and
              // a grandchild that escaped the process group (its own setsid) can hold stdout open
              // forever -- wedging this promise, runExclusiveAgentExecution's per-agent lock behind
              // it, and every later turn for this agent with nothing able to clear it. SIGKILL is
              // the last thing we can do; once it has been sent there is nothing left worth waiting
              // on, so this resolves from whatever was captured so far rather than the disk session
              // lookup the normal close path below does -- the CLI never exited cleanly, so its
              // session file can't be trusted.
              flushStreamTail()
              resolveAttempt({
                completionText: normalizeChatMessage(fullOutput.trim()),
                rawError: stderrOutput || 'cancelled',
                usage: null,
                persistedAssistant: null,
                hadVisibleOutput,
                sessionId: executionSessionId,
                model: attemptModel,
                provider: attemptProvider,
              })
              })
            }
            if (turn.signal.aborted) onAttemptCancel()
            else turn.signal.addEventListener('abort', onAttemptCancel, { once: true })
            const bumpAttemptIdle = () => turn.touch()

            // A runaway producer is a volume problem, not a time problem, so it stays bounded even
            // with no turn deadline: once combined stdout+stderr crosses MAX_TOTAL_CHAT_OUTPUT this
            // terminates the CLI the same way a cancellation does, and the partial reply captured so
            // far is preserved (see the close handler below) rather than discarded.
            const stopIncompleteAttempt = (reason: string) => {
              if (incompleteReason) return
              incompleteReason = reason
              // Settle off the escalation rather than trusting 'close'. A runaway producer is
              // exactly the case where a grandchild has escaped the group and is still writing, so
              // the pipe stays open, 'close' never fires, and this promise -- plus the per-agent
              // lock behind it -- would wedge with no deadline left to clear either.
              killEscalation = cancelProcessTree(spawned, () => {
                flushStreamTail()
                resolveAttempt({
                  completionText: normalizeChatMessage(fullOutput.trim()),
                  rawError: stderrOutput,
                  usage: null,
                  persistedAssistant: null,
                  hadVisibleOutput,
                  incompleteReason: reason,
                  sessionId: executionSessionId,
                  model: attemptModel,
                  provider: attemptProvider,
                })
              })
            }
            const recordOutputBytes = (chunk: Buffer) => {
              totalOutputBytes += chunk.byteLength
              if (totalOutputBytes > MAX_TOTAL_CHAT_OUTPUT) {
                stopIncompleteAttempt('The agent produced far more output than a reply should contain and was stopped. The partial reply was preserved; this usually means the agent got stuck repeating itself.')
                return false
              }
              return true
            }

            spawned.stdout.on('data', (chunk: Buffer) => {
              // Before the empty-text guard: a suppressed benign warning still proves the process is
              // alive, even though nothing is shown to the user.
              bumpAttemptIdle()
              if (!recordOutputBytes(chunk)) return
              // Line-buffered rather than per-chunk: this filter matches whole lines, and a boxed
              // warning routinely arrives split across two chunks, where neither half matches.
              const text = attemptDeltaFilter.push(chunk.toString())
              if (!text) return
              fullOutput = appendBoundedOutput(fullOutput, text, MAX_RETAINED_CHAT_OUTPUT)
              hadVisibleOutput = true
              send('delta', { text })
            })

            spawned.stderr.on('data', (chunk: Buffer) => {
              bumpAttemptIdle()
              if (!recordOutputBytes(chunk)) return
              stderrOutput = appendBoundedOutput(stderrOutput, chunk.toString(), MAX_RETAINED_CHAT_STDERR)
            })

            spawned.on('exit', () => { procExited = true })

            spawned.on('close', async (code) => {
              // Before anything reads fullOutput: the close path computes normalizedText from it.
              flushStreamTail()
              console.log(`[Chat Route] CLI exited for agent ${id} with code ${code}`)

              if (stderrOutput) {
                console.error(`[Chat Route] stderr for ${id}:`, stderrOutput.slice(0, 500))
              }

              const normalizedText = normalizeChatMessage(fullOutput.trim())
              const persistedAssistant = !incompleteReason && shouldRecoverPersistedAssistant(normalizedText)
                ? await readLatestAssistantTextWithRetry(id, dashboardSessionKey, executionSessionId)
                : null
              const completionText = normalizedText || normalizeChatMessage(persistedAssistant?.content || '') || ''
              const usage = completionText
                ? readLatestAssistantUsageFromPersistedSession(id, dashboardSessionKey, executionSessionId)
                : null

              persistDashboardChatSession(id, executionSessionId)

              resolveAttempt({
                completionText,
                rawError: stderrOutput || (code !== 0 ? 'Agent failed.' : 'No reply from agent.'),
                usage,
                persistedAssistant,
                hadVisibleOutput,
                incompleteReason,
                sessionId: executionSessionId,
                model: attemptModel,
                provider: attemptProvider,
              })
            })

            spawned.on('error', (err) => {
              console.error(`[Chat Route] CLI spawn error for ${id}:`, err)
              reject(err)
            })
          })
        }, { persistAuthProfiles: true, skipModelConfigMutation: true })
      }

      await runExclusiveAgentExecution(id, async () => {
        const primaryResult = await runChatAttempt(resolvedAgent.model, resolvedAgent.provider)
        throwIfChatAttemptNeedsSessionRetry(primaryResult)
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
        const fallbackResult = await runChatAttempt(fallbackModel, fallbackProvider)
        throwIfChatAttemptNeedsSessionRetry(fallbackResult)
        return fallbackResult
      }, {
        maxSessionLockRetries: 1,
        onSessionLockRetry: (attempt) => {
          chatSessionRetryAttempt = attempt + 1
          console.warn(`[Chat Route] Recovering agent ${id} with a fresh chat session after an OpenClaw session conflict`)
        },
      }).then((attemptResult) => {
        clearInterval(keepalive)
        if (attemptResult.incompleteReason) {
          send('error', attemptResult.incompleteReason)
        }
        if (attemptResult.completionText && !attemptResult.incompleteReason) {
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
          const activityUserId = session?.userId || session?.login || 'dashboard-user'
          const activityWorkspaceId = getWorkspacePath()
          appendActivityExportEventsForActiveConsents({
            source: 'agent-chat',
            workspaceId: activityWorkspaceId,
            userId: activityUserId,
            sessionId: attemptResult.sessionId,
            subjectId: id,
            content: `User:\n${message}\n\nAssistant:\n${attemptResult.completionText}`,
            metadata: { agentId: id, model: attemptResult.model || null },
          })
        } else if (!attemptResult.completionText && !attemptResult.incompleteReason) {
          send('error', deriveChatError(attemptResult.rawError, attemptResult.provider, { agentId: id, model: attemptResult.model }))
        }
        send('complete', { text: attemptResult.completionText })
        if (!res.writableEnded) {
          res.end()
        }
      }).catch((err) => {
        console.error(`[Chat Route] Auth profile prep error for ${id}:`, err)
        clearInterval(keepalive)
        send('error', deriveChatError(err?.message || String(err), resolvedAgent.provider, { agentId: id, model: resolvedAgent.model }))
        send('complete', { text: '' })
        if (!res.writableEnded) {
          res.end()
        }
      })
    }
  }).catch((err) => {
    // Both branches above already catch their own errors internally, so this only fires if
    // something throws before either branch's own handling is reached -- but it still has to be
    // here: without it the turn would settle via an unhandled rejection instead of through
    // withRegisteredTurn's `finally`, and this route would be back to leaking on an exit path.
    console.error(`[Chat Route] Unexpected error running chat turn for ${id}:`, err)
    clearInterval(keepalive)
    if (!res.writableEnded) res.end()
  })

  // Handle client disconnect — only kill if process hasn't exited yet
  // A lost connection is NOT a cancellation, and must not kill the turn.
  //
  // Turns routinely run 15-20+ minutes. Over that window a browser refresh, a laptop sleeping, or a
  // proxy timing out an idle response are all ordinary events, and every one of them closes this
  // request while the agent is working perfectly well. Killing on disconnect meant the user lost
  // twenty minutes of work by switching tabs -- and the old 30s grace only narrowed the window
  // rather than fixing the rule.
  //
  // So the turn keeps running and stays in the registry, which is what makes it still cancellable
  // afterwards. Only an explicit stop ends it early.
  req.on('close', () => {
    console.log(`[Chat Route] Client disconnected for agent ${id}, procExited=${procExited}; turn ${turnId} continues`)
    clearInterval(keepalive)
    // Deliberately no kill-after-grace here. A lost connection is not a cancellation: over a
    // twenty-minute turn a browser refresh, a sleeping laptop and a proxy timeout are all ordinary,
    // and each one closes this request while the agent is working perfectly well. The turn keeps
    // running and stays in the registry, which is what makes it still stoppable afterwards.
  })
})

/**
 * Stop a running turn.
 *
 * This is the only kill switch there is: turns have no deadline, so without this a wedged turn
 * runs forever.
 *
 * Scoped to a turn id when the caller has one, which the UI always does -- every `start` event
 * carries it. Cancelling by agent instead would stop turns the clicker never started: two browser
 * tabs on one agent is an ordinary state, and so is one running turn plus one still queued behind
 * the per-agent lock (turns register before acquiring it, so both are in the registry). An earlier
 * version of this route cancelled by agent and justified it with "there is at most one running turn
 * per agent" -- that claim was simply false.
 *
 * Falls back to cancelling every turn for the agent only when no turn id is supplied, which is the
 * deliberate "stop this agent" case.
 *
 * Returns cancelled:false when nothing was running, so the caller can say "it had already
 * finished" instead of reporting a stop that never happened.
 */
router.post('/:id/chat/cancel', (req, res) => {
  const { id } = req.params
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
    return res.status(400).json({ error: 'Invalid agent id' })
  }
  const { turnId } = (req.body || {}) as { turnId?: string }
  if (typeof turnId === 'string' && turnId.trim()) {
    // Guard against one agent's Stop reaching another agent's turn: turn ids are namespaced by
    // agent, so a mismatched prefix means the caller is addressing something that is not theirs.
    if (!turnId.startsWith(`${id}:`)) {
      return res.status(400).json({ error: 'turnId does not belong to this agent' })
    }
    const stopped = cancelTurn(turnId)
    console.log(`[Chat Route] Cancel requested for turn ${turnId}: ${stopped ? 'signalled' : 'already finished'}`)
    return res.json({ cancelled: stopped, count: stopped ? 1 : 0 })
  }
  const cancelled = cancelTurnsForAgent(id)
  console.log(`[Chat Route] Cancel requested for agent ${id} (no turnId): ${cancelled} turn(s) signalled`)
  return res.json({ cancelled: cancelled > 0, count: cancelled })
})

/** What is running right now, with elapsed and idle times. See listActiveTurns for why this exists. */
router.get('/turns/active', (_req, res) => {
  res.json({ turns: listActiveTurns() })
})

export default router
