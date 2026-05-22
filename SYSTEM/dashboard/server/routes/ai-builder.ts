import { Router } from 'express'
import { buildAiBuilderRecommendation } from '../lib/ai-builder'

const router = Router()

router.post('/recommend', (req, res) => {
  const prompt = `${req.body?.prompt || ''}`.trim()
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' })
  }

  try {
    const recommendation = buildAiBuilderRecommendation(prompt)
    res.json({ ok: true, recommendation })
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to build recommendation' })
  }
})

export default router
