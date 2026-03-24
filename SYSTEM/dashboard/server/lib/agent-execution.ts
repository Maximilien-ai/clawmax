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

function readOpenClawAgentRecord(agentId: string): OpenClawAgentRecord | null {
  try {
    const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return (config?.agents?.list || []).find((agent: any) => agent.id === agentId) || null
  } catch {
    return null
  }
}

function providerFromModel(model?: string): 'openai' | 'anthropic' | null {
  if (!model) return null
  if (model.startsWith('openai/') || model.startsWith('gpt-') || model.startsWith('o1')) return 'openai'
  if (model.startsWith('anthropic/') || model.startsWith('claude')) return 'anthropic'
  return null
}

export function resolveAgentExecutionConfig(agentId: string): {
  model?: string
  workspace?: string
  agentDir?: string
  provider?: 'openai' | 'anthropic' | null
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

function buildAuthProfiles(providerKeys: ProviderKeys, preferredProvider?: 'openai' | 'anthropic' | null): AuthProfileFile {
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
  preferredProvider: 'openai' | 'anthropic' | null | undefined,
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
