import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { getWorkspacePath, parseIdentity } from './workspace'
import type { ProviderKeys } from './dashboard-env'
import { REPO_ROOT } from './paths'
import { syncAssignedSkillGuidanceForAgent } from './skills'
import { normalizeAgentModelInput, readAgentModelFromConfigFile, restoreAgentModelInConfigFile, updateAgentModelInConfigFile } from './agent-model'
import { resetAgentSessionsForModelChange } from './agent-model'
import { resolveDefaultAgentModel } from './agent-default-model'
import { getAvailableModelsCached } from './model-discovery'
import { isPinnedRuntimeDisabled, resolveAgentRuntime, type AgentRuntimeId } from './agent-runtime'

interface OpenClawAgentRecord {
  id: string
  workspace?: string
  agentDir?: string
  model?: string
  skills?: string[]
}

interface AuthProfileFile {
  version: number
  profiles: Record<string, { type: 'api_key'; provider: string; key: string }>
  lastGood?: Record<string, string>
  usageStats?: Record<string, any>
}

interface OpenClawConfigFile {
  models?: {
    providers?: Record<string, any>
  }
  agents?: {
    list?: Array<Record<string, any>>
  }
  skills?: {
    load?: {
      extraDirs?: string[]
      [key: string]: any
    }
    [key: string]: any
  }
  [key: string]: any
}

type ExecutionProvider = 'openai' | 'openai-compatible' | 'anthropic' | 'gemini' | 'openrouter' | 'xai' | 'ollama' | null
interface AgentAuthProfileOptions {
  persistAuthProfiles?: boolean
  runtime?: AgentRuntimeId
  skipModelConfigMutation?: boolean
}
const LMSTUDIO_DEFAULT_CONTEXT_TOKENS = 64_000
const OPENCLAW_CONFIG_RELOAD_SETTLE_MS = 1500
let openClawConfigMutationLock: Promise<void> = Promise.resolve()
const agentExecutionLocks = new Map<string, Promise<void>>()
const AGENT_EXECUTION_SESSION_LOCK_RETRIES = 2

interface ExclusiveAgentExecutionOptions {
  onSessionLockRetry?: (attempt: number, error: unknown) => void | Promise<void>
  maxSessionLockRetries?: number
}

function resolveLmstudioServerBase(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim()
  if (!trimmed) return undefined
  return trimmed.replace(/\/api\/v1\/?$/i, '').replace(/\/v1\/?$/i, '').replace(/\/+$/, '')
}

type LmstudioLoadedInstance = {
  id?: string
  config?: {
    context_length?: number
  }
}

type LmstudioWireModel = {
  key?: string
  loaded_instances?: LmstudioLoadedInstance[]
}

function getLmstudioLoadedInstancesBelowContext(model: LmstudioWireModel | undefined, minContextTokens: number): string[] {
  const instances = Array.isArray(model?.loaded_instances) ? model!.loaded_instances : []
  return instances
    .filter((instance) => {
      const length = typeof instance?.config?.context_length === 'number' ? Math.floor(instance.config.context_length) : 0
      return !!instance?.id && length > 0 && length < minContextTokens
    })
    .map((instance) => String(instance!.id))
}

function hasLmstudioLoadedInstanceAtOrAboveContext(model: LmstudioWireModel | undefined, minContextTokens: number): boolean {
  const instances = Array.isArray(model?.loaded_instances) ? model!.loaded_instances : []
  return instances.some((instance) => {
    const length = typeof instance?.config?.context_length === 'number' ? Math.floor(instance.config.context_length) : 0
    return length >= minContextTokens
  })
}

async function normalizeLmstudioLoadedModelState(params: {
  baseUrl?: string
  apiKey?: string
  modelId?: string
  requestedContextTokens?: number
}): Promise<void> {
  const serverBaseUrl = resolveLmstudioServerBase(params.baseUrl)
  const modelId = params.modelId?.trim()
  const requestedContextTokens = typeof params.requestedContextTokens === 'number' && params.requestedContextTokens > 0
    ? Math.floor(params.requestedContextTokens)
    : LMSTUDIO_DEFAULT_CONTEXT_TOKENS
  if (!serverBaseUrl || !modelId) return

  const headers: Record<string, string> = {}
  if (params.apiKey?.trim()) {
    headers.Authorization = `Bearer ${params.apiKey.trim()}`
  }

  const modelsResponse = await fetch(`${serverBaseUrl}/api/v1/models`, {
    headers,
    signal: AbortSignal.timeout(5000),
  })
  if (!modelsResponse.ok) return
  const modelsBody = await modelsResponse.json() as { models?: LmstudioWireModel[] }
  const matchingModel = (modelsBody.models || []).find((entry) => entry?.key?.trim() === modelId)

  const staleInstances = getLmstudioLoadedInstancesBelowContext(matchingModel, requestedContextTokens)
  for (const instanceId of staleInstances) {
    await fetch(`${serverBaseUrl}/api/v1/models/unload`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instance_id: instanceId }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined)
  }

  if (staleInstances.length === 0 && hasLmstudioLoadedInstanceAtOrAboveContext(matchingModel, requestedContextTokens)) {
    return
  }

  await fetch(`${serverBaseUrl}/api/v1/models/load`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      context_length: requestedContextTokens,
    }),
    signal: AbortSignal.timeout(30000),
  }).catch(() => undefined)
}

export function isOpenClawSessionLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  return /session file locked/i.test(message)
    || /EmbeddedAttemptSessionTakeoverError/i.test(message)
    || /session file changed while embedded prompt lock was released/i.test(message)
}

export function getAgentExecutionRetryDelay(attempt: number): number {
  return Math.min(1500 * 2 ** attempt, 5000)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runExclusiveAgentExecution<T>(
  agentId: string,
  fn: () => Promise<T>,
  options: ExclusiveAgentExecutionOptions = {}
): Promise<T> {
  const previous = agentExecutionLocks.get(agentId) || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  // Keep the exact promise that went into the map. The cleanup below compares identity to avoid
  // deleting a newer waiter's entry, and `previous.then(...)` returns a NEW promise -- so storing it
  // inline meant the comparison could never be true and every agent that ever ran a turn kept its
  // entry forever.
  const chained = previous.then(() => current)
  agentExecutionLocks.set(agentId, chained)

  await previous
  try {
    let attempt = 0
    const maxSessionLockRetries = options.maxSessionLockRetries ?? AGENT_EXECUTION_SESSION_LOCK_RETRIES
    while (true) {
      try {
        return await fn()
      } catch (error) {
        if (!isOpenClawSessionLockError(error) || attempt >= maxSessionLockRetries) {
          throw error
        }
        await options.onSessionLockRetry?.(attempt, error)
        await wait(getAgentExecutionRetryDelay(attempt))
        attempt++
      }
    }
  } finally {
    release()
    if (agentExecutionLocks.get(agentId) === chained) {
      agentExecutionLocks.delete(agentId)
    }
  }
}

function readOpenClawAgentRecord(agentId: string, activeWorkspaceAgentDir?: string): OpenClawAgentRecord | null {
  try {
    const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const records = (config?.agents?.list || []).filter((agent: any) => agent.id === agentId)
    if (records.length === 0) return null
    if (activeWorkspaceAgentDir) {
      const exactWorkspaceMatch = records.find((agent: any) => agent.workspace === activeWorkspaceAgentDir)
      if (exactWorkspaceMatch) return exactWorkspaceMatch
      const nestedWorkspaceMatch = records.find((agent: any) => {
        const workspace = String(agent.workspace || '')
        return workspace && activeWorkspaceAgentDir.startsWith(workspace)
      })
      if (nestedWorkspaceMatch) return nestedWorkspaceMatch
    }
    return records[0] || null
  } catch {
    return null
  }
}

export function providerFromModel(model?: string): ExecutionProvider {
  if (!model) return null
  if (model.startsWith('openai-compatible/')) return 'openai-compatible'
  if (model.startsWith('lmstudio/')) return 'openai-compatible'
  if (model.startsWith('openrouter/')) return 'openrouter'
  if (model.startsWith('xai/')) return 'xai'
  if (model.startsWith('openai/') || model.startsWith('gpt-') || /^o[134](?:-|$)/.test(model)) return 'openai'
  if (model.startsWith('anthropic/') || model.startsWith('claude')) return 'anthropic'
  if (model.startsWith('gemini/') || model.startsWith('gemini-') || model.startsWith('google/')) return 'gemini'
  if (model.startsWith('ollama/') || model.includes(':')) return 'ollama'
  return null
}

function normalizeMissingModel(model?: string): string | undefined {
  const trimmed = model?.trim()
  if (!trimmed) return undefined
  if (trimmed.toLowerCase() === 'unknown') return undefined
  return normalizeAgentModelInput(trimmed)
}

function isSupportedHostedModel(model: string | undefined): boolean {
  if (!model) return false
  const provider = providerFromModel(model)
  if (provider === 'openai' || provider === 'anthropic' || provider === 'gemini' || provider === 'openrouter' || provider === 'xai') {
    return true
  }
  const availableModels = getAvailableModelsCached(process.env as Record<string, string>)
  if (provider === 'ollama' || provider === 'openai-compatible') {
    const hasKnownLocalDefaults = availableModels.some((entry) => entry.startsWith(`${provider}/`))
    if (!hasKnownLocalDefaults) return true
    if (availableModels.includes(model)) return true
    if (provider === 'openai-compatible' && model.startsWith('lmstudio/')) {
      return availableModels.includes(`openai-compatible/${model.slice('lmstudio/'.length)}`)
    }
    return false
  }
  if (availableModels.length === 0) return true
  return availableModels.includes(model)
}

export function resolveAgentExecutionConfig(agentId: string): {
  model?: string
  backupModel?: string
  workspace?: string
  agentDir?: string
  provider?: ExecutionProvider
  backupProvider?: ExecutionProvider
  runtime: AgentRuntimeId
  /** Set when IDENTITY.md pins a CLI runtime that is not currently enabled. */
  disabledPinnedRuntime?: AgentRuntimeId
} {
  const activeWorkspaceAgentDir = path.join(getWorkspacePath(), 'AGENTS', agentId)
  const record = readOpenClawAgentRecord(agentId, activeWorkspaceAgentDir)
  const activeWorkspaceIdentityPath = path.join(activeWorkspaceAgentDir, 'IDENTITY.md')
  const hasActiveWorkspaceAgent = fs.existsSync(activeWorkspaceIdentityPath)

  const resolvedWorkspace = hasActiveWorkspaceAgent
    ? activeWorkspaceAgentDir
    : record?.workspace
  const identityPath = hasActiveWorkspaceAgent
    ? activeWorkspaceIdentityPath
    : record?.workspace
      ? path.join(record.workspace, 'IDENTITY.md')
      : path.join(process.env.OPENCLAW_WORKSPACE || '', 'AGENTS', agentId, 'IDENTITY.md')

  let identityModel: string | undefined
  let identityBackupModel: string | undefined
  let identityTags: string[] = []
  let identityRuntime: string | undefined
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    const parsedIdentity = parseIdentity(identity)
    identityModel = normalizeMissingModel(parsedIdentity.model || undefined)
    identityBackupModel = normalizeMissingModel(parsedIdentity.backupModel || undefined)
    identityTags = Array.isArray(parsedIdentity.tags) ? parsedIdentity.tags : []
    identityRuntime = parsedIdentity.runtime || undefined
  } catch {}

  // If the active workspace contains this agent, trust its local identity first.
  // A stale global openclaw.json entry may point at a different workspace with the same agent id.
  const recordModel = normalizeMissingModel(record?.model)
  let model = hasActiveWorkspaceAgent
    ? (identityModel || recordModel || resolveDefaultAgentModel({ rawEnv: process.env as Record<string, string>, builtIn: identityTags.includes('built-in') }))
    : (recordModel || identityModel || resolveDefaultAgentModel({ rawEnv: process.env as Record<string, string>, builtIn: identityTags.includes('built-in') }))
  if (model && !isSupportedHostedModel(model)) {
    model = resolveDefaultAgentModel({
      builtIn: identityTags.includes('built-in'),
      rawEnv: process.env as Record<string, string>,
      availableModels: getAvailableModelsCached(process.env as Record<string, string>),
    }) || model
  }
  const backupModel = (() => {
    const candidate = identityBackupModel
    if (!candidate || candidate === model) return undefined
    return candidate
  })()
  return {
    model,
    backupModel,
    workspace: resolvedWorkspace,
    agentDir: record?.agentDir,
    provider: providerFromModel(model),
    backupProvider: providerFromModel(backupModel),
    runtime: resolveAgentRuntime(agentId, identityRuntime),
    // Pin as written in IDENTITY.md, even when it is not currently enabled — lets callers
    // explain a silent fallback to openclaw instead of reporting a provider-key problem.
    disabledPinnedRuntime: isPinnedRuntimeDisabled(identityRuntime),
  }
}

export function shouldRetryWithBackupModel(errorText: string): boolean {
  const text = String(errorText || '')
  if (!text.trim()) return false
  return /Unknown model:/i.test(text)
    || /No API key found for provider/i.test(text)
    || /Incorrect API key provided/i.test(text)
    || /has auth issue \(skipping all models\)/i.test(text)
    || /insufficient_quota|quota exceeded|rate limit|too many requests|429\b/i.test(text)
    || /is in cooldown \(suspending lanes\)/i.test(text)
    || /\btimeout\b/i.test(text)
    || /All models failed/i.test(text)
}

export function shouldUseExplicitBackupModelRetry(args: {
  backupModel?: string
  backupProvider?: ExecutionProvider
  rawError?: string
  hadVisibleOutput?: boolean
  completionText?: string
}): boolean {
  if (args.completionText) return false
  if (args.hadVisibleOutput) return false
  if (!args.backupModel || !args.backupProvider) return false
  return shouldRetryWithBackupModel(args.rawError || '')
}

export function resolveAgentSkillIds(agentId: string): string[] {
  const activeWorkspaceAgentDir = path.join(getWorkspacePath(), 'AGENTS', agentId)
  const record = readOpenClawAgentRecord(agentId, activeWorkspaceAgentDir)
  return Array.isArray(record?.skills)
    ? record.skills.map((entry) => String(entry || '').trim()).filter(Boolean)
    : []
}

export function deriveWorkspaceRootFromAgentWorkspace(agentWorkspace?: string): string | undefined {
  if (!agentWorkspace) return undefined
  const normalized = path.resolve(agentWorkspace)
  const parent = path.basename(path.dirname(normalized))
  if (parent === 'AGENTS') {
    return path.dirname(path.dirname(normalized))
  }
  return normalized
}

export function scopeSessionIdToModel(sessionId: string, model?: string): string {
  const MAX_SESSION_KEY_LENGTH = 48
  const safeBase = sessionId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const modelToken = (model || '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24)
  const base = safeBase || 'chat'
  const combined = modelToken ? `${base}-${modelToken}` : base

  if (combined.length <= MAX_SESSION_KEY_LENGTH) {
    return combined
  }

  const hash = createHash('sha1').update(combined).digest('hex').slice(0, 8)
  const trimmedBase = base.slice(0, Math.max(8, MAX_SESSION_KEY_LENGTH - hash.length - 1))
  return `${trimmedBase}-${hash}`.slice(0, MAX_SESSION_KEY_LENGTH)
}

export function resolvePersistedAgentSessionId(
  agentId: string,
  sessionKey: string,
  preferredSessionId?: string,
  homeDir: string = process.env.HOME || ''
): string | undefined {
  if (!agentId || !homeDir) return preferredSessionId

  const sessionsDir = path.join(homeDir, '.openclaw', 'agents', agentId, 'sessions')
  const sessionsIndexPath = path.join(sessionsDir, 'sessions.json')

  const hasSessionFile = (sessionId: string | undefined): sessionId is string =>
    !!sessionId && fs.existsSync(path.join(sessionsDir, `${sessionId}.jsonl`))

  if (hasSessionFile(preferredSessionId)) {
    return preferredSessionId
  }

  try {
    if (fs.existsSync(sessionsIndexPath)) {
      const sessionsIndex = JSON.parse(fs.readFileSync(sessionsIndexPath, 'utf-8'))
      const mappedSessionId = typeof sessionsIndex?.[sessionKey]?.sessionId === 'string'
        ? sessionsIndex[sessionKey].sessionId
        : undefined
      if (hasSessionFile(mappedSessionId)) {
        return mappedSessionId
      }

      for (const [key, entry] of Object.entries(sessionsIndex)) {
        if (typeof entry !== 'object' || entry === null) continue
        const entrySessionId = typeof (entry as any).sessionId === 'string'
          ? (entry as any).sessionId
          : undefined
        if (preferredSessionId && key === preferredSessionId && hasSessionFile(entrySessionId)) {
          return entrySessionId
        }
      }
    }
  } catch {}

  try {
    if (!fs.existsSync(sessionsDir)) return preferredSessionId
    const newest = fs.readdirSync(sessionsDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map(entry => {
        const fullPath = path.join(sessionsDir, entry.name)
        return {
          sessionId: entry.name.replace(/\.jsonl$/, ''),
          mtimeMs: fs.statSync(fullPath).mtimeMs,
        }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
    return newest?.sessionId || preferredSessionId
  } catch {
    return preferredSessionId
  }
}

export function readLatestAssistantUsageFromPersistedSession(
  agentId: string,
  sessionKey: string,
  preferredSessionId?: string,
  homeDir: string = process.env.HOME || ''
): {
  sessionId?: string
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  estimatedCostUsd?: number
  model?: string
  provider?: string
} | null {
  const sessionId = resolvePersistedAgentSessionId(agentId, sessionKey, preferredSessionId, homeDir)
  if (!sessionId || !homeDir) return null

  const sessionFile = path.join(homeDir, '.openclaw', 'agents', agentId, 'sessions', `${sessionId}.jsonl`)
  if (!fs.existsSync(sessionFile)) return null

  try {
    const lines = fs.readFileSync(sessionFile, 'utf-8')
      .split('\n')
      .filter((line) => line.trim())

    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = JSON.parse(lines[i])
      const message = entry?.message
      if (entry?.type !== 'message' || message?.role !== 'assistant') continue
      const usage = message?.usage || {}
      return {
        sessionId,
        inputTokens: Number(usage.input || 0),
        outputTokens: Number(usage.output || 0),
        cacheReadTokens: Number(usage.cacheRead || 0),
        estimatedCostUsd: Number(usage?.cost?.total || 0),
        model: typeof message?.model === 'string' ? message.model : undefined,
        provider: typeof message?.provider === 'string' ? message.provider : undefined,
      }
    }
  } catch {}

  return sessionId ? { sessionId } : null
}

export function readLatestAssistantTextFromPersistedSession(
  agentId: string,
  sessionKey: string,
  preferredSessionId?: string,
  homeDir: string = process.env.HOME || ''
): {
  sessionId?: string
  content?: string
} | null {
  const sessionId = resolvePersistedAgentSessionId(agentId, sessionKey, preferredSessionId, homeDir)
  if (!sessionId || !homeDir) return null

  const sessionFile = path.join(homeDir, '.openclaw', 'agents', agentId, 'sessions', `${sessionId}.jsonl`)
  if (!fs.existsSync(sessionFile)) return null

  try {
    const lines = fs.readFileSync(sessionFile, 'utf-8')
      .split('\n')
      .filter((line) => line.trim())

    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = JSON.parse(lines[i])
      const message = entry?.message
      if (entry?.type !== 'message' || message?.role !== 'assistant') continue

      const contentArray = Array.isArray(message?.content) ? message.content : [message?.content]
      const content = contentArray
        .map((part: any) => {
          if (typeof part === 'string') return part
          if (!part || typeof part !== 'object') return ''
          if (part.type === 'text' && typeof part.text === 'string') return part.text
          if (typeof part.text === 'string') return part.text
          if (typeof part.content === 'string') return part.content
          return ''
        })
        .filter(Boolean)
        .join('\n')
        .trim()

      if (content) {
        return {
          sessionId,
          content,
        }
      }
    }
  } catch {}

  return sessionId ? { sessionId } : null
}

function normalizeSessionModel(model?: string): string | undefined {
  if (!model) return undefined
  const trimmed = model.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('anthropic/') || trimmed.startsWith('openai/') || trimmed.startsWith('gemini/') || trimmed.startsWith('google/') || trimmed.startsWith('openrouter/') || trimmed.startsWith('xai/') || trimmed.startsWith('ollama/')) {
    return trimmed
  }
  if (trimmed.startsWith('lmstudio/')) return trimmed
  if (trimmed.startsWith('openai-compatible/')) return trimmed
  if (trimmed.startsWith('claude')) return `anthropic/${trimmed}`
  if (trimmed.startsWith('gpt-') || trimmed.startsWith('o1')) return `openai/${trimmed}`
  if (trimmed.startsWith('gemini-')) return `google/${trimmed}`
  if (trimmed.includes(':')) return `ollama/${trimmed}`
  return trimmed
}

export function toExecutionModelOverride(model: string | undefined, provider: ExecutionProvider | undefined): string | undefined {
  const trimmed = model?.trim()
  if (!trimmed) return undefined
  if (provider === 'openai-compatible' && trimmed.startsWith('openai-compatible/')) {
    return `lmstudio/${trimmed.slice('openai-compatible/'.length)}`
  }
  if (provider === 'openai' && /^(?:openai\/)?gpt-(?:4o(?:-mini)?|4\.1(?:-mini)?|5)$/i.test(trimmed)) {
    return 'openai/gpt-5.4-mini'
  }
  return trimmed
}

function resetSessionsIfModelChanged(agentId: string, preferredModel?: string) {
  const normalizedPreferred = normalizeSessionModel(preferredModel)
  if (!normalizedPreferred) return

  try {
    const sessionsPath = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'sessions', 'sessions.json')
    if (!fs.existsSync(sessionsPath)) return
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
    const persistedModels = Object.values(sessions || {})
      .map((entry: any) => normalizeSessionModel(entry?.model || entry?.systemPromptReport?.model))
      .filter(Boolean) as string[]
    const hasMismatchedModel = persistedModels.some((model) => model !== normalizedPreferred)
    if (!hasMismatchedModel) return

    const reset = resetAgentSessionsForModelChange(process.env.HOME || '', agentId)
    if (!reset.ok) {
      throw new Error(reset.error || `Failed to reset runtime sessions for ${agentId}`)
    }
  } catch (err) {
    console.warn(`[Agent Execution] Failed to inspect/reset sessions for ${agentId}:`, err)
  }
}

function readOpenClawConfigFile(configPath: string): OpenClawConfigFile {
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

function writeOpenClawConfigFile(configPath: string, config: OpenClawConfigFile) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function ensureWorkspaceAgentRecordForExecution(
  configPath: string,
  agentId: string,
  execution: { workspace?: string; agentDir?: string },
  preferredModel?: string
): void {
  if (!execution.workspace || !fs.existsSync(configPath)) return

  const config = readOpenClawConfigFile(configPath)
  config.agents = config.agents || {}
  config.agents.list = Array.isArray(config.agents.list) ? config.agents.list : []

  const exactIndex = config.agents.list.findIndex((agent: any) =>
    agent?.id === agentId && typeof agent?.workspace === 'string' && agent.workspace === execution.workspace
  )
  const agentDir = execution.agentDir || path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'agent')
  const model = normalizeMissingModel(preferredModel)

  if (exactIndex >= 0) {
    const current = { ...config.agents.list[exactIndex] }
    let changed = false
    if (!current.name) {
      current.name = agentId
      changed = true
    }
    if (!current.agentDir && agentDir) {
      current.agentDir = agentDir
      changed = true
    }
    if (model && current.model !== model) {
      current.model = model
      changed = true
    }
    if (changed) {
      config.agents.list[exactIndex] = current
      writeOpenClawConfigFile(configPath, config)
    }
    return
  }

  const nextAgent: Record<string, any> = {
    id: agentId,
    name: agentId,
    workspace: execution.workspace,
    agentDir,
  }
  if (model) nextAgent.model = model
  config.agents.list.push(nextAgent)
  writeOpenClawConfigFile(configPath, config)
}

function normalizePathForConfig(value: string): string {
  return path.resolve(value)
}

function ensureWorkspaceSkillRootForExecution(
  configPath: string,
  execution: { workspace?: string }
): boolean {
  if (!execution.workspace || !fs.existsSync(configPath)) return false

  const workspaceRoot = deriveWorkspaceRootFromAgentWorkspace(execution.workspace)
  if (!workspaceRoot) return false

  const customSkillsDir = path.join(workspaceRoot, 'SKILLS', 'custom')
  if (!fs.existsSync(customSkillsDir)) return false

  const config = readOpenClawConfigFile(configPath)
  config.skills = config.skills || {}
  config.skills.load = config.skills.load || {}
  const extraDirs = Array.isArray(config.skills.load.extraDirs) ? config.skills.load.extraDirs : []
  const normalizedCustomSkillsDir = normalizePathForConfig(customSkillsDir)
  const alreadyPresent = extraDirs.some((entry) => normalizePathForConfig(entry) === normalizedCustomSkillsDir)
  if (alreadyPresent) return false

  config.skills.load.extraDirs = [...extraDirs, customSkillsDir]
  writeOpenClawConfigFile(configPath, config)
  return true
}

function ensureBundledRepoSkillRootForExecution(
  configPath: string,
  agentId: string,
  execution: { workspace?: string }
): boolean {
  const repoCustomSkillsDir = path.join(REPO_ROOT, 'SKILLS', 'custom')
  if (!fs.existsSync(repoCustomSkillsDir) || !fs.existsSync(configPath)) return false

  const config = readOpenClawConfigFile(configPath)
  const agentList = Array.isArray(config?.agents?.list) ? config.agents.list : []
  const matchingAgent = agentList.find((agent: any) =>
    agent?.id === agentId && (!execution.workspace || agent?.workspace === execution.workspace)
  ) || agentList.find((agent: any) => agent?.id === agentId)
  const skills = Array.isArray(matchingAgent?.skills)
    ? matchingAgent.skills.map((entry: any) => String(entry || '').trim()).filter(Boolean)
    : []
  if (skills.length === 0) return false

  const needsRepoSkillRoot = skills.some((skillId) => fs.existsSync(path.join(repoCustomSkillsDir, skillId)))
  if (!needsRepoSkillRoot) return false

  config.skills = config.skills || {}
  config.skills.load = config.skills.load || {}
  const extraDirs = Array.isArray(config.skills.load.extraDirs) ? config.skills.load.extraDirs : []
  const normalizedRepoCustomSkillsDir = normalizePathForConfig(repoCustomSkillsDir)
  const alreadyPresent = extraDirs.some((entry) => normalizePathForConfig(entry) === normalizedRepoCustomSkillsDir)
  if (alreadyPresent) return false

  config.skills.load.extraDirs = [...extraDirs, repoCustomSkillsDir]
  writeOpenClawConfigFile(configPath, config)
  return true
}

function getWorkspaceCustomSkillsDir(execution: { workspace?: string }): string | undefined {
  if (!execution.workspace) return undefined
  const workspaceRoot = deriveWorkspaceRootFromAgentWorkspace(execution.workspace)
  if (!workspaceRoot) return undefined
  const customSkillsDir = path.join(workspaceRoot, 'SKILLS', 'custom')
  return fs.existsSync(customSkillsDir) ? customSkillsDir : undefined
}

function listWorkspaceCustomSkillDirsForAgent(
  configPath: string,
  agentId: string,
  execution: { workspace?: string }
): string[] {
  const customSkillsDir = getWorkspaceCustomSkillsDir(execution)
  if (!customSkillsDir || !fs.existsSync(configPath)) return []

  try {
    const config = readOpenClawConfigFile(configPath)
    const agentList = Array.isArray(config?.agents?.list) ? config.agents.list : []
    const matchingAgent = agentList.find((agent: any) =>
      agent?.id === agentId && (!execution.workspace || agent?.workspace === execution.workspace)
    ) || agentList.find((agent: any) => agent?.id === agentId)
    const skills = Array.isArray(matchingAgent?.skills) ? matchingAgent.skills.map((entry: any) => String(entry || '').trim()).filter(Boolean) : []
    if (skills.length === 0) return []

    return skills
      .map((skillId) => path.join(customSkillsDir, skillId))
      .filter((skillDir) => fs.existsSync(skillDir))
  } catch {
    return []
  }
}

function getNewestFileMtimeMs(targetPath: string): number {
  if (!fs.existsSync(targetPath)) return 0
  try {
    const stats = fs.statSync(targetPath)
    if (!stats.isDirectory()) {
      return stats.mtimeMs
    }

    let newest = stats.mtimeMs
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      newest = Math.max(newest, getNewestFileMtimeMs(path.join(targetPath, entry.name)))
    }
    return newest
  } catch {
    return 0
  }
}

function getLatestPersistedSessionMtimeMs(agentId: string, homeDir: string = process.env.HOME || ''): number {
  if (!agentId || !homeDir) return 0
  const sessionsDir = path.join(homeDir, '.openclaw', 'agents', agentId, 'sessions')
  if (!fs.existsSync(sessionsDir)) return 0

  try {
    return fs.readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => fs.statSync(path.join(sessionsDir, entry.name)).mtimeMs)
      .reduce((max, value) => Math.max(max, value), 0)
  } catch {
    return 0
  }
}

function resetSessionsIfWorkspaceSkillsChanged(
  configPath: string,
  agentId: string,
  execution: { workspace?: string }
) {
  const skillDirs = listWorkspaceCustomSkillDirsForAgent(configPath, agentId, execution)
  if (skillDirs.length === 0) return

  const newestSkillMtime = skillDirs
    .map((skillDir) => getNewestFileMtimeMs(skillDir))
    .reduce((max, value) => Math.max(max, value), 0)
  if (!newestSkillMtime) return

  const latestSessionMtime = getLatestPersistedSessionMtimeMs(agentId)
  if (latestSessionMtime >= newestSkillMtime) return

  const reset = resetAgentSessionsForModelChange(process.env.HOME || '', agentId)
  if (!reset.ok) {
    console.warn(`[Agent Execution] Failed to reset sessions after workspace skill update for ${agentId}: ${reset.error || 'unknown error'}`)
  }
}

function buildAuthProfiles(providerKeys: ProviderKeys, preferredProvider?: ExecutionProvider): AuthProfileFile {
  const profiles: AuthProfileFile['profiles'] = {}
  const lastGood: Record<string, string> = {}

  if (providerKeys.openai) {
    profiles['openai-key'] = { type: 'api_key', provider: 'openai', key: providerKeys.openai }
    // Select only the requested provider; without a preference, select a sole configured provider.
    if (preferredProvider === 'openai' || preferredProvider === 'openai-compatible' || (!preferredProvider && !providerKeys.anthropic && !providerKeys.gemini && !providerKeys.openrouter && !providerKeys.xai)) {
      lastGood.openai = 'openai-key'
    }
  } else if (providerKeys.openaiCompatibleBaseUrl) {
    profiles['openai-key'] = { type: 'api_key', provider: 'openai', key: providerKeys.openaiCompatibleApiKey || 'openai-compatible' }
    profiles['lmstudio-key'] = { type: 'api_key', provider: 'lmstudio', key: providerKeys.openaiCompatibleApiKey || 'lmstudio-local' }
    if (preferredProvider === 'openai-compatible' || (!preferredProvider && !providerKeys.anthropic && !providerKeys.gemini && !providerKeys.openrouter && !providerKeys.xai)) {
      lastGood.openai = 'openai-key'
      lastGood.lmstudio = 'lmstudio-key'
    }
  }
  if (providerKeys.anthropic) {
    profiles['anthropic-key'] = { type: 'api_key', provider: 'anthropic', key: providerKeys.anthropic }
    if (preferredProvider === 'anthropic' || (!preferredProvider && !providerKeys.openai && !providerKeys.gemini && !providerKeys.openrouter && !providerKeys.xai)) {
      lastGood.anthropic = 'anthropic-key'
    }
  }
  if (providerKeys.gemini) {
    profiles['gemini-key'] = { type: 'api_key', provider: 'gemini', key: providerKeys.gemini }
    profiles['google-key'] = { type: 'api_key', provider: 'google', key: providerKeys.gemini }
    if (preferredProvider === 'gemini' || (!preferredProvider && !providerKeys.openai && !providerKeys.anthropic && !providerKeys.openrouter && !providerKeys.xai)) {
      lastGood.gemini = 'gemini-key'
      lastGood.google = 'google-key'
    }
  }
  if (providerKeys.openrouter) {
    profiles['openrouter-key'] = { type: 'api_key', provider: 'openrouter', key: providerKeys.openrouter }
    if (preferredProvider === 'openrouter' || (!preferredProvider && !providerKeys.openai && !providerKeys.anthropic && !providerKeys.gemini && !providerKeys.xai)) {
      lastGood.openrouter = 'openrouter-key'
    }
  }
  if (providerKeys.xai) {
    profiles['xai-key'] = { type: 'api_key', provider: 'xai', key: providerKeys.xai }
    if (preferredProvider === 'xai' || (!preferredProvider && !providerKeys.openai && !providerKeys.anthropic && !providerKeys.gemini && !providerKeys.openrouter)) {
      lastGood.xai = 'xai-key'
    }
  }

  return {
    version: 1,
    profiles,
    lastGood: Object.keys(lastGood).length > 0 ? lastGood : undefined,
    usageStats: {},
  }
}

function authProfileStateFingerprint(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as AuthProfileFile
    return JSON.stringify({
      version: parsed.version || 1,
      profiles: parsed.profiles || {},
      lastGood: parsed.lastGood || {},
    })
  } catch {
    return raw
  }
}

function persistPinnedOpenClawAuthStore(agentDir: string, store: AuthProfileFile): boolean {
  const helperPath = path.join(REPO_ROOT, 'SYSTEM', 'dashboard', 'openclaw-auth-store.mjs')
  const packageRoot = process.env.OPENCLAW_PACKAGE_ROOT || '/usr/local/lib/node_modules/openclaw'
  if (!fs.existsSync(helperPath) || !fs.existsSync(path.join(packageRoot, 'dist'))) return false

  const result = spawnSync(process.execPath, [helperPath, agentDir], {
    input: JSON.stringify(store),
    encoding: 'utf8',
    env: {
      ...process.env,
      OPENCLAW_PACKAGE_ROOT: packageRoot,
    },
  })
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim()
    throw new Error(`Failed to persist OpenClaw auth store for ${path.basename(path.dirname(agentDir))}: ${detail || `exit ${result.status}`}`)
  }
  return true
}

export async function withTemporaryAgentAuthProfiles<T>(
  agentId: string,
  providerKeys: ProviderKeys,
  preferredModel: string | undefined,
  preferredProvider: ExecutionProvider | undefined,
  fn: () => Promise<T>,
  options: AgentAuthProfileOptions = {}
): Promise<T> {
  // Non-openclaw runtimes don't use ~/.openclaw's auth-profiles.json / openclaw.json / session
  // stores at all — everything below this line is openclaw-CLI-specific plumbing.
  if (options.runtime && options.runtime !== 'openclaw') return await fn()

  const execution = resolveAgentExecutionConfig(agentId)
  const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
  const hadConfig = fs.existsSync(configPath)
  try {
    const toolsChanged = syncAssignedSkillGuidanceForAgent(agentId, {
      agentWorkspaceDir: execution.workspace,
    })
    if (toolsChanged) {
      const reset = resetAgentSessionsForModelChange(process.env.HOME || '', agentId)
      if (!reset.ok) {
        console.warn(`[Agent Execution] Failed to reset sessions after assigned skill guidance sync for ${agentId}: ${reset.error || 'unknown error'}`)
      }
    }
  } catch (err: any) {
    const message = String(err?.message || err || '')
    if (!/EPERM|EACCES|operation not permitted/i.test(message)) {
      console.warn(`[Agent Execution] Failed to sync assigned skill guidance for ${agentId}: ${message}`)
    }
  }
  if (hadConfig) {
    ensureWorkspaceAgentRecordForExecution(
      configPath,
      agentId,
      execution,
      options.skipModelConfigMutation ? undefined : preferredModel
    )
    const skillRootChanged = ensureWorkspaceSkillRootForExecution(configPath, execution)
    const bundledSkillRootChanged = ensureBundledRepoSkillRootForExecution(configPath, agentId, execution)
    if (skillRootChanged || bundledSkillRootChanged) {
      resetAgentSessionsForModelChange(process.env.HOME || '', agentId)
    }
    resetSessionsIfWorkspaceSkillsChanged(configPath, agentId, execution)
  }
  resetSessionsIfModelChanged(agentId, preferredModel)
  const workspaceOptions = { workspacePath: execution.workspace }
  const readCurrentModel = () => {
    if (!hadConfig) return { ok: false as const, model: undefined }
    let current = readAgentModelFromConfigFile(configPath, agentId, workspaceOptions)
    if (!current.ok && !execution.workspace) {
      current = readAgentModelFromConfigFile(configPath, agentId)
    }
    return current
  }
  const restoreModelOverride = (model: string | undefined) => {
    let restore = restoreAgentModelInConfigFile(configPath, agentId, model, workspaceOptions)
    if (!restore.ok && !execution.workspace) {
      restore = restoreAgentModelInConfigFile(configPath, agentId, model)
    }
    if (!restore.ok) {
      throw new Error(restore.error || `Failed to restore model override for ${agentId}`)
    }
  }
  const readCurrentOllamaProviderConfig = () => {
    if (!hadConfig) return { exists: false, config: undefined as Record<string, any> | undefined }
    const config = readOpenClawConfigFile(configPath)
    const providerConfig = config.models?.providers?.ollama
    return {
      exists: Object.prototype.hasOwnProperty.call(config.models?.providers || {}, 'ollama'),
      config: providerConfig && typeof providerConfig === 'object' ? cloneJsonValue(providerConfig) : providerConfig,
    }
  }
  const readCurrentOpenAiCompatibleProviderConfig = () => {
    if (!hadConfig) return { exists: false, config: undefined as Record<string, any> | undefined }
    const config = readOpenClawConfigFile(configPath)
    const providerConfig = config.models?.providers?.lmstudio
    return {
      exists: Object.prototype.hasOwnProperty.call(config.models?.providers || {}, 'lmstudio'),
      config: providerConfig && typeof providerConfig === 'object' ? cloneJsonValue(providerConfig) : providerConfig,
    }
  }
  const applyOllamaProviderConfig = (baseUrl?: string) => {
    if (!hadConfig) return false
    const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, '')
    const config = readOpenClawConfigFile(configPath)
    const providers = config.models?.providers || {}
    const previousProviderConfig = providers.ollama
    const nextProviderConfig = previousProviderConfig && typeof previousProviderConfig === 'object'
      ? cloneJsonValue(previousProviderConfig)
      : {}
    if (normalizedBaseUrl) {
      nextProviderConfig.baseUrl = normalizedBaseUrl
    }
    if (!nextProviderConfig.api) {
      nextProviderConfig.api = 'ollama'
    }
    if (!Array.isArray(nextProviderConfig.models)) {
      nextProviderConfig.models = []
    }
    config.models = config.models || {}
    config.models.providers = providers
    config.models.providers.ollama = nextProviderConfig
    writeOpenClawConfigFile(configPath, config)
    return true
  }
  const applyOpenAiCompatibleProviderConfig = (baseUrl?: string, preferredModel?: string, apiKey?: string) => {
    if (!hadConfig) return false
    const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, '')
    const config = readOpenClawConfigFile(configPath)
    const providers = config.models?.providers || {}
    const previousProviderConfig = providers.lmstudio
    const nextProviderConfig = previousProviderConfig && typeof previousProviderConfig === 'object'
      ? cloneJsonValue(previousProviderConfig)
      : {}
    const normalizedModel = preferredModel?.trim().replace(/^lmstudio\//, '')
    if (normalizedBaseUrl) {
      nextProviderConfig.baseUrl = normalizedBaseUrl
    }
    if (!nextProviderConfig.api) {
      nextProviderConfig.api = 'openai-completions'
    }
    if (apiKey?.trim()) {
      nextProviderConfig.apiKey = apiKey.trim()
    } else if (!nextProviderConfig.apiKey) {
      nextProviderConfig.apiKey = 'lmstudio-local'
    }
    const existingModels = Array.isArray(nextProviderConfig.models) ? nextProviderConfig.models : []
    if (normalizedModel) {
      const hasModel = existingModels.some((entry: any) =>
        typeof entry === 'object' && entry !== null && String(entry.id || '').trim() === normalizedModel
      )
      nextProviderConfig.models = hasModel
        ? existingModels.map((entry: any) => {
            if (typeof entry !== 'object' || entry === null || String(entry.id || '').trim() !== normalizedModel) {
              return entry
            }
            return {
              ...entry,
              id: normalizedModel,
              name: entry.name || normalizedModel,
              contextWindow: typeof entry.contextWindow === 'number' && entry.contextWindow > 0 ? entry.contextWindow : LMSTUDIO_DEFAULT_CONTEXT_TOKENS,
              contextTokens: typeof entry.contextTokens === 'number' && entry.contextTokens > 0 ? entry.contextTokens : LMSTUDIO_DEFAULT_CONTEXT_TOKENS,
              maxTokens: typeof entry.maxTokens === 'number' && entry.maxTokens > 0 ? entry.maxTokens : Math.min(8_192, LMSTUDIO_DEFAULT_CONTEXT_TOKENS),
            }
          })
        : [...existingModels, {
            id: normalizedModel,
            name: normalizedModel,
            contextWindow: LMSTUDIO_DEFAULT_CONTEXT_TOKENS,
            contextTokens: LMSTUDIO_DEFAULT_CONTEXT_TOKENS,
            maxTokens: 8_192,
          }]
      const executionModelRef = `lmstudio/${normalizedModel}`
      const mutableConfig = config as any
      mutableConfig.agents = mutableConfig.agents && typeof mutableConfig.agents === 'object' && !Array.isArray(mutableConfig.agents)
        ? mutableConfig.agents
        : {}
      mutableConfig.agents.defaults = mutableConfig.agents.defaults && typeof mutableConfig.agents.defaults === 'object' && !Array.isArray(mutableConfig.agents.defaults)
        ? mutableConfig.agents.defaults
        : {}
      mutableConfig.agents.defaults.models = mutableConfig.agents.defaults.models && typeof mutableConfig.agents.defaults.models === 'object' && !Array.isArray(mutableConfig.agents.defaults.models)
        ? mutableConfig.agents.defaults.models
        : {}
      if (!Object.prototype.hasOwnProperty.call(mutableConfig.agents.defaults.models, executionModelRef)) {
        mutableConfig.agents.defaults.models[executionModelRef] = {}
      }
    } else if (!Array.isArray(nextProviderConfig.models)) {
      nextProviderConfig.models = []
    }
    config.models = config.models || {}
    config.models.providers = providers
    config.models.providers.lmstudio = nextProviderConfig
    writeOpenClawConfigFile(configPath, config)
    return true
  }
  const restoreOllamaProviderConfig = (previous: { exists: boolean; config?: Record<string, any> }) => {
    if (!hadConfig) return
    const config = readOpenClawConfigFile(configPath)
    config.models = config.models || {}
    config.models.providers = config.models.providers || {}
    if (previous.exists) {
      config.models.providers.ollama = previous.config
    } else {
      delete config.models.providers.ollama
      if (Object.keys(config.models.providers).length === 0) {
        delete config.models.providers
      }
      if (config.models && Object.keys(config.models).length === 0) {
        delete config.models
      }
    }
    writeOpenClawConfigFile(configPath, config)
  }
  const restoreOpenAiCompatibleProviderConfig = (previous: { exists: boolean; config?: Record<string, any> }) => {
    if (!hadConfig) return
    const config = readOpenClawConfigFile(configPath)
    config.models = config.models || {}
    config.models.providers = config.models.providers || {}
    if (previous.exists) {
      config.models.providers.lmstudio = previous.config
    } else {
      delete config.models.providers.lmstudio
      if (Object.keys(config.models.providers).length === 0) {
        delete config.models.providers
      }
      if (config.models && Object.keys(config.models).length === 0) {
        delete config.models
      }
    }
    writeOpenClawConfigFile(configPath, config)
  }

  const runWithConfigMutationLock = async <R>(fn: () => R | Promise<R>): Promise<R> => {
    const previous = openClawConfigMutationLock
    let release!: () => void
    openClawConfigMutationLock = new Promise<void>(resolve => { release = resolve })
    await previous
    try {
      return await fn()
    } finally {
      release()
    }
  }

  const applyModelOverride = (model: string | undefined) => {
    if (!model || !hadConfig) return false
    let update = updateAgentModelInConfigFile(configPath, agentId, model, {
      workspacePath: execution.workspace,
    })
    if (!update.ok && !execution.workspace) {
      update = updateAgentModelInConfigFile(configPath, agentId, model)
    }
    if (!update.ok) {
      throw new Error(update.error || `Failed to apply temporary model override for ${agentId}`)
    }
    return true
  }

  if (preferredProvider === 'ollama') {
    const previousOllamaProvider = readCurrentOllamaProviderConfig()
    const normalizedOllamaBaseUrl = providerKeys.ollamaBaseUrl?.trim().replace(/\/+$/, '')
    const shouldInjectOllamaProvider = Boolean(
      hadConfig &&
      (
        (normalizedOllamaBaseUrl && !previousOllamaProvider.exists) ||
        (normalizedOllamaBaseUrl && previousOllamaProvider.config?.baseUrl !== normalizedOllamaBaseUrl) ||
        (previousOllamaProvider.exists && !previousOllamaProvider.config?.api)
      )
    )

    if (shouldInjectOllamaProvider) {
      await runWithConfigMutationLock(async () => {
        const latestOllamaProvider = readCurrentOllamaProviderConfig()
        const latestBaseUrl = latestOllamaProvider.config?.baseUrl
        const latestHasApi = !!latestOllamaProvider.config?.api
        let changed = false
        if (
          (normalizedOllamaBaseUrl && (!latestOllamaProvider.exists || latestBaseUrl !== normalizedOllamaBaseUrl)) ||
          (latestOllamaProvider.exists && !latestHasApi)
        ) {
          changed = applyOllamaProviderConfig(normalizedOllamaBaseUrl)
        }
        if (changed) {
          await wait(OPENCLAW_CONFIG_RELOAD_SETTLE_MS)
        }
      })
    }

    return await fn()
  }

  if (preferredProvider === 'openai-compatible') {
    const previousOpenAiCompatibleProvider = readCurrentOpenAiCompatibleProviderConfig()
    const normalizedOpenAiCompatibleBaseUrl = providerKeys.openaiCompatibleBaseUrl?.trim().replace(/\/+$/, '')
    const executionModelOverride = toExecutionModelOverride(preferredModel, preferredProvider)
    const executionLmstudioModelId = executionModelOverride?.replace(/^lmstudio\//, '')
    const shouldInjectOpenAiCompatibleProvider = Boolean(
      hadConfig &&
      (
        (normalizedOpenAiCompatibleBaseUrl && !previousOpenAiCompatibleProvider.exists) ||
        (normalizedOpenAiCompatibleBaseUrl && previousOpenAiCompatibleProvider.config?.baseUrl !== normalizedOpenAiCompatibleBaseUrl) ||
        (previousOpenAiCompatibleProvider.exists && !previousOpenAiCompatibleProvider.config?.api) ||
        (providerKeys.openaiCompatibleApiKey?.trim() && previousOpenAiCompatibleProvider.config?.apiKey !== providerKeys.openaiCompatibleApiKey.trim()) ||
        !(
          executionLmstudioModelId &&
          Array.isArray(previousOpenAiCompatibleProvider.config?.models) &&
          previousOpenAiCompatibleProvider.config?.models.some((entry: any) =>
            typeof entry === 'object' && entry !== null && String(entry.id || '').trim() === executionLmstudioModelId
          )
        )
      )
    )

    if (shouldInjectOpenAiCompatibleProvider) {
      await runWithConfigMutationLock(async () => {
        const latestOpenAiCompatibleProvider = readCurrentOpenAiCompatibleProviderConfig()
        const latestHasExecutionModel = Boolean(
          executionLmstudioModelId &&
          Array.isArray(latestOpenAiCompatibleProvider.config?.models) &&
          latestOpenAiCompatibleProvider.config?.models.some((entry: any) =>
            typeof entry === 'object' && entry !== null && String(entry.id || '').trim() === executionLmstudioModelId
          )
        )
        let changed = false
        if (
          (normalizedOpenAiCompatibleBaseUrl && !latestOpenAiCompatibleProvider.exists) ||
          (normalizedOpenAiCompatibleBaseUrl && latestOpenAiCompatibleProvider.config?.baseUrl !== normalizedOpenAiCompatibleBaseUrl) ||
          (latestOpenAiCompatibleProvider.exists && !latestOpenAiCompatibleProvider.config?.api) ||
          (providerKeys.openaiCompatibleApiKey?.trim() && latestOpenAiCompatibleProvider.config?.apiKey !== providerKeys.openaiCompatibleApiKey.trim()) ||
          !latestHasExecutionModel
        ) {
          changed = applyOpenAiCompatibleProviderConfig(
            normalizedOpenAiCompatibleBaseUrl,
            executionModelOverride,
            providerKeys.openaiCompatibleApiKey,
          )
        }
        if (changed) {
          await wait(OPENCLAW_CONFIG_RELOAD_SETTLE_MS)
        }
      })
    }

    await normalizeLmstudioLoadedModelState({
      baseUrl: normalizedOpenAiCompatibleBaseUrl,
      apiKey: providerKeys.openaiCompatibleApiKey,
      modelId: executionLmstudioModelId,
      requestedContextTokens: LMSTUDIO_DEFAULT_CONTEXT_TOKENS,
    })

    return await fn()
  }

  const agentDir = execution.agentDir || path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  fs.mkdirSync(agentDir, { recursive: true })

  const hadExisting = fs.existsSync(authProfilePath)
  const previous = hadExisting ? fs.readFileSync(authProfilePath, 'utf-8') : null
  // If preferred provider's key is missing, fall back to available provider's model
  let effectiveModel = preferredModel
  let effectiveProvider = preferredProvider
  const prefersOpenAiFamily = preferredProvider === 'openai'
  if (preferredProvider === 'anthropic' && !providerKeys.anthropic && providerKeys.openai) {
    effectiveModel = 'openai/gpt-4.1'
    effectiveProvider = 'openai'
    console.log(`[Auth] Agent ${agentId}: no Anthropic key, falling back to ${effectiveModel}`)
  } else if (prefersOpenAiFamily && !providerKeys.openai && !providerKeys.openaiCompatibleBaseUrl && providerKeys.anthropic) {
    effectiveModel = 'anthropic/claude-sonnet-4-20250514'
    effectiveProvider = 'anthropic'
    console.log(`[Auth] Agent ${agentId}: no OpenAI key, falling back to ${effectiveModel}`)
  } else if (preferredProvider === 'gemini' && !providerKeys.gemini && providerKeys.openai) {
    effectiveModel = 'openai/gpt-4.1'
    effectiveProvider = 'openai'
    console.log(`[Auth] Agent ${agentId}: no Gemini key, falling back to ${effectiveModel}`)
  } else if (preferredProvider === 'gemini' && !providerKeys.gemini && providerKeys.anthropic) {
    effectiveModel = 'anthropic/claude-sonnet-4-20250514'
    effectiveProvider = 'anthropic'
    console.log(`[Auth] Agent ${agentId}: no Gemini key, falling back to ${effectiveModel}`)
  }

  const nextAuthProfiles = buildAuthProfiles(providerKeys, effectiveProvider)
  const nextAuthProfilesSerialized = JSON.stringify(nextAuthProfiles, null, 2)
  const authProfilesChanged = authProfileStateFingerprint(previous) !== authProfileStateFingerprint(nextAuthProfilesSerialized)
  const hasNextAuthProfiles = Object.keys(nextAuthProfiles.profiles).length > 0

  if (hasNextAuthProfiles) {
    fs.writeFileSync(authProfilePath, nextAuthProfilesSerialized, 'utf-8')
    persistPinnedOpenClawAuthStore(agentDir, nextAuthProfiles)
    if (authProfilesChanged) {
      resetAgentSessionsForModelChange(process.env.HOME || '', agentId)
    }
  }
  const currentConfigModel = readCurrentModel()
  const previousModel = currentConfigModel.ok ? currentConfigModel.model : undefined
  const shouldOverrideModel = Boolean(
    hadConfig &&
    !options.skipModelConfigMutation &&
    effectiveModel &&
    effectiveModel !== previousModel
  )

  try {
    if (!shouldOverrideModel) {
      return await fn()
    }

    return await runWithConfigMutationLock(async () => {
      applyModelOverride(effectiveModel)
      try {
        return await fn()
      } finally {
        restoreModelOverride(previousModel)
      }
    })
  } finally {
    if (options.persistAuthProfiles) {
      // Agent runs can launch async OpenClaw subagents after the parent CLI command exits.
      // Leave Dashboard-provided auth in place so those child lanes can authenticate.
    } else if (!hasNextAuthProfiles) {
      // No replacement credentials were supplied, so preserve any existing store.
    } else if (previous !== null) {
      fs.writeFileSync(authProfilePath, previous, 'utf-8')
    } else if (fs.existsSync(authProfilePath)) {
      fs.unlinkSync(authProfilePath)
    }
  }
}
