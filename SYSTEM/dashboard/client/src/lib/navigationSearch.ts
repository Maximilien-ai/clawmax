import type { DashboardPage } from './navigation'

export type SearchDestination = {
  key: string
  kind: 'page' | 'agent' | 'workflow' | 'template' | 'skill' | 'action' | 'partner' | 'subpage' | 'document' | 'community' | 'group' | 'model'
  title: string
  subtitle: string
  page: DashboardPage
  target?: string
  provider?: string
  terms?: string
}

type Named = { id?: unknown; name?: unknown; description?: unknown; archived?: unknown }
type Template = Named & { slug?: unknown; type?: unknown; source?: unknown }
type Partner = { slug?: unknown; name?: unknown; description?: unknown }
type Document = { path?: unknown; section?: unknown }
type ModelProvider = { name?: unknown; models?: unknown }

const name = (value: unknown) => typeof value === 'string' ? value.trim() : ''

const PAGE_ACTION_TERMS: Partial<Record<DashboardPage, string>> = {
  builder: 'create build agent assistant',
  agents: 'create agent chat use assistant',
  workflows: 'create run execute workflow automation',
  templates: 'browse use apply agent organization workflow template',
  skills: 'find use assign skill registry registries catalog discover install',
  organizations: 'create manage organization team',
  activity: 'view history runs progress',
  communication: 'send message chat',
  keys: 'manage api key credentials',
  logs: 'view troubleshoot logs',
  docs: 'read help documentation file document generated uploaded workflow output agent',
}

export function pageSearchTerms(page: DashboardPage): string {
  return PAGE_ACTION_TERMS[page] || ''
}

export function buildNavigationDestinations(input: {
  pages: Array<{ page: DashboardPage; title: string; terms?: string }>
  agents?: Named[]
  workflows?: Named[]
  communities?: Named[]
  groups?: Named[]
  templates?: Template[]
  skills?: Named[]
  partners?: Partner[]
  documents?: Document[]
  modelsByProvider?: Record<string, ModelProvider>
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
  const communities = (input.communities || []).flatMap((community): SearchDestination[] => {
    const title = name(community.name)
    if (!title) return []
    return [{ key: `community:${title}`, kind: 'community', title, subtitle: 'Community · Organization', page: 'organizations', target: title, terms: `${name(community.description)} organization agents` }]
  })
  const groups = (input.groups || []).flatMap((group): SearchDestination[] => {
    const title = name(group.name)
    if (!title) return []
    return [{ key: `group:${title}`, kind: 'group', title, subtitle: 'Group · Organization', page: 'organizations', target: title, terms: `${name(group.description)} organization agents communication` }]
  })
  const templates = (input.templates || []).flatMap((template): SearchDestination[] => {
    const type = name(template.type)
    const id = name(template.slug) || name(template.id)
    if (!id || !['agent', 'organization', 'workflow'].includes(type)) return []
    const source = name(template.source)
    return [{ key: `template:${type}:${source}:${id}`, kind: 'template', title: name(template.name) || id, subtitle: `${type === 'organization' ? 'Organization' : type === 'agent' ? 'Agent' : 'Workflow'} template${source ? ` · ${source}` : ''}`, page: 'templates', target: `${type}:${source}:${id}`, terms: `${id} ${name(template.description)} apply use` }]
  })
  const skills = (input.skills || []).flatMap((skill): SearchDestination[] => {
    const id = name(skill.name)
    if (!id) return []
    return [{ key: `skill:${id}`, kind: 'skill', title: id, subtitle: 'Skill', page: 'skills', target: id, terms: name(skill.description) }]
  })
  const actions: SearchDestination[] = [
    { key: 'action:byok', kind: 'action', title: 'Configure model providers', subtitle: 'BYOK · Dialog', page: 'builder', target: 'byok', terms: 'api keys openai anthropic gemini openrouter xai ollama credentials' },
    { key: 'action:partners', kind: 'action', title: 'Configure partner integrations', subtitle: 'Partners · Dialog', page: 'builder', target: 'partners', terms: 'byok onboarding integrations setup connect' },
    { key: 'action:create-agent', kind: 'action', title: 'Create agent', subtitle: 'Agents · Dialog', page: 'agents', target: 'create-agent', terms: 'new agent' },
    { key: 'action:create-agent-ai', kind: 'action', title: 'Create agent with AI', subtitle: 'Agents · Dialog', page: 'agents', target: 'create-agent-ai', terms: 'new agent assistant generate' },
    { key: 'action:import-agent', kind: 'action', title: 'Import agent', subtitle: 'Agents · Dialog', page: 'agents', target: 'import-agent', terms: 'upload add agent' },
    { key: 'action:create-workspace', kind: 'action', title: 'Create workspace', subtitle: 'Workspaces · Dialog', page: 'builder', target: 'create-workspace', terms: 'new workspace' },
    { key: 'action:terms', kind: 'action', title: 'Terms of Service', subtitle: 'Dialog', page: 'docs', target: 'terms', terms: 'legal agreement policy' },
    { key: 'action:skill-registry', kind: 'action', title: 'Skill Registries', subtitle: 'Skills · Dialog', page: 'skills', target: 'skill-import:registry', terms: 'find discover search browse install skill registry registries clawhub shipables tessl' },
    { key: 'action:skill-github', kind: 'action', title: 'Import Skill from GitHub', subtitle: 'Skills · Dialog', page: 'skills', target: 'skill-import:github', terms: 'add skill github repository' },
    { key: 'action:skill-ai', kind: 'action', title: 'Create Skill with AI', subtitle: 'Skills · Dialog', page: 'skills', target: 'skill-import:ai', terms: 'build generate new skill' },
  ]
  const subpages: SearchDestination[] = [
    { key: 'subpage:keys:access', kind: 'subpage', title: 'Agent & Skill Access', subtitle: 'Keys & Secrets · Tab', page: 'keys', target: 'access', terms: 'authorize secret permission credential' },
    { key: 'subpage:keys:workspace', kind: 'subpage', title: 'Workspace Keys', subtitle: 'Keys & Secrets · Tab', page: 'keys', target: 'workspace', terms: 'workspace api keys secrets credentials' },
    { key: 'subpage:keys:global', kind: 'subpage', title: 'Global Keys', subtitle: 'Keys & Secrets · Tab', page: 'keys', target: 'global', terms: 'shared api keys secrets credentials' },
    { key: 'subpage:keys:partners', kind: 'subpage', title: 'Partner Credentials', subtitle: 'Keys & Secrets · Tab', page: 'keys', target: 'partners', terms: 'partner api keys secrets integrations' },
  ]
  const partners = (input.partners || []).flatMap((partner): SearchDestination[] => {
    const slug = name(partner.slug)
    if (!slug) return []
    return [{ key: `partner:${slug}`, kind: 'partner', title: name(partner.name) || slug, subtitle: 'Partner setup · Dialog', page: 'builder', target: slug, terms: `${slug} ${name(partner.description)} byok onboarding integration connect configure setup` }]
  })
  const documents = (input.documents || []).flatMap((document): SearchDestination[] => {
    const path = name(document.path)
    if (!path) return []
    const title = path.split('/').pop() || path
    const section = name(document.section)
    return [{ key: `document:${path}`, kind: 'document', title, subtitle: path, page: 'docs', target: path, terms: `${path} ${section} file document generated created open output` }]
  })
  const models = Object.entries(input.modelsByProvider || {}).flatMap(([provider, catalog]): SearchDestination[] => {
    if (!Array.isArray(catalog.models)) return []
    return catalog.models.flatMap((value): SearchDestination[] => {
      const model = name(value)
      if (!model) return []
      return [{ key: `model:${model}`, kind: 'model', title: model, subtitle: `${name(catalog.name) || provider} · Available model`, page: 'agents', target: model, provider, terms: `model configure agent ${provider}` }]
    })
  })
  return [...pages, ...actions, ...subpages, ...partners, ...agents, ...workflows, ...communities, ...groups, ...templates, ...skills, ...documents, ...models]
}

const QUERY_STOP_WORDS = new Set(['a', 'an', 'and', 'can', 'could', 'do', 'does', 'for', 'from', 'how', 'i', 'in', 'is', 'me', 'my', 'of', 'on', 'page', 'please', 'the', 'to', 'use', 'want', 'what', 'where', 'with'])
const QUERY_ALIASES: Record<string, string[]> = {
  add: ['create', 'import', 'install'], connect: ['configure', 'integration'], find: ['search', 'browse'], make: ['create'],
  set: ['configure'], setup: ['configure'], start: ['run', 'create'], view: ['open', 'inspect'],
}

function queryWords(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((word) => !QUERY_STOP_WORDS.has(word)) || []
}

function wordMatches(word: string, haystack: string): boolean {
  const variants = [word, ...(QUERY_ALIASES[word] || [])]
  return variants.some((variant) => haystack.includes(variant) || (variant.length > 3 && haystack.includes(variant.replace(/s$/, ''))))
}

export function searchNavigationDestinations(entries: SearchDestination[], query: string): SearchDestination[] {
  const terms = queryWords(query)
  if (terms.length === 0) return entries.filter((entry) => entry.kind === 'page').slice(0, 12)
  const scored = entries.flatMap((entry) => {
    const title = entry.title.toLocaleLowerCase()
    const detail = `${entry.subtitle} ${entry.terms || ''}`.toLocaleLowerCase()
    const matched = terms.filter((term) => wordMatches(term, `${title} ${detail}`))
    const required = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6)
    if (matched.length < required) return []
    const titleMatches = matched.filter((term) => wordMatches(term, title)).length
    const exactTitle = title === query.toLocaleLowerCase().trim() ? 15 : 0
    return [{ entry, score: matched.length * 4 + titleMatches * 5 + exactTitle + (title.startsWith(terms.join(' ')) ? 6 : 0) }]
  })
  return scored.sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title)).slice(0, 40).map(({ entry }) => entry)
}
