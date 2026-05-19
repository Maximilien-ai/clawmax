export interface RawAgentTemplateOption {
  name: string
  slug?: string
  description?: string
  tags?: string[]
  metadata?: any
  agents?: any[]
}

export interface AgentTemplateOption {
  name: string
  slug: string
  description?: string
  tags?: string[]
  metadata?: any
  agents?: any[]
}

export function fallbackAgentTemplateSlug(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function normalizeAgentTemplateOption(template: RawAgentTemplateOption): AgentTemplateOption {
  return {
    name: template.name,
    slug: template.slug || fallbackAgentTemplateSlug(template.name),
    description: template.description,
    tags: template.tags || [],
    metadata: template.metadata || {},
    agents: template.agents || [],
  }
}
