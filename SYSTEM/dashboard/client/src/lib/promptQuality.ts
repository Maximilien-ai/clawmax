export type PromptQualityDomain = 'agent' | 'skill' | 'template' | 'workflow' | 'plugin' | 'builder' | 'general'

export interface PromptQualityFacet {
  id: string
  label: string
  earned: number
  max: number
  suggestion: string
}

export interface PromptQualityResult {
  score: number
  level: 'Starting point' | 'Needs detail' | 'Promising' | 'Ready' | 'Excellent'
  ready: boolean
  facets: PromptQualityFacet[]
  suggestions: PromptQualityFacet[]
}

export interface PromptQualityFeedback {
  domain: PromptQualityDomain
  score: number
  suggestionIds: string[]
  rating: 'up' | 'down'
  createdAt: string
}

export interface PromptQualityComparison {
  before: number
  after: number
  delta: number
}

export const PROMPT_QUALITY_READY_SCORE = 80
export const PROMPT_QUALITY_EXCELLENT_SCORE = 90
export const PROMPT_QUALITY_FEEDBACK_STORAGE_KEY = 'clawmax-prompt-quality-feedback:v1'

const ACTION_PATTERN = /\b(create|build|generate|design|write|review|analy[sz]e|monitor|manage|summari[sz]e|classify|research|plan|help|evaluate|compare|draft|detect|organize|automate|respond|route|track|produce)\b/i
const CONTEXT_PATTERN = /\b(for|audience|user|customer|team|company|organization|industry|domain|role|beginner|expert|executive|developer|manager|context|background|purpose|because)\b/i
const INPUT_PATTERN = /\b(input|source|data|file|document|email|message|api|repository|repo|url|record|provided|uploaded|from|using|read|receive|query)\b/i
const OUTPUT_PATTERN = /\b(output|deliverable|return|produce|create|generate|write|draft|report|summary|list|table|json|markdown|csv|document|notification|response|artifact|issue|pull request|dashboard)\b/i
const FORMAT_PATTERN = /\b(format|structure|section|schema|json|markdown|csv|table|bullet|paragraph|template|file|document|short|concise|detailed)\b/i
const CONSTRAINT_PATTERN = /\b(must|should|avoid|never|only|limit|without|do not|don't|tone|style|budget|deadline|private|safe|security|permission|approval|under|at most|no more than)\b/i
const EXECUTION_PATTERN = /\b(daily|weekly|monthly|hourly|weekday|schedule|cron|when|after|before|until|every|\d+\s*(minute|hour|day|week|month|step|agent|role|round)s?)\b/i
const SUCCESS_PATTERN = /\b(success|criteria|accurate|complete|verify|validate|test|pass|measure|metric|quality|correct|evidence|done|acceptance|score)\b/i

const DOMAIN_RULES: Record<PromptQualityDomain, Array<{
  pattern: RegExp
  points: number
  suggestion: string
}>> = {
  agent: [
    { pattern: /\b(role|agent|assistant|manager|engineer|analyst|researcher|writer|specialist|responsible)\b/i, points: 10, suggestion: 'Name the agent role and its primary responsibility.' },
    { pattern: /\b(tool|skill|api|access|handoff|communicate|memory|tone|personality|permission)\b/i, points: 10, suggestion: 'Describe needed skills, tools, collaboration, permissions, or tone.' },
  ],
  skill: [
    { pattern: /\b(when to use|trigger|use when|agent should|purpose|skill)\b/i, points: 10, suggestion: 'Explain when an agent should use this skill.' },
    { pattern: /\b(steps?|instructions?|commands?|examples?|errors?|failures?|dependencies|dependency|requirements?|outputs?)\b/i, points: 10, suggestion: 'Specify the steps, expected output, dependencies, and failure behavior.' },
  ],
  template: [
    { pattern: /\b(team|company|organization|agent|role|department|member)\b/i, points: 10, suggestion: 'Define the team or company structure and key roles.' },
    { pattern: /\b(workflow|handoff|schedule|deliverable|group|community|collaborate|report)\b/i, points: 10, suggestion: 'Describe workflows, handoffs, schedules, and final deliverables.' },
  ],
  workflow: [
    { pattern: /\b(trigger|schedule|cron|daily|weekly|when|event|start)\b/i, points: 10, suggestion: 'State what triggers the workflow and how often it runs.' },
    { pattern: /\b(step|agent|participant|handoff|dependency|blocker|result|complete|output)\b/i, points: 10, suggestion: 'Name participants, ordered steps, dependencies, and completion output.' },
  ],
  plugin: [
    { pattern: /\b(plugin|guardrail|eval|optimization|record|page|action|setting|provider|integration)\b/i, points: 10, suggestion: 'Name the plugin behavior or record the user is creating.' },
    { pattern: /\b(scope|target|agent|workflow|permission|capability|history|notification|result|enabled)\b/i, points: 10, suggestion: 'Define targets, permissions, state, and visible results or history.' },
  ],
  builder: [
    { pattern: /\b(agent|team|company|template|skill|workflow|existing|reuse|new)\b/i, points: 10, suggestion: 'Clarify whether to create or reuse an agent, team, skill, template, or workflow.' },
    { pattern: /\b(test|verify|deliverable|result|success|done|output|deploy|run)\b/i, points: 10, suggestion: 'Describe the expected result and how ClawMax should verify it.' },
  ],
  general: [
    { pattern: /\b(who|what|where|when|why|how|user|system|process)\b/i, points: 10, suggestion: 'Add the actor, task, and operating context.' },
    { pattern: /\b(output|result|deliverable|constraint|success|verify)\b/i, points: 10, suggestion: 'Add the expected result, constraints, and success check.' },
  ],
}

function facet(
  id: string,
  label: string,
  earned: number,
  max: number,
  suggestion: string,
): PromptQualityFacet {
  return { id, label, earned: Math.min(max, Math.max(0, earned)), max, suggestion }
}

export function scorePromptQuality(prompt: string, domain: PromptQualityDomain = 'general'): PromptQualityResult {
  const text = prompt.trim()
  const words = text ? text.split(/\s+/).filter(Boolean) : []
  const domainRules = DOMAIN_RULES[domain] || DOMAIN_RULES.general
  const domainEarned = domainRules.reduce((total, rule) => total + (rule.pattern.test(text) ? rule.points : 0), 0)
  const missingDomainRule = domainRules.find((rule) => !rule.pattern.test(text))

  const facets = [
    facet(
      'goal',
      'Goal',
      (text ? 5 : 0) + (ACTION_PATTERN.test(text) ? 8 : 0) + (words.length >= 6 ? 7 : 0),
      20,
      'State one concrete action and the goal it should achieve.',
    ),
    facet(
      'context',
      'Context',
      (CONTEXT_PATTERN.test(text) ? 8 : 0) + (words.length >= 20 ? 7 : 0),
      15,
      'Add who this is for and the relevant business or workspace context.',
    ),
    facet(
      'inputs',
      'Inputs',
      INPUT_PATTERN.test(text) ? 10 : 0,
      10,
      'Name the information, files, messages, APIs, or other inputs it should use.',
    ),
    facet(
      'output',
      'Output',
      (OUTPUT_PATTERN.test(text) ? 8 : 0) + (FORMAT_PATTERN.test(text) ? 7 : 0),
      15,
      'Describe the deliverable and its format or structure.',
    ),
    facet(
      'constraints',
      'Constraints',
      (CONSTRAINT_PATTERN.test(text) ? 8 : 0) + (EXECUTION_PATTERN.test(text) ? 7 : 0),
      15,
      'Add limits, safety rules, timing, tone, or approval requirements.',
    ),
    facet(
      'success',
      'Success',
      SUCCESS_PATTERN.test(text) ? 10 : 0,
      10,
      'Explain how the result should be checked or measured.',
    ),
    facet(
      'domain',
      domain === 'general' ? 'Task detail' : `${domain[0].toUpperCase()}${domain.slice(1)} detail`,
      domainEarned,
      20,
      missingDomainRule?.suggestion || domainRules[0].suggestion,
    ),
  ]

  const score = facets.reduce((total, item) => total + item.earned, 0)
  const level = score >= PROMPT_QUALITY_EXCELLENT_SCORE
    ? 'Excellent'
    : score >= PROMPT_QUALITY_READY_SCORE
      ? 'Ready'
      : score >= 60
        ? 'Promising'
        : score >= 40
          ? 'Needs detail'
          : 'Starting point'

  return {
    score,
    level,
    ready: score >= PROMPT_QUALITY_READY_SCORE,
    facets,
    suggestions: facets
      .filter((item) => item.earned < item.max)
      .sort((a, b) => (b.max - b.earned) - (a.max - a.earned))
      .slice(0, 3),
  }
}

export function comparePromptQuality(
  beforePrompt: string,
  afterPrompt: string,
  domain: PromptQualityDomain = 'general',
): PromptQualityComparison {
  const before = scorePromptQuality(beforePrompt, domain).score
  const after = scorePromptQuality(afterPrompt, domain).score
  return { before, after, delta: after - before }
}

export function recordPromptQualityFeedback(feedback: PromptQualityFeedback): void {
  try {
    const existing = JSON.parse(localStorage.getItem(PROMPT_QUALITY_FEEDBACK_STORAGE_KEY) || '[]')
    const entries = Array.isArray(existing) ? existing : []
    localStorage.setItem(PROMPT_QUALITY_FEEDBACK_STORAGE_KEY, JSON.stringify([...entries, feedback].slice(-100)))
  } catch {
    // Feedback must never interrupt creation.
  }
}
