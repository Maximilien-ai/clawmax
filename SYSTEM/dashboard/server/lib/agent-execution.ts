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

function providerFromModel(model?: string): 'openai' | 'anthropic' | 'nebius' | null {
  if (!model) return null
  if (model.startsWith('openai/') || model.startsWith('gpt-') || model.startsWith('o1')) return 'openai'
  if (model.startsWith('anthropic/') || model.startsWith('claude')) return 'anthropic'
  if (model.startsWith('nebius/')) return 'nebius'
  return null
}

export function resolveAgentExecutionConfig(agentId: string): {
  model?: string
  workspace?: string
  agentDir?: string
  provider?: 'openai' | 'anthropic' | 'nebius' | null
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

function buildAuthProfiles(providerKeys: ProviderKeys, preferredProvider?: 'openai' | 'anthropic' | 'nebius' | null): AuthProfileFile {
  const profiles: AuthProfileFile['profiles'] = {}
  const lastGood: Record<string, string> = {}

  if (providerKeys.openai) {
    profiles['openai-key'] = { type: 'api_key', provider: 'openai', key: providerKeys.openai }
    if (preferredProvider === 'openai') lastGood.openai = 'openai-key'
  }
  if (providerKeys.anthropic) {
    profiles['anthropic-key'] = { type: 'api_key', provider: 'anthropic', key: providerKeys.anthropic }
    if (preferredProvider === 'anthropic') lastGood.anthropic = 'anthropic-key'
  }
  if (providerKeys.nebius) {
    profiles['nebius-key'] = { type: 'api_key', provider: 'nebius', key: providerKeys.nebius }
    if (preferredProvider === 'nebius') lastGood.nebius = 'nebius-key'
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
  preferredProvider: 'openai' | 'anthropic' | 'nebius' | null | undefined,
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
  const nextAuthProfiles = buildAuthProfiles(providerKeys, preferredProvider)

  fs.writeFileSync(authProfilePath, JSON.stringify(nextAuthProfiles, null, 2), 'utf-8')
  if (preferredModel && hadConfig) {
    const update = updateAgentModelInConfigFile(configPath, agentId, preferredModel)
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
