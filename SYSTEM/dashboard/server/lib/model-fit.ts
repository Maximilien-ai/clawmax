export type ModelFitPreference = 'quality' | 'balanced' | 'cost'

export interface ModelFitRequirements {
  coding: boolean
  longContext: boolean
  privacy: boolean
  reasoning: boolean
  structuredOutput: boolean
  toolUse: boolean
  vision: boolean
}

export interface ModelFitCandidate {
  model: string
  score: number
  tier: 'efficient' | 'balanced' | 'quality' | 'unknown'
  reasons: string[]
  caveats: string[]
}

export interface ModelFitRecommendation {
  recommendedModel: string | null
  candidates: ModelFitCandidate[]
  confidence: 'low' | 'medium'
  requirements: ModelFitRequirements
  summary: string
  disclaimer: string
}

const REQUIREMENT_PATTERNS: Array<{
  key: keyof ModelFitRequirements
  pattern: RegExp
}> = [
  { key: 'coding', pattern: /\b(code|coding|developer|programming|repository|github|typescript|javascript|python|debug|software)\b/i },
  { key: 'longContext', pattern: /\b(long[- ]?context|large document|many documents|entire (?:repo|repository|workspace)|book|transcript|thousands of pages)\b/i },
  { key: 'privacy', pattern: /\b(private|privacy|offline|local[- ]only|on[- ]prem|confidential|air[- ]?gapped)\b/i },
  { key: 'reasoning', pattern: /\b(reason|reasoning|strategy|strategic|complex|investigate|research|analy[sz]e|analysis|plan|architect)\b/i },
  { key: 'structuredOutput', pattern: /\b(json|schema|structured|extract|classification|classify|table|csv|fields?)\b/i },
  { key: 'toolUse', pattern: /\b(tool|skill|api|email|gmail|outlook|calendar|workflow|file|database|browser|search)\b/i },
  { key: 'vision', pattern: /\b(images?|photos?|screenshots?|vision|diagrams?|scans?|visual|videos?)\b/i },
]

function detectRequirements(description: string): ModelFitRequirements {
  const requirements: ModelFitRequirements = {
    coding: false,
    longContext: false,
    privacy: false,
    reasoning: false,
    structuredOutput: false,
    toolUse: false,
    vision: false,
  }
  for (const { key, pattern } of REQUIREMENT_PATTERNS) {
    requirements[key] = pattern.test(description)
  }
  return requirements
}

function classifyTier(model: string): ModelFitCandidate['tier'] {
  const value = model.toLowerCase()
  if (/\b(nano|mini|haiku|flash|lite|fast)\b|(?:^|[-/:])(3b|7b|8b)(?:[-/:.]|$)/.test(value)) return 'efficient'
  if (/\b(pro|opus|reasoning)\b|(?:^|[-/])(o1|o3)(?:[-/:.]|$)/.test(value)) return 'quality'
  if (/\b(sonnet|gpt-5|grok-4|gemini-2\.5)\b/.test(value)) return 'balanced'
  return 'unknown'
}

function isLocalModel(model: string): boolean {
  return model.startsWith('ollama/') || model.startsWith('openai-compatible/')
}

function scoreCandidate(
  model: string,
  requirements: ModelFitRequirements,
  preference: ModelFitPreference,
): ModelFitCandidate {
  const value = model.toLowerCase()
  const tier = classifyTier(model)
  const local = isLocalModel(value)
  const reasons: string[] = []
  const caveats: string[] = []
  let score = 50

  if (preference === 'cost') {
    if (tier === 'efficient') {
      score += 18
      reasons.push('The model name indicates an efficiency-oriented variant.')
    } else if (tier === 'quality') {
      score -= 10
    }
  } else if (preference === 'quality') {
    if (tier === 'quality') {
      score += 18
      reasons.push('The model name indicates a quality-oriented variant.')
    } else if (tier === 'efficient') {
      score -= 7
    }
  } else {
    if (tier === 'balanced') {
      score += 10
      reasons.push('The model family is a plausible balanced starting point.')
    } else if (tier === 'efficient') {
      score += 5
      reasons.push('The model name indicates an efficiency-oriented variant.')
    } else if (tier === 'quality') {
      score += 6
      reasons.push('The model name indicates a quality-oriented variant.')
    }
  }

  if (requirements.coding) {
    if (/\b(code|codex|coder)\b/i.test(value)) {
      score += 22
      reasons.push('Its model name explicitly indicates coding specialization.')
    } else if (tier === 'quality' || tier === 'balanced') {
      score += 5
    }
  }

  if (requirements.reasoning) {
    if (/\b(reasoning)\b|(?:^|[-/])(o1|o3)(?:[-/:.]|$)/.test(value)) {
      score += 18
      reasons.push('Its model name explicitly indicates reasoning specialization.')
    } else if (tier === 'quality' || tier === 'balanced') {
      score += 7
      reasons.push('The model tier is a plausible fit for reasoning-heavy work.')
    } else if (tier === 'efficient') {
      score -= 5
    }
  }

  if (requirements.privacy) {
    if (local) {
      score += 20
      reasons.push('It uses a local or user-controlled compatible runtime.')
    } else {
      score -= 6
      caveats.push('This is a hosted model; verify the workspace data-handling policy.')
    }
  }

  if (requirements.toolUse || requirements.structuredOutput) {
    if (local) {
      score -= 2
      caveats.push('Tool and structured-output support must be verified for this local model.')
    } else {
      score += 3
    }
  }

  if (requirements.vision) {
    caveats.push('Vision support cannot be confirmed from the runtime model ID alone.')
  }
  if (requirements.longContext) {
    caveats.push('The model context limit is not available in the current runtime catalog.')
  }
  if (model === 'openrouter/auto') {
    score += preference === 'balanced' ? 4 : 0
    reasons.push('OpenRouter can route across configured models.')
    caveats.push('The exact routed model, capabilities, and price can vary by request.')
  }
  if (tier === 'unknown') {
    caveats.push('The model tier could not be determined from its ID.')
  }
  caveats.push('Capabilities and current pricing have not been independently verified.')

  return {
    model,
    score: Math.max(0, Math.min(100, score)),
    tier,
    reasons: [...new Set(reasons)].slice(0, 3),
    caveats: [...new Set(caveats)].slice(0, 3),
  }
}

export function recommendModelsForDescription(args: {
  description: string
  availableModels: string[]
  preference?: ModelFitPreference
  limit?: number
}): ModelFitRecommendation {
  const description = String(args.description || '').trim()
  const preference = args.preference || 'balanced'
  const models = [...new Set(
    (args.availableModels || [])
      .map(model => String(model || '').trim())
      .filter(Boolean),
  )]
  const requirements = detectRequirements(description)
  const candidates = models
    .map(model => scoreCandidate(model, requirements, preference))
    .sort((left, right) => right.score - left.score || left.model.localeCompare(right.model))
    .slice(0, Math.max(1, Math.min(args.limit || 3, 10)))
  const requirementCount = Object.values(requirements).filter(Boolean).length
  const confidence = description.split(/\s+/).filter(Boolean).length >= 8
    && requirementCount > 0
    && models.length > 1
    ? 'medium'
    : 'low'

  return {
    recommendedModel: candidates[0]?.model || null,
    candidates,
    confidence,
    requirements,
    summary: candidates[0]
      ? `${candidates[0].model} is the strongest ${preference} fit among ${models.length} currently available model${models.length === 1 ? '' : 's'}.`
      : 'No runtime-visible models are available to compare.',
    disclaimer: 'This is an advisory name-based fit estimate, not a quality or cost measurement. Verify required capabilities and pricing, then evaluate representative work before applying a model change.',
  }
}

export const __test = {
  classifyTier,
  detectRequirements,
  isLocalModel,
}
