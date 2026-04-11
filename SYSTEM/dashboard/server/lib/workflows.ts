import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import cronstrue from 'cronstrue'
import { spawn } from 'child_process'
import { safeEnv, userExecutionEnv } from './safe-env'
import { randomUUID } from 'crypto'
import { getWorkspacePath } from './workspace'
import { addMessage } from './messages'
import { traceAgentChat, traceWorkflowExecution } from './opik'
import { isGatewayRunning } from './gateway-rpc'
import { checkBudgetBlock } from './budget'
import { validateWorkflow } from './validator'
import { resolveAgentExecutionConfig, withTemporaryAgentAuthProfiles } from './agent-execution'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'

// Use dynamic workspace path to support multi-workspace
function getWorkflowsDir(): string {
  return path.join(getWorkspacePath(), 'WORKFLOWS')
}

function getExecutionsDir(): string {
  return path.join(getWorkflowsDir(), 'executions')
}

function getTemplatesDir(): string {
  return path.join(getWorkflowsDir(), 'templates')
}

// Interfaces
export interface AgentTargeting {
  communities: string[]
  groups: string[]
  tags: string[]
  agents: string[]
}

export interface Workflow {
  id: string
  name: string
  description: string
  schedule: string
  enabled: boolean
  targeting: AgentTargeting
  created: string
  modified: string
  author: string
  owner?: string
  executionMode: 'automated' | 'managed'
  maxRuns?: number     // 0 or undefined = unlimited, >0 = auto-disable after N runs
  runCount?: number    // Current run count (persisted)
  cronJobId?: string   // OpenClaw cron job ID (when synced)
  content: string
  // Workflow v2
  dependsOn?: string[]   // Workflow IDs that must complete before this runs
  type?: 'once' | 'recurring' | 'conditional'  // Workflow lifecycle type
  progress?: number      // Current progress 0-100 (aggregated from agents)
  status?: 'idle' | 'running' | 'completed' | 'blocked'  // Current workflow status
  secretRequirements?: Array<{
    key: string
    label: string
    kind?: 'api_key' | 'token' | 'text' | 'id' | 'url'
    required?: boolean
    help?: string
    placeholder?: string
    sensitive?: boolean
  }>
}

export interface WorkflowParticipant {
  agentId: string
  agentName: string
  reason: string
}

export interface WorkflowExecutionParticipant {
  agentId: string
  agentName: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
  result?: any
  error?: string
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'completed' | 'failed' | 'paused'
  triggerType: 'scheduled' | 'manual' | 'agent'
  triggeredBy?: string
  participants: WorkflowExecutionParticipant[]
  logs: string[]
  inputs?: Record<string, string>  // Structured inputs parsed from workflow content
}

interface WorkflowRuntimeOverrides {
  openai?: string
  anthropic?: string
  gemini?: string
  ollamaBaseUrl?: string
}

export function detectParticipantReportedFailure(agentText: string): string | null {
  const text = agentText.trim()
  if (!text) return null

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    if (/^(FAIL|FAILED)\b/i.test(line)) {
      return line
    }
    if (/\b[A-Z0-9_-]+\s+FAIL\b/.test(line)) {
      return line
    }
  }

  return null
}

const GITHUB_RESULT_URL_REGEX = /https:\/\/github\.com\/[^\s)>\]]+\/(issues|pull)\/\d+[^\s)>\]]*/gi

export function extractGitHubResultLinks(agentText: string, limit = 3): string[] {
  const seen = new Set<string>()
  for (const match of agentText.match(GITHUB_RESULT_URL_REGEX) || []) {
    const normalized = match.replace(/[.,;!?]+$/, '')
    if (!seen.has(normalized)) {
      seen.add(normalized)
      if (seen.size >= limit) break
    }
  }
  return Array.from(seen)
}

export function summarizeGitHubResultLink(link: string): string {
  try {
    const parsed = new URL(link)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const owner = parts[0]
    const repo = parts[1]
    const kind = parts[2] === 'pull' ? 'PR' : 'issue'
    const number = parts[3]
    return `${owner}/${repo} ${kind} #${number}`
  } catch {
    return 'GitHub result'
  }
}

export function buildWorkflowSessionId(executionId: string, agentId: string): string {
  return `workflow-${executionId}-${agentId}`
}

const workflowAgentLocks = new Map<string, Promise<void>>()

async function withWorkflowAgentLock<T>(agentId: string, fn: () => Promise<T>): Promise<T> {
  const previous = workflowAgentLocks.get(agentId) || Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  workflowAgentLocks.set(agentId, previous.then(() => current))

  await previous
  try {
    return await fn()
  } finally {
    release()
    if (workflowAgentLocks.get(agentId) === current) {
      workflowAgentLocks.delete(agentId)
    }
  }
}

function reconcileWorkflowStateFromExecutions(workflow: Workflow): Workflow {
  if (workflow.status !== 'running') return workflow

  const latestExecution = listExecutions(workflow.id, 1).at(-1)
  if (!latestExecution) return workflow
  if (latestExecution.status === 'running') return workflow

  if (latestExecution.status === 'completed') {
    return {
      ...workflow,
      status: 'completed',
      progress: 100,
    }
  }

  if (latestExecution.status === 'failed') {
    return {
      ...workflow,
      status: 'blocked',
      progress: Math.max(workflow.progress || 0, 100),
    }
  }

  return workflow
}

// Helper: Generate ID from name
function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// Helper: Ensure unique ID
function ensureUniqueId(baseId: string): string {
  let id = baseId
  let counter = 2

  while (fs.existsSync(path.join(getWorkflowsDir(), `${id}.md`))) {
    id = `${baseId}-${counter}`
    counter++
  }

  return id
}

function getRecursiveDownstreamWorkflowIds(workflowId: string, workflows: Workflow[]): string[] {
  const dependentsById = new Map<string, string[]>()
  for (const workflow of workflows) {
    for (const dep of workflow.dependsOn || []) {
      const current = dependentsById.get(dep) || []
      current.push(workflow.id)
      dependentsById.set(dep, current)
    }
  }

  const visited = new Set<string>()
  const queue = [...(dependentsById.get(workflowId) || [])]

  while (queue.length > 0) {
    const nextId = queue.shift()!
    if (visited.has(nextId)) continue
    visited.add(nextId)
    for (const childId of dependentsById.get(nextId) || []) {
      if (!visited.has(childId)) queue.push(childId)
    }
  }

  return Array.from(visited)
}

// ============================================================================
// WORKFLOW.md Format — Parse and Serialize
// ============================================================================

/**
 * Parse a WORKFLOW.md string into a Workflow object.
 * Format: YAML frontmatter (metadata) + Markdown body (instructions).
 */
export function parseWorkflowMd(content: string, id?: string): Workflow | null {
  try {
    const { data, content: body } = matter(content)
    if (!data.name && !id) return null

    return {
      id: id || data.id || generateId(data.name || 'workflow'),
      name: data.name || id || '',
      description: data.description || '',
      schedule: data.schedule || 'manual',
      enabled: data.enabled !== false,
      targeting: {
        communities: data.targeting?.communities || [],
        groups: data.targeting?.groups || [],
        tags: data.targeting?.tags || [],
        agents: data.targeting?.agents || [],
      },
      created: data.created || new Date().toISOString(),
      modified: data.modified || new Date().toISOString(),
      author: data.author || '',
      owner: data.owner,
      executionMode: data.executionMode || 'automated',
      maxRuns: data.maxRuns || 0,
      runCount: data.runCount || 0,
      content: body.trim(),
      dependsOn: data.dependsOn,
      type: data.type,
      progress: data.progress,
      status: data.status,
      secretRequirements: data.secretRequirements,
    }
  } catch {
    return null
  }
}

/**
 * Convert a Workflow object to WORKFLOW.md format.
 */
export function workflowToMarkdown(workflow: Workflow): string {
  const fm: any = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    schedule: workflow.schedule,
    enabled: workflow.enabled,
    targeting: workflow.targeting,
    created: workflow.created,
    modified: workflow.modified,
    author: workflow.author,
    executionMode: workflow.executionMode,
  }
  if (workflow.owner) fm.owner = workflow.owner
  if (workflow.maxRuns) fm.maxRuns = workflow.maxRuns
  if (workflow.runCount) fm.runCount = workflow.runCount
  if (workflow.secretRequirements?.length) fm.secretRequirements = workflow.secretRequirements

  return matter.stringify(workflow.content || '', fm)
}

// Helper: Validate cron expression
export function validateCron(cronExpression: string): { valid: boolean; error?: string; humanReadable?: string } {
  try {
    const humanReadable = cronstrue.toString(cronExpression)
    return { valid: true, humanReadable }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }
}

// ========== OpenClaw Cron Integration ==========

import { execSync } from 'child_process'

function runCronCmd(args: string[]): { ok: boolean; output: string; error?: string } {
  try {
    const output = execSync(`openclaw cron ${args.join(' ')}`, {
      encoding: 'utf-8',
      timeout: 15000,
      env: safeEnv()
    }).trim()
    return { ok: true, output }
  } catch (err: any) {
    console.error(`[Cron] Failed: openclaw cron ${args.join(' ')}`, err.message)
    return { ok: false, output: '', error: err.message }
  }
}

/**
 * Sync a workflow to OpenClaw cron. Creates or updates the cron job.
 * Returns the cron job ID if successful.
 */
export function syncWorkflowToCron(workflow: Workflow, participants: string[]): { ok: boolean; cronJobId?: string; error?: string } {
  if (!workflow.enabled || workflow.schedule === 'manual') {
    // If disabled or manual, remove any existing cron job
    if (workflow.cronJobId) {
      removeCronJob(workflow.cronJobId)
    }
    return { ok: true }
  }

  if (participants.length === 0) {
    return { ok: false, error: 'No participants resolved for workflow' }
  }

  // Use first participant as the cron agent (OpenClaw cron targets one agent per job)
  // For multiagent workflows, we create one cron job per agent
  const results: string[] = []

  for (const agentId of participants) {
    const jobName = `clawmax-${workflow.id}-${agentId}`

    // Remove existing job if any
    const existingJobs = listCronJobs()
    const existing = existingJobs.find(j => j.name === jobName)
    if (existing) {
      removeCronJob(existing.id)
    }

    // Try to get agent's model from IDENTITY.md
    let agentModel = ''
    try {
      const { parseIdentity } = require('./workspace')
      const identity = parseIdentity(agentId)
      if (identity?.model) agentModel = identity.model
    } catch {}

    const args = [
      'add',
      '--name', jobName,
      '--agent', agentId,
      '--cron', `"${workflow.schedule}"`,
      '--message', JSON.stringify(workflow.content).slice(0, 2000),
      ...(agentModel ? ['--model', agentModel] : []),
      '--no-deliver',
      '--json'
    ]

    const result = runCronCmd(args)
    if (result.ok) {
      try {
        const parsed = JSON.parse(result.output)
        results.push(parsed.id || parsed.jobId || jobName)
      } catch {
        results.push(jobName)
      }
    } else {
      console.error(`[Cron] Failed to add job for agent ${agentId}:`, result.error)
    }
  }

  return { ok: results.length > 0, cronJobId: results.join(',') }
}

export function removeCronJob(jobId: string): void {
  // Handle comma-separated job IDs (multiagent workflows)
  for (const id of jobId.split(',')) {
    runCronCmd(['rm', id.trim()])
  }
}

export function enableCronJob(jobId: string): void {
  for (const id of jobId.split(',')) {
    runCronCmd(['enable', id.trim()])
  }
}

export function disableCronJob(jobId: string): void {
  for (const id of jobId.split(',')) {
    runCronCmd(['disable', id.trim()])
  }
}

function listCronJobs(): Array<{ id: string; name: string; enabled: boolean }> {
  const result = runCronCmd(['list', '--json', '--all'])
  if (!result.ok) return []
  try {
    const data = JSON.parse(result.output)
    return data.jobs || []
  } catch {
    return []
  }
}

// List all workflows
export function listWorkflows(): Workflow[] {
  const workflowsDir = getWorkflowsDir()
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true })
  }

  const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.md') && f !== 'README.md')
  const workflows: Workflow[] = []

  for (const file of files) {
    try {
      const workflow = getWorkflow(path.basename(file, '.md'))
      if (workflow) {
        workflows.push(workflow)
      }
    } catch (error) {
      console.error(`Error reading workflow ${file}:`, error)
    }
  }

  return workflows
}

// List workflow templates from templates directory
export function listWorkflowTemplates(): Workflow[] {
  const templatesDir = getTemplatesDir()
  if (!fs.existsSync(templatesDir)) {
    return []
  }

  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.md') && f !== 'README.md')
  const templates: Workflow[] = []

  for (const file of files) {
    const filePath = path.join(templatesDir, file)
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const { data, content: markdownContent } = matter(content)

      const template: Workflow = {
        id: path.basename(file, '.md'),
        name: data.name || path.basename(file, '.md'),
        description: data.description || '',
        schedule: data.schedule || '',
        enabled: false, // Templates are disabled by default
        targeting: {
        communities: data.targeting?.communities || [],
        groups: data.targeting?.groups || [],
        tags: data.targeting?.tags || [],
        agents: data.targeting?.agents || [],
      },
        created: data.created || '',
        modified: data.modified || '',
        author: data.author || 'system',
        owner: data.owner,
        executionMode: data.executionMode || 'automated',
        content: markdownContent.trim()
      }

      templates.push(template)
    } catch (error) {
      console.error(`Error reading workflow template ${file}:`, error)
    }
  }

  return templates
}

// Get single workflow
export function getWorkflow(id: string): Workflow | null {
  const filePath = path.join(getWorkflowsDir(), `${id}.md`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const { data, content } = matter(fileContent)

    return reconcileWorkflowStateFromExecutions({
      id,
      name: data.name || '',
      description: data.description || '',
      schedule: data.schedule || '',
      enabled: data.enabled !== false, // Default to true
      targeting: {
        communities: data.targeting?.communities || [],
        groups: data.targeting?.groups || [],
        tags: data.targeting?.tags || [],
        agents: data.targeting?.agents || [],
      },
      created: data.created || new Date().toISOString(),
      modified: data.modified || new Date().toISOString(),
      author: data.author || '',
      owner: data.owner,
      executionMode: data.executionMode || 'automated',
      maxRuns: data.maxRuns || 0,
      runCount: data.runCount || 0,
      cronJobId: data.cronJobId,
      content: content.trim(),
      dependsOn: data.dependsOn,
      type: data.type,
      progress: data.progress,
      status: data.status,
    })
  } catch (error) {
    console.error(`Error parsing workflow ${id}:`, error)
    return null
  }
}

// Create workflow
export function createWorkflow(data: Partial<Workflow>): { success: boolean; id?: string; errors?: string[]; error?: string } {
  try {
    // Validate against schema
    const schemaResult = validateWorkflow(data)
    if (!schemaResult.valid) {
      const messages = schemaResult.errors.map(e => `${e.field}: ${e.message}`)
      return { success: false, errors: messages, error: messages.join('; ') }
    }

    // Validate cron expression (semantic check beyond schema)
    // Allow empty or "manual" for on-demand workflows
    if (data.schedule && data.schedule !== 'manual' && data.schedule !== 'once') {
      const cronValidation = validateCron(data.schedule)
      if (!cronValidation.valid) {
        return { success: false, error: `Invalid cron expression: ${cronValidation.error}` }
      }
    }

    // Schema validation passed — these fields are guaranteed present
    const name = data.name!
    const description = data.description!
    const schedule = data.schedule!
    const content = data.content!

    // Use explicit ID if provided (e.g., from template import), otherwise generate from name
    const baseId = data.id || generateId(name)
    const id = ensureUniqueId(baseId)

    const now = new Date().toISOString()
    const workflow: Workflow = {
      id,
      name,
      description,
      schedule,
      enabled: data.enabled !== false,
      targeting: {
        communities: data.targeting?.communities || [],
        groups: data.targeting?.groups || [],
        tags: data.targeting?.tags || [],
        agents: data.targeting?.agents || [],
      },
      created: now,
      modified: now,
      author: data.author || 'unknown',
      owner: data.owner,
      executionMode: data.executionMode || 'automated',
      maxRuns: data.maxRuns || 0,
      runCount: 0,
      content,
      dependsOn: data.dependsOn,
      type: data.type,
      secretRequirements: (data as any).secretRequirements,
    }

    // Create file with YAML frontmatter
    const frontmatter: Record<string, any> = {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      schedule: workflow.schedule,
      enabled: workflow.enabled,
      targeting: workflow.targeting,
      created: workflow.created,
      modified: workflow.modified,
      author: workflow.author,
      ...(workflow.owner && { owner: workflow.owner }),
      executionMode: workflow.executionMode,
      ...(workflow.maxRuns && workflow.maxRuns > 0 && { maxRuns: workflow.maxRuns }),
      ...(workflow.runCount && workflow.runCount > 0 && { runCount: workflow.runCount }),
      ...(workflow.dependsOn?.length && { dependsOn: workflow.dependsOn }),
      ...(workflow.type && { type: workflow.type }),
      ...(workflow.secretRequirements?.length && { secretRequirements: workflow.secretRequirements }),
    }
    const fileContent = matter.stringify(workflow.content, frontmatter)

    const wfDir = getWorkflowsDir()
    fs.mkdirSync(wfDir, { recursive: true })
    const filePath = path.join(wfDir, `${id}.md`)
    fs.writeFileSync(filePath, fileContent, 'utf-8')

    return { success: true, id }
  } catch (error: any) {
    console.error('Error creating workflow:', error)
    return { success: false, error: error.message }
  }
}

// Update workflow
export function updateWorkflow(id: string, data: Partial<Workflow>): { success: boolean; errors?: string[]; error?: string } {
  try {
    const existing = getWorkflow(id)
    if (!existing) {
      return { success: false, error: 'Workflow not found' }
    }

    // Merge with existing to validate the full resulting object
    const merged = { ...existing, ...data, id: existing.id, created: existing.created }
    const schemaResult = validateWorkflow(merged)
    if (!schemaResult.valid) {
      const messages = schemaResult.errors.map(e => `${e.field}: ${e.message}`)
      return { success: false, errors: messages, error: messages.join('; ') }
    }

    // Validate cron expression if provided (semantic check beyond schema)
    if (data.schedule) {
      const cronValidation = validateCron(data.schedule)
      if (!cronValidation.valid) {
        return { success: false, error: `Invalid cron expression: ${cronValidation.error}` }
      }
    }

    const updated: Workflow = {
      ...existing,
      ...data,
      id: existing.id, // ID cannot be changed
      created: existing.created, // Created timestamp cannot be changed
      modified: new Date().toISOString()
    }

    // Create file with YAML frontmatter
    const updateFrontmatter: Record<string, any> = {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      schedule: updated.schedule,
      enabled: updated.enabled,
      targeting: updated.targeting,
      created: updated.created,
      modified: updated.modified,
      author: updated.author,
      ...(updated.owner && { owner: updated.owner }),
      executionMode: updated.executionMode,
      ...((updated.maxRuns !== undefined && updated.maxRuns > 0) && { maxRuns: updated.maxRuns }),
      ...((updated.runCount !== undefined && updated.runCount > 0) && { runCount: updated.runCount }),
      ...(updated.cronJobId && { cronJobId: updated.cronJobId }),
      ...(updated.dependsOn?.length && { dependsOn: updated.dependsOn }),
      ...(updated.type && { type: updated.type }),
      ...(updated.progress !== undefined && updated.progress > 0 && { progress: updated.progress }),
      ...(updated.status && updated.status !== 'idle' && { status: updated.status }),
      ...(updated.secretRequirements?.length && { secretRequirements: updated.secretRequirements }),
    }
    const fileContent = matter.stringify(updated.content, updateFrontmatter)

    const filePath = path.join(getWorkflowsDir(), `${id}.md`)
    fs.writeFileSync(filePath, fileContent, 'utf-8')

    return { success: true }
  } catch (error: any) {
    console.error('Error updating workflow:', error)
    return { success: false, error: error.message }
  }
}

// Delete workflow
export function deleteWorkflow(id: string): { success: boolean; error?: string } {
  try {
    const filePath = path.join(getWorkflowsDir(), `${id}.md`)

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Workflow not found' }
    }

    fs.unlinkSync(filePath)

    // Also delete execution history
    const executionDir = path.join(getExecutionsDir(), id)
    if (fs.existsSync(executionDir)) {
      fs.rmSync(executionDir, { recursive: true })
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error deleting workflow:', error)
    return { success: false, error: error.message }
  }
}

// Resolve participants
export function resolveParticipants(workflow: Workflow, agents: any[]): WorkflowParticipant[] {
  const participants: WorkflowParticipant[] = []
  const directAgentIds = new Set(workflow.targeting.agents || [])
  const directTags = new Set(workflow.targeting.tags || [])
  const ownerId = workflow.owner?.trim()
  const hasDirectExecutionTargets = directAgentIds.size > 0 || directTags.size > 0 || !!ownerId

  for (const agent of agents) {
    const reasons: string[] = []

    // Owner is the most explicit execution target and should not require
    // duplicating the id into targeting.agents for lead-owned workflows.
    if (ownerId && agent.id === ownerId) {
      reasons.push(`owner:${ownerId}`)
    }

    // Explicit tags are treated as execution targets.
    if (directTags.size > 0 && agent.tags) {
      for (const tag of agent.tags) {
        if (directTags.has(tag)) {
          reasons.push(`tag:${tag}`)
        }
      }
    }

    // Explicit agent ids are also execution targets.
    if (directAgentIds.has(agent.id)) {
      reasons.push(`agent:${agent.id}`)
    }

    // Groups/communities are primarily output channels. Preserve them as
    // execution targeting only when a workflow does not declare clearer
    // execution targets via owner, agents, or tags.
    if (!hasDirectExecutionTargets) {
      if (workflow.targeting.communities.length > 0 && agent.communities) {
        for (const community of agent.communities) {
          const communityName = typeof community === 'string' ? community : community.name
          if (workflow.targeting.communities.includes(communityName)) {
            reasons.push(`community:${communityName}`)
          }
        }
      }

      if (workflow.targeting.groups.length > 0 && agent.groups) {
        for (const group of agent.groups) {
          const groupName = typeof group === 'string' ? group : group.name
          if (workflow.targeting.groups.includes(groupName)) {
            reasons.push(`group:${groupName}`)
          }
        }
      }
    }

    if (reasons.length > 0) {
      participants.push({
        agentId: agent.id,
        agentName: agent.name || agent.id,
        reason: reasons.join(', ')
      })
    }
  }

  return participants
}

// List executions for a workflow
export function listExecutions(workflowId: string, limit: number = 10): WorkflowExecution[] {
  const executionDir = path.join(getExecutionsDir(), workflowId)

  if (!fs.existsSync(executionDir)) {
    return []
  }

  const files = fs.readdirSync(executionDir)
    .filter(f => f.endsWith('.json'))
    .sort() // Alphabetical order (chronological)
    .slice(-limit) // Take last N (most recent executions, oldest to newest)

  const executions: WorkflowExecution[] = []

  for (const file of files) {
    try {
      const filePath = path.join(executionDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const execution = JSON.parse(content)
      executions.push(execution)
    } catch (error) {
      console.error(`Error reading execution ${file}:`, error)
    }
  }

  return executions
}

// Get single execution
export function getExecution(workflowId: string, executionId: string): WorkflowExecution | null {
  const filePath = path.join(getExecutionsDir(), workflowId, `${executionId}.json`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch (error) {
    console.error(`Error reading execution ${executionId}:`, error)
    return null
  }
}

// Trigger workflow manually
export function triggerWorkflow(workflowId: string, options?: {
  manual?: boolean
  byok?: WorkflowRuntimeOverrides
  secrets?: Record<string, string>
  inputs?: Record<string, string>
  actor?: {
    userId?: string
    login?: string
    email?: string | null
  }
}): { success: boolean; executionId?: string; error?: string } {
  try {
    // Check workspace budget before executing
    const budgetBlock = checkBudgetBlock({ operation: 'workflow' })
    if (budgetBlock) {
      // Create budget notification
      const { createNotification } = require('./notifications')
      createNotification({
        type: 'cost-exceeded',
        title: 'Workflow blocked by budget',
        message: budgetBlock,
        entityId: workflowId,
        entityType: 'workflow',
        fingerprint: `budget-block:${workflowId}:${Date.now()}`,
        workflowId,
      })
      return { success: false, error: budgetBlock }
    }

    // Check if workflow exists
    const workflow = getWorkflow(workflowId)
    if (!workflow) {
      return { success: false, error: 'Workflow not found' }
    }

    // Check maxRuns limit (skip for manual triggers)
    if (!options?.manual && workflow.maxRuns && workflow.maxRuns > 0) {
      const currentCount = workflow.runCount || 0
      if (currentCount >= workflow.maxRuns) {
        updateWorkflow(workflowId, { enabled: false })
        return { success: false, error: `Workflow reached max runs limit (${workflow.maxRuns}). Workflow has been disabled.` }
      }
    }

    // Increment run count + mark as running + reset progress
    const newRunCount = (workflow.runCount || 0) + 1
    updateWorkflow(workflowId, { runCount: newRunCount, status: 'running', progress: 0 } as any)

    // Reset all downstream dependent workflows to idle for a clean rerun
    const allWorkflows = listWorkflows()
    const downstreamWorkflowIds = getRecursiveDownstreamWorkflowIds(workflowId, allWorkflows)
    for (const downstreamId of downstreamWorkflowIds) {
      updateWorkflow(downstreamId, { status: 'idle', progress: 0 } as any)
      console.log(`[Workflow] Reset downstream ${downstreamId} to idle (depends on re-triggered ${workflowId})`)
    }

    // Check if this run will hit the limit — disable after this run
    if (workflow.maxRuns && workflow.maxRuns > 0 && newRunCount >= workflow.maxRuns) {
      console.log(`[Workflow] ${workflowId} reached maxRuns (${workflow.maxRuns}), will disable after this run`)
      // Schedule disable after execution completes
      setTimeout(() => {
        updateWorkflow(workflowId, { enabled: false })
        if (workflow.cronJobId) {
          disableCronJob(workflow.cronJobId)
        }
      }, 5000)
    }

    // Generate execution ID
    const executionId = randomUUID()

    // Create executions directory for workflow if it doesn't exist
    const workflowExecutionDir = path.join(getExecutionsDir(), workflowId)
    if (!fs.existsSync(workflowExecutionDir)) {
      fs.mkdirSync(workflowExecutionDir, { recursive: true })
    }

    // Resolve participants upfront
    const { listAgents } = require('./workspace')
    const agents = listAgents()
    const workflowParticipants = resolveParticipants(workflow, agents)

    // Convert to execution participants with pending status
    const executionParticipants: WorkflowExecutionParticipant[] = workflowParticipants.map(p => ({
      agentId: p.agentId,
      agentName: p.agentName,
      status: 'pending' as const
    }))

    const integrationDefaults = readWorkspaceIntegrationConfig()

    // Persist only explicit workflow/user-provided run inputs.
    // Workspace integration defaults still flow into runtime context, but should not
    // appear as editable run inputs on unrelated workflows.
    const executionInputs: Record<string, string> = {}
    const content = workflow.content || ''
    const fieldRegex = /^-\s+\*\*(.+?):\*\*\s+(.+)$/gm
    let fieldMatch
    while ((fieldMatch = fieldRegex.exec(content)) !== null) {
      const label = fieldMatch[1].trim()
      const value = fieldMatch[2].trim()
      if (value && !value.startsWith('[')) {
        executionInputs[label] = value
      }
    }
    const runInstructions = typeof options?.inputs?.['Run Instructions'] === 'string'
      ? options.inputs['Run Instructions'].trim()
      : ''
    if (options?.inputs) {
      for (const [key, value] of Object.entries(options.inputs)) {
        if (typeof value === 'string' && value.trim()) {
          executionInputs[key] = value.trim()
        }
      }
    }
    if (options?.secrets) {
      for (const [key, value] of Object.entries(options.secrets)) {
        if (typeof value === 'string' && value.trim()) {
          executionInputs[key] = value.trim()
        }
      }
    }

    const blaxelDefaults = integrationDefaults.partners?.blaxel || {}
    const redisDefaults = integrationDefaults.partners?.redis || {}
    const workflowSignalsPartner = (partner: 'github' | 'senso' | 'blaxel' | 'redis') => {
      const text = (workflow.content || '').toLowerCase()
      const requirements = workflow.secretRequirements || []
      const requirementText = requirements
        .map((requirement) => `${requirement.key || ''} ${requirement.label || ''} ${requirement.help || ''}`)
        .join(' ')
        .toLowerCase()
      const haystack = `${text}\n${requirementText}`
      switch (partner) {
        case 'github':
          return /github|repo|pull request|issue\b|gh\b/.test(haystack)
        case 'senso':
          return /senso|context label|context folder|shared context/.test(haystack)
        case 'blaxel':
          return /blaxel|sandbox|project id|deploy/.test(haystack)
        case 'redis':
          return /redis|namespace|memory layer|memory store/.test(haystack)
        default:
          return false
      }
    }
    const runtimeContextLines: string[] = []
    if (workflowSignalsPartner('github') && integrationDefaults.githubDefaultRepo && !content.includes(integrationDefaults.githubDefaultRepo)) {
      runtimeContextLines.push(`- GitHub repo: \`${integrationDefaults.githubDefaultRepo}\``)
    }
    if (workflowSignalsPartner('senso') && integrationDefaults.sensoContextLabel && !content.includes(integrationDefaults.sensoContextLabel)) {
      runtimeContextLines.push(`- Senso context: \`${integrationDefaults.sensoContextLabel}\``)
    }
    if (workflowSignalsPartner('blaxel') && typeof blaxelDefaults.projectId === 'string' && blaxelDefaults.projectId.trim() && !content.includes(blaxelDefaults.projectId.trim())) {
      runtimeContextLines.push(`- Blaxel project: \`${blaxelDefaults.projectId.trim()}\``)
    }
    if (workflowSignalsPartner('blaxel') && typeof blaxelDefaults.defaultSandbox === 'string' && blaxelDefaults.defaultSandbox.trim() && !content.includes(blaxelDefaults.defaultSandbox.trim())) {
      runtimeContextLines.push(`- Blaxel sandbox: \`${blaxelDefaults.defaultSandbox.trim()}\``)
    }
    if (workflowSignalsPartner('blaxel') && typeof blaxelDefaults.region === 'string' && blaxelDefaults.region.trim() && !content.includes(blaxelDefaults.region.trim())) {
      runtimeContextLines.push(`- Blaxel region: \`${blaxelDefaults.region.trim()}\``)
    }
    if (workflowSignalsPartner('redis') && typeof redisDefaults.url === 'string' && redisDefaults.url.trim() && !content.includes(redisDefaults.url.trim())) {
      runtimeContextLines.push(`- Redis URL: \`${redisDefaults.url.trim()}\``)
    }
    if (workflowSignalsPartner('redis') && typeof redisDefaults.namespace === 'string' && redisDefaults.namespace.trim() && !content.includes(redisDefaults.namespace.trim())) {
      runtimeContextLines.push(`- Redis namespace: \`${redisDefaults.namespace.trim()}\``)
    }
    if (workflow.secretRequirements?.length && options?.secrets) {
      for (const requirement of workflow.secretRequirements) {
        const value = options.secrets[requirement.key]
        if (!value?.trim()) continue
        if (requirement.sensitive) {
          runtimeContextLines.push(`- ${requirement.label}: provided securely for this run`)
        } else {
          runtimeContextLines.push(`- ${requirement.label}: \`${value.trim()}\``)
        }
      }
    }
    if ((workflow.targeting.groups || []).length > 0) {
      runtimeContextLines.push(`- Current workflow group channel(s): ${(workflow.targeting.groups || []).join(', ')}`)
      runtimeContextLines.push('- Use the current workflow group channel for replies and reports in this run')
      runtimeContextLines.push('- Do not create or look up separate session labels unless explicitly configured in the workspace')
      runtimeContextLines.push('- ClawMax will post your final response back into the current workflow group channel automatically')
      runtimeContextLines.push('- Do not treat missing external channel plugins or messaging transports as a failure for this workflow unless the workflow explicitly asks you to test those transports')
    }
    if ((workflow.targeting.communities || []).length > 0) {
      runtimeContextLines.push(`- Current workflow community channel(s): ${(workflow.targeting.communities || []).join(', ')}`)
      runtimeContextLines.push('- ClawMax will post your final response back into the current workflow community channel automatically')
      runtimeContextLines.push('- Do not treat missing external channel plugins or messaging transports as a failure for this workflow unless the workflow explicitly asks you to test those transports')
    }
    if (runInstructions) {
      runtimeContextLines.push(`- Run-specific instructions: ${runInstructions}`)
      runtimeContextLines.push('- Treat the run-specific instructions as the highest-priority adjustment for this execution only')
    }
    const executionMessage = runtimeContextLines.length > 0
      ? `${workflow.content || 'Execute workflow'}\n\n---\nWorkspace Integration Defaults:\n${runtimeContextLines.join('\n')}\n---\n`
      : (workflow.content || 'Execute workflow')

    // Create execution record with participants and inputs
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      startedAt: new Date().toISOString(),
      status: 'running',
      triggerType: 'manual',
      participants: executionParticipants,
      logs: [`Workflow triggered at ${new Date().toISOString()}`, `Targeting ${executionParticipants.length} agent(s)`],
      inputs: Object.keys(executionInputs).length > 0 ? executionInputs : undefined,
    }

    // Write execution file
    const executionFilePath = path.join(workflowExecutionDir, `${executionId}.json`)
    fs.writeFileSync(executionFilePath, JSON.stringify(execution, null, 2), 'utf-8')

    // Run workflow by calling each participant agent directly
    const executeAsync = async () => {
      const executionFilePath = path.join(workflowExecutionDir, `${executionId}.json`)
      const executionEnv = userExecutionEnv({
        openai: options?.byok?.openai,
        anthropic: options?.byok?.anthropic,
        gemini: options?.byok?.gemini,
        ollamaBaseUrl: options?.byok?.ollamaBaseUrl || integrationDefaults.ollamaBaseUrl,
      })
      const persistExecution = () => {
        try {
          fs.mkdirSync(path.dirname(executionFilePath), { recursive: true })
          fs.writeFileSync(executionFilePath, JSON.stringify(execution, null, 2), 'utf-8')
        } catch (error: any) {
          if (error?.code !== 'ENOENT') throw error
        }
      }
      const updateAggregateProgress = () => {
        const completedOrFailed = execution.participants.filter(p => p.status === 'completed' || p.status === 'failed').length
        const totalCount = execution.participants.length
        const inFlight = execution.participants.filter(p => p.status === 'running').length
        let progress = totalCount > 0 ? Math.round((completedOrFailed / totalCount) * 100) : 0
        if (inFlight > 0) {
          progress = Math.max(progress, Math.min(95, 10 + completedOrFailed * 15))
        }
        updateWorkflow(workflowId, { progress } as any)
      }

      const runParticipant = async (participant: WorkflowExecutionParticipant) => {
        try {
          participant.status = 'running' as any
          participant.startedAt = new Date().toISOString()
          updateAggregateProgress()
          persistExecution()

          // Call agent via CLI
          const agentResponse = await withWorkflowAgentLock(participant.agentId, () => new Promise<string>((resolve, reject) => {
            const resolvedAgent = resolveAgentExecutionConfig(participant.agentId)
            const hasOllamaPath = !!(executionEnv.OLLAMA_BASE_URL || integrationDefaults.ollamaDefaultModel)
            if (resolvedAgent.provider === 'ollama' && !hasOllamaPath) {
              reject(new Error(`Agent ${participant.agentId} is configured for ${resolvedAgent.model || 'ollama'}, but no Ollama runtime is configured`))
              return
            }
            const useLocal = !isGatewayRunning().running
            const sessionId = buildWorkflowSessionId(executionId, participant.agentId)
            const args = ['agent', '--agent', participant.agentId, '--session-id', sessionId, '--message', executionMessage, '--json', ...(useLocal ? ['--local'] : [])]
            withTemporaryAgentAuthProfiles(participant.agentId, {
              openai: executionEnv.OPENAI_API_KEY,
              anthropic: executionEnv.ANTHROPIC_API_KEY,
              gemini: executionEnv.GEMINI_API_KEY,
            }, resolvedAgent.model, resolvedAgent.provider, async () => {
              await new Promise<void>((innerResolve) => {
                const proc = spawn('openclaw', args, { env: executionEnv })
                let stdout = ''
                let stderr = ''
                const timer = setTimeout(() => { proc.kill(); reject(new Error('Agent timeout')) }, 300000) // 5 min

                let progressTicks = 0
                proc.stdout.on('data', (d: Buffer) => {
                  stdout += d.toString()
                  // Mark visible forward motion once work is actually streaming.
                  progressTicks++
                  const estimated = Math.min(20 + progressTicks * 10, 90)
                  const current = getWorkflow(workflowId)?.progress || 0
                  updateWorkflow(workflowId, { progress: Math.max(current, estimated) } as any)
                })
                proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
                proc.on('close', (code: number) => {
                  clearTimeout(timer)
                  if (code !== 0 && !stdout) {
                    reject(new Error(`Agent failed: ${stderr.slice(0, 200)}`))
                    innerResolve()
                    return
                  }
                  try {
                    const result = JSON.parse(stdout)
                    const text = result?.payloads?.[0]?.text || result?.result?.payloads?.[0]?.text || ''
                    // Extract meta for tracing
                    const meta = result?.result?.meta || result?.meta || {}
                    const agentMeta = meta.agentMeta || {}
                    resolve({ text, meta: agentMeta, durationMs: meta.durationMs } as any)
                  } catch {
                    resolve({ text: stdout.trim(), meta: {}, durationMs: 0 } as any)
                  }
                  innerResolve()
                })
                proc.on('error', (err) => {
                  reject(err)
                  innerResolve()
                })
              })
            }).catch(reject)
          }))

          const agentResult = agentResponse as any
          const agentText = agentResult.text || ''
          const agentMeta = agentResult.meta || {}
          const reportedFailure = detectParticipantReportedFailure(agentText)

          participant.status = reportedFailure ? 'failed' as any : 'completed' as any
          ;(participant as any).response = agentText
          if (reportedFailure) {
            ;(participant as any).error = `Agent reported failure: ${reportedFailure}`
          }
          participant.completedAt = new Date().toISOString()
          execution.logs.push(
            reportedFailure
              ? `Agent ${participant.agentId} reported failure: ${reportedFailure}`
              : `Agent ${participant.agentId} completed: ${agentText.slice(0, 100)}`
          )

          // Detect blockers/questions from agent output
          const { createNotification } = require('./notifications')
          const textLower = agentText.toLowerCase()
          const isQuestion = /\?\s*$/.test(agentText.trim()) || /what should|which (one|option)|ready for.*planning|need.*decision|waiting for|blocked by|please (choose|decide|confirm|approve)/i.test(agentText)
          const isError = /error|failed|cannot|unable to|permission denied|access denied|rate limit/i.test(textLower) && agentText.length < 500

          if (isQuestion) {
            createNotification({
              type: 'agent-needs-decision',
              title: `${participant.agentId} needs input`,
              message: agentText.slice(-200),
              entityId: participant.agentId,
              entityType: 'agent',
              fingerprint: `agent-question:${workflowId}:${participant.agentId}:${execution.id}`,
              blockerType: 'input',
              workflowId,
            })
            console.log(`[DAG] Agent ${participant.agentId} asked a question — notification created`)
          } else if (isError) {
            createNotification({
              type: 'agent-error',
              title: `${participant.agentId} reported an error`,
              message: agentText.slice(0, 300),
              entityId: participant.agentId,
              entityType: 'agent',
              fingerprint: `agent-error:${workflowId}:${participant.agentId}:${execution.id}`,
              workflowId,
            })
          } else if (reportedFailure) {
            createNotification({
              type: 'agent-error',
              title: `${participant.agentId} reported a failed check`,
              message: reportedFailure,
              entityId: participant.agentId,
              entityType: 'agent',
              fingerprint: `agent-fail:${workflowId}:${participant.agentId}:${execution.id}`,
              workflowId,
            })
          }

          for (const githubLink of extractGitHubResultLinks(agentText)) {
            createNotification({
              type: 'artifact-update',
              title: `${participant.agentId} produced ${summarizeGitHubResultLink(githubLink)}`,
              message: `GitHub result from ${participant.agentId}: ${githubLink}`,
              entityId: participant.agentId,
              entityType: 'agent',
              fingerprint: `github-result:${workflowId}:${participant.agentId}:${githubLink}`,
              workflowId,
              artifactUrl: githubLink,
            })
          }

          // Update intermediate progress based on % of participants done
          updateAggregateProgress()
          persistExecution()

          // Trace individual agent call to Opik
          traceAgentChat(participant.agentId, executionMessage, agentText, {
            model: agentMeta.model,
            provider: agentMeta.provider,
            inputTokens: agentMeta.usage?.input,
            outputTokens: agentMeta.usage?.output,
            cacheReadTokens: agentMeta.usage?.cacheRead,
            durationMs: agentResult.durationMs,
            workflowId,
            workflowName: workflow.name,
            actorUserId: options?.actor?.userId,
            actorLogin: options?.actor?.login,
            actorEmail: options?.actor?.email,
          })

          // Post response to targeted groups/communities
          if (agentText && agentText.trim()) {
            const targeting = workflow.targeting || {}
            for (const group of (targeting.groups || [])) {
              addMessage('group', group, {
                from: participant.agentId,
                content: agentText,
                mentions: []
              })
            }
            for (const community of (targeting.communities || [])) {
              addMessage('community', community, {
                from: participant.agentId,
                content: agentText,
                mentions: []
              })
            }
          }
        } catch (err: any) {
          participant.status = 'failed' as any
          ;(participant as any).error = err.message
          participant.completedAt = new Date().toISOString()
          execution.logs.push(`Agent ${participant.agentId} failed: ${err.message}`)

          const completedCount = execution.participants.filter(p => p.status === 'completed').length
          const failedCount = execution.participants.filter(p => p.status === 'failed').length
          const progress = Math.round(((completedCount + failedCount) / Math.max(execution.participants.length, 1)) * 100)
          updateWorkflow(workflowId, {
            status: 'blocked',
            progress,
          } as any)
          persistExecution()
        }
      }

      await Promise.all(executionParticipants.map(runParticipant))

      // Mark execution complete
      execution.status = execution.participants.some(p => p.status === 'failed') ? 'failed' : 'completed'
      execution.completedAt = new Date().toISOString()
      execution.logs.push(`Workflow completed at ${execution.completedAt}`)
      persistExecution()
      updateWorkflow(workflowId, {
        status: execution.status === 'completed' ? 'completed' : 'blocked',
        progress: 100,
      } as any)

      // Auto-advance DAG: mark workflow completed and trigger ready dependents
      if (execution.status === 'completed') {
        const { readyToRun } = completeWorkflow(workflowId)
        if (readyToRun.length > 0) {
          execution.logs.push(`DAG: unlocked ${readyToRun.join(', ')}`)
          persistExecution()

          // Auto-trigger enabled workflows with BYOK keys passed through
          for (const nextId of readyToRun) {
            const nextWf = getWorkflow(nextId)
            if (nextWf?.enabled) {
              console.log(`[DAG] Auto-triggering ${nextId}`)
              triggerWorkflow(nextId, { manual: false, byok: options?.byok })
              updateWorkflow(nextId, { status: 'running' } as any)
            }
          }
        }
      } else {
        // Failed — update workflow status
        updateWorkflow(workflowId, { status: 'blocked' } as any)
        // Create notification for failure
        const { createNotification } = require('./notifications')
        createNotification({
          type: 'workflow-failed',
          title: `${workflow.name} failed`,
          message: execution.logs.slice(-1)[0] || 'Workflow execution failed',
          entityId: workflowId,
          entityType: 'workflow',
          fingerprint: `wf-failed:${workflowId}:${execution.id}`,
          workflowId,
        })
      }

      // Trace to Opik
      const execDuration = new Date(execution.completedAt).getTime() - new Date(execution.startedAt).getTime()
      traceWorkflowExecution(workflowId, workflow.name, execution.participants.map(p => ({
        agentId: p.agentId,
        status: p.status,
        durationMs: p.completedAt && p.startedAt ? new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime() : undefined,
      })), {
        triggerType: options?.manual ? 'manual' : 'scheduled',
        totalDurationMs: execDuration,
        status: execution.status,
        actorUserId: options?.actor?.userId,
        actorLogin: options?.actor?.login,
        actorEmail: options?.actor?.email,
      })
    }

    // Fire and forget
    executeAsync().catch(err => console.error('Workflow execution error:', err))

    return { success: true, executionId }
  } catch (error: any) {
    console.error('Error triggering workflow:', error)
    return { success: false, error: error.message }
  }
}

// ============================================================================
// Workflow v2: DAG Execution Engine
// ============================================================================

/**
 * Check if a workflow's dependencies are all met (completed).
 */
export function areDependenciesMet(workflowId: string): { met: boolean; pending: string[] } {
  const workflow = getWorkflow(workflowId)
  if (!workflow?.dependsOn?.length) return { met: true, pending: [] }

  const pending: string[] = []
  for (const depId of workflow.dependsOn) {
    const dep = getWorkflow(depId)
    if (!dep || dep.status !== 'completed') {
      pending.push(depId)
    }
  }
  return { met: pending.length === 0, pending }
}

/**
 * Mark a workflow as completed and advance the DAG.
 * Finds all workflows that depend on this one and checks if their deps are now met.
 * Returns the list of workflows that are now ready to run.
 */
export function completeWorkflow(workflowId: string): { readyToRun: string[] } {
  updateWorkflow(workflowId, { status: 'completed', progress: 100 } as any)
  console.log(`[DAG] Workflow ${workflowId} completed`)

  // Find all workflows that depend on this one
  const allWorkflows = listWorkflows()
  const readyToRun: string[] = []

  for (const wf of allWorkflows) {
    if (!wf.dependsOn?.includes(workflowId)) continue
    if (wf.status === 'running') continue // skip already-running, but allow re-run of completed

    const { met } = areDependenciesMet(wf.id)
    if (met) {
      readyToRun.push(wf.id)
      console.log(`[DAG] Workflow ${wf.id} dependencies met — ready to run`)
    }
  }

  return { readyToRun }
}

/**
 * Get the full DAG status — all workflows with their dependency state.
 */
export function getDAGStatus(): Array<{
  id: string
  name: string
  status: string
  progress: number
  dependsOn: string[]
  dependenciesMet: boolean
  pendingDeps: string[]
  type: string
}> {
  const workflows = listWorkflows()
  return workflows.map(wf => {
    const { met, pending } = areDependenciesMet(wf.id)
    return {
      id: wf.id,
      name: wf.name,
      status: wf.status || 'idle',
      progress: wf.progress || 0,
      dependsOn: wf.dependsOn || [],
      dependenciesMet: met,
      pendingDeps: pending,
      type: wf.type || 'recurring',
    }
  })
}
