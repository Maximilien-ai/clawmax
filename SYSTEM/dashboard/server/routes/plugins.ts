import { Router } from 'express'
import {
  deletePluginRecord,
  generatePluginRecordDocument,
  getPluginBySlug,
  getPluginWorkspaceContext,
  listConfiguredPlugins,
  listPluginRecords,
  emitPluginRecordNotification,
  runPluginEval,
  upsertPluginRecord,
} from '../lib/plugin-system'

const router = Router()

router.get('/', (_req, res) => {
  res.json({
    plugins: listConfiguredPlugins(),
  })
})

router.get('/:pluginId/context', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  res.json({
    plugin,
    context: getPluginWorkspaceContext(),
  })
})

router.get('/:pluginId/items', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  res.json({
    plugin,
    items: listPluginRecords(plugin),
  })
})

router.post('/:pluginId/items', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  const item = upsertPluginRecord(plugin, req.body || {})
  res.status(201).json({ ok: true, item })
})

router.put('/:pluginId/items/:itemId', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  const item = upsertPluginRecord(plugin, {
    ...(req.body || {}),
    id: req.params.itemId,
  })
  res.json({ ok: true, item })
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
  const item = generatePluginRecordDocument(plugin, req.params.itemId)
  if (!item) return res.status(404).json({ error: 'Plugin item not found' })
  res.json({ ok: true, item })
})

router.post('/:pluginId/items/:itemId/notify', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  const item = emitPluginRecordNotification(plugin, req.params.itemId)
  if (!item) return res.status(404).json({ error: 'Plugin item not found' })
  res.json({ ok: true, item })
})

router.post('/:pluginId/items/:itemId/run', (req, res) => {
  const plugin = getPluginBySlug(req.params.pluginId)
  if (!plugin) return res.status(404).json({ error: 'Plugin not found' })
  const item = runPluginEval(plugin, req.params.itemId)
  if (!item) return res.status(404).json({ error: 'Plugin eval not found or plugin does not support runs' })
  res.json({ ok: true, item })
})

export default router
