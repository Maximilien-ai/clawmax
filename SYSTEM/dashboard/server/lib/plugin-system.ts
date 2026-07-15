import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { REPO_ROOT } from './paths'
import { createNotification } from './notifications'
import { listAgents, getWorkspacePath, parseGroups } from './workspace'
import { listWorkflows } from './workflows'

export const PLUGIN_HOST_API_VERSION = 'clawmax.ai/v2' as const

export type PluginObjectKind = string
export type PluginVisibility = 'private' | 'public'
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

export interface PluginUiContract {
  form?: { order?: string[] }
  list?: { fields?: string[] }
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
  visibility: PluginVisibility
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
  ui?: PluginUiContract
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

type PluginDocument = {
  path: string
  title: string
  generatedAt: string
}

type PluginRecordBase = {
  id: string
  name: string
  description: string
  tags: string[]
  enabled: boolean
  archived?: boolean
  createdAt: string
  updatedAt: string
  document?: PluginDocument | null
}

export interface GuardrailRecord extends PluginRecordBase {
  kind: 'guardrail'
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

export interface EvalRecord extends PluginRecordBase {
  kind: 'eval'
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

export interface GenericPluginRecord extends PluginRecordBase {
  kind: string
  fields: Record<string, PluginFieldValue>
}

export type PluginRecord = GuardrailRecord | EvalRecord | GenericPluginRecord

export class PluginContractError extends Error {
  statusCode = 400

  constructor(message: string) {
    super(message)
    this.name = 'PluginContractError'
  }
}

export interface PluginWorkspaceContext {
  agents: Array<{ id: string; name: string }>
  workflows: Array<{ id: string; name: string }>
  groups: string[]
  communities: string[]
}

const DEFAULT_PLUGIN_ROOT = path.join(REPO_ROOT, 'PLUGINS')
const PLUGIN_MANIFEST_FILE = 'clawmax-plugin.json'
const PLUGIN_TEMPLATE_DIR = 'templates'

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function sortPlugins(a: PluginManifest, b: PluginManifest): number {
  const orderA = a.nav?.order ?? 999
  const orderB = b.nav?.order ?? 999
  if (orderA !== orderB) return orderA - orderB
  return a.name.localeCompare(b.name)
}

function getPluginRoots(): string[] {
  const configured = String(process.env.CLAWMAX_PLUGIN_PATHS || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
  return uniq([DEFAULT_PLUGIN_ROOT, ...configured])
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

type PluginManifestEntry = {
  directory: string
  manifest: PluginManifest
}

function isPluginFieldSchema(value: any): value is PluginRecordFieldSchema {
  if (!value || typeof value !== 'object') return false
  if (!['string', 'number', 'integer', 'boolean', 'array'].includes(value.type)) return false
  if (typeof value.title !== 'string' || !value.title.trim()) return false
  if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.some((entry: unknown) => typeof entry !== 'string'))) return false
  if (value.enum !== undefined && value.type !== 'string') return false
  if (value.format !== undefined && value.type !== 'string') return false
  if (value.type === 'array' && value.items?.type !== 'string') return false
  if (value.default !== undefined) {
    if (value.type === 'string' && typeof value.default !== 'string') return false
    if ((value.type === 'number' || value.type === 'integer') && typeof value.default !== 'number') return false
    if (value.type === 'boolean' && typeof value.default !== 'boolean') return false
    if (value.type === 'array' && (!Array.isArray(value.default) || value.default.some((entry: unknown) => typeof entry !== 'string'))) return false
  }
  return true
}

function isPluginRecordSchema(value: any): value is PluginRecordSchema {
  if (!value || value.type !== 'object' || !value.properties || typeof value.properties !== 'object') return false
  if (value.required !== undefined && (!Array.isArray(value.required) || value.required.some((entry: unknown) => typeof entry !== 'string' || !value.properties[entry]))) return false
  return Object.entries(value.properties).every(([key, field]) => /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(key) && isPluginFieldSchema(field))
}

function isPluginManifest(value: any): value is PluginManifest {
  const commonValid = !!value
    && typeof value.id === 'string'
    && typeof value.slug === 'string'
    && typeof value.name === 'string'
    && typeof value.description === 'string'
    && typeof value.version === 'string'
    && typeof value.icon === 'string'
    && typeof value.objectKind === 'string'
    && /^[a-z0-9][a-z0-9-]*$/.test(value.objectKind)
    && (value.visibility === 'private' || value.visibility === 'public')
    && value.source
    && value.source.type === 'github'
    && typeof value.source.owner === 'string'
    && typeof value.source.repo === 'string'
    && typeof value.source.url === 'string'

  if (!commonValid) return false
  if (!value.apiVersion || value.apiVersion === 'clawmax.ai/v1') {
    return value.objectKind === 'guardrail' || value.objectKind === 'eval'
  }
  if (value.apiVersion !== PLUGIN_HOST_API_VERSION) return false
  if (!isPluginRecordSchema(value.recordSchema)) return false
  const declaredFields = new Set(Object.keys(value.recordSchema.properties))
  const uiFields = [...(value.ui?.form?.order || []), ...(value.ui?.list?.fields || [])]
  return uiFields.every((field: unknown) => typeof field === 'string' && declaredFields.has(field))
}

function discoverPluginManifestEntries(root: string): PluginManifestEntry[] {
  if (!fs.existsSync(root)) return []

  const seen = new Set<string>()
  const entries: PluginManifestEntry[] = []

  const visitDirectory = (directory: string, depth: number) => {
    if (depth > 2 || seen.has(directory)) return
    seen.add(directory)

    const manifestPath = path.join(directory, PLUGIN_MANIFEST_FILE)
    const manifest = readJsonFile<PluginManifest>(manifestPath)
    if (isPluginManifest(manifest)) {
      entries.push({ directory, manifest })
      return
    }

    let children: fs.Dirent[] = []
    try {
      children = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const child of children) {
      if (!child.isDirectory()) continue
      if (child.name.startsWith('.')) continue
      visitDirectory(path.join(directory, child.name), depth + 1)
    }
  }

  visitDirectory(root, 0)
  return entries
}

function listDiscoveredPluginEntries(): PluginManifestEntry[] {
  const seenDirectories = new Set<string>()
  const discovered: PluginManifestEntry[] = []

  for (const root of getPluginRoots()) {
    for (const entry of discoverPluginManifestEntries(root)) {
      if (seenDirectories.has(entry.directory)) continue
      seenDirectories.add(entry.directory)
      discovered.push(entry)
    }
  }

  return discovered
}

export function listConfiguredPlugins(): PluginManifest[] {
  const disableDefaults = String(process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS || '').trim().toLowerCase() === 'true'
  const enabledFilter = new Set(
    uniq(String(process.env.CLAWMAX_ENABLED_PLUGINS || '').split(','))
  )
  const manifests: PluginManifest[] = []

  for (const entry of listDiscoveredPluginEntries()) {
    const manifest = entry.manifest
    if (enabledFilter.size > 0) {
      if (!enabledFilter.has(manifest.slug) && !enabledFilter.has(manifest.id)) continue
    } else if (disableDefaults) {
      continue
    } else if (manifest.enabledByDefault !== true) {
      continue
    }
    manifests.push(manifest)
  }

  return manifests.sort(sortPlugins)
}

export function getPluginBySlug(slug: string): PluginManifest | null {
  return listConfiguredPlugins().find((plugin) => plugin.slug === slug || plugin.id === slug) || null
}

function findPluginDirectory(plugin: PluginManifest): string | null {
  for (const entry of listDiscoveredPluginEntries()) {
    if (entry.manifest.slug === plugin.slug || entry.manifest.id === plugin.id) {
      return entry.directory
    }
  }
  return null
}

function getPluginStorageDir(plugin: PluginManifest): string {
  return path.join(getWorkspacePath(), 'SYSTEM', 'plugins', plugin.slug)
}

function getPluginItemsPath(plugin: PluginManifest): string {
  return path.join(getPluginStorageDir(plugin), 'items.json')
}

function getPluginDocsDir(plugin: PluginManifest): string {
  return path.join(getPluginStorageDir(plugin), 'docs')
}

function ensurePluginStorage(plugin: PluginManifest): void {
  fs.mkdirSync(getPluginStorageDir(plugin), { recursive: true })
  fs.mkdirSync(getPluginDocsDir(plugin), { recursive: true })
}

function usesLegacyAdapter(plugin: PluginManifest, kind: 'guardrail' | 'eval'): boolean {
  return plugin.apiVersion !== PLUGIN_HOST_API_VERSION && plugin.objectKind === kind
}

function normalizeGenericFieldValue(schema: PluginRecordFieldSchema, value: unknown): PluginFieldValue {
  const candidate = value === undefined ? schema.default : value
  if (schema.type === 'boolean') return candidate === true
  if (schema.type === 'number' || schema.type === 'integer') {
    const parsed = typeof candidate === 'number' ? candidate : Number(candidate)
    if (!Number.isFinite(parsed)) return typeof schema.default === 'number' ? schema.default : 0
    return schema.type === 'integer' ? Math.trunc(parsed) : parsed
  }
  if (schema.type === 'array') {
    const values = Array.isArray(candidate) ? candidate : typeof candidate === 'string' ? candidate.split(',') : []
    return uniq(values.map(String))
  }
  const normalized = candidate === undefined || candidate === null ? '' : String(candidate).trim()
  if (schema.enum?.length && !schema.enum.includes(normalized)) {
    return typeof schema.default === 'string' && schema.enum.includes(schema.default) ? schema.default : schema.enum[0]
  }
  return normalized
}

function normalizeGenericFields(plugin: PluginManifest, value: unknown, validateRequired = false): Record<string, PluginFieldValue> {
  const schema = plugin.recordSchema
  if (!schema) throw new PluginContractError(`Plugin ${plugin.slug} does not provide a v2 record schema.`)
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const fields: Record<string, PluginFieldValue> = {}
  for (const [key, fieldSchema] of Object.entries(schema.properties)) {
    fields[key] = normalizeGenericFieldValue(fieldSchema, input[key])
  }
  if (validateRequired) {
    for (const key of schema.required || []) {
      const fieldValue = fields[key]
      if (fieldValue === null || fieldValue === '' || (Array.isArray(fieldValue) && fieldValue.length === 0)) {
        const label = schema.properties[key]?.title || key
        throw new PluginContractError(`${label} is required.`)
      }
    }
  }
  return fields
}

function normalizeRecord(plugin: PluginManifest, value: any): PluginRecord | null {
  if (!value || typeof value !== 'object') return null
  if (usesLegacyAdapter(plugin, 'guardrail')) {
    return {
      id: String(value.id || '').trim(),
      kind: 'guardrail',
      name: String(value.name || '').trim(),
      description: String(value.description || '').trim(),
      tags: uniq(Array.isArray(value.tags) ? value.tags.map(String) : []),
      enabled: value.enabled !== false,
      archived: value.archived === true,
      createdAt: String(value.createdAt || '').trim(),
      updatedAt: String(value.updatedAt || '').trim(),
      document: value.document || null,
      appliesTo: {
        agents: uniq(Array.isArray(value.appliesTo?.agents) ? value.appliesTo.agents.map(String) : []),
        workflows: uniq(Array.isArray(value.appliesTo?.workflows) ? value.appliesTo.workflows.map(String) : []),
        groups: uniq(Array.isArray(value.appliesTo?.groups) ? value.appliesTo.groups.map(String) : []),
        communities: uniq(Array.isArray(value.appliesTo?.communities) ? value.appliesTo.communities.map(String) : []),
      },
      controls: {
        blockEmail: !!value.controls?.blockEmail,
        blockWeb: !!value.controls?.blockWeb,
        blockExternalDocs: !!value.controls?.blockExternalDocs,
        allowedSkills: uniq(Array.isArray(value.controls?.allowedSkills) ? value.controls.allowedSkills.map(String) : []),
      },
    }
  }

  if (!usesLegacyAdapter(plugin, 'eval')) {
    return {
      id: String(value.id || '').trim(),
      kind: plugin.objectKind,
      name: String(value.name || '').trim(),
      description: String(value.description || '').trim(),
      tags: uniq(Array.isArray(value.tags) ? value.tags.map(String) : []),
      enabled: value.enabled !== false,
      archived: value.archived === true,
      createdAt: String(value.createdAt || '').trim(),
      updatedAt: String(value.updatedAt || '').trim(),
      document: value.document || null,
      fields: normalizeGenericFields(plugin, value.fields),
    }
  }

  const runs = Array.isArray(value.runs)
    ? value.runs
      .map((run: any) => ({
        id: String(run.id || '').trim(),
        score: Number.isFinite(run.score) ? Number(run.score) : 0,
        summary: String(run.summary || '').trim(),
        judgeMode: run.judgeMode === 'fixed' ? 'fixed' : 'ai-placeholder',
        tokensIn: Number.isFinite(run.tokensIn) ? Number(run.tokensIn) : 0,
        tokensOut: Number.isFinite(run.tokensOut) ? Number(run.tokensOut) : 0,
        costUsd: Number.isFinite(run.costUsd) ? Number(run.costUsd) : 0,
        createdAt: String(run.createdAt || '').trim(),
      }))
      .filter((run: EvalRunRecord) => run.id && run.createdAt)
    : []

  return {
    id: String(value.id || '').trim(),
    kind: 'eval',
    name: String(value.name || '').trim(),
    description: String(value.description || '').trim(),
      tags: uniq(Array.isArray(value.tags) ? value.tags.map(String) : []),
      enabled: value.enabled !== false,
      archived: value.archived === true,
      createdAt: String(value.createdAt || '').trim(),
      updatedAt: String(value.updatedAt || '').trim(),
    document: value.document || null,
    target: {
      type: value.target?.type === 'workflow' || value.target?.type === 'group' ? value.target.type : 'agent',
      ids: uniq(Array.isArray(value.target?.ids) ? value.target.ids.map(String) : []),
    },
    experiment: {
      input: String(value.experiment?.input || '').trim(),
      candidateOutput: String(value.experiment?.candidateOutput || '').trim(),
      expectedOutput: String(value.experiment?.expectedOutput || '').trim(),
      judge: value.experiment?.judge === 'ai' ? 'ai' : 'fixed',
    },
    runs,
    lastRun: value.lastRun || runs[0] || null,
  }
}

export function listPluginRecords(plugin: PluginManifest): PluginRecord[] {
  ensurePluginStorage(plugin)
  const raw = readJsonFile<any[]>(getPluginItemsPath(plugin))
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => normalizeRecord(plugin, entry)).filter((entry): entry is PluginRecord => Boolean(entry))
}

function normalizeTemplate(plugin: PluginManifest, value: any): PluginRecordTemplate | null {
  if (!value || typeof value !== 'object') return null
  const payload = value.payload && typeof value.payload === 'object' ? value.payload : value.record
  if (!payload || typeof payload !== 'object') return null
  return {
    id: String(value.id || '').trim(),
    pluginId: plugin.slug,
    name: String(value.name || '').trim(),
    description: String(value.description || '').trim(),
    objectKind: plugin.objectKind,
    recommended: value.recommended !== false,
    tags: uniq(Array.isArray(value.tags) ? value.tags.map(String) : []),
    payload,
  }
}

export function listPluginTemplates(plugin: PluginManifest): PluginRecordTemplate[] {
  const pluginDir = findPluginDirectory(plugin)
  if (!pluginDir) return []
  const templateDir = path.join(pluginDir, PLUGIN_TEMPLATE_DIR)
  if (!fs.existsSync(templateDir)) return []

  return fs.readdirSync(templateDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJsonFile<any>(path.join(templateDir, entry.name)))
    .map((value) => normalizeTemplate(plugin, value))
    .filter((value): value is PluginRecordTemplate => {
      if (!value) return false
      return Boolean(value.id) && Boolean(value.name)
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function writePluginRecords(plugin: PluginManifest, records: PluginRecord[]): void {
  ensurePluginStorage(plugin)
  fs.writeFileSync(getPluginItemsPath(plugin), JSON.stringify(records, null, 2), 'utf-8')
}

function buildPluginDocPath(plugin: PluginManifest, record: PluginRecord): string {
  return `SYSTEM/plugins/${plugin.slug}/docs/${record.id}.md`
}

function buildPluginItemPath(plugin: PluginManifest, record: PluginRecord): string {
  return `SYSTEM/plugins/${plugin.slug}/items/${record.id}.md`
}

function isGuardrailRecord(record: PluginRecord): record is GuardrailRecord {
  return record.kind === 'guardrail' && 'controls' in record && 'appliesTo' in record
}

function isEvalRecord(record: PluginRecord): record is EvalRecord {
  return record.kind === 'eval' && 'experiment' in record && 'runs' in record
}

function formatPluginFieldValue(value: PluginFieldValue): string {
  if (Array.isArray(value)) return value.join(', ') || 'none'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (value === null || value === '') return 'none'
  return String(value)
}

function genericFieldLines(plugin: PluginManifest, record: GenericPluginRecord): string[] {
  const properties = plugin.recordSchema?.properties || {}
  const order = plugin.ui?.form?.order || Object.keys(properties)
  const keys = [...order, ...Object.keys(properties).filter((key) => !order.includes(key))]
  return keys
    .filter((key) => properties[key])
    .map((key) => `- **${properties[key].title}:** ${formatPluginFieldValue(record.fields[key])}`)
}

function writePluginDocument(plugin: PluginManifest, record: PluginRecord): PluginDocument {
  ensurePluginStorage(plugin)
  const generatedAt = new Date().toISOString()
  const absolutePath = path.join(getWorkspacePath(), buildPluginDocPath(plugin, record))
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })

  let lines: string[]
  if (isGuardrailRecord(record)) {
    lines = [
        `# ${record.name}`,
        '',
        `- **Plugin:** ${plugin.name}`,
        `- **Type:** Guardrail`,
        `- **Enabled:** ${record.enabled ? 'Yes' : 'No'}`,
        `- **Tags:** ${record.tags.join(', ') || 'none'}`,
        '',
        '## Summary',
        '',
        record.description || 'No description provided.',
        '',
        '## Applies To',
        '',
        `- **Agents:** ${record.appliesTo.agents.join(', ') || 'none'}`,
        `- **Workflows:** ${record.appliesTo.workflows.join(', ') || 'none'}`,
        `- **Groups:** ${record.appliesTo.groups.join(', ') || 'none'}`,
        `- **Communities:** ${record.appliesTo.communities.join(', ') || 'none'}`,
        '',
        '## Controls',
        '',
        `- Block email: ${record.controls.blockEmail ? 'yes' : 'no'}`,
        `- Block web: ${record.controls.blockWeb ? 'yes' : 'no'}`,
        `- Block external docs: ${record.controls.blockExternalDocs ? 'yes' : 'no'}`,
        `- Allowed skills: ${record.controls.allowedSkills.join(', ') || 'all skills'}`,
        '',
        `Generated at ${generatedAt}.`,
      ]
  } else if (isEvalRecord(record)) {
    lines = [
        `# ${record.name}`,
        '',
        `- **Plugin:** ${plugin.name}`,
        `- **Type:** Eval`,
        `- **Enabled:** ${record.enabled ? 'Yes' : 'No'}`,
        `- **Tags:** ${record.tags.join(', ') || 'none'}`,
        `- **Target Type:** ${record.target.type}`,
        `- **Targets:** ${record.target.ids.join(', ') || 'none'}`,
        `- **Judge:** ${record.experiment.judge === 'ai' ? 'AI placeholder judge' : 'Fixed heuristic judge'}`,
        '',
        '## Experiment Input',
        '',
        record.experiment.input || 'No input provided.',
        '',
        '## Candidate Output',
        '',
        record.experiment.candidateOutput || 'No candidate output provided.',
        '',
        '## Expected Output',
        '',
        record.experiment.expectedOutput || 'No expected output provided.',
        '',
        '## Latest Result',
        '',
        record.lastRun
          ? `- Score: ${record.lastRun.score}\n- Summary: ${record.lastRun.summary}\n- Run At: ${record.lastRun.createdAt}`
          : 'No runs recorded yet.',
        '',
        `Generated at ${generatedAt}.`,
      ]
  } else {
    lines = [
      `# ${record.name}`,
      '',
      `- **Plugin:** ${plugin.name}`,
      `- **Type:** ${plugin.labels?.singular || plugin.objectKind}`,
      `- **Enabled:** ${record.enabled ? 'Yes' : 'No'}`,
      `- **Tags:** ${record.tags.join(', ') || 'none'}`,
      '',
      '## Summary',
      '',
      record.description || 'No description provided.',
      '',
      '## Details',
      '',
      ...genericFieldLines(plugin, record),
      '',
      `Generated at ${generatedAt}.`,
    ]
  }

  fs.writeFileSync(absolutePath, lines.join('\n'), 'utf-8')
  return {
    path: buildPluginDocPath(plugin, record),
    title: `${record.name} ${plugin.labels?.singular?.toLowerCase() || plugin.objectKind} summary`,
    generatedAt,
  }
}

function writePluginItemFile(plugin: PluginManifest, record: PluginRecord): PluginDocument {
  ensurePluginStorage(plugin)
  const generatedAt = new Date().toISOString()
  const absolutePath = path.join(getWorkspacePath(), buildPluginItemPath(plugin, record))
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  let frontmatter: string[]
  if (isGuardrailRecord(record)) {
    frontmatter = [
        '---',
        `plugin: ${plugin.slug}`,
        'kind: guardrail',
        `id: ${record.id}`,
        `name: "${String(record.name).replace(/"/g, '\\"')}"`,
        `status: ${record.archived ? 'archived' : record.enabled ? 'enabled' : 'disabled'}`,
        `updated_at: ${generatedAt}`,
        `tags: [${record.tags.map((tag) => `"${String(tag).replace(/"/g, '\\"')}"`).join(', ')}]`,
        `agents: [${record.appliesTo.agents.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(', ')}]`,
        `workflows: [${record.appliesTo.workflows.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(', ')}]`,
        `groups: [${record.appliesTo.groups.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(', ')}]`,
        `communities: [${record.appliesTo.communities.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(', ')}]`,
        '---',
      ]
  } else if (isEvalRecord(record)) {
    frontmatter = [
        '---',
        `plugin: ${plugin.slug}`,
        'kind: eval',
        `id: ${record.id}`,
        `name: "${String(record.name).replace(/"/g, '\\"')}"`,
        `status: ${record.archived ? 'archived' : record.enabled ? 'enabled' : 'disabled'}`,
        `updated_at: ${generatedAt}`,
        `tags: [${record.tags.map((tag) => `"${String(tag).replace(/"/g, '\\"')}"`).join(', ')}]`,
        `target_type: ${record.target.type}`,
        `target_ids: [${record.target.ids.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(', ')}]`,
        `judge: ${record.experiment.judge}`,
        `run_count: ${record.runs.length}`,
        `last_score: ${record.lastRun ? record.lastRun.score : 'null'}`,
        '---',
      ]
  } else {
    frontmatter = [
      '---',
      `plugin: ${plugin.slug}`,
      `kind: ${plugin.objectKind}`,
      `id: ${record.id}`,
      `name: "${String(record.name).replace(/"/g, '\\"')}"`,
      `status: ${record.archived ? 'archived' : record.enabled ? 'enabled' : 'disabled'}`,
      `updated_at: ${generatedAt}`,
      `tags: [${record.tags.map((tag) => `"${String(tag).replace(/"/g, '\\"')}"`).join(', ')}]`,
      '---',
    ]
  }

  let lines: string[]
  if (isGuardrailRecord(record)) {
    lines = [
        ...frontmatter,
        '',
        `# ${record.name}`,
        '',
        record.description || 'No description provided.',
        '',
        '## Controls',
        '',
        `- Block email: ${record.controls.blockEmail ? 'yes' : 'no'}`,
        `- Block web: ${record.controls.blockWeb ? 'yes' : 'no'}`,
        `- Block external docs: ${record.controls.blockExternalDocs ? 'yes' : 'no'}`,
        `- Allowed skills: ${record.controls.allowedSkills.join(', ') || 'none'}`,
      ]
  } else if (isEvalRecord(record)) {
    lines = [
        ...frontmatter,
        '',
        `# ${record.name}`,
        '',
        record.description || 'No description provided.',
        '',
        '## Experiment',
        '',
        `- Input: ${record.experiment.input || 'none'}`,
        `- Candidate output: ${record.experiment.candidateOutput || 'none'}`,
        `- Expected output: ${record.experiment.expectedOutput || 'none'}`,
        '',
        '## Usage',
        '',
        `- Runs: ${record.runs.length}`,
        `- Latest score: ${record.lastRun ? `${record.lastRun.score}/100` : 'none'}`,
      ]
  } else {
    lines = [
      ...frontmatter,
      '',
      `# ${record.name}`,
      '',
      record.description || 'No description provided.',
      '',
      '## Details',
      '',
      ...genericFieldLines(plugin, record),
    ]
  }

  fs.writeFileSync(absolutePath, `${lines.join('\n').trim()}\n`, 'utf-8')
  return {
    path: buildPluginItemPath(plugin, record),
    title: `${record.name} ${plugin.labels?.singular?.toLowerCase() || plugin.objectKind} record`,
    generatedAt,
  }
}

function emitPluginArtifactNotification(plugin: PluginManifest, record: PluginRecord, document: PluginDocument): void {
  createNotification({
    type: 'artifact-update',
    title: `${plugin.name} updated ${record.name}`,
    message: `${plugin.name} generated a plugin document: ${document.path}`,
    entityId: record.id,
    fingerprint: `plugin-artifact:${plugin.slug}:${record.id}:${document.generatedAt}`,
    artifactPath: document.path,
  })
}

export function emitPluginRecordNotification(plugin: PluginManifest, recordId: string): PluginRecord | null {
  const record = listPluginRecords(plugin).find((entry) => entry.id === recordId) || null
  if (!record) return null
  createNotification({
    type: 'artifact-update',
    title: `${plugin.name}: ${record.name}`,
    message: `${plugin.name} emitted a plugin notification for ${record.name}.`,
    entityId: record.id,
    fingerprint: `plugin-notification:${plugin.slug}:${record.id}:${Date.now()}`,
    artifactPath: record.document?.path,
  })
  return record
}

function createGuardrailRecord(input: Partial<GuardrailRecord>): GuardrailRecord {
  const now = new Date().toISOString()
  return {
    id: String(input.id || crypto.randomUUID()),
    kind: 'guardrail',
    name: String(input.name || '').trim() || 'Untitled guardrail',
    description: String(input.description || '').trim(),
    tags: uniq(Array.isArray(input.tags) ? input.tags.map(String) : []),
    enabled: input.enabled !== false,
    archived: input.archived === true,
    createdAt: input.createdAt || now,
    updatedAt: now,
    document: input.document || null,
    appliesTo: {
      agents: uniq(Array.isArray(input.appliesTo?.agents) ? input.appliesTo.agents : []),
      workflows: uniq(Array.isArray(input.appliesTo?.workflows) ? input.appliesTo.workflows : []),
      groups: uniq(Array.isArray(input.appliesTo?.groups) ? input.appliesTo.groups : []),
      communities: uniq(Array.isArray(input.appliesTo?.communities) ? input.appliesTo.communities : []),
    },
    controls: {
      blockEmail: !!input.controls?.blockEmail,
      blockWeb: !!input.controls?.blockWeb,
      blockExternalDocs: !!input.controls?.blockExternalDocs,
      allowedSkills: uniq(Array.isArray(input.controls?.allowedSkills) ? input.controls.allowedSkills : []),
    },
  }
}

function createEvalRecord(input: Partial<EvalRecord>): EvalRecord {
  const now = new Date().toISOString()
  return {
    id: String(input.id || crypto.randomUUID()),
    kind: 'eval',
    name: String(input.name || '').trim() || 'Untitled eval',
    description: String(input.description || '').trim(),
    tags: uniq(Array.isArray(input.tags) ? input.tags.map(String) : []),
    enabled: input.enabled !== false,
    archived: input.archived === true,
    createdAt: input.createdAt || now,
    updatedAt: now,
    document: input.document || null,
    target: {
      type: input.target?.type === 'workflow' || input.target?.type === 'group' ? input.target.type : 'agent',
      ids: uniq(Array.isArray(input.target?.ids) ? input.target.ids : []),
    },
    experiment: {
      input: String(input.experiment?.input || '').trim(),
      candidateOutput: String(input.experiment?.candidateOutput || '').trim(),
      expectedOutput: String(input.experiment?.expectedOutput || '').trim(),
      judge: input.experiment?.judge === 'ai' ? 'ai' : 'fixed',
    },
    runs: Array.isArray(input.runs) ? input.runs : [],
    lastRun: input.lastRun || null,
  }
}

function createGenericRecord(plugin: PluginManifest, input: Partial<GenericPluginRecord>): GenericPluginRecord {
  const now = new Date().toISOString()
  return {
    id: String(input.id || crypto.randomUUID()),
    kind: plugin.objectKind,
    name: String(input.name || '').trim() || `Untitled ${plugin.labels?.singular?.toLowerCase() || plugin.objectKind}`,
    description: String(input.description || '').trim(),
    tags: uniq(Array.isArray(input.tags) ? input.tags.map(String) : []),
    enabled: input.enabled !== false,
    archived: input.archived === true,
    createdAt: input.createdAt || now,
    updatedAt: now,
    document: input.document || null,
    fields: normalizeGenericFields(plugin, input.fields, true),
  }
}

export function upsertPluginRecord(plugin: PluginManifest, input: Partial<PluginRecord>): PluginRecord {
  const records = listPluginRecords(plugin)
  const existingIndex = records.findIndex((record) => record.id === input.id)
  const existing = existingIndex >= 0 ? records[existingIndex] : null
  let nextRecord: PluginRecord
  if (usesLegacyAdapter(plugin, 'guardrail')) {
    nextRecord = createGuardrailRecord(existing ? { ...existing, ...input } as Partial<GuardrailRecord> : input as Partial<GuardrailRecord>)
  } else if (usesLegacyAdapter(plugin, 'eval')) {
    nextRecord = createEvalRecord(existing ? { ...existing, ...input } as Partial<EvalRecord> : input as Partial<EvalRecord>)
  } else {
    const existingFields = existing && !isGuardrailRecord(existing) && !isEvalRecord(existing) ? existing.fields : {}
    const inputFields = 'fields' in input && input.fields && typeof input.fields === 'object' ? input.fields : {}
    nextRecord = createGenericRecord(plugin, {
      ...(existing || {}),
      ...input,
      fields: { ...existingFields, ...inputFields },
    } as Partial<GenericPluginRecord>)
  }

  if (existingIndex >= 0) records.splice(existingIndex, 1, nextRecord)
  else records.unshift(nextRecord)
  writePluginRecords(plugin, records)
  writePluginItemFile(plugin, nextRecord)
  return nextRecord
}

export function applyPluginTemplate(plugin: PluginManifest, templateId: string): PluginRecord | null {
  const template = listPluginTemplates(plugin).find((entry) => entry.id === templateId)
  if (!template) return null
  const payload = {
    ...template.payload,
    name: template.payload.name || template.name,
    description: template.payload.description || template.description,
    tags: uniq([...(Array.isArray(template.payload.tags) ? template.payload.tags.map(String) : []), ...template.tags]),
    enabled: template.payload.enabled !== false,
  } as Partial<PluginRecord>
  return upsertPluginRecord(plugin, payload)
}

export function deletePluginRecord(plugin: PluginManifest, recordId: string): boolean {
  const records = listPluginRecords(plugin)
  const current = records.find((record) => record.id === recordId) || null
  const next = records.filter((record) => record.id !== recordId)
  if (next.length === records.length) return false
  writePluginRecords(plugin, next)
  if (current) {
    const itemPath = path.join(getWorkspacePath(), buildPluginItemPath(plugin, current))
    if (fs.existsSync(itemPath)) fs.rmSync(itemPath, { force: true })
    if (current.document?.path) {
      const docPath = path.join(getWorkspacePath(), current.document.path)
      if (fs.existsSync(docPath)) fs.rmSync(docPath, { force: true })
    }
  }
  return true
}

export function generatePluginRecordDocument(plugin: PluginManifest, recordId: string): PluginRecord | null {
  const records = listPluginRecords(plugin)
  const index = records.findIndex((record) => record.id === recordId)
  if (index < 0) return null
  const document = writePluginDocument(plugin, records[index])
  const updated = { ...records[index], document, updatedAt: new Date().toISOString() }
  records.splice(index, 1, updated)
  writePluginRecords(plugin, records)
  writePluginItemFile(plugin, updated)
  emitPluginArtifactNotification(plugin, updated, document)
  return updated
}

function normalizeTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter(Boolean)
}

function scoreEval(experiment: EvalRecord['experiment']): EvalRunRecord {
  const now = new Date().toISOString()
  const expected = normalizeTokens(experiment.expectedOutput)
  const actual = new Set(normalizeTokens(experiment.candidateOutput))
  const matched = expected.filter((token) => actual.has(token)).length
  const baseScore = expected.length > 0 ? Math.round((matched / expected.length) * 100) : 0
  const judgeMode = experiment.judge === 'ai' ? 'ai-placeholder' : 'fixed'
  const tokensIn = Math.max(1, Math.ceil((experiment.input.length + experiment.expectedOutput.length) / 4))
  const tokensOut = Math.max(1, Math.ceil(experiment.candidateOutput.length / 4))
  const costUsd = Number(((tokensIn * 0.0000025) + (tokensOut * 0.00001)).toFixed(6))
  const summary = experiment.judge === 'ai'
    ? `Placeholder AI judge scored semantic overlap at ${baseScore}/100. Replace with a real model-backed judge in a later pass.`
    : `Fixed heuristic judge scored token overlap at ${baseScore}/100 against the expected output.`
  return {
    id: crypto.randomUUID(),
    score: Math.max(0, Math.min(100, baseScore)),
    summary,
    judgeMode,
    tokensIn,
    tokensOut,
    costUsd,
    createdAt: now,
  }
}

export function runPluginEval(plugin: PluginManifest, recordId: string): EvalRecord | null {
  if (!usesLegacyAdapter(plugin, 'eval')) return null
  const records = listPluginRecords(plugin)
  const index = records.findIndex((record) => record.id === recordId && record.kind === 'eval')
  if (index < 0) return null
  const current = records[index]
  if (!isEvalRecord(current)) return null
  const run = scoreEval(current.experiment)
  const updated: EvalRecord = {
    ...current,
    runs: [run, ...current.runs].slice(0, 20),
    lastRun: run,
    updatedAt: new Date().toISOString(),
  }
  records.splice(index, 1, updated)
  writePluginRecords(plugin, records)
  writePluginItemFile(plugin, updated)
  const document = writePluginDocument(plugin, updated)
  updated.document = document
  records.splice(index, 1, updated)
  writePluginRecords(plugin, records)
  writePluginItemFile(plugin, updated)
  emitPluginArtifactNotification(plugin, updated, document)
  return updated
}

export function getPluginWorkspaceContext(): PluginWorkspaceContext {
  const agents = listAgents()
    .filter((agent) => !agent.archived)
    .map((agent) => ({ id: agent.id, name: agent.name || agent.id }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const workflows = listWorkflows()
    .map((workflow) => ({ id: workflow.id, name: workflow.name || workflow.id }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
  const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
  const groups = fs.existsSync(groupsPath)
    ? parseGroups(fs.readFileSync(groupsPath, 'utf-8')).groups.map((group) => group.name).sort((a, b) => a.localeCompare(b))
    : []
  const communities = fs.existsSync(communitiesPath)
    ? parseGroups(fs.readFileSync(communitiesPath, 'utf-8')).communities.map((community) => community.name).sort((a, b) => a.localeCompare(b))
    : []

  return { agents, workflows, groups, communities }
}
