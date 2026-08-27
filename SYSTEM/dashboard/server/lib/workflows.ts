import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import cronstrue from 'cronstrue'
import { execFileSync, spawn } from 'child_process'
import { safeEnv, workflowExecutionEnv } from './safe-env'
import { createHash, randomUUID } from 'crypto'
import { getWorkspacePath, listAgents, parseGroups } from './workspace'
import { listTeams, type Team } from './teams'
import { addMessage } from './messages'
import { getConfiguredDashboardInstanceId, traceAgentChat, traceWorkflowExecution } from './opik'
import { waitForGatewayResponsive } from './gateway-rpc'
import { checkBudgetBlock } from './budget'
import { validateWorkflow } from './validator'
import {
  resolveAgentExecutionConfig,
  isOpenClawSessionLockError,
  runExclusiveAgentExecution,
  shouldUseExplicitBackupModelRetry,
  toExecutionModelOverride,
  withTemporaryAgentAuthProfiles,
} from './agent-execution'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'
import { hasWorkspaceManagedPartnerSecrets } from './workspace-integrations'
import { resolveOpenClawCliPath } from './openclaw-cli'
import { createBrokerCapabilityToken } from './skill-secret-broker'
import { executeAgentRuntimeTurn, isRuntimeCancelledError } from './agent-runtime'
import { hasRuntimeSession } from './runtime-sessions'
import { withRegisteredTurn } from './agent-turns'
import { cancelProcessTree, detachProcessStreams, terminateProcessTree } from './process-tree'

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

function getPipelineStatePath(): string {
  return path.join(getWorkflowsDir(), '.pipeline-state.json')
}

export interface WorkflowPipelineState {
  paused: boolean
  updatedAt: string | null
  updatedBy: string | null
  stateError?: boolean
}

export function getWorkflowPipelineState(): WorkflowPipelineState {
  const statePath = getPipelineStatePath()
  if (!fs.existsSync(statePath)) {
    return { paused: false, updatedAt: null, updatedBy: null }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    if (parsed?.version !== 1 || typeof parsed.paused !== 'boolean') throw new Error('invalid pipeline state')
    return {
      paused: parsed.paused,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
    }
  } catch {
    // A corrupt pause ledger must not silently allow new executions.
    return { paused: true, updatedAt: null, updatedBy: null, stateError: true }
  }
}

export function setWorkflowPipelinePaused(paused: boolean, updatedBy?: string): WorkflowPipelineState {
  const statePath = getPipelineStatePath()
  const state: WorkflowPipelineState = {
    paused,
    updatedAt: new Date().toISOString(),
    updatedBy: `${updatedBy || 'dashboard'}`.trim().slice(0, 256) || 'dashboard',
  }
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  const tempPath = `${statePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify({ version: 1, ...state }, null, 2), { encoding: 'utf-8', mode: 0o600 })
  fs.renameSync(tempPath, statePath)
  return state
}

const WORKFLOW_RUNNER_BOOT_ID = randomUUID()
const activeWorkflowExecutions = new Map<string, string>()
// Cancellers rather than raw process handles. An operator Stop that killed the handle directly
// bypassed the step's own settle path, leaving its promise waiting on a 'close' that a grandchild
// escaping the process group can hold open indefinitely -- wedging the step, the per-agent lock
// behind it, and every later turn for that agent, with no deadline left anywhere to clear it.
const activeExecutionProcesses = new Map<string, Set<() => void>>()
const cancelledExecutions = new Set<string>()
const INTERRUPTED_WORKFLOW_MESSAGE = 'Interrupted: the dashboard restarted while this run was in progress.'

// Interfaces
export interface AgentTargeting {
  communities: string[]
  groups: string[]
  tags: string[]
  agents: string[]
  teamIds?: string[]
}

export interface Workflow {
  id: string
  name: string
  description: string
  schedule: string
  timezone?: string
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
}

export interface WorkflowParticipant {
  agentId: string
  agentName: string
  reason: string
}

export interface WorkflowCommunicationTargetResolution {
  groups: string[]
  communities: string[]
  missingGroups: string[]
  missingCommunities: string[]
}

export function resolveTargetTeamAgentIds(
  teamIds: string[] = [],
  teams: Team[] = listTeams()
): Map<string, string[]> {
  const teamsById = new Map(teams.map((team) => [team.id, team]))
  const targetedTeamIds = new Set<string>()
  for (const nextTeamId of teamIds.map((teamId) => `${teamId || ''}`.trim()).filter(Boolean)) {
    if (teamsById.has(nextTeamId)) {
      targetedTeamIds.add(nextTeamId)
    }
  }

  const agentReasons = new Map<string, string[]>()
  for (const teamId of targetedTeamIds) {
    const team = teamsById.get(teamId)
    if (!team) continue
    const executionIds = team.leaderAgentId
      ? [team.leaderAgentId]
      : Array.from(new Set((team.memberAgentIds || []).filter(Boolean)))
    for (const agentId of executionIds) {
      agentReasons.set(agentId, [...(agentReasons.get(agentId) || []), `team:${team.id}`])
    }
  }

  return agentReasons
}

function readWorkflowChannelNames(workspaceRoot: string, kind: 'group' | 'community'): string[] {
  const names = new Set<string>()
  const files = [
    path.join(workspaceRoot, 'ORG', 'GROUPS.md'),
    path.join(workspaceRoot, 'ORG', 'COMMUNITIES.md'),
  ]

  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue
      const parsed = parseGroups(fs.readFileSync(file, 'utf-8'))
      const entries = kind === 'group' ? parsed.groups : parsed.communities
      for (const entry of entries) {
        if (entry.name?.trim()) names.add(entry.name.trim())
      }
    } catch {}
  }

  return Array.from(names)
}

function resolveTargetNames(requested: string[] = [], available: string[]): { resolved: string[]; missing: string[] } {
  const byLower = new Map(available.map((name) => [name.toLowerCase(), name]))
  const resolved: string[] = []
  const missing: string[] = []
  const seen = new Set<string>()

  for (const rawTarget of requested) {
    const target = `${rawTarget || ''}`.trim()
    if (!target) continue
    const canonical = byLower.get(target.toLowerCase())
    if (!canonical) {
      missing.push(target)
      continue
    }
    if (!seen.has(canonical.toLowerCase())) {
      resolved.push(canonical)
      seen.add(canonical.toLowerCase())
    }
  }

  return { resolved, missing }
}

function normalizeWorkflowChannelKey(value: string): string {
  return `${value || ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function inferWorkflowCommunicationTargets(
  targeting: Partial<AgentTargeting> = {},
  workspaceRoot: string = getWorkspacePath()
): { groups: string[]; communities: string[] } {
  const existingGroups = Array.isArray(targeting.groups) ? targeting.groups.filter(Boolean) : []
  const existingCommunities = Array.isArray(targeting.communities) ? targeting.communities.filter(Boolean) : []
  if (existingGroups.length > 0 || existingCommunities.length > 0) {
    return {
      groups: Array.from(new Set(existingGroups)),
      communities: Array.from(new Set(existingCommunities)),
    }
  }

  const teamIds = Array.isArray(targeting.teamIds) ? targeting.teamIds.map((value) => `${value || ''}`.trim()).filter(Boolean) : []
  const targetedAgents = Array.isArray(targeting.agents) ? targeting.agents.map((value) => `${value || ''}`.trim()).filter(Boolean) : []
  const groupsPath = path.join(workspaceRoot, 'ORG', 'GROUPS.md')
  const communitiesPath = path.join(workspaceRoot, 'ORG', 'COMMUNITIES.md')
  const parsedGroups = fs.existsSync(groupsPath) ? parseGroups(fs.readFileSync(groupsPath, 'utf-8')).groups : []
  const parsedCommunities = fs.existsSync(communitiesPath) ? parseGroups(fs.readFileSync(communitiesPath, 'utf-8')).communities : []

  const groupsByKey = new Map<string, { name: string; community?: string | null }>()
  for (const group of parsedGroups) {
    const key = normalizeWorkflowChannelKey(group.name || '')
    if (!key || groupsByKey.has(key)) continue
    groupsByKey.set(key, { name: group.name, community: group.community })
  }

  const communitiesByKey = new Map<string, string>()
  for (const community of parsedCommunities) {
    const key = normalizeWorkflowChannelKey(community.name || '')
    if (!key || communitiesByKey.has(key)) continue
    communitiesByKey.set(key, community.name)
  }

  const inferredGroups = new Set<string>()
  const inferredCommunities = new Set<string>()

  if (teamIds.length > 0) {
    for (const team of listTeams(workspaceRoot).filter((candidate) => teamIds.includes(candidate.id))) {
      const candidateKeys = new Set<string>([
        normalizeWorkflowChannelKey(team.id),
        normalizeWorkflowChannelKey(team.name || ''),
      ].filter(Boolean))
      for (const candidateKey of candidateKeys) {
        const matchingGroup = groupsByKey.get(candidateKey)
        if (!matchingGroup) continue
        inferredGroups.add(matchingGroup.name)
        if (matchingGroup.community) inferredCommunities.add(matchingGroup.community)
      }
    }
  }

  if (targetedAgents.length > 0) {
    const uniqueAgentIds = Array.from(new Set(targetedAgents))
    const agents = listAgents()
    const agentMemberships = uniqueAgentIds
      .map((agentId) => agents.find((agent) => agent.id === agentId))
      .filter(Boolean)
      .map((agent) => ({
        groups: new Set((agent!.groups || []).map((group) => group.name)),
        communities: new Set((agent!.communities || []).map((community) => community.name)),
      }))

    if (agentMemberships.length > 0) {
      const sharedGroups = new Set<string>(agentMemberships[0].groups)
      const sharedCommunities = new Set<string>(agentMemberships[0].communities)

      for (const membership of agentMemberships.slice(1)) {
        for (const groupName of Array.from(sharedGroups)) {
          if (!membership.groups.has(groupName)) sharedGroups.delete(groupName)
        }
        for (const communityName of Array.from(sharedCommunities)) {
          if (!membership.communities.has(communityName)) sharedCommunities.delete(communityName)
        }
      }

      for (const groupName of sharedGroups) inferredGroups.add(groupName)
      for (const communityName of sharedCommunities) inferredCommunities.add(communityName)
    }
  }

  for (const groupName of Array.from(inferredGroups)) {
    const matchingGroup = groupsByKey.get(normalizeWorkflowChannelKey(groupName))
    if (matchingGroup?.community) inferredCommunities.add(matchingGroup.community)
  }

  return {
    groups: Array.from(inferredGroups),
    communities: Array.from(inferredCommunities).map((communityName) => communitiesByKey.get(normalizeWorkflowChannelKey(communityName)) || communityName),
  }
}

export function resolveWorkflowCommunicationTargets(
  targeting: Partial<AgentTargeting> = {},
  workspaceRoot: string = getWorkspacePath()
): WorkflowCommunicationTargetResolution {
  const inferredTargets = inferWorkflowCommunicationTargets(targeting, workspaceRoot)
  const groups = resolveTargetNames(inferredTargets.groups, readWorkflowChannelNames(workspaceRoot, 'group'))
  const communities = resolveTargetNames(inferredTargets.communities, readWorkflowChannelNames(workspaceRoot, 'community'))
  return {
    groups: groups.resolved,
    communities: communities.resolved,
    missingGroups: groups.missing,
    missingCommunities: communities.missing,
  }
}

export function formatWorkflowCommunicationTargetError(resolution: Pick<WorkflowCommunicationTargetResolution, 'missingGroups' | 'missingCommunities'>): string | null {
  const parts: string[] = []
  if (resolution.missingGroups.length > 0) {
    parts.push(`missing group${resolution.missingGroups.length === 1 ? '' : 's'}: ${resolution.missingGroups.map((name) => `"${name}"`).join(', ')}`)
  }
  if (resolution.missingCommunities.length > 0) {
    parts.push(`missing communit${resolution.missingCommunities.length === 1 ? 'y' : 'ies'}: ${resolution.missingCommunities.map((name) => `"${name}"`).join(', ')}`)
  }
  if (parts.length === 0) return null
  return `COMMS FAIL: Workflow communication delivery target ${parts.join('; ')}. Add the target in Communications or update the workflow targeting.`
}

export function summarizeAgentInputRequest(agentText: string): string {
  const normalized = `${agentText || ''}`.replace(/\s+/g, ' ').trim()
  if (!normalized) return 'Open the agent to review the input request and provide the missing detail.'
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  const primarySentence = sentences.find((sentence) =>
    /please\s+(?:choose|decide|confirm|approve)|what should|which (?:one|option)|can you|could you|would you|should we|do you want/i.test(sentence)
  )
  const secondarySentence = sentences.find((sentence) =>
    /waiting for|blocked by|need(?:s)?/i.test(sentence)
  )
  const summary = primarySentence || secondarySentence || normalized.slice(-220).trim()
  if (summary.length <= 220) {
    return summary
  }
  return `${summary.slice(0, 217).trimEnd()}...`
}

export interface WorkflowExecutionParticipant {
  agentId: string
  agentName: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
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
  status: 'running' | 'completed' | 'failed' | 'paused' | 'cancelled' | 'interrupted'
  triggerType: 'scheduled' | 'manual' | 'agent'
  triggeredBy?: string
  participants: WorkflowExecutionParticipant[]
  logs: string[]
  ownerPid?: number
  ownerBootId?: string
  heartbeatAt?: string
  error?: string
  inputs?: Record<string, string>  // Structured inputs parsed from workflow content
  outputs?: Record<string, {
    type: 'markdown' | 'text' | 'json' | 'artifact' | 'handoff'
    summary?: string
    artifactPath?: string
    value?: unknown
  }>
}

function expandHomePath(input: string): string {
  const home = process.env.HOME || ''
  if (!input.startsWith('~')) return input
  if (input === '~') return home || input
  if (input.startsWith('~/')) return home ? path.join(home, input.slice(2)) : input
  return input
}

function isPathLikeRunInput(label: string, value: string): boolean {
  const normalizedLabel = label.trim().toLowerCase()
  if (/(^|[\s_-])(path|root|dir|directory|folder|file|files)([\s_-]|$)/i.test(normalizedLabel)) return true
  const trimmed = value.trim()
  return trimmed.startsWith('~/')
    || trimmed.startsWith('./')
    || trimmed.startsWith('../')
    || trimmed.startsWith('/')
    || /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]/.test(trimmed)
}

export function resolveWorkflowRunInputPath(inputValue: string, workspaceRoot: string = getWorkspacePath()): string {
  const trimmed = inputValue.trim()
  if (!trimmed) return trimmed
  const expanded = expandHomePath(trimmed)
  if (path.isAbsolute(expanded)) return path.normalize(expanded)
  return path.resolve(workspaceRoot, expanded)
}

export function normalizeWorkflowExecutionOutputs(
  outputs?: Record<string, {
    type?: 'markdown' | 'text' | 'json' | 'artifact' | 'handoff'
    summary?: string
    artifactPath?: string
    value?: unknown
  }>
): WorkflowExecution['outputs'] | undefined {
  if (!outputs || typeof outputs !== 'object') return undefined
  const normalized = Object.fromEntries(
    Object.entries(outputs)
      .map(([key, raw]) => {
        const normalizedKey = `${key || ''}`.trim()
        if (!normalizedKey || !raw || typeof raw !== 'object') return null
        const type = raw.type || 'text'
        const summary = typeof raw.summary === 'string' ? raw.summary.trim() || undefined : undefined
        const artifactPath = typeof raw.artifactPath === 'string' ? raw.artifactPath.trim() || undefined : undefined
        return [normalizedKey, {
          type,
          summary,
          artifactPath,
          value: raw.value,
        }]
      })
      .filter(Boolean) as Array<[string, NonNullable<WorkflowExecution['outputs']>[string]]>
  )
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function resolveWorkflowInputRefs(
  workflow: Pick<Workflow, 'inputRefs'>,
  getExecutionForWorkflowId: (workflowId: string) => WorkflowExecution | null = getLatestExecution
): Array<{
  workflowId: string
  outputKey: string
  label: string
  value?: unknown
  summary?: string
  artifactPath?: string
  missing: boolean
}> {
  return (workflow.inputRefs || []).map((ref) => {
    const workflowId = `${ref.workflowId || ''}`.trim()
    const outputKey = `${ref.outputKey || ''}`.trim()
    const execution = workflowId ? getExecutionForWorkflowId(workflowId) : null
    const output = execution?.outputs?.[outputKey]
    return {
      workflowId,
      outputKey,
      label: ref.label?.trim() || `${workflowId}.${outputKey}`,
      value: output?.value,
      summary: output?.summary,
      artifactPath: output?.artifactPath,
      missing: !output,
    }
  })
}

function summarizeWorkflowOutputValue(raw: string, maxLength = 220): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const singleLine = trimmed.replace(/\s+/g, ' ')
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength - 1)}…` : singleLine
}

export function compactWorkflowExecutionContent(content: string, maxLength = 2200): string {
  const trimmed = content.trim()
  if (trimmed.length <= maxLength) return trimmed

  const lines = trimmed
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const priorityLines = lines.filter((line) =>
    /^#{1,3}\s+/.test(line)
    || /^[-*]\s+/.test(line)
    || /^(objective|objectives|goal|goals|deliverable|deliverables|output|outputs|input|inputs|constraints?|success criteria|definition of done|next actions?)\b/i.test(line)
  )
  const fallbackLines = lines.filter((line) => !priorityLines.includes(line))
  const ordered = [...priorityLines, ...fallbackLines]

  const kept: string[] = []
  for (const line of ordered) {
    const candidate = [...kept, line].join('\n')
    if (candidate.length > maxLength) break
    kept.push(line)
  }

  const compacted = kept.join('\n').trim()
  return compacted.length < trimmed.length
    ? `${compacted}\n\n[Workflow instructions truncated for brevity. Focus on the highest-signal goals, inputs, deliverables, and constraints above.]`
    : compacted
}

export function deriveWorkflowExecutionOutputs(
  workflow: Pick<Workflow, 'outputDefinitions' | 'owner'>,
  participants: Array<Pick<WorkflowExecutionParticipant, 'agentId'> & { response?: string }>,
  existingOutputs?: WorkflowExecution['outputs']
): WorkflowExecution['outputs'] | undefined {
  if (existingOutputs && Object.keys(existingOutputs).length > 0) return existingOutputs
  const outputDefinition = workflow.outputDefinitions?.[0]
  if (!outputDefinition?.key) return existingOutputs

  const ownerParticipant = workflow.owner
    ? participants.find((participant) => participant.agentId === workflow.owner && typeof participant.response === 'string' && participant.response.trim())
    : undefined
  const firstParticipantWithResponse = participants.find((participant) => typeof participant.response === 'string' && participant.response.trim())
  const chosenResponse = ownerParticipant?.response || firstParticipantWithResponse?.response
  if (!chosenResponse?.trim()) return existingOutputs

  return {
    [outputDefinition.key]: {
      type: outputDefinition.type || 'markdown',
      summary: summarizeWorkflowOutputValue(chosenResponse),
      value: chosenResponse.trim(),
    },
  }
}

export function persistWorkflowExecutionOutputArtifacts(
  workflowId: string,
  outputs?: WorkflowExecution['outputs'],
  workspaceRoot: string = getWorkspacePath()
): WorkflowExecution['outputs'] | undefined {
  if (!outputs || typeof outputs !== 'object') return outputs

  let mutated = false
  const persistedOutputs = Object.fromEntries(
    Object.entries(outputs).map(([key, output]) => {
      if (!output || output.artifactPath) return [key, output]

      const normalizedKey = `${key || ''}`.trim()
      if (!normalizedKey) return [key, output]

      if ((output.type === 'markdown' || output.type === 'text') && typeof output.value === 'string' && output.value.trim()) {
        const extension = output.type === 'markdown' ? 'md' : 'txt'
        const artifactPath = path.posix.join('WORKFLOWS', 'outputs', workflowId, `${normalizedKey}.${extension}`)
        const absolutePath = path.join(workspaceRoot, artifactPath)
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
        fs.writeFileSync(absolutePath, output.value.trimEnd() + '\n', 'utf-8')
        mutated = true
        return [key, {
          ...output,
          artifactPath,
        }]
      }

      return [key, output]
    })
  ) as WorkflowExecution['outputs']

  return mutated ? persistedOutputs : outputs
}

function hydrateExecutionArtifacts(
  workflowId: string,
  execution: WorkflowExecution,
  filePath?: string
): WorkflowExecution {
  const persistedOutputs = persistWorkflowExecutionOutputArtifacts(workflowId, execution.outputs)
  if (persistedOutputs !== execution.outputs) {
    execution.outputs = persistedOutputs
    if (filePath) {
      try {
        fs.writeFileSync(filePath, JSON.stringify(execution, null, 2), 'utf-8')
      } catch (error) {
        console.error(`Error persisting hydrated execution ${execution.id}:`, error)
      }
    }
  }
  return execution
}

interface WorkflowRuntimeOverrides {
  openai?: string
  anthropic?: string
  gemini?: string
  openrouter?: string
  xai?: string
  ollamaBaseUrl?: string
  openaiCompatibleApiKey?: string
  openaiCompatibleBaseUrl?: string
  openaiCompatibleDefaultModel?: string
}

function buildMockWorkflowResponse(
  workflow: Pick<Workflow, 'name' | 'description' | 'outputDefinitions'>,
  participant: Pick<WorkflowExecutionParticipant, 'agentId' | 'agentName'>,
  resolvedInputRefs: Array<{
    workflowId: string
    outputKey: string
    label: string
    value?: unknown
    summary?: string
    artifactPath?: string
    missing: boolean
  }>,
  executionInputs?: Record<string, string>
): string {
  const lines = [
    `# ${workflow.name}`,
    '',
    `Mock execution completed by ${participant.agentName} (${participant.agentId}).`,
  ]

  if (workflow.description?.trim()) {
    lines.push('', workflow.description.trim())
  }

  const availableRefs = resolvedInputRefs.filter((ref) => !ref.missing)
  if (availableRefs.length > 0) {
    lines.push('', '## Upstream Inputs')
    for (const ref of availableRefs) {
      const detail = ref.summary
        || (typeof ref.value === 'string' ? ref.value : undefined)
        || ref.artifactPath
        || `${ref.workflowId}.${ref.outputKey}`
      lines.push(`- ${ref.label}: ${detail}`)
    }
  }

  const explicitInputs = Object.entries(executionInputs || {}).filter(([, value]) => `${value || ''}`.trim())
  if (explicitInputs.length > 0) {
    lines.push('', '## Run Inputs')
    for (const [key, value] of explicitInputs) {
      lines.push(`- ${key}: ${value}`)
    }
  }

  if (workflow.outputDefinitions?.length) {
    lines.push('', '## Output Contract')
    for (const outputDefinition of workflow.outputDefinitions) {
      lines.push(`- ${outputDefinition.label || outputDefinition.key}: mock-ready`)
    }
  }

  lines.push('', '## Status', '- Mock pipeline output generated for testing and workflow chaining.')
  return lines.join('\n')
}

export function detectParticipantReportedFailure(agentText: string): string | null {
  const text = agentText.trim()
  if (!text) return null

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  for (const line of lines) {
    if (/FsSafeError: directory changed during operation/i.test(line)) {
      return line
    }
    if (/context overflow|prompt too large|prompt_cache_key|string too long|runtime error detail/i.test(line)) {
      return line
    }
    if (/EmbeddedAttemptSessionTakeoverError|session file changed while embedded prompt lock was released/i.test(line)) {
      return line
    }
    if (/^Unknown model:/i.test(line)) {
      return line
    }
    if (/Incorrect API key provided/i.test(line)) {
      return line
    }
    if (/No API key found for provider/i.test(line)) {
      return line
    }
    if (/has auth issue \(skipping all models\)/i.test(line)) {
      return line
    }
    if (/^LLM request rejected:/i.test(line)) {
      return line
    }
    if (/^No execution path configured\b/i.test(line)) {
      return line
    }
    if (/^No API keys available\b/i.test(line)) {
      return line
    }
  }

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

const BENIGN_OPENCLAW_RUNTIME_WARNING_PATTERNS = [
  /\[skills\]\s+failed to create plugin skill symlink\b.*\bEEXIST\b/i,
  /\[skills\]\s+failed to create plugin skill symlink\b.*\bfile already exists\b/i,
]

export function isBenignOpenClawRuntimeWarning(line: string): boolean {
  const text = line.trim()
  return BENIGN_OPENCLAW_RUNTIME_WARNING_PATTERNS.some((pattern) => pattern.test(text))
}

export function stripBenignOpenClawRuntimeWarnings(text: string): string {
  return text
    .split('\n')
    .filter((line) => !isBenignOpenClawRuntimeWarning(line))
    .join('\n')
    .trim()
}

export function formatParticipantFailure(reportedFailure: string): string {
  if (/FsSafeError: directory changed during operation/i.test(reportedFailure)) {
    return 'The agent runtime changed files while this workflow was running and the participant could not complete. Retry once. If it keeps happening, restart the runtime or disable unstable runtime plugins before retrying.'
  }
  if (/^Unknown model:/i.test(reportedFailure)) {
    return 'This workflow participant is configured with a model that the current runtime does not support. Choose a different model for the agent and retry the workflow.'
  }
  if (/^LLM request rejected:/i.test(reportedFailure) || /usage limits|quota|insufficient_quota/i.test(reportedFailure)) {
    return 'Model provider usage limits blocked this workflow participant. Wait a moment and retry, or update the provider billing and rate-limit configuration for the selected model.'
  }
  if (/Incorrect API key provided/i.test(reportedFailure)) {
    return 'Model provider authentication failed because the configured API key was rejected. Update the API key or runtime auth profile used for this workflow run and retry.'
  }
  if (/has auth issue \(skipping all models\)/i.test(reportedFailure)) {
    return 'Model provider authentication is currently marked unhealthy for this runtime, usually because a prior request failed auth. Refresh the API key or auth profile for this runtime and retry after the auth state is cleared.'
  }
  if (/No API key found for provider/i.test(reportedFailure)) {
    return 'No model provider credentials are configured for this workflow run. Add the missing API key or auth profile in BYOK, runtime settings, or the agent auth store and retry.'
  }
  if (/is in cooldown \(suspending lanes\)/i.test(reportedFailure) || /timed out/i.test(reportedFailure)) {
    return 'Model provider is temporarily cooling down after a timeout or transient failure. Wait a moment and retry, or switch this workflow to a faster fallback model.'
  }
  if (/context overflow|prompt too large|prompt_cache_key|string too long|runtime error detail/i.test(reportedFailure)) {
    return `Model provider rejected the request before generation. Raw error: ${reportedFailure}`
  }
  if (/EmbeddedAttemptSessionTakeoverError|session file changed while embedded prompt lock was released/i.test(reportedFailure)) {
    return 'The runtime retried this workflow participant after an embedded session conflict, but the session kept changing. Retry when no chat request is active for this agent; restart the agent runtime if it continues.'
  }
  if (/^No execution path configured\b/i.test(reportedFailure) || /^No API keys available\b/i.test(reportedFailure)) {
    return 'No model execution path is configured for this workflow run. Add hosted provider keys or configure a local runtime in BYOK / workspace integrations.'
  }
  if (/^COMMS FAIL/i.test(reportedFailure)) {
    return `Communication delivery failed. ${reportedFailure.replace(/^COMMS FAIL:\s*/i, '')}`
  }
  return `Agent reported failure: ${reportedFailure}`
}

export function normalizeWorkflowThreadDiagnostic(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed) return null

  if (/FsSafeError: directory changed during operation/i.test(trimmed)) {
    return 'The agent runtime changed files while this workflow was running and the participant could not complete. Retry once. If it keeps happening, restart the runtime or disable unstable runtime plugins before retrying.'
  }

  if (/^Unknown model:/i.test(trimmed)) {
    return 'This workflow participant is configured with a model that the current runtime does not support. Choose a different model for the agent and retry the workflow.'
  }

  if (/EmbeddedAttemptSessionTakeoverError|session file changed while embedded prompt lock was released/i.test(trimmed)) {
    return 'The runtime retried this workflow participant after an embedded session conflict, but the session kept changing. Retry when no chat request is active for this agent; restart the agent runtime if it continues.'
  }

  const looksLikeRawRuntimeNoise =
    /model fallback decision|FailoverError|FallbackSummaryError|incorrect api key provided|Provider .* auth issue|network connection error|Connection error/i.test(trimmed)
    && !/\n\n/.test(trimmed)

  if (!looksLikeRawRuntimeNoise) return null

  if (/incorrect api key provided|auth issue|missing credentials|missing api key/i.test(trimmed)) {
    return 'Runtime auth error while contacting the configured model provider. Check the provider key/configuration and retry.'
  }

  if (/network connection error|Connection error|timeout|timed out|cooldown/i.test(trimmed)) {
    return 'Runtime connection error while contacting the configured model provider. Check provider/network availability and retry.'
  }

  return 'Runtime model execution error. Review the workflow details or retry the run.'
}

export function resolveWorkflowConversationTarget(
  targeting: Partial<AgentTargeting> | null | undefined,
  workspaceRoot: string = getWorkspacePath()
): { type: 'group' | 'community'; name: string } | null {
  const inferredTargets = inferWorkflowCommunicationTargets(targeting || {}, workspaceRoot)
  if (inferredTargets.groups.length > 0) {
    return { type: 'group', name: inferredTargets.groups[0] }
  }
  if (inferredTargets.communities.length > 0) {
    return { type: 'community', name: inferredTargets.communities[0] }
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
  const normalizedExecutionId = `${executionId || ''}`.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const normalizedAgentId = `${agentId || ''}`.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  const hash = createHash('sha1')
    .update(`${normalizedExecutionId}:${normalizedAgentId}`)
    .digest('hex')
    .slice(0, 10)
  const agentTail = normalizedAgentId.slice(-18) || 'agent'
  return `wf-${hash}-${agentTail}`.slice(0, 48)
}

export function buildWorkflowRetrySessionId(executionId: string, agentId: string, retryAttempt = 0): string {
  const retryExecutionId = retryAttempt > 0 ? `${executionId}-retry-${retryAttempt}` : executionId
  return buildWorkflowSessionId(retryExecutionId, agentId)
}

export function resolveWorkflowOpenClawCliPath(): string {
  const cliPath = resolveOpenClawCliPath()
  if (!cliPath) {
    throw new Error('OpenClaw CLI is not available for workflow execution')
  }
  return cliPath
}

function resolveAgentSessionsDir(agentId: string, home: string): string {
  return path.join(home, '.openclaw', 'agents', agentId, 'sessions')
}

function resolveSessionFileFromEntry(sessionsDir: string, sessionFile: string): string | undefined {
  const trimmed = sessionFile.trim()
  if (!trimmed) return undefined
  const resolved = path.resolve(path.isAbsolute(trimmed) ? trimmed : path.join(sessionsDir, trimmed))
  const base = path.resolve(sessionsDir)
  const relative = path.relative(base, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return undefined
  return resolved
}

function readSessionHeaderId(sessionFile: string): string | undefined {
  try {
    if (!fs.existsSync(sessionFile)) return undefined
    const fd = fs.openSync(sessionFile, 'r')
    try {
      const buffer = Buffer.alloc(8192)
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
      const firstLine = buffer.subarray(0, bytesRead).toString('utf-8').split('\n')[0]
      if (!firstLine) return undefined
      const parsed = JSON.parse(firstLine)
      return typeof parsed?.id === 'string' ? parsed.id : undefined
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return undefined
  }
}

export function repairWorkflowSessionEntryForRun(agentId: string, sessionId: string, home: string = process.env.HOME || ''): boolean {
  try {
    if (!agentId || !sessionId || !home) return false
    const sessionsDir = resolveAgentSessionsDir(agentId, home)
    const sessionsPath = path.join(sessionsDir, 'sessions.json')
    if (!fs.existsSync(sessionsPath)) return false

    const raw = fs.readFileSync(sessionsPath, 'utf-8')
    const sessions = JSON.parse(raw || '{}')
    if (!sessions || typeof sessions !== 'object' || Array.isArray(sessions)) return false

    let changed = false
    const mainSessionKey = `agent:${agentId}:main`
    for (const [key, entry] of Object.entries(sessions) as Array<[string, Record<string, any>]>) {
      if (!entry || typeof entry !== 'object') continue
      if (typeof entry.sessionFile !== 'string' || !entry.sessionFile.trim()) continue

      const sessionFile = resolveSessionFileFromEntry(sessionsDir, entry.sessionFile)
      if (!sessionFile) continue

      const headerId = readSessionHeaderId(sessionFile)
      const basenameSessionId = path.basename(sessionFile, '.jsonl')
      const entrySessionId = typeof entry.sessionId === 'string' ? entry.sessionId : ''
      const workflowOwnedEntry =
        key === mainSessionKey
        && (/^(workflow-|wf-)/.test(entrySessionId) || /^(workflow-|wf-)/.test(headerId || basenameSessionId))
      const shouldInspect = entrySessionId === sessionId || workflowOwnedEntry
      if (!shouldInspect) continue

      const pointsAtDifferentTranscript = headerId
        ? headerId !== sessionId
        : basenameSessionId !== sessionId

      if (pointsAtDifferentTranscript) {
        delete entry.sessionFile
        changed = true
      }
    }

    if (!changed) return false
    fs.writeFileSync(sessionsPath, `${JSON.stringify(sessions, null, 2)}\n`, 'utf-8')
    return true
  } catch {
    return false
  }
}

export function getLatestAgentSessionErrorMessage(agentId: string, home: string = process.env.HOME || ''): string | undefined {
  try {
    const sessionsDir = resolveAgentSessionsDir(agentId, home)
    if (!fs.existsSync(sessionsDir)) return undefined

    const files = fs.readdirSync(sessionsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => {
        const fullPath = path.join(sessionsDir, entry.name)
        return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs }
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)

    for (const file of files.slice(0, 3)) {
      const lines = fs.readFileSync(file.fullPath, 'utf-8').split('\n').filter(Boolean)
      for (let index = lines.length - 1; index >= 0; index--) {
        try {
          const parsed = JSON.parse(lines[index])
          const errorMessage = parsed?.message?.errorMessage
          if (typeof errorMessage === 'string' && errorMessage.trim()) {
            return errorMessage.trim()
          }
        } catch {}
      }
    }
  } catch {}

  return undefined
}

function enrichAgentContextOverflow(agentId: string, agentText: string): string {
  if (!/context overflow|prompt too large/i.test(agentText)) return agentText
  const errorMessage = getLatestAgentSessionErrorMessage(agentId)
  if (!errorMessage || agentText.includes(errorMessage)) return agentText
  return `${agentText.trim()}\n\nRuntime error detail: ${errorMessage.slice(0, 500)}`
}

export function throwIfWorkflowAgentResultNeedsRetry(agentText: string): void {
  if (isOpenClawSessionLockError(new Error(agentText))) {
    throw new Error(agentText)
  }
}

export function parseWorkflowAgentResultPayload(payloadText: string): { text: string; meta: any; durationMs: number } {
  let result: any
  try {
    result = JSON.parse(payloadText)
  } catch {
    throwIfWorkflowAgentResultNeedsRetry(payloadText)
    return { text: payloadText, meta: {}, durationMs: 0 }
  }

  const text = result?.payloads?.[0]?.text || result?.result?.payloads?.[0]?.text || ''
  throwIfWorkflowAgentResultNeedsRetry(text)
  const meta = result?.result?.meta || result?.meta || {}
  return { text, meta: meta.agentMeta || {}, durationMs: meta.durationMs || 0 }
}

export {
  getAgentExecutionRetryDelay as getWorkflowAgentRetryDelay,
  isOpenClawSessionLockError as isWorkflowSessionLockError,
} from './agent-execution'

function reconcileWorkflowStateFromExecutions(workflow: Workflow): Workflow {
  if (workflow.status !== 'running') return workflow

  const latestExecution = getLatestExecution(workflow.id)
  if (!latestExecution) return workflow
  if (latestExecution.status === 'running') {
    const activeExecutionId = activeWorkflowExecutions.get(workflow.id)
    if (latestExecution.ownerBootId === WORKFLOW_RUNNER_BOOT_ID && activeExecutionId === latestExecution.id) {
      return workflow
    }
    const interruptedAt = new Date().toISOString()
    const interruptedExecution: WorkflowExecution = {
      ...latestExecution,
      status: 'interrupted',
      completedAt: interruptedAt,
      heartbeatAt: interruptedAt,
      error: INTERRUPTED_WORKFLOW_MESSAGE,
      participants: latestExecution.participants.map((participant) => (
        participant.status === 'running' || participant.status === 'pending'
          ? { ...participant, status: 'failed', completedAt: interruptedAt, error: INTERRUPTED_WORKFLOW_MESSAGE }
          : participant
      )),
      logs: [...latestExecution.logs, INTERRUPTED_WORKFLOW_MESSAGE],
    }
    const executionPath = path.join(getExecutionsDir(), workflow.id, `${latestExecution.id}.json`)
    fs.writeFileSync(executionPath, JSON.stringify(interruptedExecution, null, 2), 'utf-8')
    return {
      ...workflow,
      status: 'blocked',
      progress: workflow.progress || 0,
    }
  }

  if (latestExecution.status === 'completed') {
    return {
      ...workflow,
      status: 'completed',
      progress: 100,
    }
  }

  if (latestExecution.status === 'failed' || latestExecution.status === 'interrupted') {
    return {
      ...workflow,
      status: 'blocked',
      progress: Math.max(workflow.progress || 0, 100),
    }
  }

  return workflow
}

export function reconcileInterruptedWorkflowExecutions(): number {
  const workflowsDir = getWorkflowsDir()
  if (!fs.existsSync(workflowsDir)) return 0
  let interrupted = 0
  for (const file of fs.readdirSync(workflowsDir).filter((entry) => entry.endsWith('.md') && entry !== 'README.md')) {
    const workflowId = path.basename(file, '.md')
    const latest = getLatestExecution(workflowId)
    if (latest?.status !== 'running') continue
    if (latest.ownerBootId === WORKFLOW_RUNNER_BOOT_ID && activeWorkflowExecutions.get(workflowId) === latest.id) continue
    const workflow = getWorkflow(workflowId)
    if (workflow?.status === 'blocked') interrupted++
  }
  return interrupted
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
      timezone: data.timezone || 'UTC',
      enabled: data.enabled !== false,
      targeting: {
        communities: data.targeting?.communities || [],
        groups: data.targeting?.groups || [],
        tags: data.targeting?.tags || [],
        agents: data.targeting?.agents || [],
        teamIds: data.targeting?.teamIds || [],
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
      outputDefinitions: data.outputDefinitions,
      inputRefs: data.inputRefs,
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
    timezone: workflow.timezone || 'UTC',
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
  if (workflow.outputDefinitions?.length) fm.outputDefinitions = workflow.outputDefinitions
  if (workflow.inputRefs?.length) fm.inputRefs = workflow.inputRefs

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

function runCronCmd(args: string[]): { ok: boolean; output: string; error?: string } {
  try {
    const output = execFileSync('openclaw', ['cron', ...args], {
      encoding: 'utf-8',
      timeout: 15000,
      env: safeEnv()
    }).trim()
    return { ok: true, output }
  } catch (err: any) {
    console.error('[Cron] OpenClaw command failed', err.message)
    return { ok: false, output: '', error: err.message }
  }
}

/**
 * Sync a workflow to OpenClaw cron. Creates or updates the cron job.
 * Returns the cron job ID if successful.
 */
export function syncWorkflowToCron(workflow: Workflow, participants: string[]): { ok: boolean; cronJobId?: string; error?: string } {
  if (getWorkflowPipelineState().paused || !workflow.enabled || workflow.schedule === 'manual') {
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
  let skippedNonOpenClaw = 0

  for (const agentId of participants) {
    const jobName = `clawmax-${workflow.id}-${agentId}`

    // Remove existing job if any (e.g. a stale registration from before the agent's runtime was
    // switched away from openclaw)
    const existingJobs = listCronJobs()
    const existing = existingJobs.find(j => j.name === jobName)
    if (existing) {
      removeCronJob(existing.id)
    }

    // openclaw cron only knows how to invoke the openclaw CLI — claude/droid participants are
    // scheduled entirely by the in-process node-cron scheduler in lib/scheduler.ts instead.
    const agentRuntime = resolveAgentExecutionConfig(agentId).runtime
    if (agentRuntime !== 'openclaw') {
      skippedNonOpenClaw++
      console.log(`[Cron] cron: skipped openclaw cron registration for ${agentId} (runtime ${agentRuntime}); in-process scheduler covers it`)
      continue
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
      '--tz', workflow.timezone || 'UTC',
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

  // Every participant was a non-openclaw runtime — nothing was attempted, so this isn't a
  // failure, there's simply no openclaw cron registration for the in-process scheduler to need.
  const attemptedOpenClawRegistration = participants.length > skippedNonOpenClaw
  return {
    ok: attemptedOpenClawRegistration ? results.length > 0 : true,
    cronJobId: results.length > 0 ? results.join(',') : undefined,
  }
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
        timezone: data.timezone || 'UTC',
        enabled: false, // Templates are disabled by default
        targeting: {
          communities: data.targeting?.communities || [],
          groups: data.targeting?.groups || [],
          tags: data.targeting?.tags || [],
          agents: data.targeting?.agents || [],
          teamIds: data.targeting?.teamIds || [],
        },
        created: data.created || '',
        modified: data.modified || '',
        author: data.author || 'system',
        owner: data.owner,
        executionMode: data.executionMode || 'automated',
        content: markdownContent.trim(),
        outputDefinitions: data.outputDefinitions,
        inputRefs: data.inputRefs,
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
      timezone: data.timezone || 'UTC',
      enabled: data.enabled !== false, // Default to true
      targeting: {
        communities: data.targeting?.communities || [],
        groups: data.targeting?.groups || [],
        tags: data.targeting?.tags || [],
        agents: data.targeting?.agents || [],
        teamIds: data.targeting?.teamIds || [],
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
      secretRequirements: data.secretRequirements,
      outputDefinitions: data.outputDefinitions,
      inputRefs: data.inputRefs,
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
      timezone: data.timezone || 'UTC',
      enabled: data.enabled !== false,
      targeting: {
        communities: data.targeting?.communities || [],
        groups: data.targeting?.groups || [],
        tags: data.targeting?.tags || [],
        agents: data.targeting?.agents || [],
        teamIds: data.targeting?.teamIds || [],
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
      outputDefinitions: data.outputDefinitions,
      inputRefs: data.inputRefs,
    }

    // Create file with YAML frontmatter
    const frontmatter: Record<string, any> = {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      schedule: workflow.schedule,
      timezone: workflow.timezone || 'UTC',
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
      ...(workflow.outputDefinitions?.length && { outputDefinitions: workflow.outputDefinitions }),
      ...(workflow.inputRefs?.length && { inputRefs: workflow.inputRefs }),
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
    if (data.schedule && data.schedule !== 'manual' && data.schedule !== 'once') {
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
      timezone: updated.timezone || 'UTC',
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
      ...(updated.outputDefinitions?.length && { outputDefinitions: updated.outputDefinitions }),
      ...(updated.inputRefs?.length && { inputRefs: updated.inputRefs }),
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
export function resolveParticipants(workflow: Workflow, agents: any[], teams: Team[] = listTeams()): WorkflowParticipant[] {
  const participants: WorkflowParticipant[] = []
  const directAgentIds = new Set(workflow.targeting.agents || [])
  const teamAgentReasons = resolveTargetTeamAgentIds(workflow.targeting.teamIds || [], teams)
  const directTags = new Set(workflow.targeting.tags || [])
  const ownerId = workflow.owner?.trim()
  const hasDirectExecutionTargets = directAgentIds.size > 0 || directTags.size > 0 || teamAgentReasons.size > 0 || !!ownerId

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

    for (const reason of teamAgentReasons.get(agent.id) || []) {
      reasons.push(reason)
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

  const executions: WorkflowExecution[] = []

  for (const file of fs.readdirSync(executionDir).filter(f => f.endsWith('.json'))) {
    try {
      const filePath = path.join(executionDir, file)
      const content = fs.readFileSync(filePath, 'utf-8')
      const execution = hydrateExecutionArtifacts(workflowId, JSON.parse(content), filePath)
      executions.push(execution)
    } catch (error) {
      console.error(`Error reading execution ${file}:`, error)
    }
  }

  const ordered = executions.sort((a, b) => {
      const aStartedAt = Date.parse(a.startedAt)
      const bStartedAt = Date.parse(b.startedAt)
      if (Number.isFinite(aStartedAt) && Number.isFinite(bStartedAt) && aStartedAt !== bStartedAt) {
        return aStartedAt - bStartedAt
      }
      return a.id.localeCompare(b.id)
    })
  return limit > 0 ? ordered.slice(-limit) : [] // Most recent executions, oldest to newest.
}

/** Return the newest execution without exposing list ordering to callers. */
export function getLatestExecution(workflowId: string): WorkflowExecution | null {
  return listExecutions(workflowId, 1).at(-1) || null
}

// Get single execution
export function getExecution(workflowId: string, executionId: string): WorkflowExecution | null {
  const filePath = path.join(getExecutionsDir(), workflowId, `${executionId}.json`)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return hydrateExecutionArtifacts(workflowId, JSON.parse(content), filePath)
  } catch (error) {
    console.error(`Error reading execution ${executionId}:`, error)
    return null
  }
}

export function isExecutionCancelled(executionId: string): boolean {
  return cancelledExecutions.has(executionId)
}

export function cancelExecution(workflowId: string, executionId: string): { success: boolean; error?: string } {
  const execution = getExecution(workflowId, executionId)
  if (!execution) return { success: false, error: 'Execution not found' }
  if (execution.status !== 'running') return { success: false, error: `Execution is already ${execution.status}` }

  cancelledExecutions.add(executionId)
  for (const cancelStep of activeExecutionProcesses.get(executionId) || []) {
    cancelStep()
  }

  const completedAt = new Date().toISOString()
  const cancellationMessage = 'Stopped by an operator. Steps already completed were not rolled back.'
  const cancelled: WorkflowExecution = {
    ...execution,
    status: 'cancelled',
    completedAt,
    heartbeatAt: completedAt,
    error: cancellationMessage,
    participants: execution.participants.map((participant) => (
      participant.status === 'running' || participant.status === 'pending'
        ? { ...participant, status: 'cancelled', completedAt, error: cancellationMessage }
        : participant
    )),
    logs: [...execution.logs, cancellationMessage],
  }
  const executionPath = path.join(getExecutionsDir(), workflowId, `${executionId}.json`)
  fs.writeFileSync(executionPath, JSON.stringify(cancelled, null, 2), 'utf-8')
  updateWorkflow(workflowId, { status: 'idle', progress: 0 } as any)
  return { success: true }
}

// Trigger workflow manually
export function triggerWorkflow(workflowId: string, options?: {
  manual?: boolean
  mock?: boolean
  byok?: WorkflowRuntimeOverrides
  secrets?: Record<string, string>
  inputs?: Record<string, string>
  outputs?: WorkflowExecution['outputs']
  actor?: {
    userId?: string
    login?: string
    email?: string | null
  }
}): { success: boolean; executionId?: string; error?: string } {
  let claimedExecutionId: string | undefined
  try {
    if (getWorkflowPipelineState().paused) {
      return { success: false, error: 'Workflow pipeline is paused. Resume the pipeline before starting new runs.' }
    }
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

    if (workflow.status === 'running' || activeWorkflowExecutions.has(workflowId)) {
      return { success: false, error: 'This workflow is already running. Stop the current run before starting another.' }
    }

    // Check maxRuns limit (skip for manual triggers)
    if (!options?.manual && workflow.maxRuns && workflow.maxRuns > 0) {
      const currentCount = workflow.runCount || 0
      if (currentCount >= workflow.maxRuns) {
        updateWorkflow(workflowId, { enabled: false })
        return { success: false, error: `Workflow reached max runs limit (${workflow.maxRuns}). Workflow has been disabled.` }
      }
    }

    // Claim synchronously before any asynchronous execution can start. Node cannot
    // interleave another trigger while this read/check/set section is running.
    const executionId = randomUUID()
    claimedExecutionId = executionId
    activeWorkflowExecutions.set(workflowId, executionId)

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

    // Create executions directory for workflow if it doesn't exist
    const workflowExecutionDir = path.join(getExecutionsDir(), workflowId)
    if (!fs.existsSync(workflowExecutionDir)) {
      fs.mkdirSync(workflowExecutionDir, { recursive: true })
    }

    // Resolve participants upfront
    const { listAgents } = require('./workspace')
    const agents = listAgents()
    const workflowParticipants = resolveParticipants(workflow, agents)
    const resolvedWorkflowParticipants = options?.mock && workflowParticipants.length === 0
      ? (() => {
          const seen = new Set<string>()
          const mockAgentIds = [
            workflow.owner,
            ...(workflow.targeting?.agents || []),
          ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
          return mockAgentIds.flatMap((agentId) => {
            if (seen.has(agentId)) return []
            seen.add(agentId)
            return [{
              agentId,
              agentName: agentId,
              reason: 'mock-target',
            }]
          })
        })()
      : workflowParticipants

    // Convert to execution participants with pending status
    const executionParticipants: WorkflowExecutionParticipant[] = resolvedWorkflowParticipants.map(p => ({
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

    const workspaceRoot = getWorkspacePath()
    const workflowSignalsPartner = (partner: 'github' | 'senso') => {
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
      runtimeContextLines.push('- Return your final response as plain text in this session; do not call message/send/channel tools for the current workflow group delivery')
      runtimeContextLines.push('- Do not create or look up separate session labels unless explicitly configured in the workspace')
      runtimeContextLines.push('- ClawMax will post your final response back into the current workflow group channel automatically')
      runtimeContextLines.push('- Do not treat missing external channel plugins or messaging transports as a failure for this workflow unless the workflow explicitly asks you to test those transports')
    }
    if ((workflow.targeting.communities || []).length > 0) {
      runtimeContextLines.push(`- Current workflow community channel(s): ${(workflow.targeting.communities || []).join(', ')}`)
      runtimeContextLines.push('- Return your final response as plain text in this session; do not call message/send/channel tools for the current workflow community delivery')
      runtimeContextLines.push('- ClawMax will post your final response back into the current workflow community channel automatically')
      runtimeContextLines.push('- Do not treat missing external channel plugins or messaging transports as a failure for this workflow unless the workflow explicitly asks you to test those transports')
    }
    if (runInstructions) {
      runtimeContextLines.push(`- Run-specific instructions: ${runInstructions}`)
      runtimeContextLines.push('- Treat the run-specific instructions as the highest-priority adjustment for this execution only')
    }
    const resolvedInputRefs = resolveWorkflowInputRefs(workflow)
    if (resolvedInputRefs.length > 0) {
      runtimeContextLines.push('- Upstream workflow handoffs available for this run:')
      for (const ref of resolvedInputRefs) {
        if (ref.missing) {
          runtimeContextLines.push(`- ${ref.label}: missing upstream output`)
          continue
        }
        const summary = ref.summary ? `summary: ${ref.summary}` : undefined
        const artifact = ref.artifactPath ? `artifact: ${ref.artifactPath}` : undefined
        const valueSummary = typeof ref.value === 'string'
          ? summarizeWorkflowOutputValue(ref.value, 140)
          : (ref.value !== undefined ? summarizeWorkflowOutputValue(JSON.stringify(ref.value), 140) : undefined)
        const value = valueSummary ? `value-summary: ${valueSummary}` : undefined
        runtimeContextLines.push(`- ${ref.label}: ${[summary, artifact, value].filter(Boolean).join(' | ')}`)
      }
      runtimeContextLines.push('- Use the upstream artifact path or summary as the source of truth; do not restate the full upstream document unless necessary.')
    }
    const resolvedPathInputs = Object.entries(executionInputs)
      .filter(([label, value]) => typeof value === 'string' && isPathLikeRunInput(label, value))
      .map(([label, value]) => ({
        label,
        raw: value.trim(),
        resolved: resolveWorkflowRunInputPath(value.trim(), workspaceRoot),
      }))
    if (resolvedPathInputs.length > 0) {
      runtimeContextLines.push(`- Active workspace root: \`${workspaceRoot}\``)
      runtimeContextLines.push('- Treat all relative run-input paths as relative to the active workspace root above')
      for (const entry of resolvedPathInputs) {
        runtimeContextLines.push(`- Resolved run input ${entry.label}: raw \`${entry.raw}\` -> absolute \`${entry.resolved}\``)
      }
    }
    const compactedWorkflowContent = compactWorkflowExecutionContent(workflow.content || 'Execute workflow')
    const executionMessage = runtimeContextLines.length > 0
      ? `${compactedWorkflowContent}\n\n---\nWorkspace Integration Defaults:\n${runtimeContextLines.join('\n')}\n---\n`
      : compactedWorkflowContent

    // Create execution record with participants and inputs
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      startedAt: new Date().toISOString(),
      status: 'running',
      triggerType: 'manual',
      participants: executionParticipants,
      logs: [`Workflow triggered at ${new Date().toISOString()}`, `Targeting ${executionParticipants.length} agent(s)`],
      ownerPid: process.pid,
      ownerBootId: WORKFLOW_RUNNER_BOOT_ID,
      heartbeatAt: new Date().toISOString(),
      inputs: Object.keys(executionInputs).length > 0 ? executionInputs : undefined,
      outputs: normalizeWorkflowExecutionOutputs(options?.outputs),
    }

    // Write execution file
    const executionFilePath = path.join(workflowExecutionDir, `${executionId}.json`)
    fs.writeFileSync(executionFilePath, JSON.stringify(execution, null, 2), 'utf-8')

    // Run workflow by calling each participant agent directly
    const executeAsync = async () => {
      const executionFilePath = path.join(workflowExecutionDir, `${executionId}.json`)
      const persistExecution = () => {
        try {
          if (execution.status === 'running') execution.heartbeatAt = new Date().toISOString()
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

      if (options?.mock) {
        for (const participant of executionParticipants) {
          participant.status = 'running'
          participant.startedAt = new Date().toISOString()
          execution.logs.push(`Agent ${participant.agentId} running in mock mode`)
          updateAggregateProgress()
          persistExecution()

          const mockResponse = buildMockWorkflowResponse(workflow, participant, resolvedInputRefs, executionInputs)
          ;(participant as any).response = mockResponse
          participant.status = 'completed'
          participant.completedAt = new Date().toISOString()
          execution.logs.push(`Agent ${participant.agentId} completed mock execution`)
          updateAggregateProgress()
          persistExecution()
        }

        execution.outputs = deriveWorkflowExecutionOutputs(
          workflow,
          execution.participants.map((participant) => ({
            agentId: participant.agentId,
            response: (participant as any).response,
          })),
          execution.outputs
        )
        execution.outputs = persistWorkflowExecutionOutputArtifacts(workflowId, execution.outputs)
        execution.status = 'completed'
        execution.completedAt = new Date().toISOString()
        execution.logs.push(`Workflow completed at ${execution.completedAt} (mock mode)`)
        persistExecution()
        updateWorkflow(workflowId, {
          status: 'completed',
          progress: 100,
        } as any)

        const { readyToRun } = completeWorkflow(workflowId)
        if (readyToRun.length > 0) {
          execution.logs.push(`DAG: unlocked ${readyToRun.join(', ')}`)
          persistExecution()
          for (const nextId of readyToRun) {
            const nextWf = getWorkflow(nextId)
            if (nextWf?.enabled) {
              triggerWorkflow(nextId, { manual: false, mock: true, byok: options?.byok })
              updateWorkflow(nextId, { status: 'running' } as any)
            }
          }
        }
        return
      }

      const runParticipant = async (participant: WorkflowExecutionParticipant) => {
        try {
          if (isExecutionCancelled(executionId)) {
            participant.status = 'cancelled'
            participant.completedAt = new Date().toISOString()
            return
          }
          participant.status = 'running' as any
          participant.startedAt = new Date().toISOString()
          updateAggregateProgress()
          persistExecution()

          // Call agent via CLI
          let workflowSessionRetryAttempt = 0
          // Registers this step so it shows up in listActiveTurns and is reachable by cancelTurn --
          // without this, the step held runExclusiveAgentExecution's per-agent lock but was invisible
          // to the registry and unstoppable by anything, including the "stop this agent" path.
          const agentResponse = await withRegisteredTurn(participant.agentId, (turn) => runExclusiveAgentExecution(participant.agentId, async () => {
            const resolvedAgent = resolveAgentExecutionConfig(participant.agentId)
            if (resolvedAgent.runtime !== 'openclaw') {
              // 2.0 builds executionEnv per attempt inside executeAttempt(), so the runtime path
              // builds its own provider-isolated env instead of reusing an outer binding that no
              // longer exists. Mirrors executeAttempt() so claude/droid agents get the same
              // provider isolation and brokered skill-secret access as the openclaw path.
              const useRuntimeOpenAiCompatible = resolvedAgent.provider === 'openai-compatible'
              const runtimeExecutionEnv = workflowExecutionEnv({
                openai: resolvedAgent.provider === 'openai' ? options?.byok?.openai : undefined,
                anthropic: resolvedAgent.provider === 'anthropic' ? options?.byok?.anthropic : undefined,
                gemini: resolvedAgent.provider === 'gemini' ? options?.byok?.gemini : undefined,
                openrouter: resolvedAgent.provider === 'openrouter' ? options?.byok?.openrouter : undefined,
                xai: resolvedAgent.provider === 'xai' ? options?.byok?.xai : undefined,
                ollamaBaseUrl: resolvedAgent.provider === 'ollama'
                  ? (options?.byok?.ollamaBaseUrl || integrationDefaults.ollamaBaseUrl)
                  : undefined,
                openaiCompatibleApiKey: useRuntimeOpenAiCompatible ? options?.byok?.openaiCompatibleApiKey : undefined,
                openaiCompatibleBaseUrl: useRuntimeOpenAiCompatible
                  ? (options?.byok?.openaiCompatibleBaseUrl || integrationDefaults.openaiCompatibleBaseUrl)
                  : undefined,
                openaiCompatibleDefaultModel: useRuntimeOpenAiCompatible
                  ? (options?.byok?.openaiCompatibleDefaultModel || integrationDefaults.openaiCompatibleDefaultModel)
                  : undefined,
              }, resolvedAgent.provider || undefined)
              runtimeExecutionEnv.CLAWMAX_AGENT_ID = participant.agentId
              const runtimeBrokerCapability = createBrokerCapabilityToken(participant.agentId)
              if (runtimeBrokerCapability) {
                runtimeExecutionEnv.CLAWMAX_SECRET_BROKER_TOKEN = runtimeBrokerCapability
                runtimeExecutionEnv.CLAWMAX_SECRET_BROKER_URL = `http://127.0.0.1:${process.env.DASHBOARD_PORT || '3001'}/api/runtime/skill-broker/execute`
              }

              const runtimeSessionId = buildWorkflowSessionId(executionId, participant.agentId)
              const startedAt = Date.now()
              const { text, errorText, missingCliError } = await executeAgentRuntimeTurn({
                runtime: resolvedAgent.runtime,
                agentId: participant.agentId,
                agentDir: resolvedAgent.workspace || path.join(getWorkspacePath(), 'AGENTS', participant.agentId),
                message: executionMessage,
                scopedSessionId: runtimeSessionId,
                model: resolvedAgent.model,
                mode: 'json',
                env: runtimeExecutionEnv,
                // No deadline: a workflow step runs until it finishes or is cancelled. The registered
                // turn's signal is the only way this ever stops early -- a throwaway
                // `new AbortController().signal` here was a signal nothing could ever call abort() on.
                signal: turn.signal,
                onActivity: turn.touch,
              })
              if (missingCliError) throw new Error(missingCliError)
              if (errorText) {
                throw new Error(isRuntimeCancelledError(errorText) ? 'Workflow step was stopped.' : errorText)
              }
              return { text, meta: {}, durationMs: Date.now() - startedAt } as any
            }

            const openclawCliPath = resolveWorkflowOpenClawCliPath()
            const executeAttempt = async (attemptModel: string | undefined, attemptProvider: typeof resolvedAgent.provider) => {
              const useOpenAiCompatible = attemptProvider === 'openai-compatible'
              const executionEnv = workflowExecutionEnv({
                openai: attemptProvider === 'openai' ? options?.byok?.openai : undefined,
                anthropic: attemptProvider === 'anthropic' ? options?.byok?.anthropic : undefined,
                gemini: attemptProvider === 'gemini' ? options?.byok?.gemini : undefined,
                openrouter: attemptProvider === 'openrouter' ? options?.byok?.openrouter : undefined,
                xai: attemptProvider === 'xai' ? options?.byok?.xai : undefined,
                ollamaBaseUrl: attemptProvider === 'ollama'
                  ? (options?.byok?.ollamaBaseUrl || integrationDefaults.ollamaBaseUrl)
                  : undefined,
                openaiCompatibleApiKey: useOpenAiCompatible ? options?.byok?.openaiCompatibleApiKey : undefined,
                openaiCompatibleBaseUrl: useOpenAiCompatible
                  ? (options?.byok?.openaiCompatibleBaseUrl || integrationDefaults.openaiCompatibleBaseUrl)
                  : undefined,
                openaiCompatibleDefaultModel: useOpenAiCompatible
                  ? (options?.byok?.openaiCompatibleDefaultModel || integrationDefaults.openaiCompatibleDefaultModel)
                  : undefined,
              }, attemptProvider || undefined)
              executionEnv.CLAWMAX_AGENT_ID = participant.agentId
              const brokerCapability = createBrokerCapabilityToken(participant.agentId)
              if (brokerCapability) {
                executionEnv.CLAWMAX_SECRET_BROKER_TOKEN = brokerCapability
                executionEnv.CLAWMAX_SECRET_BROKER_URL = `http://127.0.0.1:${process.env.DASHBOARD_PORT || '3001'}/api/runtime/skill-broker/execute`
                executionEnv.CLAWMAX_MAIL_BROKER_TOKEN = brokerCapability
                executionEnv.CLAWMAX_MAIL_BROKER_URL = `http://127.0.0.1:${process.env.DASHBOARD_PORT || '3001'}/api/runtime/mail`
              }
              const hasOllamaPath = !!(executionEnv.OLLAMA_BASE_URL || integrationDefaults.ollamaDefaultModel)
              if (attemptProvider === 'ollama' && !hasOllamaPath) {
                throw new Error(`Agent ${participant.agentId} is configured for ${attemptModel || 'ollama'}, but no Ollama runtime is configured`)
              }
              const gatewayRunning = attemptProvider === 'ollama'
                ? false
                : (await waitForGatewayResponsive()).running
              const useLocal = attemptProvider === 'ollama' || attemptProvider === 'openai-compatible' || !gatewayRunning || hasWorkspaceManagedPartnerSecrets()
              const sessionId = buildWorkflowRetrySessionId(executionId, participant.agentId, workflowSessionRetryAttempt)
              const executionModelOverride = toExecutionModelOverride(attemptModel, attemptProvider)
              repairWorkflowSessionEntryForRun(participant.agentId, sessionId)
              const args = ['agent', '--agent', participant.agentId, '--session-id', sessionId, '--message', executionMessage, '--json', ...(executionModelOverride ? ['--model', executionModelOverride] : []), ...(useLocal ? ['--local'] : [])]
              if (isExecutionCancelled(executionId)) throw new Error('Workflow execution was cancelled')
              return await new Promise<any>((resolve, reject) => {
                withTemporaryAgentAuthProfiles(participant.agentId, {
                  openai: attemptProvider === 'openai-compatible' ? undefined : executionEnv.OPENAI_API_KEY,
                  anthropic: executionEnv.ANTHROPIC_API_KEY,
                  gemini: executionEnv.GEMINI_API_KEY,
                  openrouter: executionEnv.OPENROUTER_API_KEY,
                  xai: executionEnv.XAI_API_KEY,
                  openaiCompatibleApiKey: attemptProvider === 'openai-compatible' ? executionEnv.OPENAI_API_KEY : undefined,
                  openaiCompatibleBaseUrl: attemptProvider === 'openai-compatible' ? executionEnv.OPENAI_BASE_URL : undefined,
                  openaiCompatibleDefaultModel: attemptProvider === 'openai-compatible'
                    ? (options?.byok?.openaiCompatibleDefaultModel || integrationDefaults.openaiCompatibleDefaultModel || attemptModel)
                    : undefined,
                }, attemptModel, attemptProvider, async () => {
                  await new Promise<void>((innerResolve) => {
                    // Detached on POSIX so the child leads its own process group -- openclaw spawns
                    // its own children, and signalling only the direct child leaves those
                    // grandchildren alive holding stdout open, same reason agent-runtime.ts's
                    // runOnce spawns detached for the chat/direct path. Not detached on win32:
                    // Windows has no process groups, and a detached child there opens its own
                    // console window instead of just backgrounding.
                    const proc = spawn(openclawCliPath, args, {
                      detached: process.platform !== 'win32',
                      env: executionEnv,
                    })
                    // Tracked so an operator's whole-execution Stop (cancelExecution, which has no
                    // turn to signal) can still reach this process; released in settle() below.
                    const executionProcesses = activeExecutionProcesses.get(executionId) || new Set<() => void>()
                    // Registered as a canceller so an operator Stop runs the SAME path as turn
                    // cancellation below, which guarantees this promise settles.
                    const cancelThisStep = () => onCancel()
                    executionProcesses.add(cancelThisStep)
                    activeExecutionProcesses.set(executionId, executionProcesses)
                    const releaseProcess = () => {
                      executionProcesses.delete(cancelThisStep)
                      if (executionProcesses.size === 0) activeExecutionProcesses.delete(executionId)
                    }
                    let stdout = ''
                    let stderr = ''
                    // No deadline. A workflow step legitimately runs for as long as its work takes;
                    // the registered turn's signal below -- or the operator Stop above -- are the
                    // only things that can end it early.
                    let settled = false
                    let killEscalation: NodeJS.Timeout | undefined

                    const settle = (fn: () => void) => {
                      if (settled) return
                      settled = true
                      turn.signal.removeEventListener('abort', onCancel)
                      if (killEscalation) clearTimeout(killEscalation)
                      releaseProcess()
                      // Detach before settling. A cancelled step whose grandchild escaped the group
                      // keeps writing to the still-open pipe, and these listeners would go on
                      // mutating this step's captured output -- and its progress -- after it was
                      // stopped. Every sibling spawn site does this; this one was the odd copy out.
                      detachProcessStreams(proc)
                      fn()
                      innerResolve()
                    }

                    function onCancel() {
                      if (settled) return
                      // SIGTERM, then an unconditional group SIGKILL, then settle -- see
                      // cancelProcessTree. Waiting on 'close' would wedge this step's promise
                      // forever behind an escaped grandchild holding stdout open.
                      killEscalation = cancelProcessTree(proc, () => settle(() => reject(new Error('Workflow step was stopped.'))))
                    }

                    if (turn.signal.aborted) {
                      // Already cancelled before this listener attached -- 'abort' has already fired
                      // and will never fire again, so addEventListener here would never run.
                      onCancel()
                    } else {
                      turn.signal.addEventListener('abort', onCancel, { once: true })
                    }

                    let progressTicks = 0
                    proc.stdout.on('data', (d: Buffer) => {
                      stdout += d.toString()
                      turn.touch()
                      progressTicks++
                      const estimated = Math.min(20 + progressTicks * 10, 90)
                      const current = getWorkflow(workflowId)?.progress || 0
                      updateWorkflow(workflowId, { progress: Math.max(current, estimated) } as any)
                    })
                    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); turn.touch() })
                    proc.on('close', (code: number) => {
                      settle(() => {
                        const payloadText = extractWorkflowAgentResultPayload(stdout, stderr)
                        if (code !== 0 && !payloadText) {
                          reject(new Error(`Agent failed: ${stderr.slice(0, 200)}`))
                          return
                        }
                        try {
                          resolve(parseWorkflowAgentResultPayload(payloadText) as any)
                        } catch (error) {
                          reject(error)
                        }
                      })
                    })
                    proc.on('error', (err) => {
                      settle(() => reject(err))
                    })
                  })
                }, { persistAuthProfiles: true, skipModelConfigMutation: true }).catch(reject)
              })
            }

            try {
              return await executeAttempt(resolvedAgent.model, resolvedAgent.provider)
            } catch (err: any) {
              const fallbackModel = resolvedAgent.backupModel
              const fallbackProvider = resolvedAgent.backupProvider
              if (!shouldUseExplicitBackupModelRetry({
                backupModel: fallbackModel,
                backupProvider: fallbackProvider,
                rawError: err?.message || String(err),
              })) {
                throw err
              }
              console.log(`[Workflow] Retrying ${participant.agentId} with fallback model ${fallbackModel}`)
              return await executeAttempt(fallbackModel, fallbackProvider)
            }
          }, {
            maxSessionLockRetries: 1,
            onSessionLockRetry: (attempt) => {
              workflowSessionRetryAttempt = attempt + 1
              const sessionId = buildWorkflowRetrySessionId(executionId, participant.agentId, workflowSessionRetryAttempt)
              repairWorkflowSessionEntryForRun(participant.agentId, sessionId)
            },
          }))

          if (isExecutionCancelled(executionId)) {
            participant.status = 'cancelled'
            participant.completedAt = new Date().toISOString()
            persistExecution()
            return
          }

          const agentResult = agentResponse as any
          const rawAgentText = stripBenignOpenClawRuntimeWarnings(agentResult.text || '')
          const agentText = enrichAgentContextOverflow(participant.agentId, rawAgentText)
          const normalizedThreadDiagnostic = normalizeWorkflowThreadDiagnostic(agentText)
          const surfacedAgentText = normalizedThreadDiagnostic || agentText
          const agentMeta = agentResult.meta || {}
          const reportedFailure = detectParticipantReportedFailure(agentText)

          participant.status = reportedFailure ? 'failed' as any : 'completed' as any
          ;(participant as any).response = agentText
          if (reportedFailure) {
            ;(participant as any).error = formatParticipantFailure(reportedFailure)
          }
          participant.completedAt = new Date().toISOString()
          execution.logs.push(
            reportedFailure
              ? `Agent ${participant.agentId} reported failure: ${reportedFailure}`
              : `Agent ${participant.agentId} completed: ${agentText.slice(0, 100)}`
          )

          // Detect blockers/questions from agent output
          const { createNotification, createWriterAttributedArtifactNotification, extractWorkspaceArtifactMentions } = require('./notifications')
          const textLower = agentText.toLowerCase()
          const isQuestion = /\?\s*$/.test(agentText.trim()) || /what should|which (one|option)|ready for.*planning|need.*decision|waiting for|blocked by|please (choose|decide|confirm|approve)/i.test(agentText)
          const isError = /error|failed|cannot|unable to|permission denied|access denied|rate limit/i.test(textLower) && agentText.length < 500

          if (isQuestion) {
            const conversationTarget = resolveWorkflowConversationTarget(workflow.targeting || {})
            createNotification({
              type: 'agent-needs-decision',
              title: `${participant.agentId} needs input`,
              message: summarizeAgentInputRequest(agentText),
              entityId: participant.agentId,
              entityType: 'agent',
              fingerprint: `agent-question:${workflowId}:${participant.agentId}:${execution.id}`,
              blockerType: 'input',
              workflowId,
              executionId: execution.id,
              conversationTarget: conversationTarget?.name,
              conversationTargetType: conversationTarget?.type,
            })
            console.log(`[DAG] Agent ${participant.agentId} asked a question — notification created`)
          } else if (isError) {
            createNotification({
              type: 'agent-error',
              title: `${participant.agentId} reported an error`,
              message: surfacedAgentText.slice(0, 300),
              entityId: participant.agentId,
              entityType: 'agent',
              fingerprint: `agent-error:${workflowId}:${participant.agentId}:${execution.id}`,
              workflowId,
              executionId: execution.id,
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
              executionId: execution.id,
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

          for (const artifactPath of extractWorkspaceArtifactMentions(agentText, getWorkspacePath())) {
            createWriterAttributedArtifactNotification({
              agentId: participant.agentId,
              artifactPath,
              workflowId,
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
            dashboardInstanceId: getConfiguredDashboardInstanceId(),
          })

          // Post response to targeted groups/communities
          if (surfacedAgentText && surfacedAgentText.trim()) {
            const communicationTargets = resolveWorkflowCommunicationTargets(workflow.targeting || {})
            const communicationTargetError = formatWorkflowCommunicationTargetError(communicationTargets)
            if (communicationTargetError) {
              throw new Error(communicationTargetError)
            }
            for (const group of communicationTargets.groups) {
              addMessage('group', group, {
                from: participant.agentId,
                content: surfacedAgentText,
                mentions: []
              })
            }
            for (const community of communicationTargets.communities) {
              addMessage('community', community, {
                from: participant.agentId,
                content: surfacedAgentText,
                mentions: []
              })
            }
          }
        } catch (err: any) {
          if (isExecutionCancelled(executionId)) {
            participant.status = 'cancelled'
            ;(participant as any).error = 'Stopped by an operator.'
            participant.completedAt = new Date().toISOString()
            persistExecution()
            return
          }
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

      if (isExecutionCancelled(executionId)) {
        execution.status = 'cancelled'
        execution.completedAt = new Date().toISOString()
        execution.error = 'Stopped by an operator. Steps already completed were not rolled back.'
        execution.logs.push(execution.error)
        persistExecution()
        updateWorkflow(workflowId, { status: 'idle', progress: 0 } as any)
        return
      }

      execution.outputs = deriveWorkflowExecutionOutputs(
        workflow,
        execution.participants.map((participant) => ({
          agentId: participant.agentId,
          response: (participant as any).response,
        })),
        execution.outputs
      )
      execution.outputs = persistWorkflowExecutionOutputArtifacts(workflowId, execution.outputs)

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
        const { resolveWorkflowExecutionNotifications } = require('./notifications')
        resolveWorkflowExecutionNotifications(workflowId, execution.id, { includeOlderExecutions: true })
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
          executionId: execution.id,
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
        dashboardInstanceId: getConfiguredDashboardInstanceId(),
      })
    }

    // Fire and forget
    executeAsync()
      .catch(err => console.error('Workflow execution error:', err))
      .finally(() => {
        if (activeWorkflowExecutions.get(workflowId) === executionId) activeWorkflowExecutions.delete(workflowId)
        activeExecutionProcesses.delete(executionId)
        cancelledExecutions.delete(executionId)
      })

    return { success: true, executionId }
  } catch (error: any) {
    if (claimedExecutionId && activeWorkflowExecutions.get(workflowId) === claimedExecutionId) {
      activeWorkflowExecutions.delete(workflowId)
    }
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
export function extractWorkflowAgentResultPayload(stdout: string, stderr: string): string {
  const trimmedStdout = stdout.trim()
  if (trimmedStdout) return trimmedStdout

  const trimmedStderr = stripBenignOpenClawRuntimeWarnings(stderr)
  if (!trimmedStderr) return ''

  const jsonObjectStart = trimmedStderr.indexOf('{')
  const jsonArrayStart = trimmedStderr.indexOf('[')
  const starts = [jsonObjectStart, jsonArrayStart].filter((index) => index >= 0)
  if (starts.length === 0) return ''
  const jsonStart = Math.min(...starts)
  return trimmedStderr.slice(jsonStart).trim()
}
