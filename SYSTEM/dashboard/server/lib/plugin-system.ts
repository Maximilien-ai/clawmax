import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { REPO_ROOT } from './paths'
import { createNotification } from './notifications'
import { listAgents, getWorkspacePath, parseGroups } from './workspace'
import { listExecutions, listWorkflows } from './workflows'
import { readAgentLifecycleAuditEvents } from './agent-lifecycle-audit'
import { getMessages } from './messages'

export const PLUGIN_HOST_API_VERSION = 'clawmax.ai/v2' as const

export type PluginObjectKind = string
export type PluginVisibility = 'private' | 'public'
export type PluginFieldValue = string | number | boolean | string[] | null
export type PluginCapability = 'notifications' | 'docs' | 'agents' | 'workflows' | 'communications' | 'metering'

const PLUGIN_CAPABILITIES: PluginCapability[] = ['docs', 'notifications', 'agents', 'workflows', 'communications', 'metering']
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

export interface PluginUiContract {
  form?: { order?: string[] }
  list?: { fields?: string[]; groupBy?: string; checkField?: string }
}

export interface PluginUsageMonitoringContract {
  kind: 'metering-budget'
  intervalMinutes: number
  fields: {
    scope: string
    targetIds: string
    tokenBudget: string
    costBudget: string
    currentTokens: string
    currentCost: string
    state: string
    summary: string
    lastAssessedAt: string
    nextAssessmentAt: string
  }
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
    metering?: boolean
  }
  labels?: {
    singular?: string
    plural?: string
  }
  recordSchema?: PluginRecordSchema
  ui?: PluginUiContract
  usageMonitoring?: PluginUsageMonitoringContract
}

export interface PluginSettingsEntry {
  id: string
  slug: string
  name: string
  description: string
  version: string
  visibility: PluginVisibility
  enabled: boolean
}

interface PersistedPluginSettings {
  version: 1
  enabledPluginIds: string[]
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
  action: 'created' | 'activated' | 'deactivated' | 'updated' | 'blocked'
  summary: string
  createdAt: string
}

export interface EvalRunRecord {
  id: string
  score: number
  summary: string
  judgeMode: 'fixed' | 'ai-placeholder' | 'human'
  casesCompleted?: number
  totalCases?: number
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
    judge: 'ai' | 'human' | 'fixed'
    iterations?: number
    judgeGuidance?: string
    fixedMatch?: 'exact' | 'contains' | 'regex'
    fixedCaseSensitive?: boolean
    humanReviewerName?: string
    humanReviewerEmail?: string
    humanReviewPath?: string
    cases?: EvalCase[]
  }
  runs: EvalRunRecord[]
  lastRun?: EvalRunRecord | null
  humanReview?: {
    status: 'pending' | 'completed'
    reviewerName?: string
    reviewerEmail?: string
    path: string
    requestedAt: string
    completedAt?: string
  } | null
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

export interface AgentLifecycleEvidence {
  subject: {
    kind?: 'agent' | 'workflow' | 'group' | 'community'
    id: string
    name: string
    createdAt: string | null
    lastModifiedAt: string | null
    currentModel: string | null
    currentStatus?: string | null
  }
  summary: {
    fileCount: number
    conversationCount: number
    messageCount: number
    observedModelCount: number
    observedChangeCount: number
    executionCount?: number
    participantCount?: number
    archiveCount?: number
  }
  files: Array<{ path: string; size: number; modifiedAt: string }>
  conversations: Array<{ id: string; active: boolean; messageCount: number; modifiedAt: string }>
  modelHistory: Array<{ model: string; observedAt: string | null; current: boolean }>
  events: Array<{
    id: string
    type: 'created' | 'modified' | 'file' | 'conversation' | 'model' | 'execution'
    at: string
    title: string
    detail: string
  }>
  limitations: string[]
  executions?: Array<{ id: string; status: string; startedAt: string; completedAt: string | null; participantCount: number }>
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
  return uniq([DEFAULT_PLUGIN_ROOT, ...configured].map((entry) => path.resolve(entry)))
}

function isTestPluginDirectory(directory: string): boolean {
  return directory.startsWith(path.join(DEFAULT_PLUGIN_ROOT, 'test') + path.sep)
}

function testPluginFixturesEnabled(): boolean {
  return String(process.env.CLAWMAX_ENABLE_TEST_PLUGINS || '').trim().toLowerCase() === 'true'
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
  const numeric = value.type === 'number' || value.type === 'integer'
  if (value.control !== undefined && value.control !== 'slider') return false
  if (value.control === 'slider' && (!numeric || !Number.isFinite(value.minimum) || !Number.isFinite(value.maximum))) return false
  if (value.minimum !== undefined && (!numeric || !Number.isFinite(value.minimum))) return false
  if (value.maximum !== undefined && (!numeric || !Number.isFinite(value.maximum))) return false
  if (value.step !== undefined && (!numeric || !Number.isFinite(value.step) || value.step <= 0)) return false
  if (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum) return false
  if (value.type === 'array' && value.items?.type !== 'string') return false
  if (value.default !== undefined) {
    if (value.type === 'string' && typeof value.default !== 'string') return false
    if ((value.type === 'number' || value.type === 'integer') && typeof value.default !== 'number') return false
    if (value.type === 'boolean' && typeof value.default !== 'boolean') return false
    if (value.type === 'array' && (!Array.isArray(value.default) || value.default.some((entry: unknown) => typeof entry !== 'string'))) return false
  }
  if (numeric && typeof value.default === 'number') {
    if (value.minimum !== undefined && value.default < value.minimum) return false
    if (value.maximum !== undefined && value.default > value.maximum) return false
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

function isPluginUsageMonitoring(value: any, schema: PluginRecordSchema | undefined): value is PluginUsageMonitoringContract {
  if (value === undefined) return true
  if (!schema || !value || value.kind !== 'metering-budget') return false
  if (!Number.isFinite(value.intervalMinutes) || value.intervalMinutes < 1 || value.intervalMinutes > 1440) return false
  if (!value.fields || typeof value.fields !== 'object' || Array.isArray(value.fields)) return false
  const expectedTypes: Record<keyof PluginUsageMonitoringContract['fields'], PluginRecordFieldSchema['type'][]> = {
    scope: ['string'],
    targetIds: ['array'],
    tokenBudget: ['number', 'integer'],
    costBudget: ['number', 'integer'],
    currentTokens: ['number', 'integer'],
    currentCost: ['number', 'integer'],
    state: ['string'],
    summary: ['string'],
    lastAssessedAt: ['string'],
    nextAssessmentAt: ['string'],
  }
  if (!Object.keys(expectedTypes).every((key) => typeof value.fields[key] === 'string')) return false
  if (!Object.keys(value.fields).every((key) => key in expectedTypes)) return false
  return Object.entries(expectedTypes).every(([binding, types]) => {
    const field = schema.properties[value.fields[binding]]
    return Boolean(field && types.includes(field.type))
  })
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
    && isPluginUsageMonitoring(value.usageMonitoring, value.recordSchema)

  if (!commonValid) return false
  if (!value.apiVersion || value.apiVersion === 'clawmax.ai/v1') {
    return value.objectKind === 'guardrail' || value.objectKind === 'eval'
  }
  if (value.apiVersion !== PLUGIN_HOST_API_VERSION) return false
  if (!isPluginRecordSchema(value.recordSchema)) return false
  if (value.usageMonitoring && value.capabilities?.metering !== true) return false
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

function getPluginSettingsPath(): string {
  const configured = String(process.env.CLAWMAX_PLUGIN_SETTINGS_PATH || '').trim()
  if (configured) return path.resolve(configured)
  const home = String(process.env.OPENCLAW_HOME || '').trim()
    || path.join(String(process.env.HOME || '').trim() || process.cwd(), '.openclaw')
  return path.join(home, 'clawmax-plugin-settings.json')
}

function readPersistedPluginSettings(): PersistedPluginSettings | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(getPluginSettingsPath(), 'utf-8')) as Partial<PersistedPluginSettings>
    if (parsed.version !== 1 || !Array.isArray(parsed.enabledPluginIds)) return null
    return {
      version: 1,
      enabledPluginIds: uniq(parsed.enabledPluginIds.filter((entry): entry is string => typeof entry === 'string')),
    }
  } catch {
    return null
  }
}

function getEnabledPluginSelection(): { filter: Set<string>; explicit: boolean } {
  const persisted = readPersistedPluginSettings()
  if (persisted) return { filter: new Set(persisted.enabledPluginIds), explicit: true }
  const configured = String(process.env.CLAWMAX_ENABLED_PLUGINS || '').trim()
  return {
    filter: new Set(uniq(configured.split(','))),
    explicit: configured.length > 0,
  }
}

function isPluginEnabled(
  manifest: PluginManifest,
  enabledFilter: Set<string>,
  disableDefaults: boolean,
  hasExplicitSelection: boolean,
): boolean {
  if (hasExplicitSelection) return enabledFilter.has(manifest.slug) || enabledFilter.has(manifest.id)
  if (disableDefaults) return false
  return manifest.enabledByDefault === true
}

export function listConfiguredPlugins(): PluginManifest[] {
  const disableDefaults = String(process.env.CLAWMAX_DISABLE_DEFAULT_PLUGINS || '').trim().toLowerCase() === 'true'
  const { filter: enabledFilter, explicit: hasExplicitSelection } = getEnabledPluginSelection()
  const manifests: PluginManifest[] = []
  const seenIdentities = new Set<string>()

  for (const entry of listDiscoveredPluginEntries()) {
    if (isTestPluginDirectory(entry.directory) && !testPluginFixturesEnabled()) continue
    const manifest = entry.manifest
    if (seenIdentities.has(manifest.id) || seenIdentities.has(manifest.slug)) continue
    seenIdentities.add(manifest.id)
    seenIdentities.add(manifest.slug)
    if (!isPluginEnabled(manifest, enabledFilter, disableDefaults, hasExplicitSelection)) continue
    manifests.push(manifest)
  }

  return manifests.sort(sortPlugins)
}

export function getPluginSettingsInventory(): PluginSettingsEntry[] {
  const enabled = new Set(listConfiguredPlugins().flatMap((plugin) => [plugin.id, plugin.slug]))
  const seen = new Set<string>()
  const manageable: PluginManifest[] = []

  for (const { directory, manifest } of listDiscoveredPluginEntries()) {
    if (isTestPluginDirectory(directory)) continue
    if (seen.has(manifest.id) || seen.has(manifest.slug)) continue
    seen.add(manifest.id)
    seen.add(manifest.slug)
    manageable.push(manifest)
  }

  return manageable.sort(sortPlugins).map((manifest) => ({
    id: manifest.id,
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    visibility: manifest.visibility,
    enabled: enabled.has(manifest.id) || enabled.has(manifest.slug),
  }))
}

export function updatePluginSettings(enabledPluginIds: unknown): PluginSettingsEntry[] {
  if (!Array.isArray(enabledPluginIds) || enabledPluginIds.some((entry) => typeof entry !== 'string')) {
    throw new PluginContractError('enabledPluginIds must be an array of plugin IDs.', 400)
  }

  const discoveredEntries = listDiscoveredPluginEntries()
  const entries = discoveredEntries
    .filter(({ directory }) => !directory.startsWith(path.join(DEFAULT_PLUGIN_ROOT, 'test') + path.sep))
  const byIdentity = new Map<string, PluginManifest>()
  for (const { manifest } of entries) {
    byIdentity.set(manifest.id, manifest)
    byIdentity.set(manifest.slug, manifest)
  }
  const allDiscoveredIdentities = new Set(discoveredEntries.flatMap(({ manifest }) => [manifest.id, manifest.slug]))
  const requested = uniq(enabledPluginIds.map((entry) => entry.trim()).filter(Boolean))
  const unknown = requested.filter((entry) => !byIdentity.has(entry))
  if (unknown.length > 0) {
    throw new PluginContractError(`Unknown plugin${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`, 400)
  }
  const currentSelection = getEnabledPluginSelection().filter
  const temporarilyUnavailable = Array.from(currentSelection)
    .filter((entry) => !allDiscoveredIdentities.has(entry))
  const canonical = uniq([
    ...requested.map((entry) => byIdentity.get(entry)!.slug),
    ...temporarilyUnavailable,
  ])
  const settings: PersistedPluginSettings = { version: 1, enabledPluginIds: canonical }
  const settingsPath = getPluginSettingsPath()
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 })
  fs.renameSync(temporaryPath, settingsPath)
  return getPluginSettingsInventory()
}

export function getPluginDiagnosticsReport(): PluginDiagnosticsReport {
  const roots = getPluginRoots()
  const { filter: enabledFilter, explicit: hasExplicitSelection } = getEnabledPluginSelection()
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
    if (isTestPluginDirectory(candidate.directory) && !testPluginFixturesEnabled()) continue
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
    const enabled = isPluginEnabled(manifest, enabledFilter, disableDefaults, hasExplicitSelection)
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
  const pluginsRoot = path.join(getWorkspacePath(), 'SYSTEM', 'plugins')
  const current = path.join(pluginsRoot, plugin.slug)
  if (fs.existsSync(current)) return current

  const legacySlugs: Record<string, string[]> = {
    'plugin-review-notes': ['plugin-lab-review-notes'],
    'plugin-evals': ['plugin-lab-evals'],
    'plugin-guardrails': ['plugin-lab-guardrails'],
  }
  for (const legacySlug of legacySlugs[plugin.slug] || []) {
    const legacy = path.join(pluginsRoot, legacySlug)
    if (!fs.existsSync(legacy)) continue
    try {
      fs.mkdirSync(pluginsRoot, { recursive: true })
      fs.renameSync(legacy, current)
      return current
    } catch {
      return legacy
    }
  }
  return current
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
    const bounded = Math.min(schema.maximum ?? parsed, Math.max(schema.minimum ?? parsed, parsed))
    return schema.type === 'integer' ? Math.trunc(bounded) : bounded
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

function normalizeEvalCases(value: unknown, legacyInput = '', legacyExpected = ''): EvalCase[] {
  const cases = Array.isArray(value) ? value : []
  const normalized = cases.slice(0, 100).map((entry: any, index) => ({
    id: String(entry?.id || `case-${index + 1}`).trim(),
    name: String(entry?.name || `Trial case ${index + 1}`).trim(),
    input: {
      type: entry?.input?.type === 'file' ? 'file' as const : 'text' as const,
      value: String(entry?.input?.value || '').trim(),
    },
    expected: {
      type: entry?.expected?.type === 'file' ? 'file' as const : 'text' as const,
      value: String(entry?.expected?.value || '').trim(),
    },
  })).filter((entry) => entry.id && (entry.input.value || entry.expected.value))
  if (normalized.length > 0) return normalized
  if (!legacyInput && !legacyExpected) return []
  return [{
    id: 'case-1',
    name: 'Trial case 1',
    input: { type: 'text', value: legacyInput },
    expected: { type: 'text', value: legacyExpected },
  }]
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
        action: ['created', 'activated', 'deactivated', 'updated', 'blocked'].includes(event.action) ? event.action : 'updated',
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
        judgeMode: run.judgeMode === 'fixed' || run.judgeMode === 'human' ? run.judgeMode : 'ai-placeholder',
        casesCompleted: Number.isFinite(run.casesCompleted) ? Math.max(0, Number(run.casesCompleted)) : undefined,
        totalCases: Number.isFinite(run.totalCases) ? Math.max(1, Number(run.totalCases)) : undefined,
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
      judge: value.experiment?.judge === 'ai' || value.experiment?.judge === 'human' ? value.experiment.judge : 'fixed',
      iterations: Math.max(1, Math.min(100, Math.round(Number(value.experiment?.iterations) || 1))),
      judgeGuidance: String(value.experiment?.judgeGuidance || '').trim(),
      fixedMatch: value.experiment?.fixedMatch === 'contains' || value.experiment?.fixedMatch === 'regex' ? value.experiment.fixedMatch : 'exact',
      fixedCaseSensitive: value.experiment?.fixedCaseSensitive === true,
      humanReviewerName: String(value.experiment?.humanReviewerName || '').trim(),
      humanReviewerEmail: String(value.experiment?.humanReviewerEmail || '').trim().toLowerCase(),
      humanReviewPath: String(value.experiment?.humanReviewPath || '').trim(),
      cases: normalizeEvalCases(
        value.experiment?.cases,
        String(value.experiment?.input || '').trim(),
        String(value.experiment?.expectedOutput || '').trim(),
      ),
    },
    runs,
    lastRun: value.lastRun || runs[0] || null,
    humanReview: value.humanReview && typeof value.humanReview === 'object'
      ? {
          status: value.humanReview.status === 'completed' ? 'completed' : 'pending',
          reviewerName: String(value.humanReview.reviewerName || '').trim(),
          reviewerEmail: String(value.humanReview.reviewerEmail || '').trim().toLowerCase(),
          path: String(value.humanReview.path || '').trim(),
          requestedAt: String(value.humanReview.requestedAt || '').trim(),
          completedAt: String(value.humanReview.completedAt || '').trim() || undefined,
        }
      : null,
  }
}

export function listPluginRecords(plugin: PluginManifest): PluginRecord[] {
  ensurePluginStorage(plugin)
  const raw = readJsonFile<any[]>(getPluginItemsPath(plugin))
  if (!Array.isArray(raw)) return []
  const records = raw.map((entry) => normalizeRecord(plugin, entry)).filter((entry): entry is PluginRecord => Boolean(entry))
  let recordsChanged = false
  for (const record of records) {
    const canonicalItemPath = buildPluginItemPath(plugin, record)
    const legacyItemPath = `SYSTEM/plugins/${plugin.slug}/items/${record.id}.md`
    const canonicalItemAbsolute = path.join(getWorkspacePath(), canonicalItemPath)
    const legacyItemAbsolute = path.join(getWorkspacePath(), legacyItemPath)
    if (!fs.existsSync(canonicalItemAbsolute) || fs.existsSync(legacyItemAbsolute)) {
      writePluginItemFile(plugin, record)
      if (legacyItemPath !== canonicalItemPath) removePluginFile(legacyItemPath)
    }

    if (record.document?.path) {
      const canonicalDocPath = buildPluginDocPath(plugin, record)
      if (record.document.path !== canonicalDocPath) {
        const previousAbsolute = path.join(getWorkspacePath(), record.document.path)
        const canonicalAbsolute = path.join(getWorkspacePath(), canonicalDocPath)
        if (fs.existsSync(previousAbsolute)) {
          fs.mkdirSync(path.dirname(canonicalAbsolute), { recursive: true })
          if (fs.existsSync(canonicalAbsolute)) fs.rmSync(canonicalAbsolute, { force: true })
          fs.renameSync(previousAbsolute, canonicalAbsolute)
        }
        record.document = { ...record.document, path: canonicalDocPath }
        recordsChanged = true
      }
    }
  }
  if (recordsChanged) writePluginRecords(plugin, records)
  return records
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

function pluginRecordFileStem(record: PluginRecord): string {
  const readable = String(record.name || record.kind || 'plugin-item')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '') || 'plugin-item'
  const unique = String(record.id || '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(-8)
    .toLowerCase() || crypto.createHash('sha256').update(readable).digest('hex').slice(0, 8)
  return `${readable}-${unique}`
}

function buildPluginDocPath(plugin: PluginManifest, record: PluginRecord): string {
  return `SYSTEM/plugins/${plugin.slug}/docs/${pluginRecordFileStem(record)}.md`
}

function buildPluginItemPath(plugin: PluginManifest, record: PluginRecord): string {
  return `SYSTEM/plugins/${plugin.slug}/items/${pluginRecordFileStem(record)}.md`
}

function removePluginFile(relativePath: string): void {
  const absolutePath = path.join(getWorkspacePath(), relativePath)
  if (fs.existsSync(absolutePath)) fs.rmSync(absolutePath, { force: true })
}

function removeSupersededPluginItemFiles(plugin: PluginManifest, previous: PluginRecord, next: PluginRecord): void {
  const nextPath = buildPluginItemPath(plugin, next)
  const previousPaths = [
    buildPluginItemPath(plugin, previous),
    `SYSTEM/plugins/${plugin.slug}/items/${previous.id}.md`,
  ]
  for (const previousPath of previousPaths) {
    if (previousPath !== nextPath) removePluginFile(previousPath)
  }
}

function isGuardrailRecord(record: PluginRecord): record is GuardrailRecord {
  return record.kind === 'guardrail' && 'controls' in record && 'appliesTo' in record
}

function isEvalRecord(record: PluginRecord): record is EvalRecord {
  return record.kind === 'eval' && 'experiment' in record && 'runs' in record
}

function getEvalRunReadinessIssues(record: EvalRecord): string[] {
  const issues: string[] = []
  const cases = record.experiment.cases || []
  const hasLegacyCase = record.experiment.input.trim().length > 0 && record.experiment.expectedOutput.trim().length > 0
  const hasCompleteCase = cases.some((entry) => entry.input.value.trim().length > 0 && entry.expected.value.trim().length > 0)
  if (!record.enabled) issues.push('enable this Eval')
  if (record.archived) issues.push('restore this Eval')
  if (record.target.ids.length === 0) issues.push(`select at least one ${record.target.type} target`)
  if (!Number.isFinite(record.experiment.iterations) || Number(record.experiment.iterations) < 1) issues.push('set at least one planned trial')
  if (!hasLegacyCase && !hasCompleteCase) issues.push('add a trial case with input and expected output')
  if (record.experiment.judge === 'ai' && !record.experiment.judgeGuidance?.trim()) {
    issues.push('add guidance for the AI evaluator')
  }
  if (record.experiment.judge === 'ai') {
    issues.push('AI evaluator runs are unavailable until model-backed target execution and measured usage are implemented')
  }
  if (record.experiment.judge === 'human') {
    if (!record.experiment.judgeGuidance?.trim()) issues.push('add instructions for the human reviewer')
    if (!record.experiment.humanReviewerEmail?.trim()) issues.push('assign a reviewer email')
  }
  if (record.experiment.judge === 'fixed' && record.experiment.fixedMatch === 'regex') {
    const pattern = cases.find((entry) => entry.expected.value.trim())?.expected.value || record.experiment.expectedOutput
    try {
      if (!pattern.trim()) throw new Error('empty pattern')
      new RegExp(pattern)
    } catch {
      issues.push('provide a valid expected regular expression')
    }
  }
  return issues
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
  const documentPath = buildPluginDocPath(plugin, record)
  if (record.document?.path && record.document.path !== documentPath) {
    removePluginFile(record.document.path)
  }
  const legacyPath = `SYSTEM/plugins/${plugin.slug}/docs/${record.id}.md`
  if (legacyPath !== documentPath) removePluginFile(legacyPath)
  const absolutePath = path.join(getWorkspacePath(), documentPath)
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
        `- **Evaluator:** ${record.experiment.judge === 'ai' ? 'AI evaluator' : record.experiment.judge === 'human' ? 'Human evaluator' : 'Fixed evaluator'}`,
        ...(record.experiment.judge === 'fixed'
          ? [`- **Comparison:** ${record.experiment.fixedMatch || 'exact'}${record.experiment.fixedCaseSensitive ? ' (case sensitive)' : ''}`]
          : []),
        ...(record.experiment.judge === 'human'
          ? [
              `- **Reviewer:** ${record.experiment.humanReviewerName || 'unassigned'}`,
              `- **Reviewer Email:** ${record.experiment.humanReviewerEmail || 'none'}`,
              `- **Review File:** ${record.humanReview?.path || record.experiment.humanReviewPath || 'created when requested'}`,
              `- **Review Status:** ${record.humanReview?.status || 'not requested'}`,
            ]
          : []),
        `- **Planned Trials:** ${record.experiment.iterations}`,
        `- **Trial Cases:** ${record.experiment.cases?.length || 0}`,
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
        '## Evaluator Guidance',
        '',
        record.experiment.judgeGuidance || 'No evaluator guidance provided.',
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
    path: documentPath,
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
        `fixed_match: ${record.experiment.fixedMatch || 'exact'}`,
        `fixed_case_sensitive: ${record.experiment.fixedCaseSensitive === true}`,
        `planned_trials: ${record.experiment.iterations || 1}`,
        `run_count: ${record.runs.length}`,
        `last_score: ${record.lastRun ? record.lastRun.score : 'null'}`,
        ...(record.experiment.judge === 'human'
          ? [
              `human_review_status: ${record.humanReview?.status || 'not-requested'}`,
              `human_review_path: ${quoteFrontmatter(record.humanReview?.path || record.experiment.humanReviewPath || '')}`,
            ]
          : []),
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
        `- Evaluator: ${record.experiment.judge}`,
        ...(record.experiment.judge === 'fixed'
          ? [`- Comparison: ${record.experiment.fixedMatch || 'exact'}${record.experiment.fixedCaseSensitive ? ' (case sensitive)' : ''}`]
          : []),
        ...(record.experiment.judge === 'human'
          ? [
              `- Reviewer: ${record.experiment.humanReviewerName || 'unassigned'}`,
              `- Reviewer email: ${record.experiment.humanReviewerEmail || 'none'}`,
              `- Review file: ${record.humanReview?.path || record.experiment.humanReviewPath || 'created when requested'}`,
              `- Review status: ${record.humanReview?.status || 'not requested'}`,
            ]
          : []),
        `- Planned trials: ${record.experiment.iterations || 1}`,
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
  const evalStatus = isEvalRecord(record)
    ? record.lastRun
      ? `${record.name} latest score is ${record.lastRun.score}/100 after ${record.runs.length} run${record.runs.length === 1 ? '' : 's'}.`
      : `${record.name} has not run yet and targets ${record.target.ids.length} ${record.target.type}${record.target.ids.length === 1 ? '' : 's'}.`
    : null
  createNotification({
    type: 'artifact-update',
    title: `${plugin.name}: ${record.name}`,
    message: evalStatus || `${plugin.name} emitted a status notification for ${record.name}.`,
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

function normalizeHumanReviewPath(rawPath: string, recordName: string, recordId: string): string {
  const supplied = rawPath.trim().replace(/\\/g, '/')
  const fallbackRecord = {
    id: recordId,
    kind: 'eval',
    name: recordName,
  } as PluginRecord
  const relativePath = supplied || `SYSTEM/evals/reviews/${pluginRecordFileStem(fallbackRecord)}-review.md`
  if (path.isAbsolute(relativePath) || !relativePath.toLowerCase().endsWith('.md')) {
    throw new PluginContractError('Human review path must be a relative workspace Markdown (.md) path.', 400)
  }
  const workspacePath = path.resolve(getWorkspacePath())
  const absolutePath = path.resolve(workspacePath, relativePath)
  if (absolutePath === workspacePath || !absolutePath.startsWith(`${workspacePath}${path.sep}`)) {
    throw new PluginContractError('Human review path must stay inside the current workspace.', 400)
  }
  return path.relative(workspacePath, absolutePath).split(path.sep).join('/')
}

function normalizeReviewerEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PluginContractError('Reviewer email must be valid.', 400)
  }
  return email
}

function createEvalRecord(input: Partial<EvalRecord>): EvalRecord {
  const now = new Date().toISOString()
  const id = String(input.id || crypto.randomUUID())
  const name = String(input.name || '').trim() || 'Untitled eval'
  const judge = input.experiment?.judge === 'ai' || input.experiment?.judge === 'human' ? input.experiment.judge : 'fixed'
  const humanReviewerEmail = normalizeReviewerEmail(String(input.experiment?.humanReviewerEmail || ''))
  const humanReviewPath = judge === 'human'
    ? normalizeHumanReviewPath(String(input.experiment?.humanReviewPath || ''), name, id)
    : String(input.experiment?.humanReviewPath || '').trim()
  return {
    id,
    kind: 'eval',
    name,
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
      judge,
      iterations: Math.max(1, Math.min(100, Math.round(Number(input.experiment?.iterations) || 1))),
      judgeGuidance: String(input.experiment?.judgeGuidance || '').trim(),
      fixedMatch: input.experiment?.fixedMatch === 'contains' || input.experiment?.fixedMatch === 'regex' ? input.experiment.fixedMatch : 'exact',
      fixedCaseSensitive: input.experiment?.fixedCaseSensitive === true,
      humanReviewerName: String(input.experiment?.humanReviewerName || '').trim(),
      humanReviewerEmail,
      humanReviewPath,
      cases: normalizeEvalCases(
        input.experiment?.cases,
        String(input.experiment?.input || '').trim(),
        String(input.experiment?.expectedOutput || '').trim(),
      ),
    },
    runs: Array.isArray(input.runs) ? input.runs : [],
    lastRun: input.lastRun || null,
    humanReview: input.humanReview || null,
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
  if (existing) removeSupersededPluginItemFiles(plugin, existing, nextRecord)
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
    removePluginFile(buildPluginItemPath(plugin, current))
    removePluginFile(`SYSTEM/plugins/${plugin.slug}/items/${current.id}.md`)
    if (current.document?.path) {
      removePluginFile(current.document.path)
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
  if (experiment.judge === 'ai') {
    throw new PluginContractError('AI evaluator runs are unavailable: ClawMax will not fabricate a score or usage without executing the target and a model-backed judge.', 501)
  }
  const now = new Date().toISOString()
  const fixedMatch = experiment.fixedMatch || 'exact'
  const normalizeFixedValue = (value: string) => experiment.fixedCaseSensitive ? value : value.toLowerCase()
  const expectedValue = normalizeFixedValue(experiment.expectedOutput)
  const candidateValue = normalizeFixedValue(experiment.candidateOutput)
  let fixedPassed = false
  let fixedError = ''
  if (fixedMatch === 'regex') {
    try {
      fixedPassed = new RegExp(experiment.expectedOutput, experiment.fixedCaseSensitive ? '' : 'i').test(experiment.candidateOutput)
    } catch (error: any) {
      fixedError = `Invalid regular expression: ${error?.message || 'could not compile pattern'}`
    }
  } else if (fixedMatch === 'contains') {
    fixedPassed = expectedValue.length > 0 && candidateValue.includes(expectedValue)
  } else {
    fixedPassed = expectedValue.length > 0 && candidateValue === expectedValue
  }
  const baseScore = fixedPassed ? 100 : 0
  const judgeMode = 'fixed'
  const tokensIn = 0
  const tokensOut = 0
  const costUsd = 0
  const totalCases = Math.max(1, experiment.cases?.length || experiment.iterations || 1)
  const summary = fixedError
      ? fixedError
      : `Fixed ${fixedMatch} comparison ${fixedPassed ? 'passed' : 'failed'}${experiment.fixedCaseSensitive ? ' with case sensitivity' : ''}.`
  return {
    id: crypto.randomUUID(),
    score: Math.max(0, Math.min(100, baseScore)),
    summary,
    judgeMode,
    casesCompleted: totalCases,
    totalCases,
    tokensIn,
    tokensOut,
    costUsd,
    createdAt: now,
  }
}

function quoteFrontmatter(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`
}

function writeHumanEvalReviewRequest(plugin: PluginManifest, record: EvalRecord): EvalRecord {
  const requestedAt = new Date().toISOString()
  const reviewPath = normalizeHumanReviewPath(
    record.experiment.humanReviewPath || '',
    record.name,
    record.id,
  )
  const absolutePath = path.join(getWorkspacePath(), reviewPath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  const cases = record.experiment.cases?.length
    ? record.experiment.cases
    : normalizeEvalCases([], record.experiment.input, record.experiment.expectedOutput)
  const caseLines = cases.flatMap((entry, index) => [
    `### ${index + 1}. ${entry.name || `Trial case ${index + 1}`}`,
    '',
    `- **Input (${entry.input.type}):** ${entry.input.value || 'none'}`,
    `- **Expected (${entry.expected.type}):** ${entry.expected.value || 'none'}`,
    '',
  ])
  const lines = [
    '---',
    `plugin: ${plugin.slug}`,
    `eval_id: ${record.id}`,
    `status: pending`,
    `reviewer_name: ${quoteFrontmatter(record.experiment.humanReviewerName || '')}`,
    `reviewer_email: ${quoteFrontmatter(record.experiment.humanReviewerEmail || '')}`,
    `requested_at: ${requestedAt}`,
    '---',
    '',
    `# Human review: ${record.name}`,
    '',
    record.description || 'Review this Eval and record the result below.',
    '',
    '## Reviewer instructions',
    '',
    record.experiment.judgeGuidance || 'Review the candidate output against the expected outcome and record a score, outcome, and rationale.',
    '',
    '## Assignment',
    '',
    `- **Reviewer:** ${record.experiment.humanReviewerName || 'Unassigned'}`,
    `- **Email:** ${record.experiment.humanReviewerEmail || 'Not provided'}`,
    `- **Target:** ${record.target.type} · ${record.target.ids.join(', ') || 'none selected'}`,
    `- **Planned trials:** ${record.experiment.iterations || 1}`,
    '',
    '## Trial cases',
    '',
    ...caseLines,
    '## Reviewer result',
    '',
    '- **Score (0-100):**',
    '- **Outcome (pass/fail):**',
    '- **Rationale:**',
    '',
    '> Change `status` in the frontmatter to `completed` after recording the result.',
    '',
  ]
  fs.writeFileSync(absolutePath, lines.join('\n'), 'utf-8')
  return {
    ...record,
    humanReview: {
      status: 'pending',
      reviewerName: record.experiment.humanReviewerName,
      reviewerEmail: record.experiment.humanReviewerEmail,
      path: reviewPath,
      requestedAt,
    },
    updatedAt: requestedAt,
  }
}

export function runPluginEval(plugin: PluginManifest, recordId: string): EvalRecord | null {
  if (!usesLegacyAdapter(plugin, 'eval')) return null
  const records = listPluginRecords(plugin)
  const index = records.findIndex((record) => record.id === recordId && record.kind === 'eval')
  if (index < 0) return null
  const current = records[index]
  if (!isEvalRecord(current)) return null
  const readinessIssues = getEvalRunReadinessIssues(current)
  if (readinessIssues.length > 0) {
    throw new PluginContractError(`Eval is not ready to run: ${readinessIssues.join('; ')}.`, 400)
  }
  if (current.experiment.judge === 'human') {
    const updated = writeHumanEvalReviewRequest(plugin, current)
    records.splice(index, 1, updated)
    writePluginRecords(plugin, records)
    writePluginItemFile(plugin, updated)
    if (plugin.capabilities?.notifications === true) {
      createNotification({
        type: 'artifact-update',
        title: `${plugin.name}: Human review requested`,
        message: `${updated.name} is ready for human review at ${updated.humanReview!.path}${updated.experiment.humanReviewerEmail ? ` by ${updated.experiment.humanReviewerEmail}` : ''}.`,
        entityId: updated.id,
        fingerprint: `plugin-human-review:${plugin.slug}:${updated.id}:${updated.humanReview!.requestedAt}`,
        artifactPath: updated.humanReview!.path,
      })
    }
    return updated
  }
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
  agents: Record<string, PluginRelationshipEntry[]>
  workflows: Record<string, PluginRelationshipEntry[]>
}

export interface PluginRelationshipEntry {
  pluginId: string
  pluginName: string
  objectKind: string
  itemId: string
  name: string
  status: string
  summary?: string
}

export type GuardrailOperation = 'outbound-email'

export interface GuardrailEnforcementInput {
  operation: GuardrailOperation
  agentId?: string
  workflowId?: string
}

export interface GuardrailEnforcementDecision {
  allowed: boolean
  guardrails: Array<{ pluginId: string; itemId: string; name: string }>
}

function guardrailBlocksOperation(record: GuardrailRecord, input: GuardrailEnforcementInput): boolean {
  if (!record.enabled || record.archived) return false
  const targetsAgent = !!input.agentId && record.appliesTo.agents.includes(input.agentId)
  const targetsWorkflow = !!input.workflowId && record.appliesTo.workflows.includes(input.workflowId)
  if (!targetsAgent && !targetsWorkflow) return false
  return input.operation === 'outbound-email' && record.controls.blockEmail
}

export function evaluatePluginGuardrails(input: GuardrailEnforcementInput): GuardrailEnforcementDecision {
  const guardrails: GuardrailEnforcementDecision['guardrails'] = []
  for (const plugin of listConfiguredPlugins()) {
    for (const record of listPluginRecords(plugin)) {
      if (!isGuardrailRecord(record) || !guardrailBlocksOperation(record, input)) continue
      guardrails.push({ pluginId: plugin.slug, itemId: record.id, name: record.name })
    }
  }
  return { allowed: guardrails.length === 0, guardrails }
}

export function enforcePluginGuardrails(input: GuardrailEnforcementInput): void {
  const decision = evaluatePluginGuardrails(input)
  if (decision.allowed) return

  const now = new Date().toISOString()
  for (const plugin of listConfiguredPlugins()) {
    const records = listPluginRecords(plugin)
    let changed = false
    for (const record of records) {
      if (!isGuardrailRecord(record) || !guardrailBlocksOperation(record, input)) continue
      const target = input.agentId ? `agent ${input.agentId}` : input.workflowId ? `workflow ${input.workflowId}` : 'target'
      const event: GuardrailHistoryEvent = {
        id: crypto.randomUUID(),
        action: 'blocked',
        summary: `Blocked outbound email for ${target}.`,
        createdAt: now,
      }
      record.history = [event, ...record.history].slice(0, 50)
      record.updatedAt = now
      writePluginItemFile(plugin, record)
      if (plugin.capabilities?.notifications === true) {
        createNotification({
          type: 'artifact-update',
          title: `${plugin.name}: outbound email blocked`,
          message: `${record.name} blocked outbound email for ${target}.`,
          entityId: record.id,
          fingerprint: `plugin-guardrail-block:${plugin.slug}:${record.id}:${event.id}`,
        })
      }
      changed = true
    }
    if (changed) writePluginRecords(plugin, records)
  }

  const names = decision.guardrails.map((entry) => entry.name).join(', ')
  const target = input.agentId ? `agent ${input.agentId}` : input.workflowId ? `workflow ${input.workflowId}` : 'this target'
  throw new PluginContractError(`Outbound email blocked for ${target} by active guardrail${decision.guardrails.length === 1 ? '' : 's'}: ${names}.`, 403)
}

export function listPluginRelationships(): PluginRelationshipSummary {
  const summary: PluginRelationshipSummary = { agents: {}, workflows: {} }
  const addRelationship = (
    collection: Record<string, PluginRelationshipEntry[]>,
    targetId: string,
    relationship: PluginRelationshipEntry,
  ) => {
    if (!targetId) return
    collection[targetId] = [...(collection[targetId] || []), relationship]
  }

  for (const plugin of listConfiguredPlugins()) {
    for (const record of listPluginRecords(plugin)) {
      if (!record.enabled || record.archived) continue
      const relationshipBase = {
        pluginId: plugin.slug,
        pluginName: plugin.name,
        objectKind: plugin.objectKind,
        itemId: record.id,
        name: record.name,
      }

      if (isGuardrailRecord(record)) {
        const relationship = { ...relationshipBase, status: 'active', summary: record.description }
        for (const agentId of record.appliesTo.agents) addRelationship(summary.agents, agentId, relationship)
        for (const workflowId of record.appliesTo.workflows) addRelationship(summary.workflows, workflowId, relationship)
        continue
      }

      if (isEvalRecord(record)) {
        const runCount = record.runs.length
        const relationship = {
          ...relationshipBase,
          status: runCount > 0 ? `${runCount} run${runCount === 1 ? '' : 's'}` : 'ready',
          summary: record.description,
        }
        if (record.target.type === 'agent') {
          for (const agentId of record.target.ids) addRelationship(summary.agents, agentId, relationship)
        } else if (record.target.type === 'workflow') {
          for (const workflowId of record.target.ids) addRelationship(summary.workflows, workflowId, relationship)
        }
        continue
      }

      if (!('fields' in record)) continue
      const schemaFields = Object.entries(plugin.recordSchema?.properties || {})
      const contract = plugin.usageMonitoring?.fields
      const inferredScopeField = schemaFields.find(([, field]) =>
        field.type === 'string' && field.enum?.includes('agent') && field.enum?.includes('workflow'),
      )?.[0]
      const inferredTargetsField = schemaFields.find(([, field]) =>
        field.type === 'array' && /target/i.test(field.title),
      )?.[0]
      const scopeField = contract?.scope || inferredScopeField
      const targetIdsField = contract?.targetIds || inferredTargetsField
      if (!scopeField || !targetIdsField) continue
      const scope = record.fields[scopeField]
      const targetIds = record.fields[targetIdsField]
      if (typeof scope !== 'string' || !Array.isArray(targetIds)) continue

      const appliedStatusField = Object.entries(plugin.recordSchema?.properties || {}).find(([, field]) =>
        field.type === 'string' && field.enum?.includes('applied'),
      )?.[0]
      if (appliedStatusField && record.fields[appliedStatusField] !== 'applied') continue

      const monitoringState = contract ? record.fields[contract.state] : null
      const monitoringSummary = contract ? record.fields[contract.summary] : null
      const relationship = {
        ...relationshipBase,
        status: typeof monitoringState === 'string' && monitoringState ? monitoringState : 'applied',
        summary: typeof monitoringSummary === 'string' && monitoringSummary ? monitoringSummary : record.description,
      }
      if (scope === 'agent') {
        for (const agentId of targetIds) addRelationship(summary.agents, agentId, relationship)
      } else if (scope === 'workflow') {
        for (const workflowId of targetIds) addRelationship(summary.workflows, workflowId, relationship)
      } else if (scope === 'workspace') {
        if (plugin.capabilities?.agents) {
          for (const agent of listAgents().filter((entry) => !entry.archived)) addRelationship(summary.agents, agent.id, relationship)
        }
        if (plugin.capabilities?.workflows) {
          for (const workflow of listWorkflows()) addRelationship(summary.workflows, workflow.id, relationship)
        }
      }
    }
  }
  for (const relationships of [...Object.values(summary.agents), ...Object.values(summary.workflows)]) {
    relationships.sort((left, right) => left.pluginName.localeCompare(right.pluginName) || left.name.localeCompare(right.name))
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

function isoTimestamp(value: number): string {
  return new Date(value).toISOString()
}

function countVisibleSessionMessages(filePath: string): number {
  try {
    return fs.readFileSync(filePath, 'utf-8').split('\n').reduce((count, line) => {
      if (!line.trim()) return count
      try {
        const entry = JSON.parse(line)
        const role = entry?.message?.role
        return role === 'user' || role === 'assistant' ? count + 1 : count
      } catch {
        return count
      }
    }, 0)
  } catch {
    return 0
  }
}

function listAgentLifecycleFiles(agentId: string): AgentLifecycleEvidence['files'] {
  const root = path.join(getWorkspacePath(), 'AGENTS', agentId)
  if (!fs.existsSync(root)) return []
  const files: AgentLifecycleEvidence['files'] = []
  const pending = [root]
  while (pending.length > 0 && files.length < 250) {
    const directory = pending.shift()!
    let entries: fs.Dirent[] = []
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(fullPath)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const stats = fs.statSync(fullPath)
        files.push({
          path: path.relative(getWorkspacePath(), fullPath),
          size: stats.size,
          modifiedAt: isoTimestamp(stats.mtimeMs),
        })
      } catch {}
      if (files.length >= 250) break
    }
  }
  return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

function readAgentLifecycleSessions(agentId: string): {
  conversations: AgentLifecycleEvidence['conversations']
  observedModels: Array<{ model: string; observedAt: string | null }>
} {
  const sessionsRoot = path.join(String(process.env.HOME || ''), '.openclaw', 'agents', agentId, 'sessions')
  const sessionFiles: string[] = []
  for (const directory of [sessionsRoot, path.join(sessionsRoot, 'archive')]) {
    if (!fs.existsSync(directory)) continue
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) sessionFiles.push(path.join(directory, entry.name))
      }
    } catch {}
  }
  const conversations = sessionFiles.slice(0, 100).map((filePath) => {
    const stats = fs.statSync(filePath)
    return {
      id: path.basename(filePath, '.jsonl'),
      active: path.dirname(filePath) === sessionsRoot,
      messageCount: countVisibleSessionMessages(filePath),
      modifiedAt: isoTimestamp(stats.mtimeMs),
    }
  }).filter((entry) => entry.messageCount > 0).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))

  const observedModels: Array<{ model: string; observedAt: string | null }> = []
  try {
    const index = JSON.parse(fs.readFileSync(path.join(sessionsRoot, 'sessions.json'), 'utf-8'))
    for (const value of Object.values(index || {}) as any[]) {
      const model = typeof value?.model === 'string' ? value.model : typeof value?.modelOverride === 'string' ? value.modelOverride : ''
      if (!model) continue
      const timestamp = Number(value?.updatedAt)
      observedModels.push({ model, observedAt: Number.isFinite(timestamp) ? isoTimestamp(timestamp) : null })
    }
  } catch {}
  return { conversations, observedModels }
}

export function getAgentLifecycleEvidence(plugin: PluginManifest, agentId: string): AgentLifecycleEvidence {
  if (plugin.objectKind !== 'lifecycle-view') throw new PluginContractError('Lifecycle evidence is only available to Lifecycle plugins.', 400)
  assertPluginCapability(plugin, 'agents')
  if (!/^[a-z][a-z0-9_-]*$/.test(agentId)) throw new PluginContractError('Invalid agent ID.', 400)
  const agent = listAgents().find((entry) => entry.id === agentId && !entry.archived)
  if (!agent) throw new PluginContractError('Agent not found.', 404)

  const agentRoot = path.join(getWorkspacePath(), 'AGENTS', agentId)
  let createdAt: string | null = null
  try {
    const stats = fs.statSync(agentRoot)
    const createdMs = stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.ctimeMs
    createdAt = isoTimestamp(createdMs)
  } catch {}
  try {
    const identity = fs.readFileSync(path.join(agentRoot, 'IDENTITY.md'), 'utf-8')
    const declaredCreatedAt = identity.match(/^[-*]\s+\*\*Created:\*\*\s+(.+)$/mi)?.[1]?.trim()
    if (declaredCreatedAt && !Number.isNaN(new Date(declaredCreatedAt).getTime())) createdAt = new Date(declaredCreatedAt).toISOString()
  } catch {}
  const files = listAgentLifecycleFiles(agentId)
  const { conversations, observedModels } = readAgentLifecycleSessions(agentId)
  let currentModel: string | null = null
  try {
    const config = JSON.parse(fs.readFileSync(path.join(String(process.env.HOME || ''), '.openclaw', 'openclaw.json'), 'utf-8'))
    const configured = (config?.agents?.list || []).find((entry: any) => entry?.id === agentId)
    currentModel = typeof configured?.model === 'string'
      ? configured.model
      : typeof configured?.model?.primary === 'string'
        ? configured.model.primary
        : null
  } catch {}

  const modelHistory = Array.from(new Map([
    ...(currentModel ? [{ model: currentModel, observedAt: null }] : []),
    ...observedModels,
  ].map((entry) => [entry.model, entry])).values()).map((entry) => ({
    ...entry,
    current: entry.model === currentModel,
  }))
  const events: AgentLifecycleEvidence['events'] = []
  if (createdAt) events.push({ id: 'created', type: 'created', at: createdAt, title: 'Agent created', detail: agent.name || agent.id })
  for (const file of files) events.push({ id: `file:${file.path}`, type: 'file', at: file.modifiedAt, title: 'File observed', detail: file.path })
  for (const conversation of conversations) events.push({ id: `conversation:${conversation.id}`, type: 'conversation', at: conversation.modifiedAt, title: conversation.active ? 'Active conversation' : 'Archived conversation', detail: `${conversation.messageCount} visible messages` })
  for (const model of modelHistory) {
    if (!model.observedAt) continue
    events.push({ id: `model:${model.model}:${model.observedAt}`, type: 'model', at: model.observedAt, title: 'Model observed', detail: model.model })
  }
  for (const audit of readAgentLifecycleAuditEvents(agentId)) {
    events.push({ id: `audit:${audit.id}`, type: audit.type, at: audit.at, title: audit.title, detail: audit.detail })
    if (audit.type === 'model' && audit.model && !modelHistory.some((entry) => entry.model === audit.model)) {
      modelHistory.push({ model: audit.model, observedAt: audit.at, current: audit.model === currentModel })
    }
  }
  events.sort((a, b) => a.at.localeCompare(b.at))
  const lastModifiedAt = events.length > 0 ? events[events.length - 1].at : createdAt
  return {
    subject: { kind: 'agent', id: agent.id, name: agent.name || agent.id, createdAt, lastModifiedAt, currentModel },
    summary: {
      fileCount: files.length,
      conversationCount: conversations.length,
      messageCount: conversations.reduce((sum, entry) => sum + entry.messageCount, 0),
      observedModelCount: modelHistory.length,
      observedChangeCount: events.filter((entry) => entry.type === 'modified' || entry.type === 'model' || entry.type === 'file').length,
    },
    files,
    conversations,
    modelHistory,
    events,
    limitations: [
      'File events use current filesystem timestamps; edits made before lifecycle auditing was enabled may not have a complete history. Dashboard edits made now are recorded explicitly.',
      'Model history includes the current configuration and models retained in available session metadata.',
    ],
  }
}

export function getWorkflowLifecycleEvidence(plugin: PluginManifest, workflowId: string): AgentLifecycleEvidence {
  if (plugin.objectKind !== 'lifecycle-view') throw new PluginContractError('Lifecycle evidence is only available to Lifecycle plugins.', 400)
  assertPluginCapability(plugin, 'workflows')
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(workflowId)) throw new PluginContractError('Invalid workflow ID.', 400)
  const workflow = listWorkflows().find((entry) => entry.id === workflowId)
  if (!workflow) throw new PluginContractError('Workflow not found.', 404)

  const workspaceRoot = getWorkspacePath()
  const definitionPath = path.join(workspaceRoot, 'WORKFLOWS', `${workflowId}.md`)
  let definitionStats: fs.Stats | null = null
  try { definitionStats = fs.statSync(definitionPath) } catch {}
  const parseTimestamp = (value: unknown): string | null => {
    if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return null
    return new Date(value).toISOString()
  }
  const createdAt = parseTimestamp(workflow.created)
    || (definitionStats ? isoTimestamp(definitionStats.birthtimeMs > 0 ? definitionStats.birthtimeMs : definitionStats.ctimeMs) : null)
  const modifiedAt = parseTimestamp(workflow.modified) || (definitionStats ? isoTimestamp(definitionStats.mtimeMs) : createdAt)
  const executions = listExecutions(workflowId, 100)
  const participants = new Set(executions.flatMap((execution) => execution.participants.map((participant) => participant.agentId)))
  const files: AgentLifecycleEvidence['files'] = []
  if (definitionStats) {
    files.push({ path: path.relative(workspaceRoot, definitionPath), size: definitionStats.size, modifiedAt: isoTimestamp(definitionStats.mtimeMs) })
  }
  for (const execution of executions) {
    for (const output of Object.values(execution.outputs || {})) {
      if (!output?.artifactPath) continue
      const artifactPath = path.resolve(workspaceRoot, output.artifactPath)
      if (artifactPath !== workspaceRoot && !artifactPath.startsWith(workspaceRoot + path.sep)) continue
      try {
        const stats = fs.statSync(artifactPath)
        if (stats.isFile() && !files.some((entry) => entry.path === path.relative(workspaceRoot, artifactPath))) {
          files.push({ path: path.relative(workspaceRoot, artifactPath), size: stats.size, modifiedAt: isoTimestamp(stats.mtimeMs) })
        }
      } catch {}
    }
  }
  const events: AgentLifecycleEvidence['events'] = []
  if (createdAt) events.push({ id: 'created', type: 'created', at: createdAt, title: 'Workflow created', detail: workflow.name || workflow.id })
  if (modifiedAt && modifiedAt !== createdAt) events.push({ id: 'modified', type: 'modified', at: modifiedAt, title: 'Workflow configuration observed', detail: `Schedule: ${workflow.schedule || 'manual'}` })
  for (const execution of executions) {
    events.push({ id: `execution:${execution.id}`, type: 'execution', at: execution.startedAt, title: 'Workflow run started', detail: `${execution.status} · ${execution.participants.length} participants` })
    if (execution.completedAt) events.push({ id: `execution:${execution.id}:completed`, type: 'execution', at: execution.completedAt, title: `Workflow run ${execution.status}`, detail: execution.id })
  }
  for (const file of files) events.push({ id: `file:${file.path}`, type: 'file', at: file.modifiedAt, title: 'Artifact observed', detail: file.path })
  events.sort((a, b) => a.at.localeCompare(b.at))
  const lastModifiedAt = events.at(-1)?.at || modifiedAt || createdAt
  return {
    subject: {
      kind: 'workflow',
      id: workflow.id,
      name: workflow.name || workflow.id,
      createdAt,
      lastModifiedAt,
      currentModel: null,
      currentStatus: workflow.status || (workflow.enabled ? 'enabled' : 'disabled'),
    },
    summary: {
      fileCount: files.length,
      conversationCount: 0,
      messageCount: 0,
      observedModelCount: 0,
      observedChangeCount: events.filter((entry) => entry.type === 'modified' || entry.type === 'file').length,
      executionCount: executions.length,
      participantCount: participants.size,
    },
    files: files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)),
    conversations: [],
    modelHistory: [],
    executions: executions.slice().reverse().map((execution) => ({
      id: execution.id,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt || null,
      participantCount: execution.participants.length,
    })),
    events,
    limitations: [
      'Workflow history includes the current definition and execution records retained in this workspace.',
      'Configuration changes made before explicit lifecycle auditing may only expose the current file timestamps.',
    ],
  }
}

function listCommunicationArchiveMetadata(subjectType: 'group' | 'community', name: string): Array<{ filename: string; timestamp: number; messageCount: number }> {
  const archiveDir = path.join(getWorkspacePath(), 'SYSTEM', 'messages', subjectType === 'group' ? 'groups' : 'communities', 'archive')
  if (!fs.existsSync(archiveDir)) return []
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase()
  try {
    return fs.readdirSync(archiveDir)
      .filter((filename) => filename.startsWith(`${safeName}_`) && filename.endsWith('.json'))
      .map((filename) => {
        const timestamp = Number(filename.match(/_(\d+)\.json$/)?.[1] || 0)
        let messageCount = 0
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(archiveDir, filename), 'utf-8'))
          messageCount = Array.isArray(parsed) ? parsed.length : 0
        } catch {}
        return { filename, timestamp, messageCount }
      })
      .sort((a, b) => b.timestamp - a.timestamp)
  } catch {
    return []
  }
}

export function getCommunicationLifecycleEvidence(
  plugin: PluginManifest,
  subjectType: 'group' | 'community',
  name: string,
): AgentLifecycleEvidence {
  if (plugin.objectKind !== 'lifecycle-view') throw new PluginContractError('Lifecycle evidence is only available to Lifecycle plugins.', 400)
  assertPluginCapability(plugin, 'communications')
  if (!name.trim() || name.length > 240) throw new PluginContractError('Invalid communication name.', 400)
  const context = getPluginWorkspaceContext(plugin)
  const names = subjectType === 'group' ? context.groups : context.communities
  if (!names.includes(name)) throw new PluginContractError(`${subjectType} not found.`, 404)
  const messages = getMessages(subjectType, name)
  const archives = listCommunicationArchiveMetadata(subjectType, name)
  const firstTimestamp = messages[0]?.timestamp || archives.at(-1)?.timestamp || null
  const lastTimestamp = messages.at(-1)?.timestamp || archives[0]?.timestamp || firstTimestamp
  const files: AgentLifecycleEvidence['files'] = []
  const events: AgentLifecycleEvidence['events'] = []
  if (firstTimestamp) events.push({ id: 'created', type: 'created', at: isoTimestamp(firstTimestamp), title: `${subjectType === 'group' ? 'Group' : 'Community'} activity observed`, detail: name })
  for (const message of messages) {
    events.push({ id: `message:${message.id}`, type: 'conversation', at: isoTimestamp(message.timestamp), title: 'Message sent', detail: `${message.from}: ${message.content.slice(0, 120)}` })
  }
  for (const archive of archives) {
    if (archive.timestamp) events.push({ id: `archive:${archive.filename}`, type: 'file', at: isoTimestamp(archive.timestamp), title: 'Conversation archived', detail: `${archive.messageCount} messages` })
  }
  events.sort((a, b) => a.at.localeCompare(b.at))
  return {
    subject: { kind: subjectType, id: name, name, createdAt: firstTimestamp ? isoTimestamp(firstTimestamp) : null, lastModifiedAt: lastTimestamp ? isoTimestamp(lastTimestamp) : null, currentModel: null },
    summary: { fileCount: files.length, conversationCount: messages.length + archives.length, messageCount: messages.length, observedModelCount: 0, observedChangeCount: events.length, archiveCount: archives.length },
    files,
    conversations: messages.length > 0 ? [{ id: `${subjectType}:${name}`, active: true, messageCount: messages.length, modifiedAt: isoTimestamp(lastTimestamp || Date.now()) }] : [],
    modelHistory: [],
    events,
    limitations: ['Communication history includes messages and archived conversations retained in this workspace.', 'Messages are summarized in the timeline; open Communications for full content and member details.'],
  }
}
