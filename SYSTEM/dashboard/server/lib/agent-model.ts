import fs from 'fs'
import path from 'path'
import { writeDashboardManagedOpenClawConfig } from './openclaw-config'

export function updateAgentModelInConfigFile(
  configPath: string,
  agentId: string,
  model: string,
  options?: { workspacePath?: string }
): { ok: boolean; error?: string } {
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

    agentList[agentIndex] = {
      ...agentList[agentIndex],
      model,
    }

    writeDashboardManagedOpenClawConfig(configPath, config, `updateAgentModelInConfigFile(${agentId})`)
    return { ok: true }
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
): { ok: boolean; error?: string } {
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
      nextAgent.model = model
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
  if (/^[-*]\s+\*\*Model:\*\*\s+.+$/m.test(content)) {
    return content.replace(
      /^[-*]\s+\*\*Model:\*\*\s+.+$/m,
      `- **Model:** ${model}`
    )
  }

  if (/^[-*]\s+\*\*Avatar:\*\*\s*$/m.test(content)) {
    return content.replace(
      /^[-*]\s+\*\*Avatar:\*\*\s*$(\n\s+.*)?/m,
      match => `${match}\n- **Model:** ${model}`
    )
  }

  if (/^[-*]\s+\*\*Tags:\*\*\s+.+$/m.test(content)) {
    return content.replace(
      /^[-*]\s+\*\*Tags:\*\*\s+.+$/m,
      `- **Model:** ${model}\n$&`
    )
  }

  if (/^[-*]\s+\*\*Role:\*\*\s+.+$/m.test(content)) {
    return content.replace(
      /^[-*]\s+\*\*Role:\*\*\s+.+$/m,
      `$&\n- **Model:** ${model}`
    )
  }

  return `${content.trimEnd()}\n\n- **Model:** ${model}\n`
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
