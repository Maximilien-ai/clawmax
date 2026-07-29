export const PLUGIN_HOST_API_VERSION = 'clawmax.ai/v2' as const

export type PluginObjectKind = string
export type PluginFieldValue = string | number | boolean | string[] | null
export type PluginCapability = 'docs' | 'notifications' | 'agents' | 'workflows' | 'communications'

const PLUGIN_CAPABILITIES: PluginCapability[] = ['docs', 'notifications', 'agents', 'workflows', 'communications']

export interface PluginRecordFieldSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array'
  title: string
  description?: string
  default?: PluginFieldValue
  enum?: string[]
  format?: 'text' | 'textarea' | 'date' | 'uri'
  control?: 'slider'
  minimum?: number
  maximum?: number
  step?: number
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
    label?: string
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
    list?: { fields?: string[]; groupBy?: string; checkField?: string }
  }
}

export const PLUGIN_NAV_ORDER_STORAGE_KEY = 'clawmax-plugin-nav-order'
export const PLUGIN_NAV_EXPANDED_STORAGE_KEY = 'clawmax-plugin-nav-expanded'

export function resolvePluginNavExpanded(savedValue: string | null): boolean {
  return savedValue === null ? true : savedValue === 'true'
}

export function normalizePluginNavOrder(
  plugins: PluginManifest[],
  savedOrder: unknown,
): PluginManifest[] {
  const bySlug = new Map(plugins.map((plugin) => [plugin.slug, plugin]))
  const savedSlugs = Array.isArray(savedOrder)
    ? savedOrder.filter((slug): slug is string => typeof slug === 'string')
    : []
  const seen = new Set<string>()
  const ordered: PluginManifest[] = []

  for (const slug of savedSlugs) {
    const plugin = bySlug.get(slug)
    if (!plugin || seen.has(slug)) continue
    seen.add(slug)
    ordered.push(plugin)
  }

  const remaining = plugins
    .filter((plugin) => !seen.has(plugin.slug))
    .sort((a, b) => {
      const aReview = a.objectKind === 'review-note'
      const bReview = b.objectKind === 'review-note'
      if (aReview !== bReview) return aReview ? 1 : -1
      const orderDifference = (a.nav?.order ?? 999) - (b.nav?.order ?? 999)
      return orderDifference || a.name.localeCompare(b.name)
    })

  return [...ordered, ...remaining]
}

export function getPluginNavLabel(plugin: PluginManifest): string {
  return plugin.nav?.label?.trim() || plugin.name
}

export function getPluginGroupField(plugin: PluginManifest): string | null {
  const field = plugin.ui?.list?.groupBy
  return field && plugin.recordSchema?.properties[field]?.type === 'string' ? field : null
}

export function getPluginCheckField(plugin: PluginManifest): string | null {
  const field = plugin.ui?.list?.checkField
  return field && plugin.recordSchema?.properties[field]?.type === 'boolean' ? field : null
}

export function usesLegacyPluginAdapter(plugin: PluginManifest, kind: 'guardrail' | 'eval'): boolean {
  return plugin.apiVersion !== PLUGIN_HOST_API_VERSION && plugin.objectKind === kind
}

export function getPluginGrantedCapabilities(plugin: PluginManifest): PluginCapability[] {
  return PLUGIN_CAPABILITIES.filter((capability) => plugin.capabilities?.[capability] === true)
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

export function normalizePluginNumericValue(schema: PluginRecordFieldSchema, value: unknown): number {
  const fallback = typeof schema.default === 'number' ? schema.default : 0
  const parsed = Number(value)
  const finite = Number.isFinite(parsed) ? parsed : fallback
  const bounded = Math.min(schema.maximum ?? finite, Math.max(schema.minimum ?? finite, finite))
  return schema.type === 'integer' ? Math.trunc(bounded) : bounded
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
        judge: /human|reviewer|manual review/.test(text)
          ? 'human'
          : /fixed|exact match|deterministic|heuristic/.test(text)
            ? 'fixed'
            : 'ai',
        iterations: 1,
        judgeGuidance: 'Score the response against the expected outcome and explain the evidence for the result.',
        cases: [{
          id: 'case-1',
          name: 'Trial case 1',
          input: { type: 'text', value: trimmed },
          expected: { type: 'text', value: `Success criteria for: ${firstSentence}` },
        }],
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

export interface PluginDraftQuality {
  score: number
  suggestions: string[]
}

export function scorePluginDraft(plugin: PluginManifest, draft: Partial<PluginRecord>): PluginDraftQuality {
  let earned = 0
  let possible = 0
  const suggestions: string[] = []
  const award = (points: number, condition: boolean, suggestion: string) => {
    possible += points
    if (condition) earned += points
    else suggestions.push(suggestion)
  }

  award(10, Boolean(draft.name?.trim()), 'Add a clear, specific name.')
  award(10, Boolean(draft.description?.trim() && draft.description.trim().length >= 20), 'Describe the intended behavior and success criteria.')
  award(5, Boolean(draft.tags?.length), 'Add tags so the item is easier to find and organize.')

  if (usesLegacyPluginAdapter(plugin, 'guardrail')) {
    const appliesTo = draft.kind === 'guardrail' ? draft.appliesTo : null
    const controls = draft.kind === 'guardrail' ? draft.controls : null
    award(30, Boolean(appliesTo && (appliesTo.agents.length + appliesTo.workflows.length > 0)), 'Select at least one agent or workflow target.')
    award(30, Boolean(controls && (
      controls.blockEmail
      || controls.blockWeb
      || controls.blockExternalDocs
      || controls.allowedSkills.length > 0
    )), 'Enable a restriction or declare the allowed skills.')
    award(15, Boolean(appliesTo && appliesTo.agents.length > 0 && appliesTo.workflows.length > 0), 'Consider whether this guardrail should cover both agents and workflows.')
  } else if (usesLegacyPluginAdapter(plugin, 'eval')) {
    const target = draft.kind === 'eval' ? draft.target : null
    const experiment = draft.kind === 'eval' ? draft.experiment : null
    award(20, Boolean(target?.ids.length), 'Select at least one agent, workflow, or group target.')
    award(15, Boolean(experiment?.input.trim()), 'Add the input or task that the eval should exercise.')
    award(15, Boolean(experiment?.expectedOutput.trim()), 'Define the expected output or measurable success criteria.')
    award(10, Boolean(experiment?.cases?.length), 'Add at least one trial case with an input and expected outcome.')
    award(10, Boolean(experiment?.judgeGuidance?.trim()), 'Guide the evaluator with a rubric, priorities, or pass/fail rules.')
    award(5, Boolean(experiment?.judge), 'Choose a judge mode.')
  } else {
    const fields = isGenericPluginRecord(draft) ? draft.fields : {}
    const required = plugin.recordSchema?.required || []
    award(55, required.every((key) => {
      const value = fields[key]
      return Array.isArray(value) ? value.length > 0 : value !== '' && value !== null && value !== undefined
    }), 'Complete every required plugin field.')
    award(20, Object.values(fields).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value)), 'Add meaningful plugin-specific configuration.')
  }

  return {
    score: possible > 0 ? Math.round((earned / possible) * 100) : 0,
    suggestions: suggestions.slice(0, 3),
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
  history: GuardrailHistoryEvent[]
}

export interface GuardrailHistoryEvent {
  id: string
  action: 'created' | 'activated' | 'deactivated' | 'updated'
  summary: string
  createdAt: string
}

export interface EvalRunRecord {
  id: string
  score: number
  summary: string
  judgeMode: 'fixed' | 'ai-placeholder' | 'human'
  tokensIn: number
  tokensOut: number
  costUsd: number
  createdAt: string
}

export interface EvalCase {
  id: string
  name: string
  input: {
    type: 'text' | 'file'
    value: string
  }
  expected: {
    type: 'text' | 'file'
    value: string
  }
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
    judge: 'ai' | 'human' | 'fixed'
    iterations?: number
    judgeGuidance?: string
    cases?: EvalCase[]
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
      `History: ${item.history.length} event${item.history.length === 1 ? '' : 's'}`,
      ...(item.history[0] ? [`Latest: ${item.history[0].action} · ${item.history[0].summary}`] : []),
    ]
  }
  if (isEvalRecord(item)) {
    return [
      `Target type: ${item.target.type}`,
      `Targets: ${item.target.ids.join(', ') || 'none'}`,
      `Evaluator: ${item.experiment.judge === 'ai' ? 'AI evaluator' : item.experiment.judge === 'human' ? 'Human evaluator' : 'Fixed evaluator'}`,
      `Evaluator guidance: ${item.experiment.judgeGuidance || 'none'}`,
      `Planned trials: ${item.experiment.iterations || 1}`,
      `Trial cases: ${item.experiment.cases?.length || 1}`,
      `Input: ${item.experiment.input || 'none'}`,
      `Expected: ${item.experiment.expectedOutput || 'none'}`,
    ]
  }
  const visibleFields = plugin.ui?.list?.fields?.length ? plugin.ui.list.fields : getOrderedPluginFields(plugin).map(([key]) => key)
  return visibleFields
    .filter((key) => plugin.recordSchema?.properties[key])
    .map((key) => `${plugin.recordSchema!.properties[key].title}: ${formatPluginFieldValue(item.fields[key])}`)
}

export function splitPluginDetailLine(line: string): { label: string; value: string } {
  const separator = line.indexOf(':')
  if (separator <= 0) return { label: 'Detail', value: line }
  return {
    label: line.slice(0, separator).trim(),
    value: line.slice(separator + 1).trim(),
  }
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

export function collectPluginTemplateTags(templates: PluginRecordTemplate[]): string[] {
  return Array.from(new Set(templates.flatMap((template) => template.tags))).sort((a, b) => a.localeCompare(b))
}

export function matchesPluginTemplateSearch(template: PluginRecordTemplate, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const payloadValues = 'fields' in template.payload
    ? Object.values(template.payload.fields || {}).flatMap((value) => Array.isArray(value) ? value : [String(value ?? '')])
    : []
  return [
    template.name,
    template.description,
    ...template.tags,
    ...payloadValues,
  ].join(' ').toLowerCase().includes(normalized)
}

export type PluginTemplateSort = 'recommended' | 'name-asc' | 'name-desc'

export function sortPluginTemplates(
  templates: PluginRecordTemplate[],
  sort: PluginTemplateSort,
): PluginRecordTemplate[] {
  if (sort === 'recommended') return [...templates]
  return [...templates].sort((a, b) => (
    sort === 'name-desc'
      ? b.name.localeCompare(a.name)
      : a.name.localeCompare(b.name)
  ))
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
        ? [
            ...item.target.ids,
            item.experiment.input,
            item.experiment.candidateOutput,
            item.experiment.expectedOutput,
            item.experiment.judge,
            item.experiment.judgeGuidance || '',
            ...(item.experiment.cases || []).flatMap((entry) => [entry.name, entry.input.value, entry.expected.value]),
          ]
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

export type PluginDiagnosticStatus = 'loaded' | 'disabled' | 'invalid' | 'incompatible' | 'duplicate' | 'missing'

export interface PluginDiagnostic {
  status: PluginDiagnosticStatus
  pluginId: string | null
  name: string | null
  path: string
  manifestPath: string | null
  apiVersion: string | null
  pluginVersion: string | null
  capabilities: PluginCapability[]
  message: string
  remediation: string | null
}

export interface PluginDiagnosticsReport {
  healthy: boolean
  hostApiVersion: string
  roots: string[]
  summary: Record<PluginDiagnosticStatus, number>
  diagnostics: PluginDiagnostic[]
}

const PLUGIN_DIAGNOSTIC_STATUSES: PluginDiagnosticStatus[] = ['loaded', 'disabled', 'invalid', 'incompatible', 'duplicate', 'missing']

export function normalizePluginDiagnosticsReport(value: any): PluginDiagnosticsReport {
  const diagnostics = (Array.isArray(value?.diagnostics) ? value.diagnostics : [])
    .filter((entry: any) => entry && PLUGIN_DIAGNOSTIC_STATUSES.includes(entry.status))
    .map((entry: any): PluginDiagnostic => ({
      status: entry.status,
      pluginId: typeof entry.pluginId === 'string' ? entry.pluginId : null,
      name: typeof entry.name === 'string' ? entry.name : null,
      path: typeof entry.path === 'string' ? entry.path : '',
      manifestPath: typeof entry.manifestPath === 'string' ? entry.manifestPath : null,
      apiVersion: typeof entry.apiVersion === 'string' ? entry.apiVersion : null,
      pluginVersion: typeof entry.pluginVersion === 'string' ? entry.pluginVersion : null,
      capabilities: PLUGIN_CAPABILITIES.filter((capability) => entry.capabilities?.includes?.(capability)),
      message: typeof entry.message === 'string' ? entry.message : 'Plugin diagnostic details are unavailable.',
      remediation: typeof entry.remediation === 'string' ? entry.remediation : null,
    }))
  const summary = Object.fromEntries(PLUGIN_DIAGNOSTIC_STATUSES.map((status) => [
    status,
    diagnostics.filter((entry) => entry.status === status).length,
  ])) as Record<PluginDiagnosticStatus, number>

  return {
    healthy: summary.invalid + summary.incompatible + summary.duplicate + summary.missing === 0,
    hostApiVersion: typeof value?.hostApiVersion === 'string' ? value.hostApiVersion : PLUGIN_HOST_API_VERSION,
    roots: Array.isArray(value?.roots) ? value.roots.filter((root: unknown): root is string => typeof root === 'string') : [],
    summary,
    diagnostics,
  }
}

export function formatPluginDiagnosticsSummary(report: PluginDiagnosticsReport): string {
  const issues = report.summary.invalid + report.summary.incompatible + report.summary.duplicate + report.summary.missing
  if (issues > 0) return `${issues} ${issues === 1 ? 'issue' : 'issues'} · ${report.summary.loaded} loaded`
  if (report.summary.loaded === 0 && report.summary.disabled === 0) return 'No plugins discovered'
  return `${report.summary.loaded} loaded · ${report.summary.disabled} disabled`
}
