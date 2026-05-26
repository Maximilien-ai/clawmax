import express from 'express'
import { getAuthenticatedSession } from '../lib/github-auth'
import { getRequestDashboardInstanceId, traceAgentChat } from '../lib/opik'
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
    const normalizedTarget = normalizePromptExpansionTarget(target)
    const expandedPrompt = await expandPromptWithAI(
      prompt.trim(),
      normalizedTarget,
      normalizePromptExpansionFormat(format),
      typeof guidance === 'string' ? guidance.trim() : '',
    )
    const session = getAuthenticatedSession(req)
    const systemAgentId = `ai-improve-${normalizedTarget}-prompt`
    traceAgentChat(systemAgentId, prompt.trim(), expandedPrompt, {
      model: systemAgentId,
      provider: 'system',
      sessionId: `${systemAgentId}:${Date.now()}`,
      actorUserId: session?.userId,
      actorLogin: session?.login,
      actorEmail: session?.email || null,
      dashboardInstanceId: getRequestDashboardInstanceId(req),
    })
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
