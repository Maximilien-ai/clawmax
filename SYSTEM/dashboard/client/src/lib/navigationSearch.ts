import type { DashboardPage } from './navigation'

export type SearchDestination = {
  key: string
  kind: 'page' | 'agent' | 'workflow' | 'template' | 'skill'
  title: string
  subtitle: string
  page: DashboardPage
  target?: string
  terms?: string
}

type Named = { id?: unknown; name?: unknown; description?: unknown; archived?: unknown }
type Template = Named & { slug?: unknown; type?: unknown; source?: unknown }

const name = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export function buildNavigationDestinations(input: {
  pages: Array<{ page: DashboardPage; title: string; terms?: string }>
  agents?: Named[]
  workflows?: Named[]
  templates?: Template[]
  skills?: Named[]
}): SearchDestination[] {
  const pages: SearchDestination[] = input.pages.map(({ page, title, terms }) => ({
    key: `page:${page}`, kind: 'page', title, subtitle: 'Page', page, terms,
  }))
  const agents = (input.agents || []).flatMap((agent): SearchDestination[] => {
    const id = name(agent.id)
    if (!id || agent.archived) return []
    return [{ key: `agent:${id}`, kind: 'agent', title: name(agent.name) || id, subtitle: 'Agent', page: 'agents', target: id, terms: `${id} ${name(agent.description)}` }]
  })
  const workflows = (input.workflows || []).flatMap((workflow): SearchDestination[] => {
    const id = name(workflow.id)
    if (!id) return []
    return [{ key: `workflow:${id}`, kind: 'workflow', title: name(workflow.name) || id, subtitle: 'Workflow', page: 'workflows', target: id, terms: `${id} ${name(workflow.description)}` }]
  })
  const templates = (input.templates || []).flatMap((template): SearchDestination[] => {
    const type = name(template.type)
    const id = name(template.slug) || name(template.id)
    if (!id || !['agent', 'organization', 'workflow'].includes(type)) return []
    const source = name(template.source)
    return [{ key: `template:${type}:${source}:${id}`, kind: 'template', title: name(template.name) || id, subtitle: `${type === 'organization' ? 'Organization' : type === 'agent' ? 'Agent' : 'Workflow'} template${source ? ` · ${source}` : ''}`, page: 'templates', target: `${type}:${source}:${id}`, terms: `${id} ${name(template.description)}` }]
  })
  const skills = (input.skills || []).flatMap((skill): SearchDestination[] => {
    const id = name(skill.name)
    if (!id) return []
    return [{ key: `skill:${id}`, kind: 'skill', title: id, subtitle: 'Skill', page: 'skills', target: id, terms: name(skill.description) }]
  })
  return [...pages, ...agents, ...workflows, ...templates, ...skills]
}

export function searchNavigationDestinations(entries: SearchDestination[], query: string): SearchDestination[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return entries.filter((entry) => entry.kind === 'page').slice(0, 12)
  return entries.filter((entry) => {
    const haystack = `${entry.title} ${entry.subtitle} ${entry.terms || ''}`.toLocaleLowerCase()
    return terms.every((term) => haystack.includes(term))
  }).sort((a, b) => {
    const rank = (entry: SearchDestination) => entry.title.toLocaleLowerCase().startsWith(terms.join(' ')) ? 0 : entry.kind === 'page' ? 1 : 2
    return rank(a) - rank(b) || a.title.localeCompare(b.title)
  }).slice(0, 40)
}
