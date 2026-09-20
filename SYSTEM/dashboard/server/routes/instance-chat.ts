import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Router, type Request, type Response } from 'express'
import { executeAgentChat, resolveCurrentChatAgentGeneration, type AgentChatTransport } from './chat'
import { assertTemplateRuntimeAdmitted } from '../lib/template-runtime-admission'

const API_VERSION = 'clawmax.instance/v1'
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const MAX_OUTPUT = 2 * 1024 * 1024
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')

export interface CliChatContext {
  workspaceId: string
  workspacePath: string
  actorId: string
  assertAuthorized(): void
  run<T>(fn: () => T | Promise<T>): Promise<T>
}

type ChatEvent = {
  apiVersion: string; kind: 'ChatEvent'; requestId: string
  workspaceId: string; agentId: string; sessionId: string; sequence: number
  type: 'start' | 'delta' | 'done' | 'error'; content?: string
  error?: { code: string; message: string; retryable: boolean }
}
type Receipt = { requestHash: string; sessionId: string; events?: ChatEvent[] }
type Session = { agentId: string; generation: string }

function writePrivate(file: string, value: unknown, exclusive = false) {
  const temporary = exclusive ? file : `${file}.${crypto.randomUUID()}.tmp`
  const fd = fs.openSync(temporary, 'wx', 0o600)
  try {
    fs.writeFileSync(fd, JSON.stringify(value))
    fs.fsyncSync(fd)
  } finally { fs.closeSync(fd) }
  if (!exclusive) fs.renameSync(temporary, file)
  const directory = fs.openSync(path.dirname(file), 'r')
  try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
}

function readPrivate<T>(file: string): T | null {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T } catch (error: any) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

// The injected executor is for isolated contract tests, never client-selected.
export function createInstanceChatRouter(options: {
  authorize(req: Request, res: Response): CliChatContext | null
  execute?: typeof executeAgentChat
  generation?: typeof resolveCurrentChatAgentGeneration
}) {
  const router = Router({ mergeParams: true })
  router.post('/agents/:agentId/chat/sessions', async (req, res) => {
    const requestId = `req_${crypto.randomUUID()}`
    const fail = (status: number, code: string, message: string) => res.status(status).json({
      apiVersion: API_VERSION, kind: 'Error', requestId, error: { code, message, retryable: false },
    })
    let transport: AgentChatTransport | undefined
    try {
      const context = options.authorize(req, res)
      if (!context) return
      const { agentId } = req.params
      const body = req.body
      if (!ID.test(agentId) || !body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => !['apiVersion', 'kind', 'message', 'sessionId', 'idempotencyKey'].includes(key))
        || body.apiVersion !== API_VERSION || body.kind !== 'AgentChatRequest'
        || typeof body.message !== 'string' || !body.message.trim() || Buffer.byteLength(body.message) > 1024 * 1024
        || typeof body.idempotencyKey !== 'string' || !ID.test(body.idempotencyKey)
        || (body.sessionId !== undefined && (typeof body.sessionId !== 'string' || !ID.test(body.sessionId)))
        || (req.get('idempotency-key') && req.get('idempotency-key') !== body.idempotencyKey)) {
        return fail(400, 'invalid_request', 'Invalid AgentChatRequest')
      }
      await context.run(async () => {
        context.assertAuthorized()
        try { assertTemplateRuntimeAdmitted(agentId) } catch {
          fail(409, 'template_runtime_unavailable', 'Template execution is not admitted'); return
        }
        const generation = (options.generation || resolveCurrentChatAgentGeneration)(agentId)
        if (!generation) { fail(404, 'agent_not_found', 'Agent not found'); return }
        // Hash all externally sourced identifiers; none can become filesystem paths.
        const directory = path.join(context.workspacePath, '.clawmax', 'cli-chat', hash(context.actorId))
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
        const receiptPath = path.join(directory, `request-${hash(body.idempotencyKey)}.json`)
        const requestHash = hash(JSON.stringify([agentId, generation, body.message, body.sessionId || null]))
        const previous = readPrivate<Receipt>(receiptPath)
        if (previous) {
          if (previous.requestHash !== requestHash) { fail(409, 'idempotency_conflict', 'Key was used for a different request'); return }
          if (!previous.events) {
            // A crash may have happened after dispatch. Never guess and run it twice.
            fail(409, 'chat_outcome_pending', 'This request was already accepted; its outcome is not yet recorded. Do not retry with a new key.')
            return
          }
          res.type('application/x-ndjson')
          for (const event of previous.events) res.write(`${JSON.stringify(event)}\n`)
          res.end()
          return
        }
        const sessionId = body.sessionId || `chat_${crypto.randomUUID()}`
        const sessionPath = path.join(directory, `session-${hash(sessionId)}.json`)
        if (body.sessionId) {
          const session = readPrivate<Session>(sessionPath)
          if (!session || session.agentId !== agentId || session.generation !== generation) {
            fail(404, 'session_not_found', 'Chat session not found for this actor and agent'); return
          }
        } else writePrivate(sessionPath, { agentId, generation }, true)
        const receipt: Receipt = { requestHash, sessionId }
        writePrivate(receiptPath, receipt, true)
        const events: ChatEvent[] = []
        let terminal = false
        let outputBytes = 0
        let hasDelta = false
        let opened = false
        const open = () => {
          if (opened) return
          opened = true
          res.status(200).set({ 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' })
          res.flushHeaders()
        }
        const emit = (type: ChatEvent['type'], fields: Partial<ChatEvent> = {}) => {
          if (terminal) return
          const event: ChatEvent = {
            apiVersion: API_VERSION, kind: 'ChatEvent', requestId,
            workspaceId: context.workspaceId, agentId, sessionId,
            sequence: events.length + 1, type, ...fields,
          }
          events.push(event)
          terminal = type === 'done' || type === 'error'
          // Persist the terminal receipt before acknowledging completion. No raw
          // prompt is copied here; replies remain local private conversation data.
          if (terminal) writePrivate(receiptPath, { ...receipt, events })
          if (!res.destroyed && !res.writableEnded) {
            open()
            res.write(`${JSON.stringify(event)}\n`)
          }
          if (terminal && !res.writableEnded) res.end()
        }
        const error = () => emit('error', { error: {
          code: 'agent_execution_failed', message: 'Agent execution failed. Check the agent runtime and server diagnostics.', retryable: false,
        } })
        const delta = (content: unknown) => {
          if (typeof content !== 'string' || !content || terminal) return
          outputBytes += Buffer.byteLength(content)
          if (outputBytes > MAX_OUTPUT || events.length > 99000) { error(); return }
          hasDelta = true
          // Bound each line well below RC6's 1 MiB decoder limit, even when JSON
          // escaping expands control characters. Preserve Unicode code points.
          const points = Array.from(content)
          for (let offset = 0; offset < points.length; offset += 8192) {
            emit('delta', { content: points.slice(offset, offset + 8192).join('') })
          }
        }
        transport = {
          actor: { userId: context.actorId, login: context.actorId, email: null },
          open() { if (!events.length) emit('start') },
          assertAuthorized: context.assertAuthorized,
          reject() { if (!events.length) emit('start'); error() },
          send(type, data) {
            if (!events.length) emit('start')
            if (type === 'delta') delta(data?.text)
            else if (type === 'error') error()
            else if (type === 'complete') {
              if (!hasDelta) delta(data?.text)
              if (!hasDelta) error()
              else emit('done')
            }
          },
        }
        // Pin the generation across waits, and use only the server-owned session
        // namespace. Never accept browser BYOK, context, or runtime overrides.
        ;(req as Request).params.id = agentId
        req.headers['x-clawmax-agent-generation'] = generation
        req.body = { message: body.message, sessionId: `cli-${hash(`${context.actorId}:${sessionId}`)}` }
        await (options.execute || executeAgentChat)(req, res, transport)
      })
    } catch {
      if (transport) transport.reject(503, 'Chat execution unavailable')
      else if (!res.headersSent) fail(503, 'chat_unavailable', 'Chat storage or execution is unavailable')
      else res.end()
    }
  })
  return router
}
