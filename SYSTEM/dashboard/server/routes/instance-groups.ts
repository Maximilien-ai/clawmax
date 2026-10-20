import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Router, type Request, type Response } from 'express'
import { parseGroupsWithMembers } from '../lib/workspace'
import { templateStoragePath } from '../lib/template-storage-path'
import type { CliChatContext, CliTemplateExecution } from './instance-chat'
import { CliGroupReceipts, type GroupReceipt } from '../lib/cli-group-receipts'
import { sha256 } from '../lib/portable-template'

const API_VERSION = 'clawmax.instance/v1'
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

/** Only verified Template runs produce correlated CLI history. Legacy message
 * storage has no trustworthy session/actor identity and is never relabeled. */
export function createInstanceGroupsRouter(options: {
  authorize(req: Request, res: Response): CliChatContext | null
  templateExecution?(context: CliChatContext): CliTemplateExecution
}) {
  const router = Router({ mergeParams: true })
  for (const operation of ['list', 'show', 'messages', 'chat'] as const) {
    const route = operation === 'list' ? '/groups' : `/groups/:groupId${operation === 'messages' ? '/messages' : operation === 'chat' ? '/chat/sessions' : ''}`
    router[operation === 'chat' ? 'post' : 'get'](route, async (req, res) => {
      const requestId = `req_${crypto.randomUUID()}`
      const fail = (status: number, code: string, message: string) => res.status(status).json({
        apiVersion: API_VERSION, kind: 'Error', requestId, error: { code, message, retryable: false },
      })
      try {
        const context = options.authorize(req, res)
        if (!context) return
        await context.run(async () => {
          context.assertAuthorized()
          res.setHeader('Cache-Control', 'no-store')
          if ((req.params.groupId && !ID.test(req.params.groupId)) || Object.keys(req.query).length) {
            fail(400, 'invalid_request', 'Invalid Group request'); return
          }
          let content = ''
          try {
            const file = templateStoragePath(context.workspacePath, 'ORG/GROUPS.md')
            const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK)
            try {
              const stat = fs.fstatSync(fd)
              if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('Invalid Group catalog')
              content = fs.readFileSync(fd, 'utf8')
            } finally { fs.closeSync(fd) }
          } catch (error: any) { if (error.code !== 'ENOENT') throw error }
          const items = parseGroupsWithMembers(content).groups.map(group => ({
            id: ID.test(group.name) ? group.name : `group-${crypto.createHash('sha256').update(group.name).digest('hex')}`,
            name: group.name, description: group.description || '',
            status: options.templateExecution && /^tr-[a-f0-9]{16}-group-[a-f0-9]{12}$/.test(group.name) ? 'stopped' : 'unavailable', memberCount: new Set(group.members).size,
          }))
          if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Ambiguous Group catalog')
          context.assertAuthorized()
          if (operation === 'list') { res.json({ apiVersion: API_VERSION, kind: 'GroupList', items }); return }
          const group = items.find(item => item.id === req.params.groupId)
          if (!group) { fail(404, 'group_not_found', 'Group not found'); return }
          if (operation === 'show') { res.json({ apiVersion: API_VERSION, kind: 'Group', group }); return }
          if (options.templateExecution && /^tr-[a-f0-9]{16}-group-[a-f0-9]{12}$/.test(group.id)) {
            const service = options.templateExecution(context)
            if (service.store.workspaceId !== context.workspaceId || path.resolve(service.store.workspacePath) !== path.resolve(context.workspacePath)
              || service.coordinator.workspaceId !== context.workspaceId || service.coordinator.workspacePath !== path.resolve(context.workspacePath)) throw new Error('Workspace mismatch')
            const revisions = service.store.history().filter(revision => !revision.cleanedAt && revision.actorId === context.actorId
              && Object.values(revision.resources.groups).includes(group.id))
            if (revisions.length !== 1) { fail(404, 'group_not_found', 'Group not found'); return }
            const revision = revisions[0]
            const receipts = new CliGroupReceipts(context.workspacePath, context.actorId, revision.id, group.id)
            if (operation === 'messages') {
              // Reading owned local history is not an execution grant and must
              // remain available when the model gateway is temporarily down.
              context.assertAuthorized()
              res.json({ apiVersion: API_VERSION, kind: 'GroupMessageList', items: receipts.history() }); return
            }
            await service.coordinator.verifyStagedExecution(context.actorId, revision.id, group.id, service.authority, service.policies)
            context.assertAuthorized()
            const body = req.body
            if (!body || typeof body !== 'object' || Array.isArray(body)
              || Object.keys(body).some(key => !['apiVersion', 'kind', 'message', 'idempotencyKey', 'sessionId'].includes(key))
              || body.apiVersion !== API_VERSION || body.kind !== 'GroupChatRequest'
              || typeof body.message !== 'string' || !body.message.trim() || Buffer.byteLength(body.message) > 65536
              || typeof body.idempotencyKey !== 'string' || !ID.test(body.idempotencyKey)
              || (req.get('idempotency-key') && req.get('idempotency-key') !== body.idempotencyKey)) {
              fail(400, 'invalid_request', 'Invalid GroupChatRequest'); return
            }
            if (body.sessionId !== undefined) { fail(409, 'group_session_unsupported', 'Group chat currently supports bounded one-shot runs'); return }
            const digest = sha256(JSON.stringify([group.id, revision.id, body.message]))
            const previous = receipts.get(body.idempotencyKey)
            if (previous) {
              if (previous.digest !== digest) { fail(409, 'idempotency_conflict', 'Key was used for another request'); return }
              if (!previous.events) { fail(409, 'group_outcome_pending', 'Group outcome requires inspection; do not retry with a new key'); return }
              res.type('application/x-ndjson').end(previous.events.map(event => JSON.stringify(event)).join('\n') + '\n'); return
            }
            const receipt: GroupReceipt = { digest, requestId, sessionId: `group_${crypto.randomUUID()}`, createdAt: new Date().toISOString() }
            receipts.claim(body.idempotencyKey, receipt)
            const event = (type: string, sequence: number, fields: object = {}) => ({ apiVersion: API_VERSION, kind: 'GroupChatEvent',
              requestId, workspaceId: context.workspaceId, groupId: group.id, sessionId: receipt.sessionId, sequence, type, ...fields })
            const events: Array<Record<string, unknown>> = [event('start', 1)]
            const send = (value: object) => { if (!res.destroyed && !res.writableEnded) res.write(JSON.stringify(value) + '\n') }
            res.status(200).type('application/x-ndjson')
            send(events[0])
            try {
              const result = await service.coordinator.executeNoToolsGroup(context.actorId, revision.id,
                { groupId: group.id, message: body.message, idempotencyKey: body.idempotencyKey }, service.authority, service.policies, service.runtime, context.assertAuthorized)
              context.assertAuthorized()
              const settled = JSON.parse(result.text)
              const messages: Array<Record<string, unknown>> = []
              for (const turn of settled.turns) {
                events.push(event('delta', events.length + 1, { agentId: turn.agentId, content: turn.text }))
                messages.push({ id: `${receipt.sessionId}-${turn.sequence}`, workspaceId: context.workspaceId, groupId: group.id,
                  sessionId: receipt.sessionId, senderType: 'agent', senderId: turn.agentId, content: turn.text, createdAt: receipt.createdAt })
              }
              events.push(event('done', events.length + 1, { content: `Group stopped: ${settled.stopReason}` }))
              messages.push({ id: `${receipt.sessionId}-stop`, workspaceId: context.workspaceId, groupId: group.id, sessionId: receipt.sessionId,
                senderType: 'system', senderId: 'system', content: `Group stopped: ${settled.stopReason}`, createdAt: receipt.createdAt })
              receipts.complete(body.idempotencyKey, { ...receipt, events, messages })
              for (const value of events.slice(1)) send(value)
            } catch {
              // The private pending claim is retained: a lost response is not
              // evidence that the Group did not execute.
              send(event('error', 2, { error: { code: 'group_execution_unresolved', message: 'Group execution requires inspection before retrying', retryable: false } }))
            } finally { if (!res.writableEnded) res.end() }
            return
          }
          fail(503, operation === 'chat' ? 'group_execution_unavailable' : 'group_history_unavailable',
            operation === 'chat' ? 'Public Group execution is not admitted' : 'Correlated public Group history is not available')
        })
      } catch { if (!res.headersSent) fail(503, 'group_store_unavailable', 'Group storage is unavailable') }
    })
  }
  return router
}
