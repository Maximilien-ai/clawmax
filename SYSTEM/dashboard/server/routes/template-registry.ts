import { Router } from 'express'
import {
  fetchTemplateRegistryCatalog,
  importTemplateRegistryEntry,
  isTemplateRegistryWriteEnabled,
  postTemplateRegistryAction,
} from '../lib/template-registry'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const data = await fetchTemplateRegistryCatalog()
    res.json({
      ...data,
      dashboardWriteEnabled: isTemplateRegistryWriteEnabled(),
    })
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load template registry' })
  }
})

router.post('/import', async (req, res) => {
  const {
    title,
    templateSlug,
    templateType,
    templateId,
    templateSource,
    sourceUrl,
  } = req.body || {}

  if (!title || !templateSlug || !templateType || !sourceUrl) {
    return res.status(400).json({ error: 'title, templateSlug, templateType, and sourceUrl are required' })
  }

  try {
    const result = await importTemplateRegistryEntry({
      title: String(title),
      templateSlug: String(templateSlug),
      templateType: String(templateType) as any,
      templateId: typeof templateId === 'string' ? templateId : undefined,
      templateSource: templateSource === 'user' ? 'user' : 'system',
      sourceUrl: String(sourceUrl),
    })
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to import template from registry' })
  }
})

router.post('/rate', async (req, res) => {
  try {
    const data = await postTemplateRegistryAction('rate', req.body || {})
    res.json(data)
  } catch (err: any) {
    const message = err?.message || 'Failed to rate template'
    const status = /not configured/i.test(message)
      ? 503
      : /invalid or expired/i.test(message)
        ? 401
        : /does not match the current deployment or customer/i.test(message)
          ? 403
          : /rate limit exceeded/i.test(message)
            ? 429
            : 400
    res.status(status).json({ error: message })
  }
})

router.post('/share', async (req, res) => {
  try {
    const data = await postTemplateRegistryAction('share', req.body || {})
    res.json(data)
  } catch (err: any) {
    const message = err?.message || 'Failed to share template'
    const status = /not configured/i.test(message)
      ? 503
      : /invalid or expired/i.test(message)
        ? 401
        : /does not match the current deployment or customer/i.test(message)
          ? 403
          : /rate limit exceeded/i.test(message)
            ? 429
            : 400
    res.status(status).json({ error: message })
  }
})

export default router
