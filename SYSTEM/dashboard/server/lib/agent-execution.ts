import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { getWorkspacePath, parseIdentity } from './workspace'
import type { ProviderKeys } from './dashboard-env'
import { readAgentModelFromConfigFile, restoreAgentModelInConfigFile, updateAgentModelInConfigFile } from './agent-model'
import { resetAgentSessionsForModelChange } from './agent-model'
import { resolveDefaultAgentModel } from './agent-default-model'
import { getAvailableModelsCached } from './model-discovery'

interface OpenClawAgentRecord {
  id: string
  workspace?: string
  agentDir?: string
  model?: string
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
  [key: string]: any
}

type ExecutionProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | null
let openClawConfigMutationLock: Promise<void> = Promise.resolve()
const agentExecutionLocks = new Map<string, Promise<void>>()
const AGENT_EXECUTION_SESSION_LOCK_RETRIES = 2

export function isOpenClawSessionLockError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  return /session file locked/i.test(message)
}

export function getAgentExecutionRetryDelay(attempt: number): number {
  return Math.min(1500 * 2 ** attempt, 5000)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runExclusiveAgentExecution<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
  const previous = agentExecutionLocks.get(agentId) || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  agentExecutionLocks.set(agentId, previous.then(() => current))

  await previous
  try {
    let attempt = 0
    while (true) {
      try {
        return await fn()
      } catch (error) {
        if (!isOpenClawSessionLockError(error) || attempt >= AGENT_EXECUTION_SESSION_LOCK_RETRIES) {
          throw error
        }
        await wait(getAgentExecutionRetryDelay(attempt))
        attempt++
      }
    }
  } finally {
    release()
    if (agentExecutionLocks.get(agentId) === current) {
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

function providerFromModel(model?: string): ExecutionProvider {
  if (!model) return null
  if (model.startsWith('openai/') || model.startsWith('gpt-') || model.startsWith('o1')) return 'openai'
  if (model.startsWith('anthropic/') || model.startsWith('claude')) return 'anthropic'
  if (model.startsWith('gemini/') || model.startsWith('gemini-') || model.startsWith('google/')) return 'gemini'
  if (model.startsWith('ollama/') || model.includes(':')) return 'ollama'
  return null
}

function normalizeMissingModel(model?: string): string | undefined {
  const trimmed = model?.trim()
  if (!trimmed) return undefined
  if (trimmed.toLowerCase() === 'unknown') return undefined
  return trimmed
}

function isSupportedHostedModel(model: string | undefined): boolean {
  if (!model) return false
  const provider = providerFromModel(model)
  if (provider === 'ollama') return true
  const availableModels = getAvailableModelsCached(process.env as Record<string, string>)
  if (availableModels.length === 0) return true
  return availableModels.includes(model)
}

export function resolveAgentExecutionConfig(agentId: string): {
  model?: string
  workspace?: string
  agentDir?: string
  provider?: ExecutionProvider
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
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    identityModel = normalizeMissingModel(parseIdentity(identity).model || undefined)
  } catch {}

  // If the active workspace contains this agent, trust its local identity first.
  // A stale global openclaw.json entry may point at a different workspace with the same agent id.
  const recordModel = normalizeMissingModel(record?.model)
  let model = hasActiveWorkspaceAgent
    ? (identityModel || recordModel || resolveDefaultAgentModel({ rawEnv: process.env as Record<string, string> }))
    : (recordModel || identityModel || resolveDefaultAgentModel({ rawEnv: process.env as Record<string, string> }))
  if (model && !isSupportedHostedModel(model)) {
    model = resolveDefaultAgentModel({
      rawEnv: process.env as Record<string, string>,
      availableModels: getAvailableModelsCached(process.env as Record<string, string>),
    }) || model
  }
  return {
    model,
    workspace: resolvedWorkspace,
    agentDir: record?.agentDir,
    provider: providerFromModel(model),
  }
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

function normalizeSessionModel(model?: string): string | undefined {
  if (!model) return undefined
  const trimmed = model.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('anthropic/') || trimmed.startsWith('openai/') || trimmed.startsWith('gemini/') || trimmed.startsWith('google/') || trimmed.startsWith('ollama/')) {
    return trimmed
  }
  if (trimmed.startsWith('claude')) return `anthropic/${trimmed}`
  if (trimmed.startsWith('gpt-') || trimmed.startsWith('o1')) return `openai/${trimmed}`
  if (trimmed.startsWith('gemini-')) return `google/${trimmed}`
  if (trimmed.includes(':')) return `ollama/${trimmed}`
  return trimmed
}

function resetSessionsIfModelChanged(agentId: string, preferredModel?: string) {
  const normalizedPreferred = normalizeSessionModel(preferredModel)
  if (!normalizedPreferred) return

  try {
    const sessionsPath = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'sessions', 'sessions.json')
    if (!fs.existsSync(sessionsPath)) return
    const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))
    const mainSession = sessions?.[`agent:${agentId}:main`]
    const persistedModel = normalizeSessionModel(mainSession?.model || mainSession?.systemPromptReport?.model)
    if (!persistedModel || persistedModel === normalizedPreferred) return

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

function buildAuthProfiles(providerKeys: ProviderKeys, preferredProvider?: ExecutionProvider): AuthProfileFile {
  const profiles: AuthProfileFile['profiles'] = {}
  const lastGood: Record<string, string> = {}

  if (providerKeys.openai) {
    profiles['openai-key'] = { type: 'api_key', provider: 'openai', key: providerKeys.openai }
    // Set lastGood if this is preferred OR if it's the only key available
    if (preferredProvider === 'openai' || (!providerKeys.anthropic && preferredProvider !== 'gemini')) {
      lastGood.openai = 'openai-key'
    }
  }
  if (providerKeys.anthropic) {
    profiles['anthropic-key'] = { type: 'api_key', provider: 'anthropic', key: providerKeys.anthropic }
    if (preferredProvider === 'anthropic' || !providerKeys.openai) {
      lastGood.anthropic = 'anthropic-key'
    }
  }
  if (providerKeys.gemini) {
    profiles['gemini-key'] = { type: 'api_key', provider: 'gemini', key: providerKeys.gemini }
    profiles['google-key'] = { type: 'api_key', provider: 'google', key: providerKeys.gemini }
    if (preferredProvider === 'gemini' || (!providerKeys.openai && !providerKeys.anthropic)) {
      lastGood.gemini = 'gemini-key'
      lastGood.google = 'google-key'
    }
  }

  return {
    version: 1,
    profiles,
    lastGood: Object.keys(lastGood).length > 0 ? lastGood : undefined,
    usageStats: {},
  }
}

export async function withTemporaryAgentAuthProfiles<T>(
  agentId: string,
  providerKeys: ProviderKeys,
  preferredModel: string | undefined,
  preferredProvider: ExecutionProvider | undefined,
  fn: () => Promise<T>
): Promise<T> {
  resetSessionsIfModelChanged(agentId, preferredModel)
  const execution = resolveAgentExecutionConfig(agentId)
  const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
  const hadConfig = fs.existsSync(configPath)
  const workspaceOptions = { workspacePath: execution.workspace }
  const readCurrentModel = () => {
    if (!hadConfig) return { ok: false as const, model: undefined }
    let current = readAgentModelFromConfigFile(configPath, agentId, workspaceOptions)
    if (!current.ok && execution.workspace) {
      current = readAgentModelFromConfigFile(configPath, agentId)
    }
    return current
  }
  const restoreModelOverride = (model: string | undefined) => {
    let restore = restoreAgentModelInConfigFile(configPath, agentId, model, workspaceOptions)
    if (!restore.ok && execution.workspace) {
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
    config.models = config.models || {}
    config.models.providers = providers
    config.models.providers.ollama = nextProviderConfig
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
    if (!update.ok && execution.workspace) {
      update = updateAgentModelInConfigFile(configPath, agentId, model)
    }
    if (!update.ok) {
      throw new Error(update.error || `Failed to apply temporary model override for ${agentId}`)
    }
    return true
  }

  if (preferredProvider === 'ollama') {
    const currentConfigModel = readCurrentModel()
    const previousModel = currentConfigModel.ok ? currentConfigModel.model : undefined
    const previousOllamaProvider = readCurrentOllamaProviderConfig()
    const normalizedOllamaBaseUrl = providerKeys.ollamaBaseUrl?.trim().replace(/\/+$/, '')
    const shouldOverrideModel = Boolean(
      hadConfig &&
      preferredModel &&
      preferredModel !== previousModel
    )
    const shouldInjectOllamaProvider = Boolean(
      hadConfig &&
      (
        (normalizedOllamaBaseUrl && !previousOllamaProvider.exists) ||
        (normalizedOllamaBaseUrl && previousOllamaProvider.config?.baseUrl !== normalizedOllamaBaseUrl) ||
        (previousOllamaProvider.exists && !previousOllamaProvider.config?.api)
      )
    )

    if (!shouldOverrideModel && !shouldInjectOllamaProvider) {
      return await fn()
    }

    return await runWithConfigMutationLock(async () => {
      if (shouldInjectOllamaProvider) {
        applyOllamaProviderConfig(normalizedOllamaBaseUrl)
      }
      if (shouldOverrideModel) {
        applyModelOverride(preferredModel)
      }
      try {
        return await fn()
      } finally {
        if (shouldOverrideModel) {
          restoreModelOverride(previousModel)
        }
        if (shouldInjectOllamaProvider) {
          restoreOllamaProviderConfig(previousOllamaProvider)
        }
      }
    })
  }

  const agentDir = execution.agentDir || path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  fs.mkdirSync(agentDir, { recursive: true })

  const hadExisting = fs.existsSync(authProfilePath)
  const previous = hadExisting ? fs.readFileSync(authProfilePath, 'utf-8') : null
  // If preferred provider's key is missing, fall back to available provider's model
  let effectiveModel = preferredModel
  let effectiveProvider = preferredProvider
  if (preferredProvider === 'anthropic' && !providerKeys.anthropic && providerKeys.openai) {
    effectiveModel = 'openai/gpt-4o'
    effectiveProvider = 'openai'
    console.log(`[Auth] Agent ${agentId}: no Anthropic key, falling back to ${effectiveModel}`)
  } else if (preferredProvider === 'openai' && !providerKeys.openai && providerKeys.anthropic) {
    effectiveModel = 'anthropic/claude-sonnet-4-20250514'
    effectiveProvider = 'anthropic'
    console.log(`[Auth] Agent ${agentId}: no OpenAI key, falling back to ${effectiveModel}`)
  } else if (preferredProvider === 'gemini' && !providerKeys.gemini && providerKeys.openai) {
    effectiveModel = 'openai/gpt-4o'
    effectiveProvider = 'openai'
    console.log(`[Auth] Agent ${agentId}: no Gemini key, falling back to ${effectiveModel}`)
  } else if (preferredProvider === 'gemini' && !providerKeys.gemini && providerKeys.anthropic) {
    effectiveModel = 'anthropic/claude-sonnet-4-20250514'
    effectiveProvider = 'anthropic'
    console.log(`[Auth] Agent ${agentId}: no Gemini key, falling back to ${effectiveModel}`)
  }

  const nextAuthProfiles = buildAuthProfiles(providerKeys, effectiveProvider)

  fs.writeFileSync(authProfilePath, JSON.stringify(nextAuthProfiles, null, 2), 'utf-8')
  const currentConfigModel = readCurrentModel()
  const previousModel = currentConfigModel.ok ? currentConfigModel.model : undefined
  const shouldOverrideModel = Boolean(
    hadConfig &&
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
    if (previous !== null) {
      fs.writeFileSync(authProfilePath, previous, 'utf-8')
    } else if (fs.existsSync(authProfilePath)) {
      fs.unlinkSync(authProfilePath)
    }
  }
}
