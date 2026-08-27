import fs from 'fs'
import path from 'path'
import { writeDashboardManagedOpenClawConfig } from './openclaw-config'
import { getModelLifecycleEntry } from './openAiModelLifecycle'

export interface AgentModelConfigUpdateResult {
  ok: boolean
  error?: string
  changed?: boolean
  model?: string
  backupModel?: string
}

export type AgentModelSelectionMode = 'auto' | 'manual'
export type AgentModelPreference = 'quality' | 'balanced' | 'cost'

export function normalizeAgentModelInput(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) return ''
  if (trimmed.includes('/')) {
    const lifecycle = getModelLifecycleEntry(trimmed)
    if (lifecycle?.replacementModel && lifecycle.status === 'retired') {
      const [provider] = trimmed.split('/', 1)
      return `${provider}/${lifecycle.replacementModel}`
    }
    return trimmed
  }

  const compact = trimmed.toLowerCase().replace(/[\s_]+/g, '-')
  const openAiAliases: Record<string, string> = {
    'gpt4o': 'gpt-4o',
    'gpt-4o': 'gpt-4o',
    'gpt40': 'gpt-4o',
    'gpt4o-mini': 'gpt-4o-mini',
    'gpt-4o-mini': 'gpt-4o-mini',
    'gpt40-mini': 'gpt-4o-mini',
  }
  const normalizedOpenAiModel = openAiAliases[compact] || compact
  if (
    /^gpt-/.test(normalizedOpenAiModel) ||
    /^o[134](?:-|$)/.test(normalizedOpenAiModel) ||
    normalizedOpenAiModel.startsWith('chatgpt-') ||
    normalizedOpenAiModel.startsWith('text-embedding-')
  ) {
    const qualified = `openai/${normalizedOpenAiModel}`
    const lifecycle = getModelLifecycleEntry(qualified)
    if (lifecycle?.replacementModel && lifecycle.status === 'retired') {
      return `openai/${lifecycle.replacementModel}`
    }
    return qualified
  }

  return trimmed
}

function normalizeOptionalAgentModelInput(model: string | undefined): string | undefined {
  const trimmed = String(model || '').trim()
  if (!trimmed) return undefined
  return normalizeAgentModelInput(trimmed)
}

function ensureAgentModelAllowed(config: any, model: string): boolean {
  if (!config.agents || typeof config.agents !== 'object' || Array.isArray(config.agents)) {
    config.agents = {}
  }
  if (!config.agents.defaults || typeof config.agents.defaults !== 'object' || Array.isArray(config.agents.defaults)) {
    config.agents.defaults = {}
  }
  if (!config.agents.defaults.models || typeof config.agents.defaults.models !== 'object' || Array.isArray(config.agents.defaults.models)) {
    config.agents.defaults.models = {}
  }
  if (Object.prototype.hasOwnProperty.call(config.agents.defaults.models, model)) return false
  config.agents.defaults.models[model] = {}
  return true
}

function splitIdentityRuntimeSection(content: string): { runtime: string; suffix: string } {
  const metadataIndex = content.search(/^##\s+Creation Metadata\b/im)
  if (metadataIndex === -1) {
    return { runtime: content, suffix: '' }
  }
  return {
    runtime: content.slice(0, metadataIndex),
    suffix: content.slice(metadataIndex),
  }
}

function joinIdentityRuntimeSection(runtime: string, suffix: string): string {
  if (!suffix) return runtime
  return `${runtime.trimEnd()}\n\n${suffix.trimStart()}`
}

export function updateAgentModelInConfigFile(
  configPath: string,
  agentId: string,
  model: string,
  options?: { workspacePath?: string }
): AgentModelConfigUpdateResult {
  try {
    const nextModel = normalizeAgentModelInput(model)
    if (!nextModel) {
      return { ok: false, error: 'model is required' }
    }

    if (!fs.existsSync(configPath)) {
      return { ok: false, error: `Config not found: ${configPath}` }
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list
    if (!Array.isArray(agentList)) {
      return { ok: false, error: 'Invalid openclaw.json structure: agents.list is missing' }
    }

    const agentIndex = typeof options?.workspacePath === 'string'
      ? agentList.findIndex((agent: any) => agent.id === agentId && agent.workspace === options.workspacePath)
      : agentList.findIndex((agent: any) => agent.id === agentId)
    if (agentIndex === -1) {
      return { ok: false, error: `Agent ${agentId}${options?.workspacePath ? ` @ ${options.workspacePath}` : ''} not found in openclaw.json` }
    }

    const previousModel = agentList[agentIndex]?.model
    const allowlistChanged = ensureAgentModelAllowed(config, nextModel)
    const changed = previousModel !== nextModel || allowlistChanged
    if (!changed) {
      return { ok: true, changed: false, model: nextModel }
    }

    agentList[agentIndex] = {
      ...agentList[agentIndex],
      model: nextModel,
    }

    writeDashboardManagedOpenClawConfig(configPath, config, `updateAgentModelInConfigFile(${agentId})`)
    return { ok: true, changed, model: nextModel }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function updateAgentBackupModelInConfigFile(
  configPath: string,
  agentId: string,
  backupModel: string | undefined,
  options?: { workspacePath?: string }
): AgentModelConfigUpdateResult {
  try {
    const nextBackupModel = normalizeOptionalAgentModelInput(backupModel)

    if (!fs.existsSync(configPath)) {
      return { ok: false, error: `Config not found: ${configPath}` }
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list
    if (!Array.isArray(agentList)) {
      return { ok: false, error: 'Invalid openclaw.json structure: agents.list is missing' }
    }

    const agentIndex = typeof options?.workspacePath === 'string'
      ? agentList.findIndex((agent: any) => agent.id === agentId && agent.workspace === options.workspacePath)
      : agentList.findIndex((agent: any) => agent.id === agentId)
    if (agentIndex === -1) {
      return { ok: false, error: `Agent ${agentId}${options?.workspacePath ? ` @ ${options.workspacePath}` : ''} not found in openclaw.json` }
    }

    const hadLegacyBackupModel = Object.prototype.hasOwnProperty.call(agentList[agentIndex] || {}, 'backupModel')
    if (!hadLegacyBackupModel) {
      return { ok: true, changed: false, backupModel: nextBackupModel }
    }

    const nextAgent = { ...agentList[agentIndex] }
    delete nextAgent.backupModel
    agentList[agentIndex] = nextAgent

    writeDashboardManagedOpenClawConfig(configPath, config, `updateAgentBackupModelInConfigFile(${agentId})`)
    return { ok: true, changed: true, backupModel: nextBackupModel }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function upsertAgentModelInConfigFile(
  configPath: string,
  agentId: string,
  model: string,
  options?: { workspacePath?: string; agentDir?: string; name?: string }
): AgentModelConfigUpdateResult {
  try {
    const nextModel = normalizeAgentModelInput(model)
    if (!nextModel) {
      return { ok: false, error: 'model is required' }
    }

    let config: any = {}
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    }

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return { ok: false, error: 'Invalid openclaw.json structure: root must be an object' }
    }

    if (!config.agents || typeof config.agents !== 'object' || Array.isArray(config.agents)) {
      config.agents = {}
    }
    if (config.agents.list === undefined) {
      config.agents.list = []
    }
    if (!Array.isArray(config.agents.list)) {
      return { ok: false, error: 'Invalid openclaw.json structure: agents.list must be an array' }
    }

    const agentList = config.agents.list
    const agentIndex = typeof options?.workspacePath === 'string'
      ? agentList.findIndex((agent: any) => agent.id === agentId && agent.workspace === options.workspacePath)
      : agentList.findIndex((agent: any) => agent.id === agentId)

    let changed = ensureAgentModelAllowed(config, nextModel)
    if (agentIndex === -1) {
      agentList.push({
        id: agentId,
        name: options?.name || agentId,
        ...(options?.workspacePath ? { workspace: options.workspacePath } : {}),
        ...(options?.agentDir ? { agentDir: options.agentDir } : {}),
        model: nextModel,
      })
      changed = true
    } else {
      const current = agentList[agentIndex]
      changed = changed || current?.model !== nextModel ||
        (Boolean(options?.workspacePath) && current?.workspace !== options?.workspacePath) ||
        (Boolean(options?.agentDir) && current?.agentDir !== options?.agentDir)
      agentList[agentIndex] = {
        ...current,
        ...(options?.workspacePath ? { workspace: options.workspacePath } : {}),
        ...(options?.agentDir ? { agentDir: options.agentDir } : {}),
        model: nextModel,
      }
    }

    if (!changed) {
      return { ok: true, changed: false, model: nextModel }
    }

    writeDashboardManagedOpenClawConfig(configPath, config, `upsertAgentModelInConfigFile(${agentId})`)
    return { ok: true, changed, model: nextModel }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function readAgentModelFromConfigFile(
  configPath: string,
  agentId: string,
  options?: { workspacePath?: string }
): { ok: boolean; model?: string; error?: string } {
  try {
    if (!fs.existsSync(configPath)) {
      return { ok: false, error: `Config not found: ${configPath}` }
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list
    if (!Array.isArray(agentList)) {
      return { ok: false, error: 'Invalid openclaw.json structure: agents.list is missing' }
    }

    const agent = typeof options?.workspacePath === 'string'
      ? agentList.find((entry: any) => entry.id === agentId && entry.workspace === options.workspacePath)
      : agentList.find((entry: any) => entry.id === agentId)
    if (!agent) {
      return { ok: false, error: `Agent ${agentId}${options?.workspacePath ? ` @ ${options.workspacePath}` : ''} not found in openclaw.json` }
    }

    return { ok: true, model: typeof agent.model === 'string' ? agent.model : undefined }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function readAgentBackupModelFromConfigFile(
  configPath: string,
  agentId: string,
  options?: { workspacePath?: string }
): { ok: boolean; backupModel?: string; error?: string } {
  try {
    if (!fs.existsSync(configPath)) {
      return { ok: false, error: `Config not found: ${configPath}` }
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list
    if (!Array.isArray(agentList)) {
      return { ok: false, error: 'Invalid openclaw.json structure: agents.list is missing' }
    }

    const agent = typeof options?.workspacePath === 'string'
      ? agentList.find((entry: any) => entry.id === agentId && entry.workspace === options.workspacePath)
      : agentList.find((entry: any) => entry.id === agentId)
    if (!agent) {
      return { ok: false, error: `Agent ${agentId}${options?.workspacePath ? ` @ ${options.workspacePath}` : ''} not found in openclaw.json` }
    }

    return { ok: true, backupModel: undefined }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function restoreAgentModelInConfigFile(
  configPath: string,
  agentId: string,
  model: string | undefined,
  options?: { workspacePath?: string }
): AgentModelConfigUpdateResult {
  try {
    if (!fs.existsSync(configPath)) {
      return { ok: false, error: `Config not found: ${configPath}` }
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list
    if (!Array.isArray(agentList)) {
      return { ok: false, error: 'Invalid openclaw.json structure: agents.list is missing' }
    }

    const agentIndex = typeof options?.workspacePath === 'string'
      ? agentList.findIndex((agent: any) => agent.id === agentId && agent.workspace === options.workspacePath)
      : agentList.findIndex((agent: any) => agent.id === agentId)
    if (agentIndex === -1) {
      return { ok: false, error: `Agent ${agentId}${options?.workspacePath ? ` @ ${options.workspacePath}` : ''} not found in openclaw.json` }
    }

    const nextAgent = { ...agentList[agentIndex] }
    if (model && model.trim()) {
      nextAgent.model = normalizeAgentModelInput(model)
    } else {
      delete nextAgent.model
    }

    const previousModel = agentList[agentIndex]?.model
    const nextModel = nextAgent.model
    if (previousModel === nextModel) {
      return { ok: true, changed: false, model: nextModel }
    }

    agentList[agentIndex] = nextAgent

    writeDashboardManagedOpenClawConfig(configPath, config, `restoreAgentModelInConfigFile(${agentId})`)
    return { ok: true, changed: true, model: nextModel }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function restoreAgentBackupModelInConfigFile(
  configPath: string,
  agentId: string,
  backupModel: string | undefined,
  options?: { workspacePath?: string }
): AgentModelConfigUpdateResult {
  try {
    if (!fs.existsSync(configPath)) {
      return { ok: false, error: `Config not found: ${configPath}` }
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list
    if (!Array.isArray(agentList)) {
      return { ok: false, error: 'Invalid openclaw.json structure: agents.list is missing' }
    }

    const agentIndex = typeof options?.workspacePath === 'string'
      ? agentList.findIndex((agent: any) => agent.id === agentId && agent.workspace === options.workspacePath)
      : agentList.findIndex((agent: any) => agent.id === agentId)
    if (agentIndex === -1) {
      return { ok: false, error: `Agent ${agentId}${options?.workspacePath ? ` @ ${options.workspacePath}` : ''} not found in openclaw.json` }
    }

    const nextBackupModel = normalizeOptionalAgentModelInput(backupModel)
    const hadLegacyBackupModel = Object.prototype.hasOwnProperty.call(agentList[agentIndex] || {}, 'backupModel')
    if (!hadLegacyBackupModel) {
      return { ok: true, changed: false, backupModel: nextBackupModel }
    }

    const nextAgent = { ...agentList[agentIndex] }
    delete nextAgent.backupModel
    agentList[agentIndex] = nextAgent

    writeDashboardManagedOpenClawConfig(configPath, config, `restoreAgentBackupModelInConfigFile(${agentId})`)
    return { ok: true, changed: true, backupModel: nextBackupModel }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function upsertAgentModelInIdentityContent(content: string, model: string): string {
  const nextModel = normalizeAgentModelInput(model)
  const { runtime, suffix } = splitIdentityRuntimeSection(content)

  if (/^[-*]\s+\*\*Model:\*\*\s*.*$/m.test(runtime)) {
    return joinIdentityRuntimeSection(runtime.replace(
      /^[-*]\s+\*\*Model:\*\*\s*.*$/m,
      `- **Model:** ${nextModel}`
    ), suffix)
  }

  if (/^[-*]\s+\*\*Avatar:\*\*\s*$/m.test(runtime)) {
    return joinIdentityRuntimeSection(runtime.replace(
      /^[-*]\s+\*\*Avatar:\*\*\s*$(\n\s+.*)?/m,
      match => `${match}\n- **Model:** ${nextModel}`
    ), suffix)
  }

  if (/^[-*]\s+\*\*Tags:\*\*\s+.+$/m.test(runtime)) {
    return joinIdentityRuntimeSection(runtime.replace(
      /^[-*]\s+\*\*Tags:\*\*\s+.+$/m,
      `- **Model:** ${nextModel}\n$&`
    ), suffix)
  }

  if (/^[-*]\s+\*\*Role:\*\*\s+.+$/m.test(runtime)) {
    return joinIdentityRuntimeSection(runtime.replace(
      /^[-*]\s+\*\*Role:\*\*\s+.+$/m,
      `$&\n- **Model:** ${nextModel}`
    ), suffix)
  }

  return joinIdentityRuntimeSection(`${runtime.trimEnd()}\n\n- **Model:** ${nextModel}\n`, suffix)
}

export function upsertAgentRuntimeInIdentityContent(content: string, runtime: string): string {
  const { runtime: runtimeSection, suffix } = splitIdentityRuntimeSection(content)
  const hasExistingLine = /^[-*]\s+\*\*Runtime:\*\*\s*.*$/m.test(runtimeSection)

  if (runtime === 'default') {
    if (!hasExistingLine) return content
    return joinIdentityRuntimeSection(
      runtimeSection.replace(/^[-*]\s+\*\*Runtime:\*\*\s*.*$\n?/m, ''),
      suffix
    )
  }

  if (hasExistingLine) {
    return joinIdentityRuntimeSection(runtimeSection.replace(
      /^[-*]\s+\*\*Runtime:\*\*\s*.*$/m,
      `- **Runtime:** ${runtime}`
    ), suffix)
  }

  if (/^[-*]\s+\*\*Model:\*\*\s*.*$/m.test(runtimeSection)) {
    return joinIdentityRuntimeSection(runtimeSection.replace(
      /^[-*]\s+\*\*Model:\*\*\s*.*$/m,
      match => `${match}\n- **Runtime:** ${runtime}`
    ), suffix)
  }

  if (/^[-*]\s+\*\*Avatar:\*\*\s*$/m.test(runtimeSection)) {
    return joinIdentityRuntimeSection(runtimeSection.replace(
      /^[-*]\s+\*\*Avatar:\*\*\s*$(\n\s+.*)?/m,
      match => `${match}\n- **Runtime:** ${runtime}`
    ), suffix)
  }

  if (/^[-*]\s+\*\*Tags:\*\*\s+.+$/m.test(runtimeSection)) {
    return joinIdentityRuntimeSection(runtimeSection.replace(
      /^[-*]\s+\*\*Tags:\*\*\s+.+$/m,
      `- **Runtime:** ${runtime}\n$&`
    ), suffix)
  }

  if (/^[-*]\s+\*\*Role:\*\*\s+.+$/m.test(runtimeSection)) {
    return joinIdentityRuntimeSection(runtimeSection.replace(
      /^[-*]\s+\*\*Role:\*\*\s+.+$/m,
      `$&\n- **Runtime:** ${runtime}`
    ), suffix)
  }

  return joinIdentityRuntimeSection(`${runtimeSection.trimEnd()}\n\n- **Runtime:** ${runtime}\n`, suffix)
}

export function upsertAgentBackupModelInIdentityContent(content: string, backupModel: string | undefined): string {
  const nextBackupModel = normalizeOptionalAgentModelInput(backupModel)
  const { runtime, suffix } = splitIdentityRuntimeSection(content)
  const backupPattern = /^[-*]\s+\*\*Backup Model:\*\*\s*.*$/m

  if (!nextBackupModel) {
    const cleanedRuntime = runtime
      .replace(/^[-*]\s+\*\*Backup Model:\*\*\s*.*$\n?/m, '')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()
    return joinIdentityRuntimeSection(cleanedRuntime, suffix)
  }

  if (backupPattern.test(runtime)) {
    return joinIdentityRuntimeSection(runtime.replace(
      backupPattern,
      `- **Backup Model:** ${nextBackupModel}`
    ), suffix)
  }

  if (/^[-*]\s+\*\*Model:\*\*\s*.*$/m.test(runtime)) {
    return joinIdentityRuntimeSection(runtime.replace(
      /^[-*]\s+\*\*Model:\*\*\s*.*$/m,
      match => `${match}\n- **Backup Model:** ${nextBackupModel}`
    ), suffix)
  }

  return joinIdentityRuntimeSection(`${runtime.trimEnd()}\n- **Backup Model:** ${nextBackupModel}\n`, suffix)
}

export function upsertAgentModelFitInIdentityContent(
  content: string,
  selectionMode: AgentModelSelectionMode | undefined,
  preference: AgentModelPreference | undefined,
): string {
  const { runtime, suffix } = splitIdentityRuntimeSection(content)
  let nextRuntime = runtime
  const upsertField = (label: 'Model Selection' | 'Model Priority', value: string) => {
    const pattern = new RegExp(`^[-*]\\s+\\*\\*${label}:\\*\\*\\s*.*$`, 'm')
    if (pattern.test(nextRuntime)) {
      nextRuntime = nextRuntime.replace(pattern, `- **${label}:** ${value}`)
      return
    }
    const backupPattern = /^[-*]\s+\*\*Backup Model:\*\*\s*.*$/m
    const modelPattern = /^[-*]\s+\*\*Model:\*\*\s*.*$/m
    if (backupPattern.test(nextRuntime)) {
      nextRuntime = nextRuntime.replace(backupPattern, match => `${match}\n- **${label}:** ${value}`)
    } else if (modelPattern.test(nextRuntime)) {
      nextRuntime = nextRuntime.replace(modelPattern, match => `${match}\n- **${label}:** ${value}`)
    } else {
      nextRuntime = `${nextRuntime.trimEnd()}\n- **${label}:** ${value}\n`
    }
  }

  if (selectionMode) upsertField('Model Selection', selectionMode)
  if (preference) upsertField('Model Priority', preference)
  return joinIdentityRuntimeSection(nextRuntime, suffix)
}

export function resetAgentSessionsForModelChange(homeDir: string, agentId: string): { ok: boolean; error?: string } {
  try {
    const sessionsDir = path.join(homeDir, '.openclaw', 'agents', agentId, 'sessions')
    if (!fs.existsSync(sessionsDir)) {
      return { ok: true }
    }

    const archiveDir = path.join(sessionsDir, 'archive')
    fs.mkdirSync(archiveDir, { recursive: true })
    const stamp = Date.now()

    for (const entry of fs.readdirSync(sessionsDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.jsonl') && entry.name !== 'sessions.json') continue
      const src = path.join(sessionsDir, entry.name)
      const dst = path.join(archiveDir, `${stamp}-${entry.name}`)
      fs.renameSync(src, dst)
    }

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}
