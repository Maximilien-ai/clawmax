import { Router } from 'express'
import { validateIntegrations } from '../lib/integration-validation'

const router = Router()

router.get('/status', (_req, res) => {
  res.json({
    validationAvailable: true,
    validationMode: 'live',
    providers: ['openai', 'anthropic', 'gemini', 'ollama', 'opik'],
    notes: [
      'Validation runs against the current server build.',
      'Saved defaults remain browser-local in this preview flow.',
    ],
  })
})

router.post('/validate', async (req, res) => {
  try {
    const result = await validateIntegrations(req.body || {})
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to validate integrations' })
  }
})

export default router
