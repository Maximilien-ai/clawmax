import type { RequestHandler } from 'express'
import fs from 'fs'
import path from 'path'
import { getWorkspaceManager } from './workspace-manager'
import { CLEAR_RECEIPT } from './workspace-clear'

export const isClearRoute = (pathname: string) => /^\/workspaces\/default\/clear(?:\/preview)?$/.test(pathname)
export const isClearRecoveryRead = (pathname: string) => ['/workspaces', '/workspaces/active', '/auth/me', '/auth/config'].includes(pathname)
export function clearPending(): boolean {
  const root = getWorkspaceManager().loadRegistry().workspaces.find(workspace => workspace.id === 'default')?.path
  if (!root) return false
  const file = path.join(root, CLEAR_RECEIPT)
  try { return fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8')).state !== 'complete' } catch { return true }
}
export function workspaceClearRequestGate(): RequestHandler {
  let writers = 0
  return (req, res, next) => {
    const clear = isClearRoute(req.path)
    if ((clear && req.method === 'POST' && writers > 0) || (!clear && clearPending()
      && !(req.method === 'GET' && (['/health', '/health/live', '/recovery'].includes(req.path) || isClearRecoveryRead(req.path))))) {
      return res.status(409).json({ error: 'Personal workspace clearing is pending or other requests are still running. Finish active work, then open Clear Personal to review or retry.', code: 'workspace_clear_pending' })
    }
    if (!clear && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      writers++
      let released = false
      const release = () => { if (!released) { writers--; released = true } }
      res.once('finish', release)
      res.once('close', release)
    }
    next()
  }
}
