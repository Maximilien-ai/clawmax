import fs from 'fs'
import path from 'path'
import { writeDashboardManagedOpenClawConfig } from './openclaw-config'

export interface AgentModelConfigUpdateResult {
  ok: boolean
  error?: string
  changed?: boolean
  model?: string
}

export function normalizeAgentModelInput(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) return ''
  if (trimmed.includes('/')) return trimmed

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
    return `openai/${normalizedOpenAiModel}`
  }

  return trimmed
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
    agentList[agentIndex] = {
      ...agentList[agentIndex],
      model: nextModel,
    }

    writeDashboardManagedOpenClawConfig(configPath, config, `updateAgentModelInConfigFile(${agentId})`)
    return { ok: true, changed: previousModel !== nextModel, model: nextModel }
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

    let changed = true
    if (agentIndex === -1) {
      agentList.push({
        id: agentId,
        name: options?.name || agentId,
        ...(options?.workspacePath ? { workspace: options.workspacePath } : {}),
        ...(options?.agentDir ? { agentDir: options.agentDir } : {}),
        model: nextModel,
      })
    } else {
      const current = agentList[agentIndex]
      changed = current?.model !== nextModel ||
        (Boolean(options?.workspacePath) && current?.workspace !== options?.workspacePath) ||
        (Boolean(options?.agentDir) && current?.agentDir !== options?.agentDir)
      agentList[agentIndex] = {
        ...current,
        ...(options?.workspacePath ? { workspace: options.workspacePath } : {}),
        ...(options?.agentDir ? { agentDir: options.agentDir } : {}),
        model: nextModel,
      }
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
    agentList[agentIndex] = nextAgent

    writeDashboardManagedOpenClawConfig(configPath, config, `restoreAgentModelInConfigFile(${agentId})`)
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) }
  }
}

export function upsertAgentModelInIdentityContent(content: string, model: string): string {
  const nextModel = normalizeAgentModelInput(model)
  if (/^[-*]\s+\*\*Model:\*\*\s+.+$/m.test(content)) {
    return content.replace(
      /^[-*]\s+\*\*Model:\*\*\s+.+$/m,
      `- **Model:** ${nextModel}`
    )
  }

  if (/^[-*]\s+\*\*Avatar:\*\*\s*$/m.test(content)) {
    return content.replace(
      /^[-*]\s+\*\*Avatar:\*\*\s*$(\n\s+.*)?/m,
      match => `${match}\n- **Model:** ${nextModel}`
    )
  }

  if (/^[-*]\s+\*\*Tags:\*\*\s+.+$/m.test(content)) {
    return content.replace(
      /^[-*]\s+\*\*Tags:\*\*\s+.+$/m,
      `- **Model:** ${nextModel}\n$&`
    )
  }

  if (/^[-*]\s+\*\*Role:\*\*\s+.+$/m.test(content)) {
    return content.replace(
      /^[-*]\s+\*\*Role:\*\*\s+.+$/m,
      `$&\n- **Model:** ${nextModel}`
    )
  }

  return `${content.trimEnd()}\n\n- **Model:** ${nextModel}\n`
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
