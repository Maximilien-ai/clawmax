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

export default router
