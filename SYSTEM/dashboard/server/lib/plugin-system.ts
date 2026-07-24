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
export type PluginCapability = 'notifications' | 'docs' | 'agents' | 'workflows' | 'communications'

const PLUGIN_CAPABILITIES: PluginCapability[] = ['docs', 'notifications', 'agents', 'workflows', 'communications']
const PLUGIN_TEMPLATE_CACHE_TTL_MS = 5 * 60 * 1000

interface PluginTemplateCacheEntry {
  templates: PluginRecordTemplate[]
  expiresAt: number
}

const pluginTemplateCache = new Map<string, PluginTemplateCacheEntry>()

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
  list?: { fields?: string[]; groupBy?: string; checkField?: string }
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
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'PluginContractError'
    this.statusCode = statusCode
  }
}

export function getPluginGrantedCapabilities(plugin: PluginManifest): PluginCapability[] {
  return PLUGIN_CAPABILITIES.filter((capability) => plugin.capabilities?.[capability] === true)
}

export function assertPluginCapability(plugin: PluginManifest, capability: PluginCapability): void {
  if (plugin.capabilities?.[capability] === true) return
  throw new PluginContractError(
    `Plugin ${plugin.slug} is not granted the "${capability}" capability. Add capabilities.${capability}=true to its manifest, then reload the plugin.`,
    403,
  )
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
  hostApiVersion: typeof PLUGIN_HOST_API_VERSION
  roots: string[]
  summary: Record<PluginDiagnosticStatus, number>
  diagnostics: PluginDiagnostic[]
}

type PluginManifestCandidate = {
  directory: string
  manifestPath: string
  manifest: PluginManifest | null
  rawManifest: any
  issue: 'invalid' | 'incompatible' | null
  issueMessage: string | null
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

function isPluginCapabilities(value: unknown): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, enabled]) =>
    PLUGIN_CAPABILITIES.includes(key as PluginCapability) && typeof enabled === 'boolean')
}

function isPluginNav(value: unknown): boolean {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const nav = value as Record<string, unknown>
  if (nav.order !== undefined && typeof nav.order !== 'number') return false
  if (nav.section !== undefined && nav.section !== 'plugins') return false
  if (nav.label !== undefined) {
    if (typeof nav.label !== 'string' || nav.label.length > 24 || !/^\S+(?:\s+\S+)?$/.test(nav.label)) return false
  }
  return Object.keys(nav).every((key) => ['order', 'section', 'label'].includes(key))
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
    && isPluginNav(value.nav)
    && isPluginCapabilities(value.capabilities)

  if (!commonValid) return false
  if (!value.apiVersion || value.apiVersion === 'clawmax.ai/v1') {
    return value.objectKind === 'guardrail' || value.objectKind === 'eval'
  }
  if (value.apiVersion !== PLUGIN_HOST_API_VERSION) return false
  if (!isPluginRecordSchema(value.recordSchema)) return false
  const declaredFields = new Set(Object.keys(value.recordSchema.properties))
  const uiFields = [
    ...(value.ui?.form?.order || []),
    ...(value.ui?.list?.fields || []),
    value.ui?.list?.groupBy,
    value.ui?.list?.checkField,
  ].filter((field) => field !== undefined)
  if (!uiFields.every((field: unknown) => typeof field === 'string' && declaredFields.has(field))) return false
  if (value.ui?.list?.groupBy && value.recordSchema.properties[value.ui.list.groupBy]?.type !== 'string') return false
  if (value.ui?.list?.checkField && value.recordSchema.properties[value.ui.list.checkField]?.type !== 'boolean') return false
  return true
}

function inspectPluginManifest(directory: string, manifestPath: string): PluginManifestCandidate {
  let rawManifest: any = null
  try {
    rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch {
    return {
      directory,
      manifestPath,
      manifest: null,
      rawManifest: null,
      issue: 'invalid',
      issueMessage: 'Manifest is not valid JSON.',
    }
  }

  const apiVersion = typeof rawManifest?.apiVersion === 'string' ? rawManifest.apiVersion : 'clawmax.ai/v1'
  if (apiVersion !== 'clawmax.ai/v1' && apiVersion !== PLUGIN_HOST_API_VERSION) {
    return {
      directory,
      manifestPath,
      manifest: null,
      rawManifest,
      issue: 'incompatible',
      issueMessage: `Plugin API ${apiVersion} is not supported by host ${PLUGIN_HOST_API_VERSION}.`,
    }
  }

  if (!isPluginManifest(rawManifest)) {
    return {
      directory,
      manifestPath,
      manifest: null,
      rawManifest,
      issue: 'invalid',
      issueMessage: apiVersion === PLUGIN_HOST_API_VERSION
        ? 'Manifest does not satisfy the clawmax.ai/v2 contract, including a valid recordSchema and declared UI fields.'
        : 'Manifest does not satisfy the required plugin identity, source, visibility, and legacy object-kind contract.',
    }
  }

  return { directory, manifestPath, manifest: rawManifest, rawManifest, issue: null, issueMessage: null }
}

function discoverPluginManifestCandidates(root: string): PluginManifestCandidate[] {
  if (!fs.existsSync(root)) return []

  const seen = new Set<string>()
  const candidates: PluginManifestCandidate[] = []

  const visitDirectory = (directory: string, depth: number) => {
    if (depth > 2 || seen.has(directory)) return
    seen.add(directory)

    const manifestPath = path.join(directory, PLUGIN_MANIFEST_FILE)
    if (fs.existsSync(manifestPath)) {
      candidates.push(inspectPluginManifest(directory, manifestPath))
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
  return candidates
}

function listDiscoveredPluginCandidates(): PluginManifestCandidate[] {
  const seenDirectories = new Set<string>()
  const discovered: PluginManifestCandidate[] = []

  for (const root of getPluginRoots()) {
    for (const entry of discoverPluginManifestCandidates(root)) {
      if (seenDirectories.has(entry.directory)) continue
      seenDirectories.add(entry.directory)
      discovered.push(entry)
    }
  }

  return discovered
}

function listDiscoveredPluginEntries(): PluginManifestEntry[] {
  return listDiscoveredPluginCandidates()
    .filter((candidate): candidate is PluginManifestCandidate & { manifest: PluginManifest } => !!candidate.manifest)
    .map(({ directory, manifest }) => ({ directory, manifest }))
}

function getEnabledPluginFilter(): Set<string> {
  return new Set(uniq(String(process.env.CLAWMAX_ENABLED_PLUGINS || '').split(',')))
}

function isPluginEnabled(manifest: PluginManifest, enabledFilter: Set<string>, disableDefaults: boolean): boolean {
  if (enabledFilter.size > 0) return enabledFilter.has(manifest.slug) || enabledFilter.has(manifest.id)
  if (disableDefaults) return false
  return manifest.enabledByDefault === true
}

export function listConfiguredPlugins(): PluginManifest[] {
  const disableDefaults = String(process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS || '').trim().toLowerCase() === 'true'
  const enabledFilter = getEnabledPluginFilter()
  const manifests: PluginManifest[] = []
  const seenIdentities = new Set<string>()

  for (const entry of listDiscoveredPluginEntries()) {
    const manifest = entry.manifest
    if (seenIdentities.has(manifest.id) || seenIdentities.has(manifest.slug)) continue
    seenIdentities.add(manifest.id)
    seenIdentities.add(manifest.slug)
    if (!isPluginEnabled(manifest, enabledFilter, disableDefaults)) continue
    manifests.push(manifest)
  }

  return manifests.sort(sortPlugins)
}

export function getPluginDiagnosticsReport(): PluginDiagnosticsReport {
  const roots = getPluginRoots()
  const enabledFilter = getEnabledPluginFilter()
  const disableDefaults = String(process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS || '').trim().toLowerCase() === 'true'
  const diagnostics: PluginDiagnostic[] = []
  const seenIdentities = new Map<string, string>()
  const discoveredIdentities = new Set<string>()

  for (const root of roots) {
    let isDirectory = false
    try {
      isDirectory = fs.statSync(root).isDirectory()
    } catch {
      isDirectory = false
    }
    if (!isDirectory) {
      diagnostics.push({
        status: 'missing',
        pluginId: null,
        name: null,
        path: root,
        manifestPath: null,
        apiVersion: null,
        pluginVersion: null,
        capabilities: [],
        message: `Configured plugin path does not exist or is not a directory: ${root}`,
        remediation: 'Mount or create the directory, or remove it from CLAWMAX_PLUGIN_PATHS.',
      })
    }
  }

  for (const candidate of listDiscoveredPluginCandidates()) {
    const raw = candidate.rawManifest || {}
    const pluginId = typeof raw.slug === 'string' && raw.slug.trim()
      ? raw.slug.trim()
      : typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : path.basename(candidate.directory)
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : pluginId
    const apiVersion = typeof raw.apiVersion === 'string' ? raw.apiVersion : 'clawmax.ai/v1'
    const pluginVersion = typeof raw.version === 'string' ? raw.version : null
    const capabilities = PLUGIN_CAPABILITIES.filter((capability) => raw.capabilities?.[capability] === true)
    if (typeof raw.id === 'string') discoveredIdentities.add(raw.id)
    if (typeof raw.slug === 'string') discoveredIdentities.add(raw.slug)
    discoveredIdentities.add(pluginId)

    if (!candidate.manifest) {
      diagnostics.push({
        status: candidate.issue || 'invalid',
        pluginId,
        name,
        path: candidate.directory,
        manifestPath: candidate.manifestPath,
        apiVersion,
        pluginVersion,
        capabilities,
        message: candidate.issueMessage || 'Plugin manifest is invalid.',
        remediation: candidate.issue === 'incompatible'
          ? `Use a plugin compatible with ${PLUGIN_HOST_API_VERSION} or update its manifest contract.`
          : 'Validate clawmax-plugin.json against PLUGINS/plugin-manifest.schema.json.',
      })
      continue
    }

    const manifest = candidate.manifest
    const duplicatePath = seenIdentities.get(manifest.id) || seenIdentities.get(manifest.slug)
    if (duplicatePath) {
      diagnostics.push({
        status: 'duplicate',
        pluginId: manifest.slug,
        name: manifest.name,
        path: candidate.directory,
        manifestPath: candidate.manifestPath,
        apiVersion,
        pluginVersion,
        capabilities: getPluginGrantedCapabilities(manifest),
        message: `Plugin ID or slug duplicates the manifest already discovered at ${duplicatePath}.`,
        remediation: 'Give every plugin a unique id and slug, then remove the duplicate mount.',
      })
      continue
    }

    seenIdentities.set(manifest.id, candidate.directory)
    seenIdentities.set(manifest.slug, candidate.directory)
    const enabled = isPluginEnabled(manifest, enabledFilter, disableDefaults)
    diagnostics.push({
      status: enabled ? 'loaded' : 'disabled',
      pluginId: manifest.slug,
      name: manifest.name,
      path: candidate.directory,
      manifestPath: candidate.manifestPath,
      apiVersion,
      pluginVersion,
      capabilities: getPluginGrantedCapabilities(manifest),
      message: enabled ? 'Plugin loaded and enabled.' : 'Plugin was discovered but is not enabled.',
      remediation: enabled ? null : `Add ${manifest.slug} to CLAWMAX_ENABLED_PLUGINS to enable it.`,
    })
  }

  for (const requested of enabledFilter) {
    if (discoveredIdentities.has(requested)) continue
    diagnostics.push({
      status: 'missing',
      pluginId: requested,
      name: requested,
      path: '',
      manifestPath: null,
      apiVersion: null,
      pluginVersion: null,
      capabilities: [],
      message: `Enabled plugin "${requested}" was not found in any configured plugin path.`,
      remediation: 'Mount the plugin directory through CLAWMAX_PLUGIN_PATHS or remove it from CLAWMAX_ENABLED_PLUGINS.',
    })
  }

  const statusOrder: Record<PluginDiagnosticStatus, number> = {
    invalid: 0,
    incompatible: 1,
    duplicate: 2,
    missing: 3,
    loaded: 4,
    disabled: 5,
  }
  diagnostics.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]
    || String(a.pluginId || a.path).localeCompare(String(b.pluginId || b.path)))
  const summary: Record<PluginDiagnosticStatus, number> = {
    loaded: 0,
    disabled: 0,
    invalid: 0,
    incompatible: 0,
    duplicate: 0,
    missing: 0,
  }
  for (const diagnostic of diagnostics) summary[diagnostic.status]++

  return {
    healthy: summary.invalid + summary.incompatible + summary.duplicate + summary.missing === 0,
    hostApiVersion: PLUGIN_HOST_API_VERSION,
    roots,
    summary,
    diagnostics,
  }
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
      history: Array.isArray(value.history) ? value.history.slice(0, 50).map((event: any) => ({
        id: String(event.id || crypto.randomUUID()),
        action: ['created', 'activated', 'deactivated', 'updated'].includes(event.action) ? event.action : 'updated',
        summary: String(event.summary || '').trim(),
        createdAt: String(event.createdAt || '').trim(),
      })) : [],
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

function normalizeTemplateFile(plugin: PluginManifest, value: any): PluginRecordTemplate[] {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) {
    const template = normalizeTemplate(plugin, value)
    return template ? [template] : []
  }

  const release = String(value.release || '').trim()
  const defaults = value.defaults && typeof value.defaults === 'object' ? value.defaults : {}
  const defaultFields = defaults.fields && typeof defaults.fields === 'object' ? defaults.fields : {}
  const bundleTags = Array.isArray(value.tags) ? value.tags.map(String) : []

  return value.items.flatMap((item: any) => {
    if (!item || typeof item !== 'object') return []
    const itemFields = item.fields && typeof item.fields === 'object' ? item.fields : {}
    const template = normalizeTemplate(plugin, {
      ...item,
      id: `${String(value.id || release || 'checklist').trim()}:${String(item.id || '').trim()}`,
      recommended: item.recommended ?? value.recommended,
      tags: uniq([...bundleTags, ...(Array.isArray(item.tags) ? item.tags.map(String) : [])]),
      payload: {
        ...defaults,
        name: item.name,
        description: item.description,
        enabled: item.enabled ?? defaults.enabled,
        tags: uniq([
          ...bundleTags,
          ...(Array.isArray(defaults.tags) ? defaults.tags.map(String) : []),
          ...(Array.isArray(item.tags) ? item.tags.map(String) : []),
        ]),
        fields: {
          ...defaultFields,
          ...itemFields,
          ...(release ? { release } : {}),
        },
      },
    })
    return template ? [template] : []
  })
}

export function clearPluginTemplateCache(plugin?: Pick<PluginManifest, 'slug'>): void {
  if (plugin) {
    pluginTemplateCache.delete(plugin.slug)
    return
  }
  pluginTemplateCache.clear()
}

export function listPluginTemplates(
  plugin: PluginManifest,
  options: { forceRefresh?: boolean } = {},
): PluginRecordTemplate[] {
  const cached = pluginTemplateCache.get(plugin.slug)
  if (!options.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.templates
  }

  const pluginDir = findPluginDirectory(plugin)
  if (!pluginDir) {
    pluginTemplateCache.delete(plugin.slug)
    return []
  }
  const templateDir = path.join(pluginDir, PLUGIN_TEMPLATE_DIR)
  if (!fs.existsSync(templateDir)) {
    pluginTemplateCache.delete(plugin.slug)
    return []
  }

  const templates = fs.readdirSync(templateDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJsonFile<any>(path.join(templateDir, entry.name)))
    .flatMap((value) => normalizeTemplateFile(plugin, value))
    .filter((value): value is PluginRecordTemplate => {
      if (!value) return false
      return Boolean(value.id) && Boolean(value.name)
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  pluginTemplateCache.set(plugin.slug, {
    templates,
    expiresAt: Date.now() + PLUGIN_TEMPLATE_CACHE_TTL_MS,
  })
  return templates
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
  const completedEval = isEvalRecord(record) && record.lastRun
  createNotification({
    type: 'artifact-update',
    title: completedEval ? `${plugin.name}: Eval completed` : `${plugin.name} updated ${record.name}`,
    message: completedEval
      ? `${record.name} completed with a score of ${record.lastRun!.score}/100.`
      : `${plugin.name} generated a plugin document: ${document.path}`,
    entityId: record.id,
    fingerprint: `plugin-artifact:${plugin.slug}:${record.id}:${document.generatedAt}`,
    artifactPath: document.path,
  })
}

export function emitPluginRecordNotification(plugin: PluginManifest, recordId: string): PluginRecord | null {
  assertPluginCapability(plugin, 'notifications')
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
    history: Array.isArray(input.history) ? input.history.slice(0, 50) : [],
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
    const existingGuardrail = existing && isGuardrailRecord(existing) ? existing : null
    const nextEnabled = input.enabled !== undefined ? input.enabled !== false : existingGuardrail?.enabled !== false
    const action: GuardrailHistoryEvent['action'] = !existingGuardrail
      ? nextEnabled ? 'activated' : 'created'
      : existingGuardrail.enabled !== nextEnabled
        ? nextEnabled ? 'activated' : 'deactivated'
        : 'updated'
    const targetInput = input.kind === 'guardrail' && 'appliesTo' in input ? input.appliesTo : undefined
    const agents = targetInput?.agents ?? existingGuardrail?.appliesTo.agents ?? []
    const workflows = targetInput?.workflows ?? existingGuardrail?.appliesTo.workflows ?? []
    const event: GuardrailHistoryEvent = {
      id: crypto.randomUUID(),
      action,
      summary: `${action === 'activated' ? 'Active' : action === 'deactivated' ? 'Inactive' : 'Updated'} for ${agents.length} agent${agents.length === 1 ? '' : 's'} and ${workflows.length} workflow${workflows.length === 1 ? '' : 's'}.`,
      createdAt: new Date().toISOString(),
    }
    nextRecord = createGuardrailRecord({
      ...(existingGuardrail || {}),
      ...input,
      history: [event, ...(existingGuardrail?.history || [])].slice(0, 50),
    } as Partial<GuardrailRecord>)
    if (plugin.capabilities?.notifications === true && (action === 'activated' || action === 'deactivated')) {
      createNotification({
        type: 'artifact-update',
        title: `${plugin.name}: ${action}`,
        message: `${String(input.name || existingGuardrail?.name || 'Guardrail')} is ${nextEnabled ? 'active' : 'inactive'} for ${agents.length} agents and ${workflows.length} workflows.`,
        entityId: nextRecord.id,
        fingerprint: `plugin-guardrail:${plugin.slug}:${nextRecord.id}:${event.id}`,
      })
    }
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
  assertPluginCapability(plugin, 'docs')
  const records = listPluginRecords(plugin)
  const index = records.findIndex((record) => record.id === recordId)
  if (index < 0) return null
  const document = writePluginDocument(plugin, records[index])
  const updated = { ...records[index], document, updatedAt: new Date().toISOString() }
  records.splice(index, 1, updated)
  writePluginRecords(plugin, records)
  writePluginItemFile(plugin, updated)
  if (plugin.capabilities?.notifications === true) {
    emitPluginArtifactNotification(plugin, updated, document)
  }
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

export interface PluginRelationshipSummary {
  agents: Record<string, Array<{ pluginId: string; itemId: string; name: string }>>
  workflows: Record<string, Array<{ pluginId: string; itemId: string; name: string }>>
}

export function listPluginRelationships(): PluginRelationshipSummary {
  const summary: PluginRelationshipSummary = { agents: {}, workflows: {} }
  for (const plugin of listConfiguredPlugins()) {
    for (const record of listPluginRecords(plugin)) {
      if (!isGuardrailRecord(record) || !record.enabled || record.archived) continue
      const relationship = { pluginId: plugin.slug, itemId: record.id, name: record.name }
      for (const agentId of record.appliesTo.agents) {
        summary.agents[agentId] = [...(summary.agents[agentId] || []), relationship]
      }
      for (const workflowId of record.appliesTo.workflows) {
        summary.workflows[workflowId] = [...(summary.workflows[workflowId] || []), relationship]
      }
    }
  }
  return summary
}

export function getPluginWorkspaceContext(plugin: PluginManifest): PluginWorkspaceContext {
  const agents = plugin.capabilities?.agents === true ? listAgents()
    .filter((agent) => !agent.archived)
    .map((agent) => ({ id: agent.id, name: agent.name || agent.id }))
    .sort((a, b) => a.name.localeCompare(b.name)) : []

  const workflows = plugin.capabilities?.workflows === true ? listWorkflows()
    .map((workflow) => ({ id: workflow.id, name: workflow.name || workflow.id }))
    .sort((a, b) => a.name.localeCompare(b.name)) : []

  const groupsPath = path.join(getWorkspacePath(), 'ORG', 'GROUPS.md')
  const communitiesPath = path.join(getWorkspacePath(), 'ORG', 'COMMUNITIES.md')
  const groups = plugin.capabilities?.communications === true && fs.existsSync(groupsPath)
    ? parseGroups(fs.readFileSync(groupsPath, 'utf-8')).groups.map((group) => group.name).sort((a, b) => a.localeCompare(b))
    : []
  const communities = plugin.capabilities?.communications === true && fs.existsSync(communitiesPath)
    ? parseGroups(fs.readFileSync(communitiesPath, 'utf-8')).communities.map((community) => community.name).sort((a, b) => a.localeCompare(b))
    : []

  return { agents, workflows, groups, communities }
}
