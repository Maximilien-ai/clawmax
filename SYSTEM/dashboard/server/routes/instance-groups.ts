import crypto from 'crypto'
import fs from 'fs'
import { Router, type Request, type Response } from 'express'
import { parseGroupsWithMembers } from '../lib/workspace'
import { templateStoragePath } from '../lib/template-storage-path'
import type { CliChatContext } from './instance-chat'

const API_VERSION = 'clawmax.instance/v1'
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

/** Read-only discovery. Legacy message storage has no trustworthy session or
 * actor identity, so it must not be relabeled as correlated CLI history. */
export function createInstanceGroupsRouter(options: {
  authorize(req: Request, res: Response): CliChatContext | null
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
            status: 'unavailable', memberCount: new Set(group.members).size,
          }))
          if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Ambiguous Group catalog')
          context.assertAuthorized()
          if (operation === 'list') { res.json({ apiVersion: API_VERSION, kind: 'GroupList', items }); return }
          const group = items.find(item => item.id === req.params.groupId)
          if (!group) { fail(404, 'group_not_found', 'Group not found'); return }
          if (operation === 'show') { res.json({ apiVersion: API_VERSION, kind: 'Group', group }); return }
          fail(503, operation === 'chat' ? 'group_execution_unavailable' : 'group_history_unavailable',
            operation === 'chat' ? 'Public Group execution is not admitted' : 'Correlated public Group history is not available')
        })
      } catch { if (!res.headersSent) fail(503, 'group_store_unavailable', 'Group storage is unavailable') }
    })
  }
  return router
}
