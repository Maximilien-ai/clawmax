import express from 'express'
import {
  expandPromptWithAI,
  normalizePromptExpansionFormat,
  normalizePromptExpansionTarget,
  setRequestByokKeys,
} from '../lib/ai-generator'

const router = express.Router()

router.post('/expand-prompt', async (req, res) => {
  const {
    prompt,
    target,
    format,
    byokKeys,
  } = req.body as {
    prompt?: string
    target?: string
    format?: string
    byokKeys?: { openai?: string; anthropic?: string; gemini?: string }
  }

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' })
  }

  try {
    setRequestByokKeys(byokKeys && typeof byokKeys === 'object' ? byokKeys : undefined)
    const expandedPrompt = await expandPromptWithAI(
      prompt.trim(),
      normalizePromptExpansionTarget(target),
      normalizePromptExpansionFormat(format),
    )
    res.json({ ok: true, expandedPrompt })
  } catch (err: any) {
    const message = err?.message || 'Failed to expand prompt'
    if (/No API key configured/i.test(message)) {
      return res.status(400).json({
        error: 'AI prompt expansion needs a configured browser key or shared preferred model. Open Workspaces Integrations or Keys & Secrets first.',
      })
    }
    res.status(500).json({ error: message })
  } finally {
    setRequestByokKeys(undefined)
  }
})

export default router
