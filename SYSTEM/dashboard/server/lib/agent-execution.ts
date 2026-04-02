import fs from 'fs'
import path from 'path'
import { parseIdentity } from './workspace'
import type { ProviderKeys } from './dashboard-env'
import { updateAgentModelInConfigFile } from './agent-model'

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

type ExecutionProvider = 'openai' | 'anthropic' | 'gemini' | 'ollama' | null

function readOpenClawAgentRecord(agentId: string): OpenClawAgentRecord | null {
  try {
    const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return (config?.agents?.list || []).find((agent: any) => agent.id === agentId) || null
  } catch {
    return null
  }
}

function providerFromModel(model?: string): ExecutionProvider {
  if (!model) return null
  if (model.startsWith('openai/') || model.startsWith('gpt-') || model.startsWith('o1')) return 'openai'
  if (model.startsWith('anthropic/') || model.startsWith('claude')) return 'anthropic'
  if (model.startsWith('gemini/') || model.startsWith('gemini-')) return 'gemini'
  if (model.startsWith('ollama/') || model.includes(':')) return 'ollama'
  return null
}

export function resolveAgentExecutionConfig(agentId: string): {
  model?: string
  workspace?: string
  agentDir?: string
  provider?: ExecutionProvider
} {
  const record = readOpenClawAgentRecord(agentId)
  const identityPath = record?.workspace
    ? path.join(record.workspace, 'IDENTITY.md')
    : path.join(process.env.OPENCLAW_WORKSPACE || '', 'AGENTS', agentId, 'IDENTITY.md')

  let identityModel: string | undefined
  try {
    const identity = fs.readFileSync(identityPath, 'utf-8')
    identityModel = parseIdentity(identity).model || undefined
  } catch {}

  const model = record?.model || identityModel
  return {
    model,
    workspace: record?.workspace,
    agentDir: record?.agentDir,
    provider: providerFromModel(model),
  }
}

export function scopeSessionIdToModel(sessionId: string, model?: string): string {
  if (!model) return sessionId
  const modelToken = model.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return modelToken ? `${sessionId}:${modelToken}` : sessionId
}

function buildAuthProfiles(providerKeys: ProviderKeys, preferredProvider?: ExecutionProvider): AuthProfileFile {
  const profiles: AuthProfileFile['profiles'] = {}
  const lastGood: Record<string, string> = {}

  if (providerKeys.openai) {
    profiles['openai-key'] = { type: 'api_key', provider: 'openai', key: providerKeys.openai }
    // Set lastGood if this is preferred OR if it's the only key available
    if (preferredProvider === 'openai' || !providerKeys.anthropic) {
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
    if (preferredProvider === 'gemini' || (!providerKeys.openai && !providerKeys.anthropic)) {
      lastGood.gemini = 'gemini-key'
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
  const execution = resolveAgentExecutionConfig(agentId)
  const agentDir = execution.agentDir || path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'agent')
  const authProfilePath = path.join(agentDir, 'auth-profiles.json')
  const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
  fs.mkdirSync(agentDir, { recursive: true })

  const hadExisting = fs.existsSync(authProfilePath)
  const previous = hadExisting ? fs.readFileSync(authProfilePath, 'utf-8') : null
  const hadConfig = fs.existsSync(configPath)
  const previousConfig = hadConfig ? fs.readFileSync(configPath, 'utf-8') : null
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
  if (effectiveModel && hadConfig) {
    const update = updateAgentModelInConfigFile(configPath, agentId, effectiveModel)
    if (!update.ok) {
      throw new Error(update.error || `Failed to apply temporary model override for ${agentId}`)
    }
  }

  try {
    return await fn()
  } finally {
    if (previousConfig !== null) {
      fs.writeFileSync(configPath, previousConfig, 'utf-8')
    }
    if (previous !== null) {
      fs.writeFileSync(authProfilePath, previous, 'utf-8')
    } else if (fs.existsSync(authProfilePath)) {
      fs.unlinkSync(authProfilePath)
    }
  }
}
