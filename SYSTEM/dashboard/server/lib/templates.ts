import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { getSystemProviderKeys } from './dashboard-env'
import Ajv from 'ajv'
import { execSync } from 'child_process'
import { getWorkspacePath, getAgentsDir, parseIdentity, listAgents, parseGroups, readWorkspaceFile, writeWorkspaceFile } from './workspace'
import { setAgentSkills, getAgentSkills } from './skills'
import { listWorkflows, createWorkflow } from './workflows'
import { createTeam, getTeam, updateTeam, type TeamInput } from './teams'
import { TEMPLATES_DIR, TEMPLATE_SCHEMAS_DIR } from './paths'
import { validateAgentConfigSections } from './agent-config-validation'
import { resetAgentSessionsForModelChange, updateAgentModelInConfigFile } from './agent-model'
import { safeEnv } from './safe-env'
import { recordTemplateApply, type CanonicalTemplateFeedbackSource, type CanonicalTemplateFeedbackType } from './template-feedback'
import { resolveDefaultAgentModel } from './agent-default-model'

// Template storage paths (dynamic functions)

// Global templates (shared across all workspaces - ClawMax system templates)
export function getGlobalTemplatesDir(): string {
  return TEMPLATES_DIR
}

export function getGlobalAgentTemplatesDir(): string {
  return path.join(getGlobalTemplatesDir(), 'agents')
}

export function getGlobalOrgTemplatesDir(): string {
  return path.join(getGlobalTemplatesDir(), 'organizations')
}

// Workspace templates (private to current workspace - user-created)
export function getTemplatesDir(): string {
  return path.join(getWorkspacePath(), 'TEMPLATES')
}

export function getAgentTemplatesDir(): string {
  return path.join(getTemplatesDir(), 'agents')
}

export function getOrgTemplatesDir(): string {
  return path.join(getTemplatesDir(), 'organizations')
}

function scaffoldAgentMemory(agentId: string) {
  const agentDir = path.join(getAgentsDir(), agentId)
  fs.mkdirSync(agentDir, { recursive: true })

  const memoryDir = path.join(agentDir, 'memory')
  fs.mkdirSync(memoryDir, { recursive: true })

  const memoryIndexPath = path.join(agentDir, 'MEMORY.md')
  if (!fs.existsSync(memoryIndexPath)) {
    fs.writeFileSync(
      memoryIndexPath,
      `# MEMORY.md\n\nUse this file as the index for long-term notes. Daily notes live in \`memory/YYYY-MM-DD.md\`.\n`,
      'utf-8'
    )
  }

  const dates = [0, 1].map((offset) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    return d.toISOString().slice(0, 10)
  })

  for (const date of dates) {
    const dailyPath = path.join(memoryDir, `${date}.md`)
    if (!fs.existsSync(dailyPath)) {
      fs.writeFileSync(dailyPath, `# ${date}\n\nNo notes yet.\n`, 'utf-8')
    }
  }
}

function initializeTemplateCreatedAgent(agentId: string) {
  scaffoldAgentMemory(agentId)
  const reset = resetAgentSessionsForModelChange(process.env.HOME || '', agentId)
  if (!reset.ok) {
    throw new Error(reset.error || `Failed to reset runtime sessions for ${agentId}`)
  }
}

function ensureTemplateCreatedAgentRuntimeArtifacts(args: {
  agentId: string
  workspaceArg: string
  agentDirArg: string
  model?: string
}) {
  const { agentId, workspaceArg, agentDirArg, model } = args
  const runtimeRoot = path.dirname(agentDirArg)

  fs.mkdirSync(agentDirArg, { recursive: true })
  fs.mkdirSync(path.join(runtimeRoot, 'sessions'), { recursive: true })

  const configYamlPath = path.join(runtimeRoot, 'config.yaml')
  if (!fs.existsSync(configYamlPath)) {
    const configContent = [
      `name: ${agentId}`,
      `model: ${model || 'anthropic/claude-sonnet-4-20250514'}`,
      `workspace: ${workspaceArg}`,
      `created: ${new Date().toISOString()}`,
    ].join('\n')
    fs.writeFileSync(configYamlPath, configContent, 'utf-8')
  }
}

function finalizeTemplateCreatedAgentRegistration(args: {
  agentId: string
  workspacePath: string
  model?: string
}) {
  const { agentId, workspacePath, model } = args
  const workspaceArg = path.join(workspacePath, 'AGENTS', agentId)
  const agentDirArg = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'agent')
  const registrationEnv = safeEnv({ OPENCLAW_WORKSPACE: workspacePath })

  const registration = ensureOpenClawAgentRegisteredForWorkspace(agentId, workspaceArg, agentDirArg, registrationEnv)
  if (registration.status === 'created') {
    console.log(`Registered agent ${agentId} in openclaw.json`)
  } else if (registration.status === 'updated-existing') {
    console.log(`Updated existing OpenClaw agent ${agentId} for active workspace`)
  } else {
    console.log(`Agent ${agentId} already registered in openclaw.json`)
  }

  const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const registered = Array.isArray(config?.agents?.list) && config.agents.list.some((agent: any) =>
    agent?.id === agentId && String(agent?.workspace || '') === workspaceArg
  )
  if (!registered) {
    throw new Error(`Agent ${agentId} registration did not persist for active workspace`)
  }

  const appliedModel = model?.trim()
  if (appliedModel) {
    const update = updateAgentModelInConfigFile(configPath, agentId, appliedModel, { workspacePath: workspaceArg })
    if (!update.ok) {
      throw new Error(update.error || `Failed to persist model ${appliedModel} for ${agentId}`)
    }
  }

  ensureTemplateCreatedAgentRuntimeArtifacts({
    agentId,
    workspaceArg,
    agentDirArg,
    model: appliedModel,
  })
  const authProfilePath = path.join(agentDirArg, 'auth-profiles.json')
  if (!fs.existsSync(authProfilePath)) {
    const authProfile: Record<string, any> = { version: 1, profiles: {} }
    const systemKeys = getSystemProviderKeys()
    if (systemKeys.openai) {
      authProfile.profiles['openai-key'] = { type: 'api_key', provider: 'openai', key: systemKeys.openai }
    }
    if (systemKeys.anthropic) {
      authProfile.profiles['anthropic-key'] = { type: 'api_key', provider: 'anthropic', key: systemKeys.anthropic }
    }
    fs.writeFileSync(authProfilePath, JSON.stringify(authProfile, null, 2), 'utf-8')
    console.log(`Created auth profile for agent ${agentId}`)
  }
}

function normalizeTagList(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return []
  return Array.from(
    new Set(
      tags
        .map((tag) => slugify(String(tag || '').trim()))
        .filter(Boolean)
    )
  )
}

function buildWorkflowDependencyAliasMap(workflows: Workflow[]): Record<string, string> {
  const aliasMap: Record<string, string> = {}

  for (const workflow of workflows || []) {
    const id = String(workflow.id || '').trim()
    const name = String(workflow.name || '').trim()
    if (!id) continue

    aliasMap[id] = id
    if (name) {
      aliasMap[slugify(name)] = id
    }

    const combined = `${id} ${name}`.toLowerCase()
    if (combined.includes('kickoff')) {
      aliasMap.kickoff = id
      aliasMap['team-kickoff'] = id
    }
    if (combined.includes('final') || combined.includes('summary') || combined.includes('brief') || combined.includes('publish')) {
      aliasMap.final = id
    }
  }

  return aliasMap
}

export function summarizeImportedProjectContext(projectContext: string, maxLength = 900): string {
  const lines = projectContext
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^##\s+/i.test(line))

  const kept: string[] = []
  for (const line of lines) {
    const normalized = /^[-*]\s+/.test(line) ? line : `- ${line}`
    kept.push(normalized)
    const candidate = kept.join('\n')
    if (candidate.length >= maxLength) break
  }

  const summary = kept.join('\n').slice(0, maxLength).trim()
  if (!summary) return ''
  return summary.length < kept.join('\n').trim().length ? `${summary}\n- Additional project context omitted for brevity.` : summary
}

function sanitizeImportedTemplateTeams(teams?: Team[]): Team[] | undefined {
  if (!teams || teams.length === 0) return teams

  const ids = new Set(teams.map((team) => `${team.id || ''}`.trim()).filter(Boolean))
  const firstPass = teams.map((team) => {
    const parentTeamId = team.parentTeamId?.trim() || undefined
    return {
      ...team,
      parentTeamId: parentTeamId && ids.has(parentTeamId) && parentTeamId !== team.id ? parentTeamId : undefined,
    }
  })
  const byId = new Map(firstPass.map((team) => [team.id, team]))

  return firstPass.map((team) => {
    let parentTeamId = team.parentTeamId?.trim() || undefined
    if (!parentTeamId) {
      return {
        ...team,
        parentTeamId: undefined,
      }
    }

    const ancestry = new Set<string>([team.id])
    let cursor: string | undefined = parentTeamId
    while (cursor) {
      if (ancestry.has(cursor)) {
        parentTeamId = undefined
        break
      }
      ancestry.add(cursor)
      cursor = byId.get(cursor)?.parentTeamId?.trim() || undefined
    }

    return {
      ...team,
      parentTeamId,
    }
  })
}

// Ensure template directories exist
export function ensureTemplateDirs(): void {
  // Global directories
  fs.mkdirSync(getGlobalAgentTemplatesDir(), { recursive: true })
  fs.mkdirSync(getGlobalOrgTemplatesDir(), { recursive: true })

  // Workspace directories
  fs.mkdirSync(getAgentTemplatesDir(), { recursive: true })
  fs.mkdirSync(getOrgTemplatesDir(), { recursive: true })
}

// ============================================================================
// TypeScript Types
// ============================================================================

export interface AgentTemplateAgent {
  id: string
  name?: string
  role: string
  tags?: string[]
  skills?: string[]
}

export interface AgentTemplate {
  name: string
  type: 'agent'
  source?: 'system' | 'workspace' | 'enterprise'
  slug?: string
  version: string
  emoji?: string
  description?: string
  author?: string
  tags?: string[]
  agents: [AgentTemplateAgent]  // Always exactly 1 agent
  metadata?: {
    aiPrompt?: string
    model?: string
    createdAt?: string
    updatedAt?: string
    basedOnSlug?: string
    basedOnSource?: TemplateSource
  }
}

export interface OrganizationTemplateAgent {
  id: string
  name?: string
  role: string
  model?: string
  tags?: string[]
  skills?: string[]
  communities?: string[]
  groups?: string[]
}

export interface Community {
  name: string
  description?: string
  tags?: string[]
  channels?: string[]
}

export interface Group {
  name: string
  description?: string
  tags?: string[]
  community?: string
  channels?: string[]
}

export interface Team {
  id: string
  name: string
  purpose?: string
  leaderAgentId?: string
  memberAgentIds?: string[]
  parentTeamId?: string
  tags?: string[]
}

export interface Workflow {
  id: string
  name: string
  description: string
  schedule: string
  enabled: boolean
  executionMode: 'automated' | 'managed'
  scaling?: 'singleton' | 'parallel'
  parallelism?: number
  dependsOn?: string[]
  type?: 'once' | 'recurring' | 'conditional'
  targeting: {
    communities: string[]
    groups: string[]
    tags: string[]
    agents: string[]
    teamIds?: string[]
  }
  outputDefinitions?: Array<{
    key: string
    label?: string
    type?: 'markdown' | 'text' | 'json' | 'artifact' | 'handoff'
    help?: string
  }>
  inputRefs?: Array<{
    workflowId: string
    outputKey: string
    label?: string
    required?: boolean
  }>
  content: string
}

export interface OrganizationTemplate {
  name: string
  type: 'organization'
  kind?: 'team' | 'company'
  source?: 'system' | 'workspace' | 'enterprise'
  slug?: string
  version: string
  emoji?: string
  description?: string
  author?: string
  tags?: string[]
  parameters?: Array<{
    agentId: string
    label: string
    default: number
    min: number
    max: number
  }>
  agents: OrganizationTemplateAgent[]
  teams?: Team[]
  communities?: Community[]
  groups?: Group[]
  workflows?: Workflow[]
  metadata?: {
    aiPrompt?: string
    createdAt?: string
    updatedAt?: string
    basedOnSlug?: string
    basedOnSource?: TemplateSource
  }
}

export type Template = AgentTemplate | OrganizationTemplate

type TemplateSource = 'system' | 'workspace' | 'enterprise'
export type OrganizationTemplateAgentFiles = Record<string, Record<string, string>>

const ORG_TEMPLATE_AGENT_FILE_ORDER = ['IDENTITY.md', 'SOUL.md', 'TOOLS.md', 'COMMUNITIES.md', 'GROUPS.md'] as const

function parseExtraTemplateRoots(): string[] {
  const raw = process.env.CLAWMAX_EXTRA_TEMPLATE_DIRS?.trim()
  if (!raw) return []
  return raw
    .split(new RegExp(`[${path.delimiter === ';' ? ';,' : ':,'}]`))
    .map(item => item.trim())
    .filter(Boolean)
}

function collectTemplateDirsFromRoot(root: string, type: 'agent' | 'organization', source: TemplateSource): Array<{ dir: string; source: TemplateSource; slug: string }> {
  const candidates: string[] = []

  if (type === 'agent') {
    candidates.push(path.join(root, 'agents'))
  } else {
    candidates.push(path.join(root, 'organizations'))
    candidates.push(root)
  }

  const results: Array<{ dir: string; source: TemplateSource; slug: string }> = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    let entries: fs.Dirent[] = []
    try {
      entries = fs.readdirSync(candidate, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = path.join(candidate, entry.name)
      const marker = path.resolve(dir)
      if (seen.has(marker)) continue
      if (!fs.existsSync(path.join(dir, 'template.json'))) continue
      seen.add(marker)
      results.push({ dir, source, slug: entry.name })
    }
  }

  return results
}

function normalizeTemplateForUse(template: Template): Template {
  if (template.type !== 'organization') return template

  return {
    ...template,
    workflows: (template.workflows || []).map((workflow) => {
      const inferredOwner = workflow.executionMode === 'managed'
        ? ((workflow as any).owner || workflow.targeting?.agents?.[0] || undefined)
        : (workflow as any).owner
      const normalizedId = slugify(workflow.name || workflow.id || 'workflow')

      return {
        ...workflow,
        id: normalizedId,
        description: workflow.description || `${workflow.name || normalizedId} workflow`,
        enabled: typeof workflow.enabled === 'boolean' ? workflow.enabled : true,
        owner: inferredOwner,
      }
    }),
  }
}

function classifyOrganizationTemplate(template: OrganizationTemplate): 'team' | 'company' {
  return (template.teams?.length || 0) > 0 ? 'company' : 'team'
}

function withDerivedTemplateFields(template: Template): Template {
  if (template.type !== 'organization') return template
  return {
    ...template,
    kind: classifyOrganizationTemplate(template),
  }
}

function toCanonicalTemplateSource(source?: TemplateSource): CanonicalTemplateFeedbackSource {
  return source === 'system' ? 'system' : 'user'
}

function toCanonicalTemplateType(template: Template): CanonicalTemplateFeedbackType {
  if (template.type === 'agent') return 'agent'
  return classifyOrganizationTemplate(template) === 'company' ? 'company' : 'team'
}

export function buildTemplateFeedbackMetadata(template: Template): {
  templateId: string
  templateType: CanonicalTemplateFeedbackType
  templateSlug: string
  templateSource: CanonicalTemplateFeedbackSource
  templateTags: string[]
  templateInfo: Record<string, any>
} {
  const templateSlug = template.slug || slugify(template.name)
  const templateSource = toCanonicalTemplateSource((template as any).source)
  const templateType = toCanonicalTemplateType(template)
  const templateTags = normalizeTagList((template as any).tags)
  const templateInfo: Record<string, any> = {
    title: template.name,
    version: (template as any).version || '1.0.0',
  }

  if ((template as any).author) templateInfo.owner = (template as any).author

  if (template.type === 'agent') {
    const firstAgent = template.agents?.[0]
    if (firstAgent?.role) templateInfo.persona = firstAgent.role
    if (firstAgent?.name) templateInfo.agentName = firstAgent.name
  } else {
    templateInfo.kind = classifyOrganizationTemplate(template)
    if (template.teams?.length) templateInfo.teamCount = template.teams.length
    if (template.workflows?.length) templateInfo.workflowCount = template.workflows.length
    const firstDepartment = template.teams?.[0]?.name || template.groups?.[0]?.name || template.communities?.[0]?.name
    if (firstDepartment) templateInfo.department = firstDepartment
  }

  return {
    templateId: `${templateSource}:${templateSlug}`,
    templateType,
    templateSlug,
    templateSource,
    templateTags,
    templateInfo,
  }
}

function stripDerivedTemplateFields(template: Template): Template {
  if (template.type !== 'organization') return template
  const { kind: _kind, ...rest } = template
  return rest
}

function bumpPatchVersion(version?: string): string {
  const match = String(version || '1.0.0').match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return '1.0.1'
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3]) + 1
  return `${major}.${minor}.${patch}`
}

function snapshotExistingTemplateVersion(templateDir: string, version?: string): void {
  if (!fs.existsSync(templateDir)) return

  const jsonPath = path.join(templateDir, 'template.json')
  const mdPath = path.join(templateDir, 'TEMPLATE.md')
  if (!fs.existsSync(jsonPath) && !fs.existsSync(mdPath)) return

  const versionLabel = (version || 'unknown').replace(/[^a-z0-9._-]+/gi, '-')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const historyDir = path.join(templateDir, '.versions', `${stamp}-v${versionLabel}`)
  fs.mkdirSync(historyDir, { recursive: true })

  if (fs.existsSync(jsonPath)) {
    fs.copyFileSync(jsonPath, path.join(historyDir, 'template.json'))
  }
  if (fs.existsSync(mdPath)) {
    fs.copyFileSync(mdPath, path.join(historyDir, 'TEMPLATE.md'))
  }
}

type OpenClawAgentRegistrationResult =
  | { status: 'created' }
  | { status: 'already-registered' }
  | { status: 'updated-existing' }

export function isOpenClawAgentAlreadyExistsError(err: unknown): boolean {
  const anyErr = err as any
  const text = [
    anyErr?.message,
    anyErr?.stdout?.toString?.(),
    anyErr?.stderr?.toString?.(),
    String(err || ''),
  ].filter(Boolean).join('\n')
  return /Agent\s+"?[^"\n]+"?\s+already exists/i.test(text)
}

function readOpenClawConfig(configPath: string): any {
  if (!fs.existsSync(configPath)) return { agents: { list: [] } }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8') || '{}')
    if (!parsed.agents || typeof parsed.agents !== 'object') parsed.agents = {}
    if (!Array.isArray(parsed.agents.list)) parsed.agents.list = []
    return parsed
  } catch {
    return { agents: { list: [] } }
  }
}

export function upsertOpenClawAgentRegistration(
  configPath: string,
  agentId: string,
  workspaceArg: string,
  agentDirArg: string
): OpenClawAgentRegistrationResult | null {
  const config = readOpenClawConfig(configPath)
  const existing = config.agents.list.find((agent: any) => agent?.id === agentId)
  if (!existing) return null

  const desired = {
    ...existing,
    id: agentId,
    name: existing.name || agentId,
    workspace: workspaceArg,
    agentDir: agentDirArg,
  }
  const changed =
    existing.name !== desired.name
    || existing.workspace !== workspaceArg
    || existing.agentDir !== agentDirArg

  if (changed) {
    Object.assign(existing, desired)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { status: 'updated-existing' }
  }

  return { status: 'already-registered' }
}

function ensureOpenClawAgentRegisteredForWorkspace(
  agentId: string,
  workspaceArg: string,
  agentDirArg: string,
  registrationEnv: NodeJS.ProcessEnv
): OpenClawAgentRegistrationResult {
  const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
  const existing = upsertOpenClawAgentRegistration(configPath, agentId, workspaceArg, agentDirArg)
  if (existing) return existing

  try {
    execSync(`openclaw agents add ${agentId} --workspace "${workspaceArg}" --agent-dir "${agentDirArg}" --non-interactive`, {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: registrationEnv,
    })
    upsertOpenClawAgentRegistration(configPath, agentId, workspaceArg, agentDirArg)
    return { status: 'created' }
  } catch (err) {
    if (isOpenClawAgentAlreadyExistsError(err)) {
      const adopted = upsertOpenClawAgentRegistration(configPath, agentId, workspaceArg, agentDirArg)
      if (adopted) return adopted
    }
    throw err
  }
}

function runOrganizationPostImportSetup(args: {
  createdAgents: string[]
  agentsToCreate: Array<{ id: string; skills?: string[] }>
  appliedModelsByAgentId?: Record<string, string | undefined>
  template: OrganizationTemplate
  prefix: string
  suffix: string
  workspacePath: string
  agentsDir: string
  workflowOverrides?: Record<string, string>
}) {
  const { createdAgents, agentsToCreate, appliedModelsByAgentId, template, prefix, suffix, workspacePath, agentsDir, workflowOverrides } = args

  // Agent registration is required before workflows can run against new agents.
  // Do this synchronously so an immediate post-apply workflow run doesn't fail.
  for (const agentId of createdAgents) {
    try {
      const workspaceArg = path.join(workspacePath, 'AGENTS', agentId)
      const agentDirArg = path.join(process.env.HOME || '', '.openclaw', 'agents', agentId, 'agent')
      const registrationEnv = safeEnv({ OPENCLAW_WORKSPACE: workspacePath })

      const registration = ensureOpenClawAgentRegisteredForWorkspace(agentId, workspaceArg, agentDirArg, registrationEnv)
      if (registration.status === 'created') {
        console.log(`Registered agent ${agentId} in openclaw.json`)
      } else if (registration.status === 'updated-existing') {
        console.log(`Updated existing OpenClaw agent ${agentId} for active workspace`)
      } else {
        console.log(`Agent ${agentId} already registered in openclaw.json`)
      }

      const configPath = path.join(process.env.HOME || '', '.openclaw', 'openclaw.json')
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const registered = Array.isArray(config?.agents?.list) && config.agents.list.some((agent: any) =>
        agent?.id === agentId && String(agent?.workspace || '') === workspaceArg
      )
      if (!registered) {
        throw new Error(`Agent ${agentId} registration did not persist for active workspace`)
      }

      const appliedModel = appliedModelsByAgentId?.[agentId]?.trim()
      if (appliedModel) {
        const update = updateAgentModelInConfigFile(configPath, agentId, appliedModel, { workspacePath: workspaceArg })
        if (!update.ok) {
          throw new Error(update.error || `Failed to persist model ${appliedModel} for ${agentId}`)
        }
      }

      ensureTemplateCreatedAgentRuntimeArtifacts({
        agentId,
        workspaceArg,
        agentDirArg,
        model: appliedModel,
      })
      const authProfilePath = path.join(agentDirArg, 'auth-profiles.json')
      if (!fs.existsSync(authProfilePath)) {
        const authProfile: Record<string, any> = { version: 1, profiles: {} }
        const systemKeys = getSystemProviderKeys()
        if (systemKeys.openai) {
          authProfile.profiles['openai-key'] = { type: 'api_key', provider: 'openai', key: systemKeys.openai }
        }
        if (systemKeys.anthropic) {
          authProfile.profiles['anthropic-key'] = { type: 'api_key', provider: 'anthropic', key: systemKeys.anthropic }
        }
        fs.writeFileSync(authProfilePath, JSON.stringify(authProfile, null, 2), 'utf-8')
        console.log(`Created auth profile for agent ${agentId}`)
      }
    } catch (err) {
      console.warn(`Failed to register agent ${agentId}: ${err}`)
    }
  }

  setTimeout(() => {
    // Non-critical follow-through can stay off the request path.

    for (const templateAgent of agentsToCreate) {
      const skills = templateAgent.skills
      if (skills && Array.isArray(skills) && skills.length > 0) {
        const targetAgentId = `${prefix}${templateAgent.id}${suffix}`
        try {
          setAgentSkills(targetAgentId, skills)
          console.log(`Assigned skills [${skills.join(', ')}] to agent ${targetAgentId}`)
        } catch (err) {
          console.warn(`Failed to assign skills to ${targetAgentId}: ${err}`)
        }
      }
    }

    const kickoffWorkflow = (template.workflows || []).find((w: any) =>
      w.type === 'once' || w.id?.includes('kickoff') || w.name?.toLowerCase().includes('kickoff')
    )
    if (!kickoffWorkflow) return

    const kickoffContent = workflowOverrides?.[kickoffWorkflow.id] || kickoffWorkflow.content || ''
    const configMatch = kickoffContent.match(/## (?:Project Configuration|Your Tasks|Configuration)[\s\S]*?(?=\n## |\n---|\Z)/i)
    const projectContext = configMatch ? summarizeImportedProjectContext(configMatch[0].trim()) : ''
    if (!projectContext) return

    for (const agentId of createdAgents) {
      try {
        const identityPath = path.join(agentsDir, agentId, 'IDENTITY.md')
        if (fs.existsSync(identityPath)) {
          let identity = fs.readFileSync(identityPath, 'utf-8')
          if (!identity.includes('## Project Context')) {
            identity += `\n\n## Project Context\n\n${projectContext}\n`
            fs.writeFileSync(identityPath, identity, 'utf-8')
            console.log(`Wrote project context to ${agentId}/IDENTITY.md`)
          }
        }
      } catch (err) {
        console.warn(`Failed to write project context to ${agentId}: ${err}`)
      }
    }
  }, 0)
}

// ============================================================================
// Template Validation
// ============================================================================

const ajv = new Ajv({ strict: false, validateFormats: false })

// Load schemas
const agentSchemaPath = path.join(TEMPLATE_SCHEMAS_DIR, 'agent-template.schema.json')
const orgSchemaPath = path.join(TEMPLATE_SCHEMAS_DIR, 'organization-template.schema.json')

const agentSchema = JSON.parse(fs.readFileSync(agentSchemaPath, 'utf-8'))
const orgSchema = JSON.parse(fs.readFileSync(orgSchemaPath, 'utf-8'))

const validateAgentTemplate = ajv.compile(agentSchema)
const validateOrgTemplate = ajv.compile(orgSchema)

export function validateTemplate(template: any): { valid: boolean; errors?: string[] } {
  if (template.type === 'agent') {
    const valid = validateAgentTemplate(template)
    if (!valid) {
      return {
        valid: false,
        errors: validateAgentTemplate.errors?.map(e => `${e.instancePath} ${e.message}`) || []
      }
    }
  } else if (template.type === 'organization') {
    const valid = validateOrgTemplate(template)
    if (!valid) {
      return {
        valid: false,
        errors: validateOrgTemplate.errors?.map(e => `${e.instancePath} ${e.message}`) || []
      }
    }
  } else {
    return { valid: false, errors: ['Template type must be "agent" or "organization"'] }
  }
  return { valid: true }
}

export function validateImportedTemplateMd(
  content: string,
  typeOverride?: string
): { valid: boolean; template?: Template; agentFiles?: OrganizationTemplateAgentFiles; errors: string[]; warnings: string[] } {
  const template = parseTemplateMd(content) as any
  if (!template) {
    return {
      valid: false,
      errors: ['Failed to parse TEMPLATE.md — ensure it has valid YAML frontmatter with name and type'],
      warnings: [],
    }
  }

  if (typeOverride) {
    ;(template as any).type = typeOverride
  }

  const agentFiles = template.agentFiles as OrganizationTemplateAgentFiles | undefined
  delete template.agentFiles

  const validation = validateTemplate(template)
  if (!validation.valid) {
    return {
      valid: false,
      template,
      errors: validation.errors || ['Template validation failed'],
      warnings: [],
    }
  }

  const refs = validateTemplateReferences(template)
  return {
    valid: true,
    template,
    agentFiles,
    errors: [],
    warnings: refs.warnings,
  }
}

export function validateAgentTemplateFiles(templateDir: string, expectedAgentId: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const identityPath = path.join(templateDir, 'IDENTITY.md')
  const soulPath = path.join(templateDir, 'SOUL.md')
  const toolsPath = path.join(templateDir, 'TOOLS.md')

  const result = validateAgentConfigSections({
    identity: fs.existsSync(identityPath) ? fs.readFileSync(identityPath, 'utf-8') : '',
    soul: fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf-8') : '',
    tools: fs.existsSync(toolsPath) ? fs.readFileSync(toolsPath, 'utf-8') : '',
  }, expectedAgentId)

  return {
    valid: result.valid,
    errors: result.errors,
    warnings: result.warnings,
  }
}

// ============================================================================
// Template Cross-Validation
// ============================================================================

/**
 * Validate that a template's agent references are consistent.
 * Checks: agent IDs are valid, no duplicates, workflow targeting references existing agents/groups.
 */
export function validateTemplateReferences(template: Template): { valid: boolean; warnings: string[] } {
  const warnings: string[] = []
  const t = template as any

  if (t.type !== 'organization') return { valid: true, warnings }

  const agentIds = new Set((t.agents || []).map((a: any) => a.id))
  const communityNames = new Set((t.communities || []).map((c: any) => c.name))
  const groupNames = new Set((t.groups || []).map((g: any) => g.name))

  // Check for duplicate agent IDs
  const seenIds = new Set<string>()
  for (const agent of t.agents || []) {
    if (seenIds.has(agent.id)) {
      warnings.push(`Duplicate agent ID: ${agent.id}`)
    }
    seenIds.add(agent.id)
  }

  // Check agent community/group references
  for (const agent of t.agents || []) {
    for (const comm of agent.communities || []) {
      if (!communityNames.has(comm)) {
        warnings.push(`Agent "${agent.id}" references unknown community "${comm}"`)
      }
    }
    for (const group of agent.groups || []) {
      if (!groupNames.has(group)) {
        warnings.push(`Agent "${agent.id}" references unknown group "${group}"`)
      }
    }
  }

  // Check group community references
  for (const group of t.groups || []) {
    if (group.community && !communityNames.has(group.community)) {
      warnings.push(`Group "${group.name}" references unknown community "${group.community}"`)
    }
  }

  // Check workflow targeting references
    for (const wf of t.workflows || []) {
    for (const agentId of wf.targeting?.agents || []) {
      if (!agentIds.has(agentId)) {
        warnings.push(`Workflow "${wf.name}" targets unknown agent "${agentId}"`)
      }
    }
    for (const group of wf.targeting?.groups || []) {
      if (!groupNames.has(group)) {
        warnings.push(`Workflow "${wf.name}" targets unknown group "${group}"`)
      }
    }
    for (const teamId of wf.targeting?.teamIds || []) {
      if (!(t.teams || []).some((team: any) => team.id === teamId)) {
        warnings.push(`Workflow "${wf.name}" targets unknown team "${teamId}"`)
      }
    }
  }

  return { valid: warnings.length === 0, warnings }
}

// ============================================================================
// Template Storage Operations
// ============================================================================

/**
 * Generate a filesystem-safe slug from a template name
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ============================================================================
// TEMPLATE.md Support — Lean YAML frontmatter + Structured Markdown body
// ============================================================================

/**
 * Parse a TEMPLATE.md file into a template object.
 *
 * Format v2 (lean): minimal frontmatter, structured markdown body
 *   frontmatter: name, type, version, category, author, tags
 *   body: description + ## Agents, ## Communities, ## Groups sections
 *   Workflows are separate WORKFLOW.md files or embedded ## Workflows section
 *
 * Format v1 (legacy): everything in frontmatter (backward compatible)
 */
export function parseTemplateMd(content: string): Template | null {
  try {
    const { data, content: body } = matter(content)
    if (!data.name || !data.type) return null

    const template: any = {
      name: data.name,
      type: data.type,
      version: data.version || '1.0.0',
      description: data.description || '',
      author: data.author || '',
      tags: data.tags || [],
      agents: data.agents || [],
    }

    if (data.category) template.category = data.category
    if (data.parameters) template.parameters = data.parameters
    if (data.aiPrompt) template.metadata = { ...(template.metadata || {}), aiPrompt: data.aiPrompt }

    // v1 legacy: all data in frontmatter
    if (data.teams) template.teams = data.teams
    if (data.communities) template.communities = data.communities
    if (data.groups) template.groups = data.groups
    if (data.workflows) template.workflows = data.workflows

    // v2 lean: parse structured markdown body sections
    if (body.trim() && template.agents.length === 0) {
      const parsed = parseTemplateMdBody(body)
      if (!template.description && parsed.description) template.description = parsed.description
      if (parsed.agents.length > 0) template.agents = parsed.agents
      if (parsed.teams.length > 0 && !template.teams) template.teams = parsed.teams
      if (parsed.communities.length > 0 && !template.communities) template.communities = parsed.communities
      if (parsed.groups.length > 0 && !template.groups) template.groups = parsed.groups
      if (parsed.workflows.length > 0 && !template.workflows) template.workflows = parsed.workflows
      if (Object.keys(parsed.agentFiles).length > 0) template.agentFiles = parsed.agentFiles
    } else if (body.trim() && !template.description) {
      // v1: body is just the description
      template.description = body.trim()
    }

    return template as Template
  } catch {
    return null
  }
}

function decodeWorkflowContentBlock(lines: string[]): string {
  const joined = lines.join('\n').replace(/\s+$/, '')
  if (!joined.trim()) return ''

  const hasIndentedContent = lines.some((line) => line.startsWith('    ') || line === '')
  if (!hasIndentedContent) {
    return joined.trim()
  }

  return lines
    .map((line) => {
      if (line.startsWith('    ')) return line.slice(4)
      return line.trim() === '' ? '' : line
    })
    .join('\n')
    .trim()
}

function splitMarkdownH3Blocks(content: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false

  for (const line of content.split('\n')) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence
    }

    if (!inFence && line.startsWith('### ')) {
      if (current.length > 0) {
        const block = current.join('\n').trim()
        if (block) blocks.push(block)
      }
      current = [line]
      continue
    }

    current.push(line)
  }

  if (current.length > 0) {
    const block = current.join('\n').trim()
    if (block) blocks.push(block)
  }

  return blocks
}

/**
 * Parse structured markdown body sections for lean TEMPLATE.md format.
 * Sections: description (before first ##), ## Agents, ## Communities, ## Groups, ## Workflows
 */
function parseTemplateMdBody(body: string): {
  description: string
  agents: any[]
  teams: any[]
  communities: any[]
  groups: any[]
  workflows: any[]
  agentFiles: OrganizationTemplateAgentFiles
} {
  const result = { description: '', agents: [] as any[], teams: [] as any[], communities: [] as any[], groups: [] as any[], workflows: [] as any[], agentFiles: {} as OrganizationTemplateAgentFiles }

  // Split into sections by ## headers
  const sections: Record<string, string> = {}
  let currentSection = '_description'
  const lines = body.split('\n')
  let inFence = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence
      sections[currentSection] = (sections[currentSection] || '') + line + '\n'
      continue
    }

    const headerMatch = !inFence ? line.match(/^##\s+(.+)/) : null
    if (headerMatch) {
      currentSection = headerMatch[1].trim().toLowerCase()
    } else {
      sections[currentSection] = (sections[currentSection] || '') + line + '\n'
    }
  }

  result.description = (sections['_description'] || '').trim()

  // Parse ## Agents section — expects table or YAML list
  if (sections['agents']) {
    const agentLines = sections['agents'].trim().split('\n')
    // Try table format: | id | name | role | tags | skills | communities | groups |
    const tableRows = agentLines.filter(l => l.startsWith('|') && !l.match(/^\|[\s-]+\|/))
    if (tableRows.length > 1) {
      const parseTableRow = (row: string) => row.split('|').slice(1, -1).map((cell) => cell.trim())
      const headers = parseTableRow(tableRows[0]).map((header) => header.toLowerCase())
      for (let i = 1; i < tableRows.length; i++) {
        const cells = parseTableRow(tableRows[i])
        const agent: any = {}
        headers.forEach((h, idx) => {
          const val = cells[idx] || ''
          if (h === 'tags' || h === 'skills' || h === 'communities' || h === 'groups') {
            agent[h] = val.split(',').map((s: string) => s.trim()).filter(Boolean)
          } else {
            agent[h] = val
          }
        })
        if (agent.id) result.agents.push(agent)
      }
    } else {
      // Try bullet list format: - **id**: role (tags: x, y)
      for (const line of agentLines) {
        const bulletMatch = line.match(/^-\s+\*\*(\S+)\*\*[:\s]+(.+)/)
        if (bulletMatch) {
          const id = bulletMatch[1]
          const rest = bulletMatch[2]
          const tagsMatch = rest.match(/\(tags?:\s*([^)]+)\)/)
          const skillsMatch = rest.match(/\(skills?:\s*([^)]+)\)/)
          const role = rest.replace(/\(tags?:[^)]+\)/, '').replace(/\(skills?:[^)]+\)/, '').trim()
          result.agents.push({
            id,
            role,
            tags: tagsMatch ? tagsMatch[1].split(',').map((s: string) => s.trim()) : [],
            skills: skillsMatch ? skillsMatch[1].split(',').map((s: string) => s.trim()) : [],
          })
        }
      }
    }
  }

  // Parse ## Teams — bullet list:
  // - **Engineering** — Builds the product (id: engineering; leader: eng-lead; members: eng1, eng2; parent: leadership; tags: platform, core)
  if (sections['teams']) {
    for (const line of sections['teams'].trim().split('\n')) {
      const match = line.match(/^-\s+\*\*(.+?)\*\*\s*(?:—|-)\s*(.+?)(?:\s+\((.+)\))?$/)
      if (!match) continue
      const team: any = {
        name: match[1].trim(),
        purpose: match[2].trim(),
      }
      const attrs = (match[3] || '').split(';').map((part) => part.trim()).filter(Boolean)
      for (const attr of attrs) {
        const [rawKey, ...rawValueParts] = attr.split(':')
        const key = rawKey?.trim()
        const value = rawValueParts.join(':').trim()
        if (key === 'id') team.id = value
        if (key === 'leader') team.leaderAgentId = value
        if (key === 'members') team.memberAgentIds = value.split(',').map((item) => item.trim()).filter(Boolean)
        if (key === 'parent') team.parentTeamId = value
        if (key === 'tags') team.tags = value.split(',').map((item) => item.trim()).filter(Boolean)
      }
      if (team.name) {
        if (!team.id) team.id = slugify(team.name)
        result.teams.push(team)
      }
    }
  }

  // Parse ## Communities — bullet list: - **Name** — description
  if (sections['communities']) {
    for (const line of sections['communities'].trim().split('\n')) {
      const match = line.match(/^-\s+\*\*(.+?)\*\*\s*(?:—|-)\s*(.*)/)
      if (match) {
        result.communities.push({ name: match[1].trim(), description: match[2].trim() })
      }
    }
  }

  // Parse ## Groups — bullet list: - **Name** — description (Community)
  if (sections['groups']) {
    for (const line of sections['groups'].trim().split('\n')) {
      const match = line.match(/^-\s+\*\*(.+?)\*\*\s*(?:—|-)\s*(.+?)(?:\((.+?)\))?$/)
      if (match) {
        const group: any = { name: match[1].trim(), description: match[2].trim() }
        if (match[3]) group.community = match[3].trim()
        result.groups.push(group)
      }
    }
  }

  // Parse ## Workflows — verbose blocks written by templateToMarkdown
  if (sections['workflows']) {
    const blocks = splitMarkdownH3Blocks(sections['workflows'])

    for (const block of blocks) {
      const lines = block.split('\n')
      const header = lines[0]?.match(/^###\s+(.+)$/)
      if (!header) continue

      const workflow: any = {
        name: header[1].trim(),
        id: slugify(header[1].trim()),
        schedule: 'manual',
        enabled: true,
        executionMode: 'managed',
        targeting: {
          communities: [],
          groups: [],
          tags: [],
          agents: [],
        },
        content: '',
      }

      let contentStart = lines.length
      for (let i = 1; i < lines.length; i++) {
        const trimmed = lines[i].trim()
        if (!trimmed.startsWith('- **')) {
          contentStart = i
          break
        }

        const desc = trimmed.match(/^- \*\*Description:\*\*\s*(.+)$/)
        if (desc) {
          workflow.description = desc[1].trim()
          continue
        }

        const schedule = trimmed.match(/^- \*\*Schedule:\*\*\s*(.+)$/)
        if (schedule) {
          workflow.schedule = schedule[1].trim()
          continue
        }

        const mode = trimmed.match(/^- \*\*Mode:\*\*\s*([^(]+?)(?:\s*\(.*\))?$/)
        if (mode) {
          const normalizedMode = mode[1].trim()
          workflow.executionMode = normalizedMode === 'automated' ? 'automated' : 'managed'
          continue
        }

        const dependsOn = trimmed.match(/^- \*\*Depends On:\*\*\s*(.+)$/)
        if (dependsOn) {
          workflow.dependsOn = dependsOn[1]
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => slugify(value))
          continue
        }

        const targets = trimmed.match(/^- \*\*Targets:\*\*\s*(.+)$/)
        if (targets) {
          for (const segment of targets[1].split(';').map((part) => part.trim())) {
            const [label, rawValues] = segment.split(':').map((part) => part.trim())
            const values = (rawValues || '').split(',').map((value) => value.trim()).filter(Boolean)
            if (label === 'agents') workflow.targeting.agents = values
            if (label === 'teams') workflow.targeting.teamIds = values
            if (label === 'groups') workflow.targeting.groups = values
            if (label === 'communities') workflow.targeting.communities = values
            if (label === 'tags') workflow.targeting.tags = values
          }
        }
      }

      workflow.content = decodeWorkflowContentBlock(lines.slice(contentStart))
      result.workflows.push(workflow)
    }
  }

  if (sections['agent files']) {
    const blocks = splitMarkdownH3Blocks(sections['agent files'])

    for (const block of blocks) {
      const lines = block.split('\n')
      const header = lines[0]?.match(/^###\s+(.+)$/)
      if (!header) continue
      const relPath = header[1].trim()
      const pathMatch = relPath.match(/^([^/]+)\/([^/]+)$/)
      if (!pathMatch) continue
      const agentId = pathMatch[1].trim()
      const filename = pathMatch[2].trim()
      if (!ORG_TEMPLATE_AGENT_FILE_ORDER.includes(filename as any)) continue

      let fileContent = lines.slice(1).join('\n').trim()
      const fenced = fileContent.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/)
      if (fenced) fileContent = fenced[1]
      if (!result.agentFiles[agentId]) result.agentFiles[agentId] = {}
      result.agentFiles[agentId][filename] = fileContent
    }
  }

  return result
}

/**
 * Convert a template object to lean TEMPLATE.md format.
 * Minimal frontmatter + structured markdown body.
 */
export function templateToMarkdown(template: Template, options?: { agentFiles?: OrganizationTemplateAgentFiles }): string {
  const t = template as any
  const lines: string[] = []

  // YAML frontmatter — minimal
  const fm: any = {
    name: t.name,
    type: t.type,
    version: t.version || '1.0.0',
  }
  if (t.category) fm.category = t.category
  if (t.author) fm.author = t.author
  if (t.tags?.length) fm.tags = t.tags
  if (t.parameters?.length) fm.parameters = t.parameters

  lines.push(matter.stringify('', fm).trim())
  lines.push('')

  // Description
  if (t.description) {
    lines.push(t.description)
    lines.push('')
  }

  if (t.metadata?.aiPrompt) {
    lines.push('## AI Prompt')
    lines.push('')
    lines.push(String(t.metadata.aiPrompt))
    lines.push('')
  }

  // ## Agents — table format
  if (t.agents?.length) {
    lines.push('## Agents')
    lines.push('')
    lines.push('| id | name | role | tags | skills | communities | groups |')
    lines.push('|----|------|------|------|--------|-------------|--------|')
    for (const a of t.agents) {
      const tags = (a.tags || []).join(', ')
      const skills = (a.skills || []).join(', ')
      const communities = (a.communities || []).join(', ')
      const groups = (a.groups || []).join(', ')
      lines.push(`| ${a.id} | ${a.name || a.id} | ${a.role || ''} | ${tags} | ${skills} | ${communities} | ${groups} |`)
    }
    lines.push('')
  }

  // ## Teams
  if (t.teams?.length) {
    lines.push('## Teams')
    lines.push('')
    for (const team of t.teams) {
      const attrs: string[] = []
      if (team.id) attrs.push(`id: ${team.id}`)
      if (team.leaderAgentId) attrs.push(`leader: ${team.leaderAgentId}`)
      if (team.memberAgentIds?.length) attrs.push(`members: ${team.memberAgentIds.join(', ')}`)
      if (team.parentTeamId) attrs.push(`parent: ${team.parentTeamId}`)
      if (team.tags?.length) attrs.push(`tags: ${team.tags.join(', ')}`)
      const suffix = attrs.length > 0 ? ` (${attrs.join('; ')})` : ''
      lines.push(`- **${team.name}** — ${team.purpose || ''}${suffix}`.trimEnd())
    }
    lines.push('')
  }

  // ## Communities
  if (t.communities?.length) {
    lines.push('## Communities')
    lines.push('')
    for (const c of t.communities) {
      lines.push(`- **${c.name}** — ${c.description || ''}`)
    }
    lines.push('')
  }

  // ## Groups
  if (t.groups?.length) {
    lines.push('## Groups')
    lines.push('')
    for (const g of t.groups) {
      const comm = g.community ? ` (${g.community})` : ''
      lines.push(`- **${g.name}** — ${g.description || ''}${comm}`)
    }
    lines.push('')
  }

  // ## Workflows
  if (t.workflows?.length) {
    lines.push('## Workflows')
    lines.push('')
    for (const w of t.workflows) {
      lines.push(`### ${w.name || w.id}`)
      if (w.description) {
        lines.push(`- **Description:** ${String(w.description).trim()}`)
      }
      lines.push(`- **Schedule:** ${w.schedule || 'manual'}`)
      lines.push(`- **Mode:** ${w.executionMode || 'automated'}${w.owner ? ` (owner: ${w.owner})` : ''}`)
      if (Array.isArray(w.dependsOn) && w.dependsOn.length > 0) {
        lines.push(`- **Depends On:** ${w.dependsOn.join(', ')}`)
      }
      const targets = []
      if (w.targeting?.agents?.length) targets.push(`agents: ${w.targeting.agents.join(', ')}`)
      if (w.targeting?.teamIds?.length) targets.push(`teams: ${w.targeting.teamIds.join(', ')}`)
      if (w.targeting?.groups?.length) targets.push(`groups: ${w.targeting.groups.join(', ')}`)
      if (w.targeting?.tags?.length) targets.push(`tags: ${w.targeting.tags.join(', ')}`)
      if (targets.length) lines.push(`- **Targets:** ${targets.join('; ')}`)
      lines.push('')
      if (w.content) {
        lines.push(...String(w.content).split('\n').map((line) => `    ${line}`))
        lines.push('')
      }
    }
  }

  const agentFiles = options?.agentFiles || {}
  if (t.type === 'organization' && Object.keys(agentFiles).length > 0) {
    lines.push('## Agent Files')
    lines.push('')
    for (const agentId of Object.keys(agentFiles).sort()) {
      const files = agentFiles[agentId] || {}
      for (const filename of ORG_TEMPLATE_AGENT_FILE_ORDER) {
        const content = files[filename]
        if (typeof content !== 'string' || !content.trim()) continue
        lines.push(`### ${agentId}/${filename}`)
        lines.push('')
        lines.push('```md')
        lines.push(content)
        lines.push('```')
        lines.push('')
      }
    }
  }

  return lines.join('\n')
}

/**
 * Read a template from a directory, checking both template.json and TEMPLATE.md.
 * template.json takes priority if both exist.
 */
function readTemplateFromDir(dir: string): Template | null {
  // Try template.json first
  const jsonPath = path.join(dir, 'template.json')
  if (fs.existsSync(jsonPath)) {
    try {
      return normalizeTemplateForUse(JSON.parse(fs.readFileSync(jsonPath, 'utf-8')))
    } catch {}
  }

  // Fall back to TEMPLATE.md
  const mdPath = path.join(dir, 'TEMPLATE.md')
  if (fs.existsSync(mdPath)) {
    try {
      const parsed = parseTemplateMd(fs.readFileSync(mdPath, 'utf-8'))
      return parsed ? normalizeTemplateForUse(parsed) : null
    } catch {}
  }

  return null
}

export function readOrganizationTemplateAgentFiles(templateDir: string): OrganizationTemplateAgentFiles {
  const agentFiles: OrganizationTemplateAgentFiles = {}
  const agentsDir = path.join(templateDir, 'agents')
  if (!fs.existsSync(agentsDir)) return agentFiles

  let agentEntries: fs.Dirent[] = []
  try {
    agentEntries = fs.readdirSync(agentsDir, { withFileTypes: true })
  } catch {
    return agentFiles
  }

  for (const entry of agentEntries) {
    if (!entry.isDirectory()) continue
    const agentDir = path.join(agentsDir, entry.name)
    const files: Record<string, string> = {}
    for (const filename of ORG_TEMPLATE_AGENT_FILE_ORDER) {
      const filePath = path.join(agentDir, filename)
      if (!fs.existsSync(filePath)) continue
      try {
        files[filename] = fs.readFileSync(filePath, 'utf-8')
      } catch {}
    }
    if (Object.keys(files).length > 0) {
      agentFiles[entry.name] = files
    }
  }

  return agentFiles
}

export function readWorkspaceAgentFilesForOrganizationTemplate(
  template: Template,
  workspacePath = getWorkspacePath()
): OrganizationTemplateAgentFiles {
  const agentFiles: OrganizationTemplateAgentFiles = {}
  if (template.type !== 'organization' || !Array.isArray(template.agents) || template.agents.length === 0) {
    return agentFiles
  }

  const agentsDir = path.join(workspacePath, 'AGENTS')
  let workspaceEntries: fs.Dirent[] = []
  try {
    workspaceEntries = fs.readdirSync(agentsDir, { withFileTypes: true })
  } catch {
    return agentFiles
  }

  const directoryNames = workspaceEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  for (const agent of template.agents) {
    const sourceId = String(agent.id || '').trim()
    if (!sourceId) continue

    const candidates = [
      sourceId,
      `${sourceId}1`,
      ...directoryNames
        .filter((name) => name.startsWith(sourceId))
        .sort((a, b) => a.localeCompare(b)),
    ]

    const uniqueCandidates = Array.from(new Set(candidates))
    let files: Record<string, string> | null = null

    for (const candidate of uniqueCandidates) {
      const candidateDir = path.join(agentsDir, candidate)
      if (!fs.existsSync(candidateDir) || !fs.statSync(candidateDir).isDirectory()) continue

      const nextFiles: Record<string, string> = {}
      for (const filename of ORG_TEMPLATE_AGENT_FILE_ORDER) {
        const filePath = path.join(candidateDir, filename)
        if (!fs.existsSync(filePath)) continue
        try {
          nextFiles[filename] = fs.readFileSync(filePath, 'utf-8')
        } catch {}
      }

      if (Object.keys(nextFiles).length > 0) {
        files = nextFiles
        break
      }
    }

    if (files) {
      agentFiles[sourceId] = files
    }
  }

  return agentFiles
}

/**
 * Save template to filesystem
 */
export function saveTemplate(
  template: Template,
  options?: { existingSlug?: string }
): { ok: boolean; path?: string; error?: string } {
  try {
    ensureTemplateDirs()

    // Check reserved names
    const slug = slugify(template.name)
    const existingSlug = options?.existingSlug?.trim()
    const RESERVED_SLUGS = ['clawmax-system-test', 'system-test']
    if (RESERVED_SLUGS.includes(slug)) {
      return { ok: false, error: `Template name "${template.name}" is reserved for system use` }
    }

    const timestamp = new Date().toISOString()
    const currentTemplateDir = template.type === 'agent'
      ? path.join(getAgentTemplatesDir(), existingSlug || slug)
      : path.join(getOrgTemplatesDir(), existingSlug || slug)
    const templateDir = template.type === 'agent'
      ? path.join(getAgentTemplatesDir(), slug)
      : path.join(getOrgTemplatesDir(), slug)
    const existingTemplate = fs.existsSync(currentTemplateDir) ? readTemplateFromDir(currentTemplateDir) : null
    const nextVersion = existingTemplate ? bumpPatchVersion(existingTemplate.version) : (template.version || '1.0.0')
    const sanitizedTemplate: Template = template.type === 'organization'
      ? {
          ...stripDerivedTemplateFields(template),
          version: nextVersion,
          source: undefined,
          slug: undefined,
          metadata: {
            ...(template.metadata || {}),
            createdAt: template.metadata?.createdAt || existingTemplate?.metadata?.createdAt || timestamp,
            updatedAt: timestamp,
          },
        }
      : {
          ...template,
          version: nextVersion,
          source: undefined,
          slug: undefined,
          metadata: {
            ...(template.metadata || {}),
            createdAt: template.metadata?.createdAt || existingTemplate?.metadata?.createdAt || timestamp,
            updatedAt: timestamp,
          },
        }

    // Validate template
    const normalizedTemplate = normalizeTemplateForUse(sanitizedTemplate)
    const validation = validateTemplate(normalizedTemplate)
    if (!validation.valid) {
      return { ok: false, error: `Validation failed: ${validation.errors?.join(', ')}` }
    }
    // Create template directory
    fs.mkdirSync(templateDir, { recursive: true })

    if (existingTemplate) {
      snapshotExistingTemplateVersion(currentTemplateDir, existingTemplate.version)
    }

    // Write template.json
    const templateJsonPath = path.join(templateDir, 'template.json')
    fs.writeFileSync(templateJsonPath, JSON.stringify(normalizedTemplate, null, 2), 'utf-8')

    // Also write TEMPLATE.md
    const templateMdPath = path.join(templateDir, 'TEMPLATE.md')
    fs.writeFileSync(templateMdPath, templateToMarkdown(normalizedTemplate), 'utf-8')

    if (normalizedTemplate.type === 'agent' && normalizedTemplate.metadata?.basedOnSlug) {
      const sourceSlug = normalizedTemplate.metadata.basedOnSlug
      const sourceType = normalizedTemplate.metadata.basedOnSource || 'system'
      const sourceDir = sourceType === 'workspace'
        ? path.join(getAgentTemplatesDir(), sourceSlug)
        : sourceType === 'enterprise'
          ? null
          : path.join(getGlobalAgentTemplatesDir(), sourceSlug)
      if (sourceDir && fs.existsSync(sourceDir)) {
        const files = ['SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'GROUPS.md', 'COMMUNITIES.md']
        for (const file of files) {
          const srcPath = path.join(sourceDir, file)
          const dstPath = path.join(templateDir, file)
          if (fs.existsSync(srcPath) && !fs.existsSync(dstPath)) {
            fs.copyFileSync(srcPath, dstPath)
          }
        }
      }
    }

    return { ok: true, path: templateDir }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * List all templates of a given type
 */
export function listTemplates(type?: 'agent' | 'organization'): Template[] {
  ensureTemplateDirs()
  const templates = new Map<string, Template>()
  const dirs: Array<{ dir: string; source: TemplateSource; slug: string }> = []
  const extraRoots = parseExtraTemplateRoots()

  // Collect templates from both global and workspace directories
  if (!type || type === 'agent') {
    // Workspace agent templates (user-created)
    try {
      const agentDirs = fs.readdirSync(getAgentTemplatesDir(), { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => ({ dir: path.join(getAgentTemplatesDir(), d.name), source: 'workspace' as const, slug: d.name }))
      dirs.push(...agentDirs)
    } catch {}

    for (const root of extraRoots) {
      dirs.push(...collectTemplateDirsFromRoot(root, 'agent', 'enterprise'))
    }

    // Global agent templates (system)
    try {
      const globalAgentDirs = fs.readdirSync(getGlobalAgentTemplatesDir(), { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => ({ dir: path.join(getGlobalAgentTemplatesDir(), d.name), source: 'system' as const, slug: d.name }))
      dirs.push(...globalAgentDirs)
    } catch {}
  }

  if (!type || type === 'organization') {
    // Workspace org templates (user-created)
    try {
      const orgDirs = fs.readdirSync(getOrgTemplatesDir(), { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => ({ dir: path.join(getOrgTemplatesDir(), d.name), source: 'workspace' as const, slug: d.name }))
      dirs.push(...orgDirs)
    } catch {}

    for (const root of extraRoots) {
      dirs.push(...collectTemplateDirsFromRoot(root, 'organization', 'enterprise'))
    }

    // Global org templates (system)
    try {
      const globalOrgDirs = fs.readdirSync(getGlobalOrgTemplatesDir(), { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => ({ dir: path.join(getGlobalOrgTemplatesDir(), d.name), source: 'system' as const, slug: d.name }))
      dirs.push(...globalOrgDirs)
    } catch {}
  }

  for (const entry of dirs) {
    try {
      const template = readTemplateFromDir(entry.dir)
      if (template && !templates.has(template.name)) {
        templates.set(template.name, {
          ...template,
          source: entry.source,
          slug: entry.slug,
        })
      }
    } catch (err) {
      console.error(`Failed to read template at ${entry.dir}:`, err)
      }
    }

  return Array.from(templates.values())
    .map((template) => withDerivedTemplateFields(template))
}

/**
 * Get a specific template by type and name slug
 * Checks workspace first (user templates), then global (system templates)
 */
export function getTemplate(type: 'agent' | 'organization', slug: string): Template | null {
  ensureTemplateDirs()

  // Check workspace templates first (user-created, higher priority)
  const workspaceTemplateDir = type === 'agent'
    ? path.join(getAgentTemplatesDir(), slug)
    : path.join(getOrgTemplatesDir(), slug)

  if (fs.existsSync(workspaceTemplateDir)) {
    const template = readTemplateFromDir(workspaceTemplateDir)
    if (template) return withDerivedTemplateFields({ ...template, source: 'workspace', slug })
  }

  for (const root of parseExtraTemplateRoots()) {
    for (const entry of collectTemplateDirsFromRoot(root, type, 'enterprise')) {
      if (entry.slug !== slug) continue
      const template = readTemplateFromDir(entry.dir)
      if (template) return withDerivedTemplateFields({ ...template, source: 'enterprise', slug })
    }
  }

  // Check global templates second (system templates)
  const globalTemplateDir = type === 'agent'
    ? path.join(getGlobalAgentTemplatesDir(), slug)
    : path.join(getGlobalOrgTemplatesDir(), slug)

  if (fs.existsSync(globalTemplateDir)) {
    const template = readTemplateFromDir(globalTemplateDir)
    if (template) return withDerivedTemplateFields({ ...template, source: 'system', slug })
  }

  return null
}

/**
 * Delete a template
 */
export function deleteTemplate(type: 'agent' | 'organization', slug: string): { ok: boolean; error?: string } {
  try {
    const templateDir = type === 'agent'
      ? path.join(getAgentTemplatesDir(), slug)
      : path.join(getOrgTemplatesDir(), slug)

    if (fs.existsSync(templateDir)) {
      fs.rmSync(templateDir, { recursive: true, force: true })
      return { ok: true }
    }

    const globalTemplateDir = type === 'agent'
      ? path.join(getGlobalAgentTemplatesDir(), slug)
      : path.join(getGlobalOrgTemplatesDir(), slug)

    if (fs.existsSync(globalTemplateDir)) {
      return { ok: false, error: 'System templates cannot be deleted from the dashboard' }
    }

    if (!fs.existsSync(templateDir)) {
      return { ok: false, error: 'Template not found' }
    }
  } catch (err) {
    return { ok: false, error: String(err) }
  }

  return { ok: false, error: 'Template not found' }
}

// ============================================================================
// Agent File Operations
// ============================================================================

/**
 * Copy agent files (SOUL.md, TOOLS.md, IDENTITY.md) to template directory
 * For agent templates: copies directly to template root
 * For org templates: copies to agents/{agentId}/ subdirectory
 */
export function copyAgentFilesToTemplate(
  agentId: string,
  templateDir: string,
  isOrgTemplate = false
): { ok: boolean; error?: string } {
  try {
    const agentDir = path.join(getAgentsDir(), agentId)

    // Agent templates: put files directly in template root
    // Org templates: put files in agents/{agentId}/ subdirectory
    const targetDir = isOrgTemplate
      ? path.join(templateDir, 'agents', agentId)
      : templateDir

    if (!fs.existsSync(agentDir)) {
      return { ok: false, error: `Agent directory not found: ${agentDir}` }
    }

    // Create target directory
    fs.mkdirSync(targetDir, { recursive: true })

    // Copy core agent files plus GROUPS.md and COMMUNITIES.md if they exist
    const files = ['SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'GROUPS.md', 'COMMUNITIES.md']
    for (const file of files) {
      const srcPath = path.join(agentDir, file)
      const dstPath = path.join(targetDir, file)
      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, dstPath)
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Copy agent files from template to agent directory
 * For agent templates: reads from template root
 * For org templates: reads from agents/{agentId}/ subdirectory
 */
export function copyAgentFilesFromTemplate(
  templateDir: string,
  sourceAgentId: string,
  targetAgentId: string,
  isOrgTemplate = false
): { ok: boolean; error?: string } {
  try {
    // Agent templates: read from template root
    // Org templates: read from agents/{agentId}/ subdirectory
    const templateAgentDir = isOrgTemplate
      ? path.join(templateDir, 'agents', sourceAgentId)
      : templateDir

    const targetAgentDir = path.join(getAgentsDir(), targetAgentId)

    if (!fs.existsSync(templateAgentDir)) {
      // No pre-built agent files — agent will be created with defaults
      return { ok: true }
    }

    // Create target directory
    fs.mkdirSync(targetAgentDir, { recursive: true })

    // Copy and transform files
    // Include GROUPS.md and COMMUNITIES.md so pre-existing template files are preserved
    const files = ['SOUL.md', 'TOOLS.md', 'IDENTITY.md', 'GROUPS.md', 'COMMUNITIES.md']
    for (const file of files) {
      const srcPath = path.join(templateAgentDir, file)
      const dstPath = path.join(targetAgentDir, file)

      if (fs.existsSync(srcPath)) {
        let content = fs.readFileSync(srcPath, 'utf-8')

        // Replace agent ID references in IDENTITY.md
        if (file === 'IDENTITY.md') {
          content = content.replace(
            new RegExp(`\\b${sourceAgentId}\\b`, 'g'),
            targetAgentId
          )
        }

        fs.writeFileSync(dstPath, content, 'utf-8')
      }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ============================================================================
// Template Import - Create Agents from Templates
// ============================================================================

/**
 * Import an agent from a template, creating a new agent in AGENTS/ directory
 */
export function importAgentFromTemplate(
  templateSlug: string,
  options: {
    newAgentId?: string
    model?: string
    port?: number
    whatsapp?: string
  }
): { ok: boolean; agentId?: string; error?: string } {
  try {
    const normalizedSlug = slugify(templateSlug)
    const slugCandidates = Array.from(new Set([
      normalizedSlug,
      normalizedSlug.endsWith('-template') ? normalizedSlug : `${normalizedSlug}-template`,
    ]))

    let templateDir = ''
    let templateJsonPath = ''
    let templateSource: TemplateSource = 'workspace'
    let resolvedTemplateSlug = normalizedSlug

    for (const candidate of slugCandidates) {
      const workspaceDir = path.join(getAgentTemplatesDir(), candidate)
      const workspaceJson = path.join(workspaceDir, 'template.json')
      if (fs.existsSync(workspaceJson)) {
        templateDir = workspaceDir
        templateJsonPath = workspaceJson
        templateSource = 'workspace'
        resolvedTemplateSlug = candidate
        break
      }

      const globalDir = path.join(getGlobalAgentTemplatesDir(), candidate)
      const globalJson = path.join(globalDir, 'template.json')
      if (fs.existsSync(globalJson)) {
        templateDir = globalDir
        templateJsonPath = globalJson
        templateSource = 'system'
        resolvedTemplateSlug = candidate
        break
      }
    }

    if (!fs.existsSync(templateJsonPath)) {
      return { ok: false, error: `Template not found: ${templateSlug}` }
    }

    const template: AgentTemplate = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'))
    const feedbackTemplate = { ...template, source: templateSource, slug: resolvedTemplateSlug } as AgentTemplate

    if (template.type !== 'agent') {
      return { ok: false, error: 'Only agent templates can be imported via this endpoint' }
    }

    if (template.agents.length !== 1) {
      return { ok: false, error: 'Agent template must contain exactly 1 agent' }
    }

    const sourceAgent = template.agents[0]
    const targetAgentId = options.newAgentId || sourceAgent.id
    const applySystemTemplateLatest = templateSource === 'system'
    const templateModel = !applySystemTemplateLatest
      ? ((sourceAgent as any).model?.trim() || (template as any)?.metadata?.model?.trim?.() || '')
      : ''
    const effectiveModel = resolveDefaultAgentModel({
      explicitModel: options.model,
      templateModel,
      rawEnv: process.env as Record<string, string>,
    })
    if (!effectiveModel) {
      return { ok: false, error: 'No default model could be resolved for this agent template. Configure a provider key/runtime or choose a model explicitly.' }
    }

    const fileValidation = validateAgentTemplateFiles(templateDir, sourceAgent.id)
    if (!fileValidation.valid) {
      return { ok: false, error: `Template files are invalid: ${fileValidation.errors.join(', ')}` }
    }

    // Validate target agent ID
    if (!/^[a-z][a-z0-9_-]*$/.test(targetAgentId)) {
      return { ok: false, error: 'Invalid agent ID format' }
    }

    const targetAgentDir = path.join(getAgentsDir(), targetAgentId)
    if (fs.existsSync(targetAgentDir)) {
      return { ok: false, error: `Agent already exists: ${targetAgentId}` }
    }

    // Copy template files to new agent directory (isOrgTemplate = false)
    const copyResult = copyAgentFilesFromTemplate(
      templateDir,
      sourceAgent.id,
      targetAgentId,
      false
    )

    if (!copyResult.ok) {
      return { ok: false, error: copyResult.error }
    }

    // Update IDENTITY.md with new agent ID and optional metadata
    const identityPath = path.join(targetAgentDir, 'IDENTITY.md')
    if (fs.existsSync(identityPath)) {
      let identity = fs.readFileSync(identityPath, 'utf-8')

      // Replace agent ID in identity content
      identity = identity.replace(
        new RegExp(`\\b${sourceAgent.id}\\b`, 'g'),
        targetAgentId
      )

      // Update model if provided
      if (effectiveModel) {
        identity = identity.replace(
          /\*\*Model:\*\*\s+.+/,
          `**Model:** ${effectiveModel}`
        )
      }

      // Add creation metadata
      const now = new Date().toISOString()
      const metadataSection = `
## Creation Metadata
- **Created:** ${now}
- **Source Template:** ${template.name} (v${template.version})
${effectiveModel ? `- **Model:** ${effectiveModel}` : ''}
${template.author ? `- **Template Author:** ${template.author}` : ''}
`

      // Insert metadata before the first ## heading or at the end
      const firstHeading = identity.match(/\n## /)?.[0]
      if (firstHeading) {
        identity = identity.replace(/\n## /, `${metadataSection}\n## `)
      } else {
        identity += `\n${metadataSection}`
      }

      fs.writeFileSync(identityPath, identity, 'utf-8')
    }

    // Assign skills from template if defined
    if (sourceAgent.skills && Array.isArray(sourceAgent.skills) && sourceAgent.skills.length > 0) {
      try {
        setAgentSkills(targetAgentId, sourceAgent.skills)
        console.log(`Assigned skills [${sourceAgent.skills.join(', ')}] to agent ${targetAgentId}`)
      } catch (err) {
        console.warn(`Failed to assign skills to ${targetAgentId}: ${err}`)
      }
    }

    finalizeTemplateCreatedAgentRegistration({
      agentId: targetAgentId,
      workspacePath: getWorkspacePath(),
      model: effectiveModel,
    })
    initializeTemplateCreatedAgent(targetAgentId)
    recordTemplateApply(buildTemplateFeedbackMetadata(feedbackTemplate))

    return { ok: true, agentId: targetAgentId }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ============================================================================
// Template Creation from Existing Agents
// ============================================================================

/**
 * Create an agent template from an existing agent
 */
export function createAgentTemplateFromAgent(
  agentId: string,
  templateName: string,
  options?: {
    description?: string
    author?: string
    tags?: string[]
  }
): { ok: boolean; template?: AgentTemplate; error?: string } {
  try {
    const agentDir = path.join(getAgentsDir(), agentId)
    if (!fs.existsSync(agentDir)) {
      return { ok: false, error: `Agent not found: ${agentId}` }
    }

    // Read agent IDENTITY.md to extract metadata
    const identityPath = path.join(agentDir, 'IDENTITY.md')
    const identityContent = fs.existsSync(identityPath)
      ? fs.readFileSync(identityPath, 'utf-8')
      : ''

    const identity = parseIdentity(identityContent)

    // Extract creation metadata if available
    let aiPrompt: string | undefined
    let model: string | undefined
    let createdAt: string | undefined

    const metadataMatch = identityContent.match(/## Creation Metadata\s+([\s\S]*?)(?=\n##|\n---|$)/i)
    if (metadataMatch) {
      const metadataSection = metadataMatch[1]
      const modelMatch = metadataSection.match(/\*\*Model:\*\*\s+(.+)/i)
      const aiDescMatch = metadataSection.match(/\*\*AI Description:\*\*\s+(.+)/i)
      const createdMatch = metadataSection.match(/\*\*Created:\*\*\s+(.+)/i)

      if (modelMatch) model = modelMatch[1].trim()
      if (aiDescMatch && aiDescMatch[1].trim() !== 'N/A') aiPrompt = aiDescMatch[1].trim()
      if (createdMatch) createdAt = createdMatch[1].trim()
    }

    // Create template object
    const template: AgentTemplate = {
      name: templateName,
      type: 'agent',
      version: '1.0.0',
      description: options?.description,
      author: options?.author,
      tags: options?.tags || identity.tags || [],
      agents: [{
        id: agentId,
        name: identity.name || agentId,
        role: identity.creature || 'AI Agent',
        tags: identity.tags || [],
        skills: getAgentSkills(agentId)
      }],
      metadata: {
        aiPrompt,
        model,
        createdAt
      }
    }

    // Validate template
    const validation = validateTemplate(template)
    if (!validation.valid) {
      return { ok: false, error: `Validation failed: ${validation.errors?.join(', ')}` }
    }

    // Save template
    const saveResult = saveTemplate(template)
    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error }
    }

    // Copy agent files to template directory (isOrgTemplate = false)
    const copyResult = copyAgentFilesToTemplate(agentId, saveResult.path!, false)
    if (!copyResult.ok) {
      return { ok: false, error: copyResult.error }
    }

    return { ok: true, template }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Create an organization template from the current workspace state
 * Exports all agents, communities, and groups
 */
export function createOrganizationTemplate(
  templateName: string,
  options?: {
    description?: string
    author?: string
    tags?: string[]
  }
): { ok: boolean; template?: OrganizationTemplate; error?: string } {
  try {
    // Filter out archived agents
    const allAgents = listAgents()
    const agents = allAgents.filter(a => !a.archived)

    if (agents.length === 0) {
      return { ok: false, error: 'No active agents found in workspace' }
    }

    // Build maps for communities and groups
    const communityMap = new Map<string, Community>()
    const groupMap = new Map<string, Group>()

    // Process each agent to extract communities and groups
    for (const agentInfo of agents) {
      const agentDir = path.join(getAgentsDir(), agentInfo.id)

      // Read IDENTITY.md for agent metadata
      const identityPath = path.join(agentDir, 'IDENTITY.md')
      const identityContent = fs.existsSync(identityPath)
        ? fs.readFileSync(identityPath, 'utf-8')
        : ''
      const identity = parseIdentity(identityContent)

      // Read COMMUNITIES.md and GROUPS.md if they exist
      const communitiesPath = path.join(agentDir, 'COMMUNITIES.md')
      const groupsPath = path.join(agentDir, 'GROUPS.md')

      if (fs.existsSync(communitiesPath)) {
        const content = fs.readFileSync(communitiesPath, 'utf-8')
        const { communities } = parseGroups(content)

        for (const comm of communities) {
          if (!communityMap.has(comm.name)) {
            communityMap.set(comm.name, {
              name: comm.name,
              description: comm.description || undefined,
              tags: comm.tags || [],
              channels: comm.channels || []
            })
          }
        }
      }

      if (fs.existsSync(groupsPath)) {
        const content = fs.readFileSync(groupsPath, 'utf-8')
        const { groups } = parseGroups(content)

        for (const grp of groups) {
          if (!groupMap.has(grp.name)) {
            groupMap.set(grp.name, {
              name: grp.name,
              description: grp.description || undefined,
              tags: grp.tags || [],
              channels: grp.channels || [],
              community: grp.community || undefined
            })
          }
        }
      }
    }

    // Build organization template
    const templateAgents: OrganizationTemplateAgent[] = agents.map(agentInfo => {
      const agentDir = path.join(getAgentsDir(), agentInfo.id)
      const identityPath = path.join(agentDir, 'IDENTITY.md')
      const identityContent = fs.existsSync(identityPath)
        ? fs.readFileSync(identityPath, 'utf-8')
        : ''
      const identity = parseIdentity(identityContent)

      // Get agent's communities and groups
      const agentCommunities: string[] = []
      const agentGroups: string[] = []

      const communitiesPath = path.join(agentDir, 'COMMUNITIES.md')
      const groupsPath = path.join(agentDir, 'GROUPS.md')

      if (fs.existsSync(communitiesPath)) {
        const content = fs.readFileSync(communitiesPath, 'utf-8')
        const { communities } = parseGroups(content)
        agentCommunities.push(...communities.map(c => c.name))
      }

      if (fs.existsSync(groupsPath)) {
        const content = fs.readFileSync(groupsPath, 'utf-8')
        const { groups } = parseGroups(content)
        agentGroups.push(...groups.map(g => g.name))
      }

      return {
        id: agentInfo.id,
        name: identity.name || agentInfo.id,
        role: identity.creature || 'AI Agent',
        tags: identity.tags || [],
        skills: getAgentSkills(agentInfo.id),
        communities: agentCommunities.length > 0 ? agentCommunities : undefined,
        groups: agentGroups.length > 0 ? agentGroups : undefined
      }
    })

    // Get all workflows
    const workflows = listWorkflows()
    const workflowsData: Workflow[] = workflows.map(wf => {
      const executionMode = wf.executionMode
      const inferredOwner = executionMode === 'managed'
        ? (wf.owner || wf.targeting?.agents?.[0])
        : undefined

      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        schedule: wf.schedule,
        enabled: wf.enabled,
        executionMode,
        owner: inferredOwner,
        type: wf.type,
        dependsOn: wf.dependsOn,
        targeting: wf.targeting,
        content: wf.content
      }
    })

    const template: OrganizationTemplate = {
      name: templateName,
      type: 'organization',
      version: '1.0.0',
      description: options?.description,
      author: options?.author,
      tags: options?.tags || [],
      agents: templateAgents,
      communities: communityMap.size > 0 ? Array.from(communityMap.values()) : undefined,
      groups: groupMap.size > 0 ? Array.from(groupMap.values()) : undefined,
      workflows: workflowsData.length > 0 ? workflowsData : undefined
    }

    // Validate template
    const validation = validateTemplate(template)
    if (!validation.valid) {
      return { ok: false, error: `Validation failed: ${validation.errors?.join(', ')}` }
    }

    // Save template
    const saveResult = saveTemplate(template)
    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error }
    }

    // Copy agent files to template directory (isOrgTemplate = true)
    for (const agentInfo of agents) {
      const copyResult = copyAgentFilesToTemplate(agentInfo.id, saveResult.path!, true)
      if (!copyResult.ok) {
        // Clean up and return error
        try {
          fs.rmSync(saveResult.path!, { recursive: true, force: true })
        } catch {}
        return { ok: false, error: `Failed to copy agent files: ${copyResult.error}` }
      }
    }

    return { ok: true, template }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Import an organization template and create all agents, communities, and groups
 * Supports prefix/suffix for agent IDs to avoid conflicts
 */
export function importOrganizationTemplate(
  templateSlug: string,
  options?: {
    prefix?: string
    suffix?: string
    includeBuiltIn?: boolean
    modelOverride?: string
    agentCounts?: Record<string, number>
    workflowOverrides?: Record<string, string>
    groupRenames?: Record<string, string>
    communityRenames?: Record<string, string>
    workflowRenames?: Record<string, string>
  }
): { ok: boolean; agentIds?: string[]; error?: string } {
  try {
    // Check workspace templates first (user templates)
    let templateDir = path.join(getOrgTemplatesDir(), templateSlug)
    let templateJsonPath = path.join(templateDir, 'template.json')
    let templateSource: TemplateSource = 'workspace'

    // If not found in workspace, check global templates (system templates)
    if (!fs.existsSync(templateJsonPath)) {
      templateDir = path.join(getGlobalOrgTemplatesDir(), templateSlug)
      templateJsonPath = path.join(templateDir, 'template.json')
      templateSource = 'system'
    }

    if (!fs.existsSync(templateJsonPath)) {
      return { ok: false, error: `Template not found: ${templateSlug}` }
    }

    const template: OrganizationTemplate = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'))
    const feedbackTemplate = withDerivedTemplateFields({ ...template, source: templateSource, slug: templateSlug } as OrganizationTemplate) as OrganizationTemplate

    if (template.type !== 'organization') {
      return { ok: false, error: 'Only organization templates can be imported via this endpoint' }
    }

    const adjustedTemplate: OrganizationTemplate = JSON.parse(fs.readFileSync(templateJsonPath, 'utf-8'))
    const prefix = options?.prefix || ''
    const suffix = options?.suffix || ''
    const namespaceChannelName = (value: string) => `${prefix}${value}${suffix}`.trim()
    const groupRenames = { ...(options?.groupRenames || {}) }
    const communityRenames = { ...(options?.communityRenames || {}) }
    const workflowRenames = options?.workflowRenames || {}
    const includeBuiltIn = options?.includeBuiltIn !== false // Default to true

    if ((prefix || suffix) && adjustedTemplate.groups) {
      for (const group of adjustedTemplate.groups) {
        const currentName = `${group?.name || ''}`.trim()
        if (!currentName || groupRenames[currentName]) continue
        groupRenames[currentName] = namespaceChannelName(currentName)
      }
    }
    if ((prefix || suffix) && adjustedTemplate.communities) {
      for (const community of adjustedTemplate.communities) {
        const currentName = `${community?.name || ''}`.trim()
        if (!currentName || communityRenames[currentName]) continue
        communityRenames[currentName] = namespaceChannelName(currentName)
      }
    }

    if (adjustedTemplate.communities) {
      adjustedTemplate.communities = adjustedTemplate.communities.map((community) => ({
        ...community,
        name: communityRenames[community.name] || community.name,
        tags: normalizeTagList((community as any).tags),
      }))
    }

    if (adjustedTemplate.groups) {
      adjustedTemplate.groups = adjustedTemplate.groups.map((group) => ({
        ...group,
        name: groupRenames[group.name] || group.name,
        community: group.community ? (communityRenames[group.community] || group.community) : group.community,
        tags: normalizeTagList((group as any).tags),
      }))
    }

    adjustedTemplate.agents = adjustedTemplate.agents.map((agent) => ({
      ...agent,
      tags: normalizeTagList(agent.tags),
      communities: (agent.communities || []).map((communityName) => communityRenames[communityName] || communityName),
      groups: (agent.groups || []).map((groupName) => groupRenames[groupName] || groupName),
    }))

    if (adjustedTemplate.teams) {
      adjustedTemplate.teams = sanitizeImportedTemplateTeams(adjustedTemplate.teams)
    }

    if (adjustedTemplate.workflows) {
      const templateWorkflowPrefix = slugify(adjustedTemplate.name || templateSlug)
      const starterWorkflowNames = new Map<string, string>([
        ['team kickoff', `${adjustedTemplate.name} Kickoff`],
        ['execution review', `${adjustedTemplate.name} Execution Review`],
        ['weekly summary', `${adjustedTemplate.name} Weekly Summary`],
      ])
      const starterWorkflowIds = new Map<string, string>([
        ['team-kickoff', `${templateWorkflowPrefix}-kickoff`],
        ['execution-review', `${templateWorkflowPrefix}-execution-review`],
        ['weekly-summary', `${templateWorkflowPrefix}-weekly-summary`],
      ])
      const legacyWorkflowIdMap: Record<string, string> = {}

      adjustedTemplate.workflows = adjustedTemplate.workflows.map((workflow) => {
        const originalId = workflow.id
        const normalizedName = workflow.name.trim().toLowerCase()
        const normalizedId = workflow.id.trim().toLowerCase()
        const nextId = starterWorkflowIds.get(normalizedId) || workflow.id
        legacyWorkflowIdMap[originalId] = nextId
        return {
          ...workflow,
          name: starterWorkflowNames.get(normalizedName) || workflow.name,
          id: nextId,
        }
      })

      const dependencyAliases = buildWorkflowDependencyAliasMap(adjustedTemplate.workflows as Workflow[])
      adjustedTemplate.workflows = adjustedTemplate.workflows.map((workflow) => ({
        ...workflow,
        dependsOn: Array.isArray(workflow.dependsOn)
          ? workflow.dependsOn.map((dep) => dependencyAliases[dep] || legacyWorkflowIdMap[dep] || dep)
          : workflow.dependsOn,
      }))

      const workflowIdRenames = Object.fromEntries(
        adjustedTemplate.workflows.map((workflow) => {
          const originalId = Object.keys(legacyWorkflowIdMap).find((key) => legacyWorkflowIdMap[key] === workflow.id) || workflow.id
          const renamedId = workflowRenames[originalId] || workflowRenames[workflow.id]
          return [
            originalId,
            renamedId ? slugify(renamedId) : workflow.id,
          ]
        })
      )
      adjustedTemplate.workflows = adjustedTemplate.workflows.map((workflow) => ({
        ...workflow,
        id: workflowIdRenames[Object.keys(legacyWorkflowIdMap).find((key) => legacyWorkflowIdMap[key] === workflow.id) || workflow.id] || workflow.id,
        name: workflowRenames[workflow.id]
          || workflowRenames[Object.keys(legacyWorkflowIdMap).find((key) => legacyWorkflowIdMap[key] === workflow.id) || workflow.id]
          || workflow.name,
        targeting: {
          ...workflow.targeting,
          communities: (workflow.targeting.communities || []).map((communityName) => communityRenames[communityName] || communityName),
          groups: (workflow.targeting.groups || []).map((groupName) => groupRenames[groupName] || groupName),
          tags: normalizeTagList(workflow.targeting?.tags),
        },
        dependsOn: (workflow.dependsOn || []).map((dependencyId) => workflowIdRenames[dependencyId] || legacyWorkflowIdMap[dependencyId] || dependencyId),
      }))

      if ((adjustedTemplate.teams || []).length > 0) {
        adjustedTemplate.workflows = adjustedTemplate.workflows.map((workflow) => {
          const hasPreciseExecutionTarget =
            Boolean(`${(workflow as any).owner || ''}`.trim()) ||
            (workflow.targeting?.agents || []).length > 0 ||
            (workflow.targeting?.teamIds || []).length > 0

          if (!hasPreciseExecutionTarget) return workflow

          return {
            ...workflow,
            targeting: {
              ...workflow.targeting,
              // Tags are broad execution selectors. Company workflows with an
              // owner, direct agent, or team target should not fan back out to
              // every agent that shares a category tag.
              tags: [],
            },
          }
        })
      }
    }

    // Validate template
    const validation = validateTemplate(adjustedTemplate)
    if (!validation.valid) {
      return { ok: false, error: `Template validation failed: ${validation.errors?.join(', ')}` }
    }

    const createdAgents: string[] = []
    const appliedModelsByAgentId: Record<string, string | undefined> = {}
    const teamNameById = new Map((adjustedTemplate.teams || []).map((team) => [team.id, team.name]))

    const mapImportedId = (value: string) => `${prefix}${value}${suffix}`
    const getWorkflowScopeLabel = (workflow: Workflow): string | undefined => {
      const firstTeamId = workflow.targeting?.teamIds?.[0]
      if (firstTeamId) return teamNameById.get(firstTeamId) || firstTeamId
      const firstGroup = workflow.targeting?.groups?.[0]
      if (firstGroup?.trim()) return firstGroup.trim()
      const firstCommunity = workflow.targeting?.communities?.[0]
      if (firstCommunity?.trim()) return firstCommunity.trim()
      return undefined
    }
    const getImportedWorkflowName = (workflow: Workflow): string => {
      const explicitRename = workflowRenames[workflow.id]
      if (explicitRename?.trim()) return explicitRename.trim()

      const importNamespace = `${prefix}${suffix}`.trim().replace(/^[-_]+|[-_]+$/g, '')
      const baseCompanyLabel = `${adjustedTemplate.name || templateSlug}`.trim()
      const companyLabel = importNamespace || baseCompanyLabel
      const scopeLabel = getWorkflowScopeLabel(workflow)
      const workflowName = `${workflow.name || workflow.id}`.trim()
      if (!companyLabel) return scopeLabel ? `${scopeLabel} / ${workflowName}` : workflowName
      if (scopeLabel && !workflowName.toLowerCase().includes(scopeLabel.toLowerCase())) {
        return `${companyLabel} · ${scopeLabel} / ${workflowName}`
      }
      return `${companyLabel} · ${workflowName}`
    }

    // Expand parameterized agents based on agentCounts
    const paramAgentIds = new Set((adjustedTemplate as any).parameters?.map((p: any) => p.agentId) || [])
    const expandedAgents = adjustedTemplate.agents.flatMap((agent: any) => {
      if (paramAgentIds.has(agent.id) && options?.agentCounts) {
        const count = options.agentCounts[agent.id] || (adjustedTemplate as any).parameters?.find((p: any) => p.agentId === agent.id)?.default || 1
        return Array.from({ length: count }, (_, i) => ({
          ...agent,
          id: count === 1 ? agent.id : `${agent.id}${i + 1}`,
          name: count === 1 ? (agent.name || agent.id) : `${agent.name || agent.role} ${i + 1}`,
          _sourceAgentId: agent.id, // Keep track of original template agent ID for file copying
        }))
      }
      return [{ ...agent, _sourceAgentId: agent.id }]
    })

    // Filter out built-in agents if includeBuiltIn is false
    const agentsToCreate = includeBuiltIn
      ? expandedAgents
      : expandedAgents.filter((a: any) => !a.tags?.includes('built-in'))

    try {
      // Step 1: Create all agents with their files
      for (const templateAgent of agentsToCreate) {
        const sourceAgentId = (templateAgent as any)._sourceAgentId || templateAgent.id
        const targetAgentId = `${prefix}${templateAgent.id}${suffix}`
        const applySystemTemplateLatest = templateSource === 'system'
        const appliedModel = resolveDefaultAgentModel({
          explicitModel: options?.modelOverride,
          templateModel: applySystemTemplateLatest ? undefined : templateAgent.model,
          rawEnv: process.env as Record<string, string>,
        })
        if (!appliedModel) {
          throw new Error(`No default model could be resolved for agent ${targetAgentId}. Configure a provider key/runtime or choose a model override first.`)
        }
        appliedModelsByAgentId[targetAgentId] = appliedModel

        // Validate target agent ID
        if (!/^[a-z][a-z0-9_-]*$/.test(targetAgentId)) {
          throw new Error(`Invalid agent ID format after prefix/suffix: ${targetAgentId}`)
        }

        const targetAgentDir = path.join(getAgentsDir(), targetAgentId)
        if (fs.existsSync(targetAgentDir)) {
          throw new Error(`Agent already exists: ${targetAgentId}`)
        }

        // Copy agent files from template (isOrgTemplate = true)
        const copyResult = copyAgentFilesFromTemplate(
          templateDir,
          sourceAgentId,
          targetAgentId,
          true
        )

        if (!copyResult.ok) {
          throw new Error(`Failed to copy agent files: ${copyResult.error}`)
        }

        // Generate IDENTITY.md from template data if none exists
        const identityPath = path.join(targetAgentDir, 'IDENTITY.md')
        if (!fs.existsSync(identityPath)) {
          fs.mkdirSync(targetAgentDir, { recursive: true })
          const agentName = templateAgent.name || targetAgentId
          const agentRole = templateAgent.role || 'AI Agent'
          const agentTags = templateAgent.tags || []
          const now = new Date().toISOString()
          const identityContent = `# ${agentName}

- **Name:** ${agentName}
- **Role:** ${agentRole}
- **Tags:** ${agentTags.length > 0 ? agentTags.join(', ') : 'none'}
${appliedModel ? `- **Model:** ${appliedModel}` : ''}

## Creation Metadata
- **Created:** ${now}
- **Source Template:** ${template.name} (v${template.version})
${template.author ? `- **Template Author:** ${template.author}` : ''}
`
          fs.writeFileSync(identityPath, identityContent, 'utf-8')
        } else if (sourceAgentId !== templateAgent.id) {
          // Update Name in IDENTITY.md if agent was expanded (e.g., engineer -> engineer1)
          let content = fs.readFileSync(identityPath, 'utf-8')
          content = content.replace(
            /^-\s+\*\*Name:\*\*\s+.+$/m,
            `- **Name:** ${templateAgent.name || targetAgentId}`
          )
          fs.writeFileSync(identityPath, content, 'utf-8')
        }

        // Apply model from override or template defaults into IDENTITY.md
        if (appliedModel) {
          const identityPath = path.join(targetAgentDir, 'IDENTITY.md')
          if (fs.existsSync(identityPath)) {
            let content = fs.readFileSync(identityPath, 'utf-8')
            if (/^-\s+\*\*Model:\*\*/m.test(content)) {
              // Replace existing model line
              content = content.replace(
                /^-\s+\*\*Model:\*\*\s+.*$/m,
                `- **Model:** ${appliedModel}`
              )
            } else {
              // No model line exists — add it after the header
              const lines = content.split('\n')
              const insertIdx = lines.findIndex(l => /^#+\s/.test(l) && lines.indexOf(l) > 0)
              if (insertIdx > 0) {
                lines.splice(insertIdx, 0, `- **Model:** ${appliedModel}`, '')
              } else {
                lines.push('', `- **Model:** ${appliedModel}`)
              }
              content = lines.join('\n')
            }
            fs.writeFileSync(identityPath, content, 'utf-8')
          }
        }

        // Add tags to IDENTITY.md if specified in template
        if (templateAgent.tags && templateAgent.tags.length > 0) {
          const identityPath = path.join(targetAgentDir, 'IDENTITY.md')
          if (fs.existsSync(identityPath)) {
            let identityContent = fs.readFileSync(identityPath, 'utf-8')

            // Check if IDENTITY.md already has a Tags field
            const tagsPattern = /^-\s+\*\*Tags:\*\*\s+.+$/m
            const tagsSectionPattern = /^##\s+Tags\s*\n[\s\S]*?(?=\n##|\n---|$)/m

            const tagsLine = `- **Tags:** ${templateAgent.tags.join(', ')}`

            if (tagsPattern.test(identityContent)) {
              // Replace existing Tags field
              identityContent = identityContent.replace(tagsPattern, tagsLine)
            } else if (tagsSectionPattern.test(identityContent)) {
              // Replace Tags section with Tags field
              identityContent = identityContent.replace(tagsSectionPattern, tagsLine)
            } else {
              // Add Tags field after Name/Creature/etc fields
              // Find the first occurrence of WhatsApp field or the first blank line
              const whatsappMatch = identityContent.match(/^-\s+\*\*WhatsApp:\*\*.*$/m)
              if (whatsappMatch) {
                // Insert Tags before WhatsApp
                identityContent = identityContent.replace(
                  /^(-\s+\*\*WhatsApp:\*\*.*$)/m,
                  `${tagsLine}\n$1`
                )
              } else {
                // Find the end of the metadata section (first blank line after Name/Creature)
                const lines = identityContent.split('\n')
                let insertIndex = -1
                let foundMetadata = false

                for (let i = 0; i < lines.length; i++) {
                  if (lines[i].match(/^-\s+\*\*(Name|Creature|Vibe|Emoji):/)) {
                    foundMetadata = true
                  } else if (foundMetadata && lines[i].trim() === '') {
                    insertIndex = i
                    break
                  }
                }

                if (insertIndex > 0) {
                  lines.splice(insertIndex, 0, tagsLine)
                  identityContent = lines.join('\n')
                } else {
                  // Fallback: append after first heading
                  identityContent = identityContent.replace(
                    /^(#[^\n]+\n)/,
                    `$1\n${tagsLine}\n`
                  )
                }
              }
            }

            fs.writeFileSync(identityPath, identityContent, 'utf-8')
          }
        }

        createdAgents.push(targetAgentId)
        initializeTemplateCreatedAgent(targetAgentId)
      }

      // Step 2: Create COMMUNITIES.md for agents with community memberships
      // Always attempt creation for every agent that has community assignments,
      // even if the file was already partially copied in Step 1.
      if (adjustedTemplate.communities && adjustedTemplate.communities.length > 0) {
        for (const templateAgent of agentsToCreate) {
          const targetAgentId = `${prefix}${templateAgent.id}${suffix}`
          const agentCommunities = templateAgent.communities || []

          if (agentCommunities.length > 0) {
            try {
              const agentDir = path.join(getAgentsDir(), targetAgentId)
              // Ensure agent directory exists (defensive — may differ from Step 1
              // if getAgentsDir() resolved differently)
              fs.mkdirSync(agentDir, { recursive: true })
              const communitiesPath = path.join(agentDir, 'COMMUNITIES.md')

              // Build COMMUNITIES.md content — match by name (case-insensitive)
              const matchedCommunities = adjustedTemplate.communities
                .filter(comm => agentCommunities.some((ac: string) => ac.toLowerCase() === comm.name.toLowerCase()))
              const communitiesContent = matchedCommunities
                .map(comm => {
                  let content = `## ${comm.name}\n\n`
                  if (comm.description) content += `${comm.description}\n\n`
                  if (comm.tags && comm.tags.length > 0) {
                    content += `**Tags:** ${comm.tags.join(', ')}\n\n`
                  }
                  if (comm.channels && comm.channels.length > 0) {
                    content += `**Channels:** ${comm.channels.join(', ')}\n\n`
                  }
                  return content
                })
                .join('\n---\n\n')

              if (communitiesContent.trim()) {
                fs.writeFileSync(communitiesPath, `# Communities\n\n${communitiesContent}`, 'utf-8')
              } else {
                // Fallback: write community names as headers even if no match in template definitions
                const fallback = agentCommunities.map((name: string) => `## ${name}\n`).join('\n')
                fs.writeFileSync(communitiesPath, `# Communities\n\n${fallback}`, 'utf-8')
              }
            } catch (err) {
              console.warn(`Failed to create COMMUNITIES.md for ${targetAgentId}:`, err)
            }
          }
        }
      }

      // Step 3: Create GROUPS.md for agents with group memberships
      if (adjustedTemplate.groups && adjustedTemplate.groups.length > 0) {
        for (const templateAgent of agentsToCreate) {
          const targetAgentId = `${prefix}${templateAgent.id}${suffix}`
          const agentGroups = templateAgent.groups || []

          if (agentGroups.length > 0) {
            try {
              const agentDir = path.join(getAgentsDir(), targetAgentId)
              // Ensure agent directory exists (defensive)
              fs.mkdirSync(agentDir, { recursive: true })
              const groupsPath = path.join(agentDir, 'GROUPS.md')

              // Build GROUPS.md content — match by name (case-insensitive)
              const matchedGroups = adjustedTemplate.groups
                .filter(grp => agentGroups.some((ag: string) => ag.toLowerCase() === grp.name.toLowerCase()))
              const groupsContent = matchedGroups
                .map(grp => {
                  let content = `## ${grp.name}\n\n`
                  if (grp.description) content += `${grp.description}\n\n`
                  if (grp.community) content += `**Community:** ${grp.community}\n\n`
                  if (grp.tags && grp.tags.length > 0) {
                    content += `**Tags:** ${grp.tags.join(', ')}\n\n`
                  }
                  if (grp.channels && grp.channels.length > 0) {
                    content += `**Channels:** ${grp.channels.join(', ')}\n\n`
                  }
                  return content
                })
                .join('\n---\n\n')

              if (groupsContent.trim()) {
                fs.writeFileSync(groupsPath, `# Groups\n\n${groupsContent}`, 'utf-8')
              } else {
                // Fallback: write group names as headers even if no match in template definitions
                const fallback = agentGroups.map((name: string) => `## ${name}\n`).join('\n')
                fs.writeFileSync(groupsPath, `# Groups\n\n${fallback}`, 'utf-8')
              }
            } catch (err) {
              console.warn(`Failed to create GROUPS.md for ${targetAgentId}:`, err)
            }
          }
        }
      }

      // Step 4: Update workspace-level ORG/COMMUNITIES.md and ORG/GROUPS.md
      if (adjustedTemplate.communities && adjustedTemplate.communities.length > 0) {
        const orgDir = path.join(getWorkspacePath(), 'ORG')
        fs.mkdirSync(orgDir, { recursive: true })

        const communitiesPath = path.join(orgDir, 'COMMUNITIES.md')

        // Read existing communities if file exists
        let existingContent = ''
        const existingCommunityNames = new Set<string>()
        if (fs.existsSync(communitiesPath)) {
          existingContent = fs.readFileSync(communitiesPath, 'utf-8')
          // Parse existing community names
          const communityHeaderRegex = /^###\s+(.+)$/gm
          let match
          while ((match = communityHeaderRegex.exec(existingContent)) !== null) {
            existingCommunityNames.add(match[1].trim())
          }
        }

        // Build content for new communities (skip existing ones)
        const newCommunitiesContent = adjustedTemplate.communities
          .filter(comm => !existingCommunityNames.has(comm.name))
          .map(comm => {
            let content = `### ${comm.name}\n`
            if (comm.description) content += `- **Description:** ${comm.description}\n`
            if (comm.tags && comm.tags.length > 0) {
              content += `- **Tags:** ${comm.tags.join(', ')}\n`
            }
            if (comm.channels && comm.channels.length > 0) {
              content += `- **Channels:** ${comm.channels.join(', ')}\n`
            }

            // List agent members
            const members = agentsToCreate
              .filter(a => (a.communities || []).includes(comm.name))
              .map(a => `${prefix}${a.id}${suffix}`)

            if (members.length > 0) {
              content += `- **Members:** ${members.join(', ')}\n`
            }

            return content
          }).join('\n')

        // Only write if there's new content
        if (newCommunitiesContent.trim()) {
          // Append to existing content or create new
          const trimmed = existingContent.trim().replace(/\s+/g, ' ')
          if (trimmed === '# Communities ## Communities' || trimmed === '# Communities') {
            // Empty template, replace entirely
            fs.writeFileSync(communitiesPath, `# COMMUNITIES.md - Organization Communities\n\n## Communities\n\n${newCommunitiesContent}`, 'utf-8')
          } else if (existingContent.trim() === '') {
            // Completely empty file
            fs.writeFileSync(communitiesPath, `# COMMUNITIES.md - Organization Communities\n\n## Communities\n\n${newCommunitiesContent}`, 'utf-8')
          } else {
            // Append new communities
            fs.writeFileSync(communitiesPath, `${existingContent}\n${newCommunitiesContent}`, 'utf-8')
          }
        } else {
          // Communities exist, but need to add new agent members to existing communities
          console.log('All communities already exist, updating member lists')
          let updatedContent = existingContent

          for (const comm of adjustedTemplate.communities) {
            // Find agents that belong to this community
            const newMembers = agentsToCreate
              .filter(a => (a.communities || []).includes(comm.name))
              .map(a => `${prefix}${a.id}${suffix}`)

            if (newMembers.length > 0) {
              // Find the community section and update members
              const communityRegex = new RegExp(`^###\\s+${comm.name}\\s*$`, 'm')
              const match = communityRegex.exec(updatedContent)

              if (match) {
                const sectionStart = match.index
                // Find the next ### or end of file
                const nextSectionMatch = updatedContent.slice(sectionStart + match[0].length).match(/^###\s+/m)
                const sectionEnd = nextSectionMatch && nextSectionMatch.index !== undefined
                  ? sectionStart + match[0].length + nextSectionMatch.index
                  : updatedContent.length

                const section = updatedContent.slice(sectionStart, sectionEnd)

                // Check if Members line exists
                const membersMatch = section.match(/^-\s+\*\*Members:\*\*\s*(.*)$/m)

                if (membersMatch) {
                  // Parse existing members
                  const existingMembers = membersMatch[1]
                    .split(',')
                    .map(m => m.trim())
                    .filter(m => m.length > 0)

                  // Add new members (avoid duplicates)
                  const allMembers = [...new Set([...existingMembers, ...newMembers])]

                  // Replace the members line
                  const newMembersLine = `- **Members:** ${allMembers.join(', ')}`
                  const updatedSection = section.replace(/^-\s+\*\*Members:\*\*.*$/m, newMembersLine)

                  updatedContent = updatedContent.slice(0, sectionStart) + updatedSection + updatedContent.slice(sectionEnd)
                } else {
                  // Add Members line before the end of the section
                  const newMembersLine = `- **Members:** ${newMembers.join(', ')}\n`
                  const insertPos = sectionEnd
                  updatedContent = updatedContent.slice(0, insertPos) + newMembersLine + updatedContent.slice(insertPos)
                }
              }
            }
          }

          fs.writeFileSync(communitiesPath, updatedContent, 'utf-8')
        }
      }

      if (adjustedTemplate.groups && adjustedTemplate.groups.length > 0) {
        const orgDir = path.join(getWorkspacePath(), 'ORG')
        fs.mkdirSync(orgDir, { recursive: true })

        const groupsPath = path.join(orgDir, 'GROUPS.md')

        // Read existing groups if file exists
        let existingContent = ''
        const existingGroupNames = new Set<string>()
        if (fs.existsSync(groupsPath)) {
          existingContent = fs.readFileSync(groupsPath, 'utf-8')
          // Parse existing group names
          const groupHeaderRegex = /^###\s+(.+)$/gm
          let match
          while ((match = groupHeaderRegex.exec(existingContent)) !== null) {
            existingGroupNames.add(match[1].trim())
          }
        }

        // Build content for new groups (skip existing ones)
        const newGroupsContent = adjustedTemplate.groups
          .filter(grp => !existingGroupNames.has(grp.name))
          .map(grp => {
            let content = `### ${grp.name}\n`
            if (grp.description) content += `- **Description:** ${grp.description}\n`
            if (grp.community) content += `- **Community:** ${grp.community}\n`
            if (grp.tags && grp.tags.length > 0) {
              content += `- **Tags:** ${grp.tags.join(', ')}\n`
            }
            if (grp.channels && grp.channels.length > 0) {
              content += `- **Channels:** ${grp.channels.join(', ')}\n`
            }

            // List agent members
            const members = agentsToCreate
              .filter(a => (a.groups || []).includes(grp.name))
              .map(a => `${prefix}${a.id}${suffix}`)

            if (members.length > 0) {
              content += `- **Members:** ${members.join(', ')}\n`
            }

            return content
          }).join('\n')

        // Only write if there's new content
        if (newGroupsContent.trim()) {
          // Append to existing content or create new
          const trimmed = existingContent.trim().replace(/\s+/g, ' ')
          if (trimmed === '# Groups ## Groups' || trimmed === '# Groups') {
            // Empty template, replace entirely
            fs.writeFileSync(groupsPath, `# GROUPS.md - Organization Groups\n\n## Groups\n\n${newGroupsContent}`, 'utf-8')
          } else if (existingContent.trim() === '') {
            // Completely empty file
            fs.writeFileSync(groupsPath, `# GROUPS.md - Organization Groups\n\n## Groups\n\n${newGroupsContent}`, 'utf-8')
          } else {
            // Append new groups
            fs.writeFileSync(groupsPath, `${existingContent}\n${newGroupsContent}`, 'utf-8')
          }
        } else {
          // Groups exist, but need to add new agent members to existing groups
          console.log('All groups already exist, updating member lists')
          let updatedContent = existingContent

          for (const grp of adjustedTemplate.groups) {
            // Find agents that belong to this group
            const newMembers = agentsToCreate
              .filter(a => (a.groups || []).includes(grp.name))
              .map(a => `${prefix}${a.id}${suffix}`)

            if (newMembers.length > 0) {
              // Find the group section and update members
              const groupRegex = new RegExp(`^###\\s+${grp.name}\\s*$`, 'm')
              const match = groupRegex.exec(updatedContent)

              if (match) {
                const sectionStart = match.index
                // Find the next ### or end of file
                const nextSectionMatch = updatedContent.slice(sectionStart + match[0].length).match(/^###\s+/m)
                const sectionEnd = nextSectionMatch && nextSectionMatch.index !== undefined
                  ? sectionStart + match[0].length + nextSectionMatch.index
                  : updatedContent.length

                const section = updatedContent.slice(sectionStart, sectionEnd)

                // Check if Members line exists
                const membersMatch = section.match(/^-\s+\*\*Members:\*\*\s*(.*)$/m)

                if (membersMatch) {
                  // Parse existing members
                  const existingMembers = membersMatch[1]
                    .split(',')
                    .map(m => m.trim())
                    .filter(m => m.length > 0)

                  // Add new members (avoid duplicates)
                  const allMembers = [...new Set([...existingMembers, ...newMembers])]

                  // Replace the members line
                  const newMembersLine = `- **Members:** ${allMembers.join(', ')}`
                  const updatedSection = section.replace(/^-\s+\*\*Members:\*\*.*$/m, newMembersLine)

                  updatedContent = updatedContent.slice(0, sectionStart) + updatedSection + updatedContent.slice(sectionEnd)
                } else {
                  // Add Members line before the end of the section
                  const newMembersLine = `- **Members:** ${newMembers.join(', ')}\n`
                  const insertPos = sectionEnd
                  updatedContent = updatedContent.slice(0, insertPos) + newMembersLine + updatedContent.slice(insertPos)
                }
              }
            }
          }

          fs.writeFileSync(groupsPath, updatedContent, 'utf-8')
        }
      }

      // Step 5: Create/update teams from template
      if (adjustedTemplate.teams && adjustedTemplate.teams.length > 0) {
        for (const templateTeam of adjustedTemplate.teams) {
          const mappedTeamId = `${prefix}${templateTeam.id}${suffix}`
          const mappedParentTeamId = templateTeam.parentTeamId
            ? `${prefix}${templateTeam.parentTeamId}${suffix}`
            : undefined
          const teamInput: TeamInput = {
            id: mappedTeamId,
            name: templateTeam.name,
            purpose: templateTeam.purpose,
            leaderAgentId: templateTeam.leaderAgentId ? `${prefix}${templateTeam.leaderAgentId}${suffix}` : undefined,
            memberAgentIds: (templateTeam.memberAgentIds || []).map((agentId) => `${prefix}${agentId}${suffix}`),
            parentTeamId: mappedParentTeamId,
            tags: templateTeam.tags,
          }

          const existingTeam = getTeam(mappedTeamId)
          if (existingTeam) {
            const updated = updateTeam(mappedTeamId, teamInput)
            if (!updated) {
              throw new Error(`Failed to update imported team: ${mappedTeamId}`)
            }
          } else {
            createTeam(teamInput)
          }
        }
      }

      // Step 6: Create/update workflows from template
      if (adjustedTemplate.workflows && adjustedTemplate.workflows.length > 0) {
        const existingWorkflows = listWorkflows()
        const existingWorkflowMap = new Map(existingWorkflows.map(w => [w.id, w]))
        const workflowIdMap: Record<string, string> = {}

        for (const wf of adjustedTemplate.workflows) {
          const mappedWorkflowId = mapImportedId(wf.id)
          workflowIdMap[wf.id] = mappedWorkflowId

          // Update targeting to use new agent IDs if prefix/suffix was applied
          const newAgents = (wf.targeting.agents || []).map(agentId => `${prefix}${agentId}${suffix}`)
          const newTeamIds = (wf.targeting.teamIds || []).map(teamId => `${prefix}${teamId}${suffix}`)
          const mappedDependsOn = wf.dependsOn?.map(dep => workflowIdMap[dep] || mapImportedId(dep))
          const mappedInputRefs = wf.inputRefs?.map((ref) => ({
            ...ref,
            workflowId: workflowIdMap[ref.workflowId] || mapImportedId(ref.workflowId),
          }))
          const importedWorkflowName = getImportedWorkflowName(wf)

          const updatedTargeting = {
            ...wf.targeting,
            agents: newAgents,
            teamIds: newTeamIds,
          }

          // For managed workflows, auto-assign owner from first targeted agent.
          // If the imported workflow already specifies an owner, remap it into the
          // current namespace and preserve it.
          const execMode = wf.executionMode || 'automated'
          const importedOwner = `${(wf as any).owner || ''}`.trim()
          const mappedOwner = importedOwner ? `${prefix}${importedOwner}${suffix}` : ''
          const owner = execMode === 'managed'
            ? (mappedOwner || newAgents[0] || createdAgents[0] || undefined)
            : (mappedOwner || undefined)

          const existing = existingWorkflowMap.get(mappedWorkflowId)
          if (existing) {
            // Workflow exists - imported workflows should replace targeting so
            // stale communities/groups/agents from prior applies do not survive.
            const existingAgents = existing.targeting.agents || []
            const existingGroups = existing.targeting.groups || []
            const existingCommunities = existing.targeting.communities || []
            const existingTags = existing.targeting.tags || []
            const existingTeamIds = existing.targeting.teamIds || []
            const newGroups = updatedTargeting.groups || []
            const newCommunities = updatedTargeting.communities || []
            const newTags = updatedTargeting.tags || []
            const existingDependsOn = existing.dependsOn || []
            const dependencyChanged = JSON.stringify(existingDependsOn) !== JSON.stringify(mappedDependsOn || [])
            const typeChanged = existing.type !== wf.type
            const scheduleChanged = existing.schedule !== wf.schedule
            const executionModeChanged = existing.executionMode !== (wf.executionMode || 'automated')
            const ownerChanged = `${existing.owner || ''}` !== `${owner || ''}`
            const targetingChanged = JSON.stringify(existing.targeting || {}) !== JSON.stringify(updatedTargeting)

            const needsUpdate =
              targetingChanged ||
              dependencyChanged ||
              typeChanged ||
              scheduleChanged ||
              executionModeChanged ||
              ownerChanged

            if (needsUpdate) {
              const { updateWorkflow } = require('./workflows')
              const updateData: any = {
                name: importedWorkflowName,
                executionMode: wf.executionMode || 'automated',
                owner,
                targeting: updatedTargeting,
                ...((typeof wf.schedule === 'string' && wf.schedule.trim().length > 0) ? { schedule: wf.schedule } : {}),
                ...(mappedDependsOn !== undefined ? { dependsOn: mappedDependsOn } : {}),
                ...(wf.type !== undefined ? { type: wf.type } : {}),
                ...((wf as any).secretRequirements !== undefined ? { secretRequirements: (wf as any).secretRequirements } : {}),
                ...(wf.outputDefinitions !== undefined ? { outputDefinitions: wf.outputDefinitions } : {}),
                ...(mappedInputRefs !== undefined ? { inputRefs: mappedInputRefs } : {}),
              }
              const result = updateWorkflow(existing.id, updateData)

              if (result.success) {
                const changes = []
                if (JSON.stringify(existingAgents) !== JSON.stringify(updatedTargeting.agents || [])) changes.push('agent targeting')
                if (JSON.stringify(existingGroups) !== JSON.stringify(newGroups)) changes.push('group targeting')
                if (JSON.stringify(existingCommunities) !== JSON.stringify(newCommunities)) changes.push('community targeting')
                if (JSON.stringify(existingTags) !== JSON.stringify(newTags)) changes.push('tag targeting')
                if (JSON.stringify(existingTeamIds) !== JSON.stringify(updatedTargeting.teamIds || [])) changes.push('team targeting')
                if (dependencyChanged) changes.push('dependencies')
                if (typeChanged) changes.push('type')
                if (scheduleChanged) changes.push('schedule')
                if (executionModeChanged) changes.push('execution mode')
                if (ownerChanged) changes.push('owner')
                console.log(`Updated workflow "${wf.name}" with ${changes.join(', ')}`)
              } else {
                console.warn(`Failed to update workflow ${wf.name}: ${result.error}`)
              }
            } else {
              console.log(`Workflow "${wf.name}" already has all targets, no update needed`)
            }
          } else {
            // Workflow doesn't exist - create it
            console.log(`[Template Import] Creating workflow "${importedWorkflowName}" (${execMode}) with ${newAgents.length} agents${owner ? `, owner=${owner}` : ''}`)
            const result = createWorkflow({
              id: mappedWorkflowId,
              name: importedWorkflowName,
              description: wf.description || `${wf.name} workflow`,
              schedule: wf.schedule,
              enabled: wf.enabled !== false,
              executionMode: execMode,
              owner,
              targeting: updatedTargeting,
              content: options?.workflowOverrides?.[wf.id] || wf.content || 'Execute workflow tasks.',
              author: adjustedTemplate.author || 'imported',
              dependsOn: mappedDependsOn,
              type: wf.type,
              secretRequirements: (wf as any).secretRequirements,
              outputDefinitions: wf.outputDefinitions,
              inputRefs: mappedInputRefs,
            })

            if (!result.success) {
              console.error(`[Template Import] Failed to create workflow "${wf.name}": ${result.error}${result.errors ? ' | ' + result.errors.join(', ') : ''}`)
              // Don't fail the whole import for workflow creation failures
            }
          }
        }
      }

      runOrganizationPostImportSetup({
        createdAgents,
        agentsToCreate,
        appliedModelsByAgentId,
        template: adjustedTemplate,
        prefix,
        suffix,
        workspacePath: getWorkspacePath(),
        agentsDir: getAgentsDir(),
        workflowOverrides: options?.workflowOverrides,
      })

      recordTemplateApply(buildTemplateFeedbackMetadata(feedbackTemplate))

      return { ok: true, agentIds: createdAgents }
    } catch (err) {
      // Rollback: delete all created agents
      for (const agentId of createdAgents) {
        try {
          const agentDir = path.join(getAgentsDir(), agentId)
          if (fs.existsSync(agentDir)) {
            fs.rmSync(agentDir, { recursive: true, force: true })
          }
        } catch (cleanupErr) {
          console.error(`Failed to cleanup agent ${agentId}:`, cleanupErr)
        }
      }

      return { ok: false, error: String(err) }
    }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
