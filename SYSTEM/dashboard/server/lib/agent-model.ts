import fs from 'fs'

export function updateAgentModelInConfigFile(configPath: string, agentId: string, model: string): { ok: boolean; error?: string } {
  try {
    if (!fs.existsSync(configPath)) {
      return { ok: false, error: `Config not found: ${configPath}` }
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentList = config?.agents?.list
    if (!Array.isArray(agentList)) {
      return { ok: false, error: 'Invalid openclaw.json structure: agents.list is missing' }
    }

    const agentIndex = agentList.findIndex((agent: any) => agent.id === agentId)
    if (agentIndex === -1) {
      return { ok: false, error: `Agent ${agentId} not found in openclaw.json` }
    }

    agentList[agentIndex] = {
      ...agentList[agentIndex],
      model,
    }

    config.meta = {
      ...config.meta,
      lastTouchedVersion: 'dashboard-0.1.0',
      lastTouchedAt: new Date().toISOString(),
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
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
