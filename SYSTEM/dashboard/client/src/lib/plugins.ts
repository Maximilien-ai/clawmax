export type PluginObjectKind = 'guardrail' | 'eval'

export interface PluginManifest {
  id: string
  slug: string
  name: string
  description: string
  version: string
  icon: string
  objectKind: PluginObjectKind
  visibility: 'private' | 'public'
  source: {
    type: 'github'
    owner: string
    repo: string
    url: string
    branch?: string
  }
  nav?: {
    order?: number
    section?: 'plugins'
  }
  capabilities?: {
    notifications?: boolean
    docs?: boolean
    agents?: boolean
    workflows?: boolean
    communications?: boolean
  }
  labels?: {
    singular?: string
    plural?: string
  }
}

export interface PluginDocument {
  path: string
  title: string
  generatedAt: string
}

export interface GuardrailRecord {
  id: string
  kind: 'guardrail'
  name: string
  description: string
  tags: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
  document?: PluginDocument | null
  appliesTo: {
    agents: string[]
    workflows: string[]
    groups: string[]
    communities: string[]
  }
  controls: {
    blockEmail: boolean
    blockWeb: boolean
    blockExternalDocs: boolean
    allowedSkills: string[]
  }
}

export interface EvalRunRecord {
  id: string
  score: number
  summary: string
  judgeMode: 'fixed' | 'ai-placeholder'
  createdAt: string
}

export interface EvalRecord {
  id: string
  kind: 'eval'
  name: string
  description: string
  tags: string[]
  enabled: boolean
  createdAt: string
  updatedAt: string
  document?: PluginDocument | null
  target: {
    type: 'agent' | 'workflow' | 'group'
    ids: string[]
  }
  experiment: {
    input: string
    candidateOutput: string
    expectedOutput: string
    judge: 'ai' | 'fixed'
  }
  runs: EvalRunRecord[]
  lastRun?: EvalRunRecord | null
}

export type PluginRecord = GuardrailRecord | EvalRecord

export interface PluginWorkspaceContext {
  agents: Array<{ id: string; name: string }>
  workflows: Array<{ id: string; name: string }>
  groups: string[]
  communities: string[]
}

export function collectPluginTags(items: PluginRecord[]): string[] {
  return Array.from(new Set(items.flatMap((item) => item.tags))).sort((a, b) => a.localeCompare(b))
}

export function matchesPluginSearch(item: PluginRecord, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const haystack = [
    item.name,
    item.description,
    ...item.tags,
    item.kind === 'guardrail'
      ? [...item.appliesTo.agents, ...item.appliesTo.workflows, ...item.appliesTo.groups, ...item.appliesTo.communities, ...item.controls.allowedSkills]
      : [...item.target.ids, item.experiment.input, item.experiment.candidateOutput, item.experiment.expectedOutput, item.experiment.judge],
  ].join(' ').toLowerCase()
  return haystack.includes(normalized)
}
