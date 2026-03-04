import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import cronstrue from 'cronstrue'

const WORKSPACE_DIR = path.join(process.env.HOME || '', '.openclaw', 'workspace')
const WORKFLOWS_DIR = path.join(WORKSPACE_DIR, 'WORKFLOWS')
const EXECUTIONS_DIR = path.join(WORKFLOWS_DIR, 'executions')

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

  while (fs.existsSync(path.join(WORKFLOWS_DIR, `${id}.md`))) {
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

// List all workflows
export function listWorkflows(): Workflow[] {
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    fs.mkdirSync(WORKFLOWS_DIR, { recursive: true })
  }

  const files = fs.readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.md') && f !== 'README.md')
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

// Get single workflow
export function getWorkflow(id: string): Workflow | null {
  const filePath = path.join(WORKFLOWS_DIR, `${id}.md`)

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
      content: content.trim()
    }
  } catch (error) {
    console.error(`Error parsing workflow ${id}:`, error)
    return null
  }
}

// Create workflow
export function createWorkflow(data: Partial<Workflow>): { success: boolean; id?: string; error?: string } {
  try {
    // Validate required fields
    if (!data.name) {
      return { success: false, error: 'Name is required' }
    }
    if (!data.description) {
      return { success: false, error: 'Description is required' }
    }
    if (!data.schedule) {
      return { success: false, error: 'Schedule is required' }
    }
    if (!data.content) {
      return { success: false, error: 'Content is required' }
    }

    // Validate cron expression
    const cronValidation = validateCron(data.schedule)
    if (!cronValidation.valid) {
      return { success: false, error: `Invalid cron expression: ${cronValidation.error}` }
    }

    // Validate execution mode
    if (data.executionMode === 'managed' && !data.owner) {
      return { success: false, error: 'Owner is required for managed workflows' }
    }

    // Generate and ensure unique ID
    const baseId = generateId(data.name)
    const id = ensureUniqueId(baseId)

    const now = new Date().toISOString()
    const workflow: Workflow = {
      id,
      name: data.name,
      description: data.description,
      schedule: data.schedule,
      enabled: data.enabled !== false,
      targeting: data.targeting || { communities: [], groups: [], tags: [], agents: [] },
      created: now,
      modified: now,
      author: data.author || 'unknown',
      owner: data.owner,
      executionMode: data.executionMode || 'automated',
      content: data.content
    }

    // Create file with YAML frontmatter
    const fileContent = matter.stringify(workflow.content, {
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
      executionMode: workflow.executionMode
    })

    const filePath = path.join(WORKFLOWS_DIR, `${id}.md`)
    fs.writeFileSync(filePath, fileContent, 'utf-8')

    return { success: true, id }
  } catch (error: any) {
    console.error('Error creating workflow:', error)
    return { success: false, error: error.message }
  }
}

// Update workflow
export function updateWorkflow(id: string, data: Partial<Workflow>): { success: boolean; error?: string } {
  try {
    const existing = getWorkflow(id)
    if (!existing) {
      return { success: false, error: 'Workflow not found' }
    }

    // Validate cron expression if provided
    if (data.schedule) {
      const cronValidation = validateCron(data.schedule)
      if (!cronValidation.valid) {
        return { success: false, error: `Invalid cron expression: ${cronValidation.error}` }
      }
    }

    // Validate execution mode
    if (data.executionMode === 'managed' && !data.owner && !existing.owner) {
      return { success: false, error: 'Owner is required for managed workflows' }
    }

    const updated: Workflow = {
      ...existing,
      ...data,
      id: existing.id, // ID cannot be changed
      created: existing.created, // Created timestamp cannot be changed
      modified: new Date().toISOString()
    }

    // Create file with YAML frontmatter
    const fileContent = matter.stringify(updated.content, {
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
      executionMode: updated.executionMode
    })

    const filePath = path.join(WORKFLOWS_DIR, `${id}.md`)
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
    const filePath = path.join(WORKFLOWS_DIR, `${id}.md`)

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Workflow not found' }
    }

    fs.unlinkSync(filePath)

    // Also delete execution history
    const executionDir = path.join(EXECUTIONS_DIR, id)
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
        if (workflow.targeting.communities.includes(community)) {
          reasons.push(`community:${community}`)
        }
      }
    }

    // Check groups
    if (workflow.targeting.groups.length > 0 && agent.groups) {
      for (const group of agent.groups) {
        if (workflow.targeting.groups.includes(group)) {
          reasons.push(`group:${group}`)
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
  const executionDir = path.join(EXECUTIONS_DIR, workflowId)

  if (!fs.existsSync(executionDir)) {
    return []
  }

  const files = fs.readdirSync(executionDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse() // Most recent first
    .slice(0, limit)

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
  const filePath = path.join(EXECUTIONS_DIR, workflowId, `${executionId}.json`)

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
