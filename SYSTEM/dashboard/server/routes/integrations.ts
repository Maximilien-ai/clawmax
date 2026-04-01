import { Router } from 'express'
import { validateIntegrations } from '../lib/integration-validation'

const router = Router()

router.post('/validate', async (req, res) => {
  try {
    const result = await validateIntegrations(req.body || {})
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to validate integrations' })
  }
})

export default router
