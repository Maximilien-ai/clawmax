import { Router } from 'express'
import { getAuthenticatedSession } from '../lib/github-auth'
import { openClawPlugins, RuntimePluginError } from '../lib/openclaw-plugins'

const router = Router()
// Enterprise workspace sessions do not establish authority over instance-wide plugins.
const canManage = (req: any) => !getAuthenticatedSession(req)?.enterprise
router.get('/', async (req, res) => {
  try {
    res.json({ plugins: await openClawPlugins.list(), history: openClawPlugins.history(), canManage: canManage(req) })
  } catch (error) {
    res.status(error instanceof RuntimePluginError ? error.status : 503).json({ error: 'OpenClaw plugin inventory is unavailable. Check runtime status and refresh.' })
  }
})
router.put('/:id', async (req, res) => {
  if (!canManage(req)) return res.status(403).json({ error: 'Instance administrator access is required to change runtime plugins.' })
  const origin = req.get('origin')
  if (origin) {
    try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Cross-origin plugin changes are not allowed.' }) }
    catch { return res.status(403).json({ error: 'Invalid origin.' }) }
  }
  try {
    res.json(await openClawPlugins.change(req.params.id, req.body?.enabled, req.body?.confirmRestartImpact))
  } catch (error) {
    res.status(error instanceof RuntimePluginError ? error.status : 503).json({ error: error instanceof RuntimePluginError ? error.message : 'Runtime plugin change failed. Refresh inventory before retrying.' })
  }
})
export default router
