export const PLUGIN_HOST_API_VERSION = 'clawmax.ai/v2' as const

export type PluginObjectKind = string
export type PluginFieldValue = string | number | boolean | string[] | null

export interface PluginRecordFieldSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array'
  title: string
  description?: string
  default?: PluginFieldValue
  enum?: string[]
  format?: 'text' | 'textarea' | 'date' | 'uri'
  items?: { type: 'string' }
}

export interface PluginRecordSchema {
  type: 'object'
  required?: string[]
  additionalProperties?: false
  properties: Record<string, PluginRecordFieldSchema>
}

export interface PluginManifest {
  apiVersion?: 'clawmax.ai/v1' | typeof PLUGIN_HOST_API_VERSION
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
  recordSchema?: PluginRecordSchema
  ui?: {
    form?: { order?: string[] }
    list?: { fields?: string[] }
  }
}

export function usesLegacyPluginAdapter(plugin: PluginManifest, kind: 'guardrail' | 'eval'): boolean {
  return plugin.apiVersion !== PLUGIN_HOST_API_VERSION && plugin.objectKind === kind
}

export function getOrderedPluginFields(plugin: PluginManifest): Array<[string, PluginRecordFieldSchema]> {
  const properties = plugin.recordSchema?.properties || {}
  const order = plugin.ui?.form?.order || Object.keys(properties)
  const keys = [...order, ...Object.keys(properties).filter((key) => !order.includes(key))]
  return keys.filter((key) => properties[key]).map((key) => [key, properties[key]])
}

export function buildGenericPluginFields(plugin: PluginManifest): Record<string, PluginFieldValue> {
  return Object.fromEntries(getOrderedPluginFields(plugin).map(([key, schema]) => {
    if (schema.default !== undefined) return [key, schema.default]
    if (schema.type === 'boolean') return [key, false]
    if (schema.type === 'number' || schema.type === 'integer') return [key, 0]
    if (schema.type === 'array') return [key, []]
    return [key, '']
  }))
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

  if (usesLegacyPluginAdapter(plugin, 'guardrail')) {
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

  if (usesLegacyPluginAdapter(plugin, 'eval')) {
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

  const fields = buildGenericPluginFields(plugin)
  const promptField = getOrderedPluginFields(plugin).find(([, schema]) => schema.type === 'string' && schema.format === 'textarea')
    || getOrderedPluginFields(plugin).find(([, schema]) => schema.type === 'string' && !schema.enum)
  if (promptField) fields[promptField[0]] = trimmed
  return { kind: plugin.objectKind, name: normalizedName, description: trimmed, enabled: true, tags, fields }
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

export interface GenericPluginRecord {
  id: string
  kind: string
  name: string
  description: string
  tags: string[]
  enabled: boolean
  archived?: boolean
  createdAt: string
  updatedAt: string
  document?: PluginDocument | null
  fields: Record<string, PluginFieldValue>
}

export type PluginRecord = GuardrailRecord | EvalRecord | GenericPluginRecord

export function isGuardrailRecord(item: PluginRecord | Partial<PluginRecord>): item is GuardrailRecord {
  return item.kind === 'guardrail' && 'controls' in item && 'appliesTo' in item
}

export function isEvalRecord(item: PluginRecord | Partial<PluginRecord>): item is EvalRecord {
  return item.kind === 'eval' && 'experiment' in item && 'runs' in item
}

export function isGenericPluginRecord(item: PluginRecord | Partial<PluginRecord>): item is GenericPluginRecord {
  return !!item.kind && 'fields' in item
}

export function formatPluginFieldValue(value: PluginFieldValue): string {
  if (Array.isArray(value)) return value.join(', ') || 'none'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (value === null || value === '') return 'none'
  return String(value)
}

export function getPluginDetailLines(plugin: PluginManifest, item: PluginRecord): string[] {
  if (isGuardrailRecord(item)) {
    return [
      `Agents: ${item.appliesTo.agents.join(', ') || 'none'}`,
      `Workflows: ${item.appliesTo.workflows.join(', ') || 'none'}`,
      `Groups: ${item.appliesTo.groups.join(', ') || 'none'}`,
      `Communities: ${item.appliesTo.communities.join(', ') || 'none'}`,
      `Allowed skills: ${item.controls.allowedSkills.join(', ') || 'none'}`,
    ]
  }
  if (isEvalRecord(item)) {
    return [
      `Target type: ${item.target.type}`,
      `Targets: ${item.target.ids.join(', ') || 'none'}`,
      `Judge: ${item.experiment.judge === 'ai' ? 'AI placeholder' : 'Fixed heuristic'}`,
      `Input: ${item.experiment.input || 'none'}`,
      `Expected: ${item.experiment.expectedOutput || 'none'}`,
    ]
  }
  const visibleFields = plugin.ui?.list?.fields?.length ? plugin.ui.list.fields : getOrderedPluginFields(plugin).map(([key]) => key)
  return visibleFields
    .filter((key) => plugin.recordSchema?.properties[key])
    .map((key) => `${plugin.recordSchema!.properties[key].title}: ${formatPluginFieldValue(item.fields[key])}`)
}

export interface PluginWorkspaceContext {
  agents: Array<{ id: string; name: string }>
  workflows: Array<{ id: string; name: string }>
  groups: string[]
  communities: string[]
}

export function getPluginUsageTotals(item: PluginRecord): { runs: number; tokens: number; costUsd: number } {
  if (!isEvalRecord(item)) {
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
  if (!isEvalRecord(item)) return 'No usage'
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
    isGuardrailRecord(item)
      ? [...item.appliesTo.agents, ...item.appliesTo.workflows, ...item.appliesTo.groups, ...item.appliesTo.communities, ...item.controls.allowedSkills]
      : isEvalRecord(item)
        ? [...item.target.ids, item.experiment.input, item.experiment.candidateOutput, item.experiment.expectedOutput, item.experiment.judge]
        : Object.values(item.fields).flatMap((value) => Array.isArray(value) ? value : [String(value ?? '')]),
  ].join(' ').toLowerCase()
  return haystack.includes(normalized)
}

export function formatPluginScopeSummary(item: PluginRecord): string {
  if (isGuardrailRecord(item)) {
    return `${item.appliesTo.agents.length} agents · ${item.appliesTo.workflows.length} workflows · ${item.appliesTo.groups.length} groups · ${item.appliesTo.communities.length} communities`
  }
  if (isEvalRecord(item)) return `${item.target.type} · ${item.target.ids.length} targets · ${item.runs.length} runs`
  const populated = Object.values(item.fields).filter((value) => value !== '' && value !== null && (!Array.isArray(value) || value.length > 0)).length
  return `${populated} configured fields`
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
