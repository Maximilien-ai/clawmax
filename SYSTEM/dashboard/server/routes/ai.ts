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
    guidance,
    byokKeys,
  } = req.body as {
    prompt?: string
    target?: string
    format?: string
    guidance?: string
    byokKeys?: { openai?: string; anthropic?: string; gemini?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
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
      typeof guidance === 'string' ? guidance.trim() : '',
    )
    res.json({ ok: true, expandedPrompt })
  } catch (err: any) {
    const message = err?.message || 'Failed to expand prompt'
    if (/No API key configured/i.test(message)) {
      return res.status(400).json({
        error: 'AI prompt expansion needs a configured OpenAI, Anthropic, or OpenAI-compatible setup, or a shared preferred model. Open Workspaces Integrations or Keys & Secrets first.',
      })
    }
    if (/developer API key|subscription or app credentials|does not look like/i.test(message)) {
      return res.status(400).json({ error: message })
    }
    res.status(500).json({ error: message })
  } finally {
    setRequestByokKeys(undefined)
  }
})

export default router
