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
import { checkBudgetBlock } from './budget'
import { validateWorkflow } from './validator'

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
  // For multi-agent workflows, we create one cron job per agent
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
  // Handle comma-separated job IDs (multi-agent workflows)
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
        targeting: data.targeting || { communities: [], groups: [], tags: [], agents: [] },
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

    return {
      id,
      name: data.name || '',
      description: data.description || '',
      schedule: data.schedule || '',
      enabled: data.enabled !== false, // Default to true
      targeting: data.targeting || { communities: [], groups: [], tags: [], agents: [] },
      created: data.created || new Date().toISOString(),
      modified: data.modified || new Date().toISOString(),
      author: data.author || '',
      owner: data.owner,
      executionMode: data.executionMode || 'automated',
      maxRuns: data.maxRuns || 0,
      runCount: data.runCount || 0,
      cronJobId: data.cronJobId,
      content: content.trim()
    }
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
    const cronValidation = validateCron(data.schedule!)
    if (!cronValidation.valid) {
      return { success: false, error: `Invalid cron expression: ${cronValidation.error}` }
    }

    // Schema validation passed — these fields are guaranteed present
    const name = data.name!
    const description = data.description!
    const schedule = data.schedule!
    const content = data.content!

    // Generate and ensure unique ID
    const baseId = generateId(name)
    const id = ensureUniqueId(baseId)

    const now = new Date().toISOString()
    const workflow: Workflow = {
      id,
      name,
      description,
      schedule,
      enabled: data.enabled !== false,
      targeting: data.targeting || { communities: [], groups: [], tags: [], agents: [] },
      created: now,
      modified: now,
      author: data.author || 'unknown',
      owner: data.owner,
      executionMode: data.executionMode || 'automated',
      maxRuns: data.maxRuns || 0,
      runCount: 0,
      content
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
    }
    const fileContent = matter.stringify(workflow.content, frontmatter)

    const filePath = path.join(getWorkflowsDir(), `${id}.md`)
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

  for (const agent of agents) {
    const reasons: string[] = []

    // Check communities
    if (workflow.targeting.communities.length > 0 && agent.communities) {
      for (const community of agent.communities) {
        const communityName = typeof community === 'string' ? community : community.name
        if (workflow.targeting.communities.includes(communityName)) {
          reasons.push(`community:${communityName}`)
        }
      }
    }

    // Check groups
    if (workflow.targeting.groups.length > 0 && agent.groups) {
      for (const group of agent.groups) {
        const groupName = typeof group === 'string' ? group : group.name
        if (workflow.targeting.groups.includes(groupName)) {
          reasons.push(`group:${groupName}`)
        }
      }
    }

    // Check tags
    if (workflow.targeting.tags.length > 0 && agent.tags) {
      for (const tag of agent.tags) {
        if (workflow.targeting.tags.includes(tag)) {
          reasons.push(`tag:${tag}`)
        }
      }
    }

    // Check specific agent IDs
    if (workflow.targeting.agents.length > 0) {
      if (workflow.targeting.agents.includes(agent.id)) {
        reasons.push(`agent:${agent.id}`)
      }
    }

    // If matched for any reason, include
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
  byok?: { openai?: string; anthropic?: string; nebius?: string }
}): { success: boolean; executionId?: string; error?: string } {
  try {
    // Check workspace budget before executing
    const budgetBlock = checkBudgetBlock()
    if (budgetBlock) {
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

    // Increment run count
    const newRunCount = (workflow.runCount || 0) + 1
    updateWorkflow(workflowId, { runCount: newRunCount })

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

    // Create execution record with participants
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      startedAt: new Date().toISOString(),
      status: 'running',
      triggerType: 'manual',
      participants: executionParticipants,
      logs: [`Workflow triggered at ${new Date().toISOString()}`, `Targeting ${executionParticipants.length} agent(s)`]
    }

    // Write execution file
    const executionFilePath = path.join(workflowExecutionDir, `${executionId}.json`)
    fs.writeFileSync(executionFilePath, JSON.stringify(execution, null, 2), 'utf-8')

    // Run workflow by calling each participant agent directly
    const executeAsync = async () => {
      const executionFilePath = path.join(workflowExecutionDir, `${executionId}.json`)
      const executionEnv = userExecutionEnv(options?.byok)

      for (const participant of executionParticipants) {
        try {
          participant.status = 'running' as any
          fs.writeFileSync(executionFilePath, JSON.stringify(execution, null, 2), 'utf-8')

          // Call agent via CLI
          const agentResponse = await new Promise<string>((resolve, reject) => {
            const args = ['agent', '--agent', participant.agentId, '--message', workflow.content || 'Execute workflow', '--json']
            const proc = spawn('openclaw', args, { env: executionEnv })
            let stdout = ''
            let stderr = ''
            const timer = setTimeout(() => { proc.kill(); reject(new Error('Agent timeout')) }, 300000) // 5 min

            proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
            proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
            proc.on('close', (code: number) => {
              clearTimeout(timer)
              if (code !== 0 && !stdout) {
                reject(new Error(`Agent failed: ${stderr.slice(0, 200)}`))
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
            })
          })

          const agentResult = agentResponse as any
          const agentText = agentResult.text || ''
          const agentMeta = agentResult.meta || {}

          participant.status = 'completed' as any
          ;(participant as any).response = agentText
          participant.completedAt = new Date().toISOString()
          execution.logs.push(`Agent ${participant.agentId} completed: ${agentText.slice(0, 100)}`)

          // Trace individual agent call to Opik
          traceAgentChat(participant.agentId, workflow.content || '', agentText, {
            model: agentMeta.model,
            provider: agentMeta.provider,
            inputTokens: agentMeta.usage?.input,
            outputTokens: agentMeta.usage?.output,
            cacheReadTokens: agentMeta.usage?.cacheRead,
            durationMs: agentResult.durationMs,
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
          execution.logs.push(`Agent ${participant.agentId} failed: ${err.message}`)
        }
        fs.writeFileSync(executionFilePath, JSON.stringify(execution, null, 2), 'utf-8')
      }

      // Mark execution complete
      execution.status = execution.participants.some(p => p.status === 'failed') ? 'failed' : 'completed'
      execution.completedAt = new Date().toISOString()
      execution.logs.push(`Workflow completed at ${execution.completedAt}`)
      fs.writeFileSync(executionFilePath, JSON.stringify(execution, null, 2), 'utf-8')

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
