import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { REPO_ROOT } from './paths'
import { createNotification } from './notifications'
import { listAgents, getWorkspacePath, parseGroups } from './workspace'
import { listWorkflows } from './workflows'

export type PluginObjectKind = 'guardrail' | 'eval'
export type PluginVisibility = 'private' | 'public'

export interface PluginManifest {
  id: string
  slug: string
  name: string
  description: string
  version: string
  icon: string
  objectKind: PluginObjectKind
  visibility: PluginVisibility
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

export type PluginRecord = GuardrailRecord | EvalRecord

export interface PluginWorkspaceContext {
  agents: Array<{ id: string; name: string }>
  workflows: Array<{ id: string; name: string }>
  groups: string[]
  communities: string[]
}

const DEFAULT_PLUGIN_ROOT = path.join(REPO_ROOT, 'SYSTEM', 'dashboard', 'plugins')
const PLUGIN_MANIFEST_FILE = 'clawmax-plugin.json'

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

function isPluginManifest(value: any): value is PluginManifest {
  return !!value
    && typeof value.id === 'string'
    && typeof value.slug === 'string'
    && typeof value.name === 'string'
    && typeof value.description === 'string'
    && typeof value.version === 'string'
    && typeof value.icon === 'string'
    && (value.objectKind === 'guardrail' || value.objectKind === 'eval')
    && (value.visibility === 'private' || value.visibility === 'public')
    && value.source
    && value.source.type === 'github'
    && typeof value.source.owner === 'string'
    && typeof value.source.repo === 'string'
    && typeof value.source.url === 'string'
}

export function listConfiguredPlugins(): PluginManifest[] {
  const enabledFilter = new Set(
    uniq(String(process.env.CLAWMAX_ENABLED_PLUGINS || '').split(','))
  )
  const manifests: PluginManifest[] = []

  for (const root of getPluginRoots()) {
    if (!fs.existsSync(root)) continue
    const entries = fs.readdirSync(root, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifestPath = path.join(root, entry.name, PLUGIN_MANIFEST_FILE)
      const manifest = readJsonFile<PluginManifest>(manifestPath)
      if (!isPluginManifest(manifest)) continue
      if (enabledFilter.size > 0 && !enabledFilter.has(manifest.slug) && !enabledFilter.has(manifest.id)) continue
      manifests.push(manifest)
    }
  }

  return manifests.sort(sortPlugins)
}

export function getPluginBySlug(slug: string): PluginManifest | null {
  return listConfiguredPlugins().find((plugin) => plugin.slug === slug || plugin.id === slug) || null
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

function normalizeRecord(plugin: PluginManifest, value: any): PluginRecord | null {
  if (!value || typeof value !== 'object') return null
  if (plugin.objectKind === 'guardrail') {
    return {
      id: String(value.id || '').trim(),
      kind: 'guardrail',
      name: String(value.name || '').trim(),
      description: String(value.description || '').trim(),
      tags: uniq(Array.isArray(value.tags) ? value.tags.map(String) : []),
      enabled: value.enabled !== false,
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

  const runs = Array.isArray(value.runs)
    ? value.runs
      .map((run: any) => ({
        id: String(run.id || '').trim(),
        score: Number.isFinite(run.score) ? Number(run.score) : 0,
        summary: String(run.summary || '').trim(),
        judgeMode: run.judgeMode === 'fixed' ? 'fixed' : 'ai-placeholder',
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

function writePluginRecords(plugin: PluginManifest, records: PluginRecord[]): void {
  ensurePluginStorage(plugin)
  fs.writeFileSync(getPluginItemsPath(plugin), JSON.stringify(records, null, 2), 'utf-8')
}

function buildPluginDocPath(plugin: PluginManifest, record: PluginRecord): string {
  return `SYSTEM/plugins/${plugin.slug}/docs/${record.id}.md`
}

function writePluginDocument(plugin: PluginManifest, record: PluginRecord): PluginDocument {
  ensurePluginStorage(plugin)
  const generatedAt = new Date().toISOString()
  const absolutePath = path.join(getWorkspacePath(), buildPluginDocPath(plugin, record))
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })

  const lines = record.kind === 'guardrail'
    ? [
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
    : [
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

  fs.writeFileSync(absolutePath, lines.join('\n'), 'utf-8')
  return {
    path: buildPluginDocPath(plugin, record),
    title: `${record.name} ${plugin.objectKind === 'guardrail' ? 'guardrail' : 'eval'} summary`,
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

export function upsertPluginRecord(plugin: PluginManifest, input: Partial<PluginRecord>): PluginRecord {
  const records = listPluginRecords(plugin)
  const existingIndex = records.findIndex((record) => record.id === input.id)
  const nextRecord = plugin.objectKind === 'guardrail'
    ? createGuardrailRecord(existingIndex >= 0 ? { ...records[existingIndex], ...input } as Partial<GuardrailRecord> : input as Partial<GuardrailRecord>)
    : createEvalRecord(existingIndex >= 0 ? { ...records[existingIndex], ...input } as Partial<EvalRecord> : input as Partial<EvalRecord>)

  if (existingIndex >= 0) records.splice(existingIndex, 1, nextRecord)
  else records.unshift(nextRecord)
  writePluginRecords(plugin, records)
  return nextRecord
}

export function deletePluginRecord(plugin: PluginManifest, recordId: string): boolean {
  const records = listPluginRecords(plugin)
  const next = records.filter((record) => record.id !== recordId)
  if (next.length === records.length) return false
  writePluginRecords(plugin, next)
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
  const summary = experiment.judge === 'ai'
    ? `Placeholder AI judge scored semantic overlap at ${baseScore}/100. Replace with a real model-backed judge in a later pass.`
    : `Fixed heuristic judge scored token overlap at ${baseScore}/100 against the expected output.`
  return {
    id: crypto.randomUUID(),
    score: Math.max(0, Math.min(100, baseScore)),
    summary,
    judgeMode,
    createdAt: now,
  }
}

export function runPluginEval(plugin: PluginManifest, recordId: string): EvalRecord | null {
  if (plugin.objectKind !== 'eval') return null
  const records = listPluginRecords(plugin)
  const index = records.findIndex((record) => record.id === recordId && record.kind === 'eval')
  if (index < 0) return null
  const current = records[index]
  if (current.kind !== 'eval') return null
  const run = scoreEval(current.experiment)
  const updated: EvalRecord = {
    ...current,
    runs: [run, ...current.runs].slice(0, 20),
    lastRun: run,
    updatedAt: new Date().toISOString(),
  }
  records.splice(index, 1, updated)
  writePluginRecords(plugin, records)
  const document = writePluginDocument(plugin, updated)
  updated.document = document
  records.splice(index, 1, updated)
  writePluginRecords(plugin, records)
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
