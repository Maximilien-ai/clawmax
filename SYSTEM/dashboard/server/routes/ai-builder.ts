import { Router } from 'express'
import {
  applyAiBuilderLlmFallback,
  buildAiBuilderRecommendation,
  shouldUseAiBuilderLlmFallback,
} from '../lib/ai-builder'
import {
  generateBuilderStarterPromptsWithAI,
  inferBuilderGroupingWithAI,
  setRequestByokKeys,
} from '../lib/ai-generator'
import {
  isAiBuilderShareEnabled,
  shareAiBuilderFeedback,
  shareAiBuilderSession,
} from '../lib/ai-builder-share'

const router = Router()

router.post('/recommend', async (req, res) => {
  const prompt = `${req.body?.prompt || ''}`.trim()
  const byokKeys = req.body?.byokKeys && typeof req.body.byokKeys === 'object'
    ? req.body.byokKeys
    : undefined
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' })
  }

  try {
    setRequestByokKeys(byokKeys)
    let recommendation = buildAiBuilderRecommendation(prompt)
    if (shouldUseAiBuilderLlmFallback(recommendation)) {
      try {
        const fallback = await inferBuilderGroupingWithAI({
          prompt,
          summary: recommendation.summary,
          intent: recommendation.intent,
          scope: recommendation.scope,
          operation: recommendation.operation,
          confidence: recommendation.confidence,
          topOrganizationTemplates: recommendation.matchedAssets.organizationTemplates.slice(0, 3).map((template) => ({
            name: template.name,
            summary: template.summary,
            family: template.family,
          })),
          topAgentTemplates: recommendation.matchedAssets.agentTemplates.slice(0, 3).map((template) => ({
            name: template.name,
            summary: template.summary,
          })),
        })
        if (fallback.grouping && fallback.rationale) {
          recommendation = applyAiBuilderLlmFallback(recommendation, prompt, fallback)
        }
      } catch {
        // Keep deterministic recommendation if AI fallback is unavailable or fails.
      }
    }
    res.json({ ok: true, recommendation })
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to build recommendation' })
  } finally {
    setRequestByokKeys(undefined)
  }
})

router.post('/starter-prompts', async (req, res) => {
  const {
    workspaceName,
    workspaceTags,
    userName,
    userEmail,
    recentPrompts,
    agents,
    skills,
    workflows,
    agentTemplates,
    organizationTemplates,
    otherWorkspaceNames,
    byokKeys,
  } = req.body as {
    workspaceName?: string
    workspaceTags?: string[]
    userName?: string
    userEmail?: string
    recentPrompts?: string[]
    agents?: string[]
    skills?: string[]
    workflows?: string[]
    agentTemplates?: string[]
    organizationTemplates?: string[]
    otherWorkspaceNames?: string[]
    byokKeys?: { openai?: string; anthropic?: string; gemini?: string; openaiCompatibleApiKey?: string; openaiCompatibleBaseUrl?: string; openaiCompatibleDefaultModel?: string }
  }

  try {
    setRequestByokKeys(byokKeys && typeof byokKeys === 'object' ? byokKeys : undefined)
    const prompts = await generateBuilderStarterPromptsWithAI({
      workspaceName,
      workspaceTags,
      userName,
      userEmail,
      recentPrompts,
      agents,
      skills,
      workflows,
      agentTemplates,
      organizationTemplates,
      otherWorkspaceNames,
    })
    res.json({ ok: true, prompts })
  } catch (error: any) {
    const message = error?.message || 'Failed to generate builder starter prompts'
    if (/No API key configured/i.test(message)) {
      return res.status(400).json({ error: 'AI starter prompts need a configured OpenAI, Anthropic, or OpenAI-compatible setup, or a shared preferred model.' })
    }
    if (/developer API key|subscription or app credentials|does not look like/i.test(message)) {
      return res.status(400).json({ error: message })
    }
    res.status(500).json({ error: message })
  } finally {
    setRequestByokKeys(undefined)
  }
})

router.get('/share-status', (_req, res) => {
  res.json({ ok: true, enabled: isAiBuilderShareEnabled() })
})

router.post('/share-session', async (req, res) => {
  const sessionId = `${req.body?.sessionId || ''}`.trim()
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : []
  if (!sessionId || messages.length === 0) {
    return res.status(400).json({ error: 'sessionId and messages are required' })
  }

  try {
    const result = await shareAiBuilderSession({
      workspaceName: typeof req.body?.workspaceName === 'string' ? req.body.workspaceName : undefined,
      workspaceId: typeof req.body?.workspaceId === 'string' ? req.body.workspaceId : undefined,
      sessionId,
      source: 'dashboard_builder',
      messages: messages
        .filter((message: any) => message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string')
        .map((message: any) => ({ role: message.role, content: message.content })),
      recommendation: req.body?.recommendation && typeof req.body.recommendation === 'object'
        ? {
            intent: typeof req.body.recommendation.intent === 'string' ? req.body.recommendation.intent : undefined,
            scope: typeof req.body.recommendation.scope === 'string' ? req.body.recommendation.scope : undefined,
            operation: typeof req.body.recommendation.operation === 'string' ? req.body.recommendation.operation : undefined,
            confidence: typeof req.body.recommendation.confidence === 'string' ? req.body.recommendation.confidence : undefined,
          }
        : null,
      matchedAssets: Array.isArray(req.body?.matchedAssets) ? req.body.matchedAssets.filter((value: any) => typeof value === 'string') : undefined,
      feedback: req.body?.feedback === 'up' || req.body?.feedback === 'down' ? req.body.feedback : undefined,
    })
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to share Builder session' })
  }
})

router.post('/share-feedback', async (req, res) => {
  const sessionId = `${req.body?.sessionId || ''}`.trim()
  const recommendationKey = `${req.body?.recommendationKey || ''}`.trim()
  const feedback = req.body?.feedback
  if (!sessionId || !recommendationKey || (feedback !== 'up' && feedback !== 'down')) {
    return res.status(400).json({ error: 'sessionId, recommendationKey, and feedback are required' })
  }

  try {
    const result = await shareAiBuilderFeedback({
      workspaceName: typeof req.body?.workspaceName === 'string' ? req.body.workspaceName : undefined,
      workspaceId: typeof req.body?.workspaceId === 'string' ? req.body.workspaceId : undefined,
      sessionId,
      recommendationKey,
      feedback,
    })
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to share Builder feedback' })
  }
})

export default router
