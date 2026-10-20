import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Router, type Request, type Response } from 'express'
import * as workflows from '../lib/workflows'
import { assertTemplateRuntimeAdmitted } from '../lib/template-runtime-admission'
import type { CliChatContext } from './instance-chat'

const API_VERSION = 'clawmax.instance/v1'
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
type RunOwner = { workflowId: string; runId: string }
type Claim = { digest: string; runId?: string; failed?: boolean }
type Runtime = Pick<typeof workflows, 'getWorkflow' | 'triggerWorkflow' | 'getExecution' | 'cancelExecution' | 'isWorkflowExecutionActive'>

function read<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch (error: any) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}
function write(file: string, data: unknown, exclusive = false) {
  const temporary = exclusive ? file : `${file}.${crypto.randomUUID()}.tmp`
  const fd = fs.openSync(temporary, 'wx', 0o600)
  try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  if (!exclusive) fs.renameSync(temporary, file)
  const parent = fs.openSync(path.dirname(file), 'r')
  try { fs.fsyncSync(parent) } finally { fs.closeSync(parent) }
}
function canonical(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value)
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))))
}

export function createInstanceWorkflowsRouter(options: {
  authorize(req: Request, res: Response): CliChatContext | null
  runtime?: Runtime
  cancelWaitMs?: number
}) {
  const runtime = options.runtime || workflows
  const router = Router({ mergeParams: true })
  const register = (method: 'get' | 'post', route: string, operation: string) => {
    router[method](route, async (req: Request, res: Response) => {
      const requestId = `req_${crypto.randomUUID()}`
      const fail = (status: number, code: string, message: string, retryable = false) => res.status(status).json({
        apiVersion: API_VERSION, kind: 'Error', requestId, error: { code, message, retryable },
      })
      const send = (kind: string, fields: object, status = 200) => {
        const body = { apiVersion: API_VERSION, kind, ...fields }
        if (Buffer.byteLength(JSON.stringify(body)) > 3 * 1024 * 1024) return fail(413, 'result_too_large', 'Result exceeds the public response limit')
        return res.status(status).json(body)
      }
      try {
        const context = options.authorize(req, res)
        if (!context) return
        await context.run(async () => {
          context.assertAuthorized()
          const { workflowId, runId } = req.params
          if ((workflowId && !ID.test(workflowId)) || (runId && !ID.test(runId))) {
            fail(400, 'invalid_request', 'Invalid resource identifier'); return
          }
          const directory = path.join(context.workspacePath, '.clawmax', 'cli-workflows', hash(context.actorId))
          const runPath = (id: string) => path.join(directory, `run-${hash(id)}.json`)
          const owned = (id: string) => {
            const owner = read<RunOwner>(runPath(id))
            if (!owner || owner.runId !== id || !ID.test(owner.workflowId)) return null
            const execution = runtime.getExecution(owner.workflowId, id)
            if (!execution || execution.id !== id || execution.workflowId !== owner.workflowId) return null
            return execution
          }
          const publicRun = (execution: workflows.WorkflowExecution) => {
            const active = runtime.isWorkflowExecutionActive(execution.workflowId, execution.id)
            const hasResponse = execution.participants.some(participant => typeof (participant as any).response === 'string' && (participant as any).response.trim())
            const status = active ? 'running' : execution.status === 'completed' && hasResponse ? 'succeeded'
              : execution.status === 'cancelled' ? 'cancelled' : 'failed'
            return {
              id: execution.id, workspaceId: context.workspaceId, workflowId: execution.workflowId,
              status, createdAt: execution.startedAt, startedAt: execution.startedAt,
              ...(!active && execution.completedAt ? { completedAt: execution.completedAt } : {}),
              outputAvailable: !active,
              ...(status === 'failed' ? { error: { code: 'workflow_failed', message: 'Workflow failed or was interrupted. Inspect its execution history.', retryable: false } } : {}),
            }
          }
          const claimRequest = (kind: string, resourceId: string): { file: string; claim: Claim; previous: boolean } | null => {
            const body = req.body
            const fields = kind === 'WorkflowRunRequest' ? ['apiVersion', 'kind', 'input', 'idempotencyKey'] : ['apiVersion', 'kind', 'idempotencyKey']
            if (!body || typeof body !== 'object' || Array.isArray(body)
              || Object.keys(body).some(key => !fields.includes(key))
              || body.apiVersion !== API_VERSION || body.kind !== kind
              || typeof body.idempotencyKey !== 'string' || !ID.test(body.idempotencyKey)
              || (req.get('idempotency-key') && req.get('idempotency-key') !== body.idempotencyKey)) {
              fail(400, 'invalid_request', `Invalid ${kind}`); return null
            }
            if (kind === 'WorkflowRunRequest' && (!body.input || typeof body.input !== 'object' || Array.isArray(body.input)
              || Object.entries(body.input).some(([key, value]) => typeof value !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key))
              || Buffer.byteLength(JSON.stringify(body.input)) > 1024 * 1024)) {
              fail(400, 'invalid_input', 'Workflow input must be a string-valued object of at most 1 MiB'); return null
            }
            fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
            const file = path.join(directory, `claim-${hash(`${kind}:${body.idempotencyKey}`)}.json`)
            const digest = hash(JSON.stringify([resourceId, canonical(body.input || {})]))
            const previous = read<Claim>(file)
            if (previous && previous.digest !== digest) {
              fail(409, 'idempotency_conflict', 'Key was used for a different request'); return null
            }
            if (previous) return { file, claim: previous, previous: true }
            const claim = { digest }
            write(file, claim, true)
            return { file, claim, previous: false }
          }

          if (operation === 'show' || operation === 'start' || operation === 'list') {
            const workflow = runtime.getWorkflow(workflowId)
            if (!workflow) { fail(404, 'workflow_not_found', 'Workflow not found'); return }
            if (operation === 'show') {
              send('Workflow', { workflow: { id: workflow.id, name: workflow.name, description: workflow.description || '', status: workflow.status || (workflow.enabled ? 'enabled' : 'disabled'), updatedAt: workflow.modified } })
              return
            }
            if (operation === 'list') {
              const files = fs.existsSync(directory) ? fs.readdirSync(directory).filter(file => /^run-[a-f0-9]{64}\.json$/.test(file)) : []
              if (files.length > 10000) { fail(503, 'history_limit', 'Run history requires maintenance'); return }
              const items = files.flatMap(file => {
                const owner = read<RunOwner>(path.join(directory, file))
                if (!owner || owner.workflowId !== workflowId || !ID.test(owner.runId)) return []
                const execution = owned(owner.runId)
                return execution ? [publicRun(execution)] : []
              }).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
              send('WorkflowRunList', { items }); return
            }
            try { assertTemplateRuntimeAdmitted(workflowId) } catch {
              fail(409, 'template_runtime_unavailable', 'Template execution is not admitted'); return
            }
            const receipt = claimRequest('WorkflowRunRequest', workflowId)
            if (!receipt) return
            if (receipt.previous) {
              const execution = receipt.claim.runId ? owned(receipt.claim.runId) : null
              if (execution) send('WorkflowRun', { run: publicRun(execution) })
              else fail(409, receipt.claim.failed ? 'workflow_start_failed' : 'workflow_outcome_pending', 'This request was already accepted; inspect its outcome before using another key')
              return
            }
            context.assertAuthorized()
            const started = runtime.triggerWorkflow(workflowId, {
              manual: true, executionScope: 'single-workflow', inputs: req.body.input,
              actor: { userId: context.actorId, login: context.actorId }, assertAuthorized: context.assertAuthorized,
            })
            if (!started.success || !started.executionId) {
              write(receipt.file, { ...receipt.claim, failed: true })
              fail(409, 'workflow_start_failed', 'Workflow could not start. Check its runtime and admission state.'); return
            }
            write(runPath(started.executionId), { workflowId, runId: started.executionId }, true)
            write(receipt.file, { ...receipt.claim, runId: started.executionId })
            const execution = owned(started.executionId)
            if (!execution) { fail(503, 'run_unavailable', 'Execution evidence is unavailable'); return }
            send('WorkflowRun', { run: publicRun(execution) }, 201)
            return
          }

          let execution = owned(runId)
          if (!execution) { fail(404, 'run_not_found', 'Run not found for this actor and workspace'); return }
          if (operation === 'cancel') {
            if (!claimRequest('WorkflowRunCancelRequest', runId)) return
            if (!runtime.isWorkflowExecutionActive(execution.workflowId, runId) && execution.status !== 'cancelled') {
              fail(409, 'run_already_terminal', 'Run has already settled without cancellation'); return
            }
            if (runtime.isWorkflowExecutionActive(execution.workflowId, runId) && execution.status !== 'cancelled') {
              const cancelled = runtime.cancelExecution(execution.workflowId, runId)
              if (!cancelled.success) { fail(409, 'cancel_failed', 'Execution could not be cancelled'); return }
            }
            const deadline = Date.now() + (options.cancelWaitMs ?? 5000)
            while (runtime.isWorkflowExecutionActive(execution.workflowId, runId) && Date.now() < deadline) {
              await new Promise(resolve => setTimeout(resolve, 50))
              context.assertAuthorized()
            }
            execution = owned(runId)
            if (!execution) { fail(503, 'run_unavailable', 'Execution evidence is unavailable'); return }
            if (runtime.isWorkflowExecutionActive(execution.workflowId, runId)) {
              fail(409, 'cancellation_pending', 'Cancellation requested; poll the run until execution settles', true); return
            }
            if (execution.status !== 'cancelled') {
              fail(409, 'run_already_terminal', 'Run settled without cancellation'); return
            }
          }
          const run = publicRun(execution)
          if (operation === 'result') {
            if (run.status === 'running') { fail(409, 'run_not_terminal', 'Execution has not settled'); return }
            send('WorkflowResult', {
              runId, workspaceId: context.workspaceId, workflowId: execution.workflowId, status: run.status,
              output: {
                participants: execution.participants.map(participant => ({
                  agentId: participant.agentId, status: participant.status,
                  ...(typeof (participant as any).response === 'string' ? { response: (participant as any).response } : {}),
                })),
                outputs: Object.fromEntries(Object.entries(execution.outputs || {}).map(([key, value]) => [key, { type: value.type, summary: value.summary, value: value.value }])),
              },
              ...(run.error ? { error: run.error } : {}),
            })
          } else send('WorkflowRun', { run })
        })
      } catch {
        if (!res.headersSent) fail(503, 'workflow_unavailable', 'Workflow storage or authorization is unavailable')
      }
    })
  }
  register('get', '/workflows/:workflowId', 'show')
  register('post', '/workflows/:workflowId/runs', 'start')
  register('get', '/workflows/:workflowId/runs', 'list')
  register('get', '/workflow-runs/:runId', 'run')
  register('get', '/workflow-runs/:runId/result', 'result')
  register('post', '/workflow-runs/:runId/cancel', 'cancel')
  return router
}
