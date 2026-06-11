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
  enabledByDefault?: boolean
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

export function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function buildPluginDraftFromPrompt(plugin: PluginManifest, prompt: string): Partial<PluginRecord> {
  const trimmed = prompt.trim()
  const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() || trimmed
  const normalizedName = titleCaseWords(firstSentence.split(/\s+/).slice(0, 5).join(' ')) || `New ${plugin.labels?.singular || plugin.name}`
  const tags = Array.from(new Set(trimmed.toLowerCase().match(/[a-z0-9-]{4,}/g)?.slice(0, 5) || []))

  if (plugin.objectKind === 'guardrail') {
    const text = trimmed.toLowerCase()
    return {
      kind: 'guardrail',
      name: normalizedName,
      description: trimmed,
      enabled: true,
      tags,
      appliesTo: { agents: [], workflows: [], groups: [], communities: [] },
      controls: {
        blockEmail: /email|mail/.test(text),
        blockWeb: /web|browser|internet|site/.test(text),
        blockExternalDocs: /document|docs|external|share/.test(text),
        allowedSkills: [],
      },
    }
  }

  const text = trimmed.toLowerCase()
  return {
    kind: 'eval',
    name: normalizedName,
    description: trimmed,
    enabled: true,
    tags,
    target: {
      type: /workflow/.test(text) ? 'workflow' : /group|team/.test(text) ? 'group' : 'agent',
      ids: [],
    },
    experiment: {
      input: trimmed,
      candidateOutput: '',
      expectedOutput: `Success criteria for: ${firstSentence}`,
      judge: /ai judge|model judge|semantic/.test(text) ? 'ai' : 'fixed',
    },
    runs: [],
  }
}

export interface PluginRecordTemplate {
  id: string
  pluginId: string
  name: string
  description: string
  objectKind: PluginObjectKind
  recommended?: boolean
  tags: string[]
  payload: Partial<PluginRecord>
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
  archived?: boolean
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
  tokensIn: number
  tokensOut: number
  costUsd: number
  createdAt: string
}

export interface EvalRecord {
  id: string
  kind: 'eval'
  name: string
  description: string
  tags: string[]
  enabled: boolean
  archived?: boolean
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

export function getPluginUsageTotals(item: PluginRecord): { runs: number; tokens: number; costUsd: number } {
  if (item.kind !== 'eval') {
    return { runs: 0, tokens: 0, costUsd: 0 }
  }

  return item.runs.reduce(
    (acc, run) => {
      acc.runs += 1
      acc.tokens += (run.tokensIn || 0) + (run.tokensOut || 0)
      acc.costUsd += run.costUsd || 0
      return acc
    },
    { runs: 0, tokens: 0, costUsd: 0 }
  )
}

export function formatPluginUsageSummary(item: PluginRecord): string {
  if (item.kind !== 'eval') return 'No usage'
  const totals = getPluginUsageTotals(item)
  if (totals.runs === 0) return '0 runs'
  return `${totals.runs} runs · ${totals.tokens.toLocaleString()} tokens · $${totals.costUsd.toFixed(4)}`
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

export function formatPluginScopeSummary(item: PluginRecord): string {
  if (item.kind === 'guardrail') {
    return `${item.appliesTo.agents.length} agents · ${item.appliesTo.workflows.length} workflows · ${item.appliesTo.groups.length} groups · ${item.appliesTo.communities.length} communities`
  }
  return `${item.target.type} · ${item.target.ids.length} targets · ${item.runs.length} runs`
}

export function formatPluginUpdatedAt(item: PluginRecord): string {
  const value = item.updatedAt || item.createdAt
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}
