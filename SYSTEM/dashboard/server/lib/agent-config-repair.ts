import { validateAgentConfigSections } from './agent-config-validation'

export interface AgentConfigSections { identity: string; soul: string; tools: string }

/** Deterministic document repairs only: never invent a role, tools, or authority. */
export function repairAgentConfigSections(input: AgentConfigSections, agentId: string, registeredName?: string) {
  const config = { ...input }
  const changes: string[] = []
  if (!/\*\*Name:\*\*[ \t]*\S/i.test(config.identity)) {
    const alternate = config.identity.match(/^[-*]?\s*(?:\*\*Name\*\*:[ \t]*|Name:[ \t]*)([^\n]+)/im)
    const name = (alternate?.[1] || registeredName || agentId).replace(/[\r\n]/g, ' ').trim()
    if (alternate) config.identity = config.identity.replace(alternate[0], `- **Name:** ${name}`)
    else if (/^[-*]?\s*\*\*Name:\*\*[ \t]*$/m.test(config.identity)) {
      config.identity = config.identity.replace(/^[-*]?\s*\*\*Name:\*\*[ \t]*$/m, `- **Name:** ${name}`)
    } else config.identity = `- **Name:** ${name}\n\n${config.identity}`
    changes.push('Restored the identity Name field from existing agent metadata')
  }
  for (const key of ['identity', 'soul', 'tools'] as const) {
    if (config[key].trim() && !/^#/m.test(config[key])) {
      config[key] = `# ${key.toUpperCase()}.md\n\n${config[key]}`
      changes.push(`Added a heading to ${key.toUpperCase()}.md`)
    }
  }
  return { config, changes, ...validateAgentConfigSections(config, agentId) }
}
