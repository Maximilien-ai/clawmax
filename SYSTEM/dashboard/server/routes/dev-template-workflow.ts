import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import type { Request } from 'express'
import { getWorkspaceManager } from '../lib/workspace-manager'
import { configuredTemplateResolverFromEnv } from '../lib/template-service'
import { revalidateTemplateAuthority } from '../lib/template-authority'
import { templateStoragePath } from '../lib/template-storage-path'
import { devHostSkillChatEnabled, isDevHostSkillChatReady, runDevHostSkillChatTurn } from './dev-host-skill-chat'
import { addMessage } from '../lib/messages'
import { withRegisteredTurn } from '../lib/agent-turns'
import { normalizeChatMessage } from '../lib/chat-normalization'
import { saveWorkflowBrief } from '../lib/workflow-brief'

const workflowIdPattern = /^tr-[a-f0-9]{16}-workflow-[a-f0-9]{12}$/
const agentIdPattern = /^tr-[a-f0-9]{16}-agent-[a-f0-9]{12}$/
const groupIdPattern = /^tr-[a-f0-9]{16}-group-[a-f0-9]{12}$/
type DevRunStatus = 'running' | 'completed' | 'failed'
export interface DevTemplateWorkflowRun {
  runId: string; workflowId: string; groupId: string; status: DevRunStatus
  createdAt: string; completedAt?: string; error?: string
  collectorId?: string; specialistId?: string; stage?: 'collector' | 'handoff' | 'specialist' | 'completed'
  brief?: { title: string; content: string; artifactPath: string }
}
const active = new Set<string>()

export function isDevTemplateWorkflowId(id: string): boolean { return workflowIdPattern.test(id) }

export function settleInterruptedDevRun(run: DevTemplateWorkflowRun, isActive: boolean, now: string): DevTemplateWorkflowRun {
  if (run.status !== 'running' || isActive) return run
  return { ...run, status: 'failed',
    error: 'Dev Workflow was interrupted before completion. Review its Group transcript before retrying.',
    completedAt: now }
}

export function formatDevWorkflowHandoff(text: string): string {
  const trimmed = text.trim()
  if (!trimmed || Buffer.byteLength(trimmed) > 64 * 1024) throw new Error('Collector report unavailable')
  // Shared chat strips bare JSON runtime artifacts. A blockquote preserves
  // bounded business JSON as an intentional Agent-to-Group handoff.
  const visible = /^(?:\{|\[)/.test(trimmed) ? `Collector structured report:\n> ${trimmed.replace(/\n/g, '\n> ')}` : trimmed
  if (!normalizeChatMessage(visible).trim()) throw new Error('Collector Group handoff unavailable')
  return visible
}

function allowed(req: Request): boolean {
  return devHostSkillChatEnabled(process.env, req.get('Origin'), req.socket.remoteAddress)
}

export function captureDevWorkflowAdmission(req: Request): Request {
  const origin = req.get('Origin')
  const remoteAddress = req.socket.remoteAddress
  return {
    get: (header: string) => header.toLowerCase() === 'origin' ? origin : undefined,
    socket: { remoteAddress },
  } as Request
}

/** Same-origin browser GETs omit Origin. Require both browser fetch metadata
 * and the exact local app referrer before admitting a read-only history call. */
export function admitDevWorkflowReadRequest(req: Request): Request {
  if (req.get('Origin') || req.method !== 'GET'
    || req.get('Sec-Fetch-Site') !== 'same-origin'
    || !/^http:\/\/localhost:5174(?:\/|$)/.test(req.get('Referer') || '')) return req
  return {
    get: (header: string) => header.toLowerCase() === 'origin' ? 'http://localhost:5174' : req.get(header),
    socket: { remoteAddress: req.socket.remoteAddress },
  } as Request
}

function readSidecar(root: string, relative: string): any {
  const file = templateStoragePath(root, relative)
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
  try {
    const stat = fs.fstatSync(fd)
    if (!stat.isFile() || stat.size < 1 || stat.size > 2 * 1024 * 1024) throw new Error('Template sidecar unavailable')
    return JSON.parse(fs.readFileSync(fd, 'utf8'))
  } finally { fs.closeSync(fd) }
}

function resolve(req: Request, workflowId: string) {
  if (!allowed(req) || !workflowIdPattern.test(workflowId)) throw new Error('Dev Workflow unavailable')
  const workspaceId = process.env.CLAWMAX_DEV_HOST_WORKSPACE_ID || ''
  const actorId = process.env.CLAWMAX_DEV_HOST_ACTOR_ID || ''
  const manager = getWorkspaceManager()
  if (manager.getActiveWorkspaceId() !== workspaceId) throw new Error('Dev Workspace unavailable')
  const workspace = manager.getWorkspace(workspaceId)
  const resolver = configuredTemplateResolverFromEnv()
  if (!workspace || !resolver) throw new Error('Dev Workflow authority unavailable')
  const service = resolver({ workspaceId, workspacePath: workspace.path, actorId })
  const revisions = service.store.history().filter(revision => !revision.cleanedAt && revision.actorId === actorId
    && Object.values(revision.resources.workflows).includes(workflowId))
  if (revisions.length !== 1) throw new Error('Dev Workflow authority unavailable')
  const revision = revisions[0]
  const current = service.store.verifyExecutionResources(actorId, revision.id, workflowId)
  if (!current.authority) throw new Error('Dev Workflow authority unavailable')
  revalidateTemplateAuthority(current.authority, current.authorityDigest, { workspaceId, actorId }, service.authority)
  const workflow = readSidecar(workspace.path, `WORKFLOWS/${workflowId}.json`)
  if (workflow.id !== workflowId || workflow.enabled !== false || !Array.isArray(workflow.steps)
    || workflow.steps.length !== 2 || workflow.steps[0].targetKind !== 'agent'
    || workflow.steps[1].targetKind !== 'group' || !agentIdPattern.test(workflow.steps[0].targetId)
    || !groupIdPattern.test(workflow.steps[1].targetId)) throw new Error('Dev Workflow graph unavailable')
  const collectorId: string = workflow.steps[0].targetId
  const groupId: string = workflow.steps[1].targetId
  if (!Object.values(revision.resources.agents).includes(collectorId)
    || !Object.values(revision.resources.groups).includes(groupId)) throw new Error('Dev Workflow ownership unavailable')
  const group = readSidecar(workspace.path, `ORG/template-groups/${groupId}.json`)
  const members = Array.isArray(group.members) ? group.members.map((member: any) => member.agentId) : []
  if (group.id !== groupId || group.state !== 'stopped' || members.length !== 2
    || !members.includes(collectorId) || !members.every((id: unknown) => typeof id === 'string' && agentIdPattern.test(id)
      && Object.values(revision.resources.agents).includes(id))) throw new Error('Dev Workflow Group unavailable')
  const specialistId = members.find((id: string) => id !== collectorId) as string
  if (!isDevHostSkillChatReady(req, collectorId) || !isDevHostSkillChatReady(req, specialistId)) throw new Error('Dev Workflow Agents unavailable')
  return { root: workspace.path, workflow, group, collectorId, specialistId, groupId, revisionId: revision.id }
}

function runFile(root: string, runId: string): string {
  return templateStoragePath(root, `SYSTEM/dev-template-workflow-runs/${runId}.json`)
}

function persist(root: string, run: DevTemplateWorkflowRun): void {
  const file = runFile(root, run.runId)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(run), { mode: 0o600, flag: 'wx' })
  fs.renameSync(temporary, file)
}

export function getDevTemplateWorkflowRun(req: Request, workflowId: string, runId: string): DevTemplateWorkflowRun | null {
  if (!/^[a-f0-9-]{36}$/.test(runId)) return null
  const context = resolve(admitDevWorkflowReadRequest(req), workflowId)
  try {
    const run = readSidecar(context.root, `SYSTEM/dev-template-workflow-runs/${runId}.json`) as DevTemplateWorkflowRun
    if (run.runId !== runId || run.workflowId !== workflowId) return null
    const settled = settleInterruptedDevRun(run, active.has(workflowId), new Date().toISOString())
    if (settled !== run) persist(context.root, settled)
    return settled
  } catch { return null }
}

export function listDevTemplateWorkflowRuns(req: Request, workflowId: string, limit: number): DevTemplateWorkflowRun[] {
  const context = resolve(admitDevWorkflowReadRequest(req), workflowId)
  const directory = templateStoragePath(context.root, 'SYSTEM/dev-template-workflow-runs')
  let names: string[]
  try { names = fs.readdirSync(directory) } catch (error: any) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  return names.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))
    .map(name => getDevTemplateWorkflowRun(req, workflowId, name.slice(0, -5)))
    .filter((run): run is DevTemplateWorkflowRun => run !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.max(1, Math.min(limit, 20)))
}

export function devRunAsExecution(run: DevTemplateWorkflowRun) {
  const collectorStatus = run.status === 'completed' ? 'completed'
    : run.status === 'failed' && (!run.stage || run.stage === 'collector') ? 'failed'
    : run.stage === 'handoff' || run.stage === 'specialist' ? 'completed' : 'running'
  const specialistStatus = run.status === 'completed' ? 'completed'
    : run.status === 'failed' && run.stage === 'specialist' ? 'failed'
    : run.status === 'running' && run.stage === 'specialist' ? 'running' : 'pending'
  const participants = [
    run.collectorId && { agentId: run.collectorId, agentName: 'Collector', status: collectorStatus },
    run.specialistId && { agentId: run.specialistId, agentName: 'Specialist', status: specialistStatus },
  ].filter((item): item is { agentId: string; agentName: string; status: string } => !!item)
  return {
    id: run.runId, workflowId: run.workflowId, startedAt: run.createdAt, completedAt: run.completedAt,
    status: run.status, triggerType: 'manual', triggeredBy: 'Dev Workspace', participants, inputs: undefined,
    brief: run.brief,
    logs: ['Dev-only manual Template run; schedule remained off.', `Linked Group: ${run.groupId}`,
      ...(run.error ? [run.error] : [])],
  }
}

export function startDevTemplateWorkflow(req: Request, workflowId: string): DevTemplateWorkflowRun {
  const context = resolve(req, workflowId)
  // The HTTP socket may close as soon as the 202 response is sent. Capture
  // the already-admitted loopback origin before starting background work;
  // each turn still rechecks live environment, Workspace and Skill authority.
  const admittedRequest = captureDevWorkflowAdmission(req)
  if (active.has(workflowId)) throw new Error('Dev Workflow is already running')
  const run: DevTemplateWorkflowRun = { runId: crypto.randomUUID(), workflowId, groupId: context.groupId,
    collectorId: context.collectorId, specialistId: context.specialistId, stage: 'collector',
    status: 'running', createdAt: new Date().toISOString() }
  persist(context.root, run)
  active.add(workflowId)
  void (async () => {
    let stage = 'Collector turn'
    try {
      const collectorPrompt = `${context.workflow.steps[0].objective}\nUse your assigned read-only Skill and return a concise report for the linked Group. This is a manual dev Workflow run.`
      const collected = await withRegisteredTurn(context.collectorId, turn => runDevHostSkillChatTurn(admittedRequest, context.collectorId, collectorPrompt, turn.signal))
      resolve(admittedRequest, workflowId)
      stage = 'Group handoff'
      run.stage = 'handoff'
      persist(context.root, run)
      addMessage('group', context.groupId, { from: context.collectorId, content: formatDevWorkflowHandoff(collected), mentions: [context.specialistId] })
      stage = 'Specialist turn'
      run.stage = 'specialist'
      persist(context.root, run)
      const specialistPrompt = `${context.workflow.steps[1].objective}\nWrite the final Markdown brief for ${context.workflow.name}, with findings, limitations, risks, and recommended next steps. Base claims only on the Collector report; clearly identify missing data. The Dashboard will save this brief and update the latest brief after success. You are reviewing the Collector's report in your assigned Group. Do not claim to run a Skill or perform writes. Collector report:\n${collected}`
      const reviewed = await withRegisteredTurn(context.specialistId, turn => runDevHostSkillChatTurn(admittedRequest, context.specialistId, specialistPrompt, turn.signal))
      resolve(admittedRequest, workflowId)
      addMessage('group', context.groupId, { from: context.specialistId, content: reviewed, mentions: [context.collectorId] })
      stage = 'Brief persistence'
      run.brief = saveWorkflowBrief(context.root, workflowId, context.workflow.name, run.runId, reviewed)
      run.status = 'completed'
      run.stage = 'completed'
    } catch {
      run.status = 'failed'
      run.error = `${stage} failed. Check Agent sign-in and current authority; review the linked Group transcript before retrying.`
    } finally {
      run.completedAt = new Date().toISOString()
      try { persist(context.root, run) } finally { active.delete(workflowId) }
    }
  })()
  return run
}
