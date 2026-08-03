import { Router } from 'express'
import {
  applyPluginTemplate,
  deletePluginRecord,
  generatePluginRecordDocument,
  getPluginBySlug,
  getPluginDiagnosticsReport,
  getPluginSettingsInventory,
  getAgentLifecycleEvidence,
  getWorkflowLifecycleEvidence,
  getCommunicationLifecycleEvidence,
  getPluginWorkspaceContext,
  listConfiguredPlugins,
  listPluginRecords,
  listPluginRelationships,
  listPluginTemplates,
  emitPluginRecordNotification,
  PluginContractError,
  runPluginEval,
  updatePluginSettings,
  upsertPluginRecord,
} from '../lib/plugin-system'

const router = Router()

function sendPluginError(res: any, error: unknown) {
  if (error instanceof PluginContractError) {
    return res.status(error.statusCode).json({ error: error.message })
  }
  throw error
}

router.get('/', (_req, res) => {
  res.json({
    plugins: listConfiguredPlugins(),
  })
})

router.get('/diagnostics', (_req, res) => {
  res.json(getPluginDiagnosticsReport())
})

router.get('/settings', (_req, res) => {
  res.json({ plugins: getPluginSettingsInventory() })
})

router.put('/settings', (req, res) => {
  try {
    const availablePlugins = updatePluginSettings(req.body?.enabledPluginIds)
    res.json({
      ok: true,
      availablePlugins,
      plugins: listConfiguredPlugins(),
    })
  } catch (error) {
    return sendPluginError(res, error)
  }
})

router.get('/relationships', (_req, res) => {
  res.json(listPluginRelationships())
})

router.get('/:pluginId/context', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  res.json({
    plugin,
    context: getPluginWorkspaceContext(plugin),
  })
})

router.get('/:pluginId/lifecycle/agents/:agentId', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  try {
    res.json({ evidence: getAgentLifecycleEvidence(plugin, req.params.agentId) })
  } catch (error) {
    return sendPluginError(res, error)
  }
})

router.get('/:pluginId/lifecycle/workflows/:workflowId', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  try {
    res.json({ evidence: getWorkflowLifecycleEvidence(plugin, req.params.workflowId) })
  } catch (error) {
    return sendPluginError(res, error)
  }
})

router.get('/:pluginId/lifecycle/communications/:subjectType/:name', async (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  if (req.params.subjectType !== 'group' && req.params.subjectType !== 'community') return res.status(400).json({ error: 'Communication type must be group or community.' })
  try {
    res.json({ evidence: await getCommunicationLifecycleEvidence(plugin, req.params.subjectType, decodeURIComponent(req.params.name)) })
  } catch (error) {
    return sendPluginError(res, error)
  }
})

router.get('/:pluginId/items', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  res.json({
    plugin,
    items: listPluginRecords(plugin),
  })
})

router.get('/:pluginId/templates', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  res.json({
    plugin,
    templates: listPluginTemplates(plugin, { forceRefresh: req.query.refresh === '1' }),
  })
})

router.post('/:pluginId/items', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  try {
    const item = upsertPluginRecord(plugin, req.body || {})
    res.status(201).json({ ok: true, item })
  } catch (error) {
    return sendPluginError(res, error)
  }
})

router.put('/:pluginId/items/:itemId', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  try {
    const item = upsertPluginRecord(plugin, {
      ...(req.body || {}),
      id: req.params.itemId,
    })
    res.json({ ok: true, item })
  } catch (error) {
    return sendPluginError(res, error)
  }
})

router.delete('/:pluginId/items/:itemId', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  const deleted = deletePluginRecord(plugin, req.params.itemId)
  if (!deleted) return res.status(404).json({ error: 'Plugin item not found' })
  res.json({ ok: true })
})

router.post('/:pluginId/items/:itemId/document', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  try {
    const item = generatePluginRecordDocument(plugin, req.params.itemId)
    if (!item) return res.status(404).json({ error: 'Plugin item not found' })
    res.json({ ok: true, item })
  } catch (error) {
    return sendPluginError(res, error)
  }
})

router.post('/:pluginId/items/:itemId/notify', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  try {
    const item = emitPluginRecordNotification(plugin, req.params.itemId)
    if (!item) return res.status(404).json({ error: 'Plugin item not found' })
    res.json({ ok: true, item })
  } catch (error) {
    return sendPluginError(res, error)
  }
})

router.post('/:pluginId/items/:itemId/run', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  const item = runPluginEval(plugin, req.params.itemId)
  if (!item) return res.status(404).json({ error: 'Plugin eval not found or plugin does not support runs' })
  res.json({ ok: true, item })
})

router.post('/:pluginId/templates/:templateId/apply', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  try {
    const item = applyPluginTemplate(plugin, req.params.templateId)
    if (!item) return res.status(404).json({ error: 'Plugin template not found' })
    res.status(201).json({ ok: true, item })
  } catch (error) {
    return sendPluginError(res, error)
  }
})

export default router
