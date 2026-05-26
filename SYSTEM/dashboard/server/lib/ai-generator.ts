import OpenAI from 'openai'
import { resolveSystemExecutionProviderKeys, resolveUserExecutionProviderKeys, ProviderKeys } from './dashboard-env'
import { getPreferredAnthropicModel } from './model-discovery'
import { getBestAvailableModel } from './dashboard-env'
import { readWorkspaceIntegrationConfig } from './workspace-integrations'

type AIProvider = 'openai' | 'openai-compatible' | 'anthropic'
export type TemplateGenerationTarget = 'agent' | 'team' | 'company'
export type PromptExpansionTarget = 'agent' | 'workflow' | 'skill' | 'template'
export type PromptExpansionFormat = 'markdown' | 'text'
export type PromptExpansionGuidance = string
export type BuilderStarterPromptInput = {
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
}

export type BuilderLlmFallbackInput = {
  prompt: string
  summary: string
  intent: string
  scope: string
  operation: string
  confidence: string
  topOrganizationTemplates?: Array<{ name: string; summary?: string; family?: string }>
  topAgentTemplates?: Array<{ name: string; summary?: string }>
}

export type BuilderLlmFallbackOutput = {
  grouping: string
  rationale: string
  candidateGroupings?: string[]
  strategy: 'keep_current' | 'use_existing_template' | 'refine_existing_template' | 'create_new_template'
  suggestedScope?: 'single_agent' | 'team' | 'team_of_teams' | 'unknown'
  suggestedFamily?: string
}

function detectProviderFromKeyShape(key: string): 'openai' | 'anthropic' | 'gemini' | null {
  const trimmed = key.trim()
  if (!trimmed) return null
  if (/^sk-ant-/i.test(trimmed)) return 'anthropic'
  if (/^AIza[0-9A-Za-z\-_]{20,}$/i.test(trimmed)) return 'gemini'
  if (/^sk-(?!ant-)[0-9A-Za-z_\-]{10,}$/i.test(trimmed)) return 'openai'
  return null
}

function looksLikeSubscriptionCredential(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return /^sess-/i.test(trimmed)
    || /^ya29\./i.test(trimmed)
    || /^1\/\//.test(trimmed)
    || /^gh[opusr]_/i.test(trimmed)
    || /^github_pat_/i.test(trimmed)
}

export function validateAiGenerationProviderKeys(byokKeys?: ProviderKeys): void {
  if (!byokKeys) return

  const labels = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
  } as const

  const hostedProviders: Array<keyof Pick<ProviderKeys, 'openai' | 'anthropic'>> = ['openai', 'anthropic']
  for (const provider of hostedProviders) {
    const raw = String(byokKeys[provider] || '').trim()
    if (!raw) continue

    const detected = detectProviderFromKeyShape(raw)
    if (detected && detected !== provider) {
      throw new Error(`This looks like a ${labels[detected]} key, not a ${labels[provider]} developer API key.`)
    }

    const expectedPrefix = provider === 'openai' ? /^sk-/i : /^sk-ant-/i
    if (!expectedPrefix.test(raw)) {
      if (looksLikeSubscriptionCredential(raw)) {
        throw new Error(`${labels[provider]} subscription or app credentials cannot be used here. Use a ${labels[provider]} developer API key instead.`)
      }
      throw new Error(`This does not look like a ${labels[provider]} developer API key. Subscription or app credentials are not supported for AI generation.`)
    }
  }
}

export function normalizeTemplateGenerationTarget(value: unknown): TemplateGenerationTarget {
  return value === 'company' || value === 'agent' ? value : 'team'
}

export function normalizePromptExpansionTarget(value: unknown): PromptExpansionTarget {
  return value === 'agent' || value === 'workflow' || value === 'skill' ? value : 'template'
}

export function normalizePromptExpansionFormat(value: unknown): PromptExpansionFormat {
  return value === 'text' ? 'text' : 'markdown'
}

export function buildPromptExpansionSystemPrompt(
  target: PromptExpansionTarget,
  format: PromptExpansionFormat = 'markdown',
  guidance: PromptExpansionGuidance = '',
): string {
  const targetLabel = {
    agent: 'AI agent',
    workflow: 'workflow',
    skill: 'skill',
    template: 'template',
  }[target]
  const formatInstruction = format === 'markdown'
    ? '- Return the improved prompt as editable markdown with short sections and bullets where useful.'
    : '- Return the improved prompt as plain text paragraphs and lists without markdown headings.'

  const normalizedGuidance = guidance.trim()
  const guidanceInstruction = normalizedGuidance
    ? `\nAdditional user direction for the improvement:\n- ${normalizedGuidance}`
    : ''

  return `You improve short natural-language prompts for an ${targetLabel} generation wizard.

Expand the user's prompt into a richer, more actionable prompt that preserves the original intent while adding useful detail, constraints, outputs, tone, and edge cases where appropriate.

Rules:
- Return text only, not JSON.
- Do not add markdown fences.
- Keep it concise but substantially more specific than the original.
- Preserve any names, domains, or user-supplied constraints.
- Do not mention that you are expanding or rewriting the prompt.
- Write the result so the user can directly edit and submit it to an AI generation wizard.
${formatInstruction}${guidanceInstruction}`
}

export async function expandPromptWithAI(
  prompt: string,
  target: PromptExpansionTarget = 'template',
  format: PromptExpansionFormat = 'markdown',
  guidance: PromptExpansionGuidance = '',
): Promise<string> {
  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4o'),
    messages: [
      {
        role: 'system',
        content: buildPromptExpansionSystemPrompt(target, format, guidance),
      },
      {
        role: 'user',
        content: prompt.trim(),
      },
    ],
    temperature: 0.5,
    max_tokens: 500,
  })

  return (completion.choices[0].message.content || prompt).trim()
}

function buildBuilderStarterPromptSystemPrompt(): string {
  return `You generate suggested starter prompts for an AI Builder / Designer surface.

The goal is to help the user get started in the current workspace with prompts they can click and submit directly.

Rules:
- Return strict JSON only.
- Shape: {"prompts":["...","...","...","..."]}.
- Return exactly 4 prompts.
- Each prompt must be a direct user prompt, not an explanation.
- Use the user's recent prompts as the strongest signal when available.
- Use the workspace name as a strong signal for tone and domain.
- Use existing agents, workflows, skills, and templates to make suggestions more grounded.
- Only mention a skill, agent, workflow, or template if it appears in the provided context.
- Do not invent skill names or suggest nonexistent skills.
- If the workspace is empty or sparse, use other workspace names and available templates as inspiration.
- Vary the 4 prompts across reuse, refine, template, and new-build paths when appropriate.
- Avoid near-duplicate prompts or simple rewrites of the same idea.
- Avoid generic filler like "help me get started".
- Keep each prompt concise, specific, and actionable.`
}

function buildBuilderLlmFallbackSystemPrompt(): string {
  return `You are a second-stage classifier for an AI Builder / Designer recommendation system.

You are only called when the first deterministic pass is low-confidence or cannot confidently identify the domain grouping.

Your job:
- infer the most likely grouping/domain for the request
- decide whether the user should:
  - keep the current recommendation
  - use an existing template
  - refine an existing template
  - create a new template

Rules:
- Return strict JSON only.
- Shape:
  {
    "grouping": "short domain/grouping label",
    "rationale": "1-2 sentence explanation",
    "candidateGroupings": ["...", "..."],
    "strategy": "keep_current" | "use_existing_template" | "refine_existing_template" | "create_new_template",
    "suggestedScope": "single_agent" | "team" | "team_of_teams" | "unknown",
    "suggestedFamily": "short existing family label or other"
  }
- Prefer practical groupings over abstract categories.
- If the closest existing template looks structurally useful but domain-generic, choose "refine_existing_template".
- If the domain looks novel or the existing templates are too generic, choose "create_new_template".
- Do not invent product capabilities beyond the provided context.
- Keep candidateGroupings short and useful.`
}

export async function generateBuilderStarterPromptsWithAI(input: BuilderStarterPromptInput): Promise<string[]> {
  const context = JSON.stringify({
    workspaceName: input.workspaceName || '',
    workspaceTags: input.workspaceTags || [],
    userName: input.userName || '',
    userEmail: input.userEmail || '',
    recentPrompts: (input.recentPrompts || []).slice(0, 4),
    agents: (input.agents || []).slice(0, 8),
    skills: (input.skills || []).slice(0, 8),
    workflows: (input.workflows || []).slice(0, 8),
    agentTemplates: (input.agentTemplates || []).slice(0, 8),
    organizationTemplates: (input.organizationTemplates || []).slice(0, 8),
    otherWorkspaceNames: (input.otherWorkspaceNames || []).slice(0, 6),
  }, null, 2)

  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4o-mini'),
    messages: [
      {
        role: 'system',
        content: buildBuilderStarterPromptSystemPrompt(),
      },
      {
        role: 'user',
        content: context,
      },
    ],
    temperature: 0.8,
    max_tokens: 500,
  })

  const raw = extractJsonResponseText(completion.choices[0].message.content || '')
  const parsed = JSON.parse(raw)
  const prompts = Array.isArray(parsed?.prompts)
    ? parsed.prompts.map((value: unknown) => String(value || '').trim()).filter(Boolean)
    : []
  if (prompts.length === 0) {
    throw new Error('Failed to generate builder starter prompts')
  }
  return prompts.slice(0, 4)
}

export async function inferBuilderGroupingWithAI(input: BuilderLlmFallbackInput): Promise<BuilderLlmFallbackOutput> {
  const context = JSON.stringify(input, null, 2)
  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4o-mini'),
    messages: [
      {
        role: 'system',
        content: buildBuilderLlmFallbackSystemPrompt(),
      },
      {
        role: 'user',
        content: context,
      },
    ],
    temperature: 0.3,
    max_tokens: 350,
  })

  const parsed = parseJsonResponse<BuilderLlmFallbackOutput>(completion.choices[0].message.content || '', {
    grouping: '',
    rationale: '',
    candidateGroupings: [],
    strategy: 'keep_current',
    suggestedScope: 'unknown',
    suggestedFamily: 'other',
  })

  return {
    grouping: String(parsed.grouping || '').trim(),
    rationale: String(parsed.rationale || '').trim(),
    candidateGroupings: Array.isArray(parsed.candidateGroupings)
      ? parsed.candidateGroupings.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 3)
      : [],
    strategy: parsed.strategy || 'keep_current',
    suggestedScope: parsed.suggestedScope || 'unknown',
    suggestedFamily: String(parsed.suggestedFamily || 'other').trim() || 'other',
  }
}

export function shouldGenerateCompanyTemplate(description: string, generationTarget: TemplateGenerationTarget = 'team'): boolean {
  const normalizedTarget = normalizeTemplateGenerationTarget(generationTarget)
  if (normalizedTarget === 'company') return true
  if (normalizedTarget === 'agent') return false
  if (promptImpliesCompany(description)) return true

  const lower = description.toLowerCase()
  const functionalHits = [
    /\bleadership\b/,
    /\bresearch\b/,
    /\bmarketing\b/,
    /\bsales\b/,
    /\boutbound\b/,
    /\bdelivery\b/,
    /\boperations\b/,
    /\bengineering\b/,
    /\bproduct\b/,
    /\bstrategy\b/,
  ].reduce((count, pattern) => count + (pattern.test(lower) ? 1 : 0), 0)

  if (promptImpliesRevenue(description) && functionalHits >= 2) return true
  if (/\b(team of teams|multiple teams|several teams|leadership plus)\b/i.test(description)) return true
  return false
}

export function ensureGeneratedCompanyRoot(teams: any[], companyName: string, shouldBiasRevenue: boolean = false) {
  if (!Array.isArray(teams) || teams.length === 0) return teams
  const rootLikeTeam = teams.find((team) => (team.tags || []).includes('org-root') || (team.tags || []).includes('company'))
  if (rootLikeTeam) return teams

  const leadershipTeam = teams.find((team) => normalizeGenerationName(team.id) === 'leadership')
  const rootLeader = leadershipTeam?.leaderAgentId || leadershipTeam?.memberAgentIds?.[0] || teams[0]?.leaderAgentId || teams[0]?.memberAgentIds?.[0]
  const rootId = slugifyGeneratedTemplateValue(companyName || 'company', 'company-root')
  const nextTeams = teams.map((team) => (
    team.id === leadershipTeam?.id
      ? { ...team, parentTeamId: rootId }
      : team
  ))

  return [
    {
      id: rootId,
      name: companyName || 'Company',
      purpose: shouldBiasRevenue ? 'Root company team for revenue leadership and operating lanes.' : 'Root company team for leadership and operating lanes.',
      leaderAgentId: rootLeader,
      memberAgentIds: [],
      tags: ['company', 'org-root'],
    },
    ...nextTeams,
  ]
}

function getPreferredAnthropicGenerationModel(): string {
  const override = process.env.CLAWMAX_ANTHROPIC_GENERATION_MODEL?.trim()
  if (override) return override.startsWith('anthropic/') ? override.replace(/^anthropic\//, '') : override
  return getPreferredAnthropicModel().replace(/^anthropic\//, '')
}

export function resolveOpenAiCompatibleGenerationDefaults(byokKeys?: ProviderKeys): { baseUrl?: string; defaultModel?: string } {
  const integrationConfig = readWorkspaceIntegrationConfig()
  const systemKeys = resolveSystemExecutionProviderKeys()
  return {
    baseUrl: byokKeys?.openaiCompatibleBaseUrl?.trim()
      || integrationConfig.openaiCompatibleBaseUrl?.trim()
      || systemKeys.openaiCompatibleBaseUrl?.trim()
      || undefined,
    defaultModel: byokKeys?.openaiCompatibleDefaultModel?.trim()
      || integrationConfig.openaiCompatibleDefaultModel?.trim()
      || systemKeys.openaiCompatibleDefaultModel?.trim()
      || undefined,
  }
}

function getAvailableProvider(byokKeys?: ProviderKeys): { provider: AIProvider; key: string; baseUrl?: string; defaultModel?: string } {
  validateAiGenerationProviderKeys(byokKeys)
  const compatibleDefaults = resolveOpenAiCompatibleGenerationDefaults(byokKeys)
  // Try BYOK keys first (passed from client request)
  if (byokKeys?.openai) return { provider: 'openai', key: byokKeys.openai }
  if (byokKeys?.openaiCompatibleBaseUrl) {
    return {
      provider: 'openai-compatible',
      key: byokKeys.openaiCompatibleApiKey || 'openai-compatible',
      baseUrl: byokKeys.openaiCompatibleBaseUrl,
      defaultModel: byokKeys.openaiCompatibleDefaultModel,
    }
  }
  if (byokKeys?.anthropic) return { provider: 'anthropic', key: byokKeys.anthropic }
  // Then system/user-default keys
  const keys = resolveSystemExecutionProviderKeys()
  if (keys.openai) return { provider: 'openai', key: keys.openai }
  if (compatibleDefaults.baseUrl) {
    return {
      provider: 'openai-compatible',
      key: keys.openaiCompatibleApiKey || 'openai-compatible',
      baseUrl: compatibleDefaults.baseUrl,
      defaultModel: compatibleDefaults.defaultModel,
    }
  }
  if (keys.anthropic) return { provider: 'anthropic', key: keys.anthropic }
  throw new Error('No API key configured. Set SYSTEM_OPENAI_API_KEY or SYSTEM_ANTHROPIC_API_KEY in .env, or provide a BYOK key.')
}

function getAIClient(byokKeys?: ProviderKeys): { client: OpenAI; model: string } {
  const { provider, key, baseUrl, defaultModel } = getAvailableProvider(byokKeys)
  if (provider === 'anthropic') {
    // Use Anthropic's OpenAI-compatible endpoint
    return {
      client: new OpenAI({
        apiKey: key,
        baseURL: 'https://api.anthropic.com/v1/',
        defaultHeaders: { 'anthropic-version': '2023-06-01' },
      }),
      model: getPreferredAnthropicGenerationModel(),
    }
  }
  if (provider === 'openai-compatible') {
    const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '')
    if (!normalizedBaseUrl) {
      throw new Error('OpenAI-compatible Base URL is required for AI generation.')
    }
    if (!String(defaultModel || '').trim()) {
      throw new Error('OpenAI-compatible AI generation requires a default model. Set one in BYOK first.')
    }
    return {
      client: new OpenAI({ apiKey: key, baseURL: normalizedBaseUrl }),
      model: String(defaultModel).trim(),
    }
  }
  return {
    client: new OpenAI({ apiKey: key }),
    model: resolveModel('gpt-4o-mini'),
  }
}

// Module-level BYOK override — set per-request by routes
let _requestByokKeys: ProviderKeys | undefined

export function setRequestByokKeys(keys: ProviderKeys | undefined) {
  _requestByokKeys = keys
}

function currentClient(): { client: OpenAI; model: string } {
  return getAIClient(_requestByokKeys)
}

export function resolveSystemGenerationModelForProvider(
  provider: AIProvider,
  configuredModel: string | undefined,
  anthropicFallback: string,
): string | undefined {
  const trimmed = String(configuredModel || '').trim()
  if (!trimmed) return undefined

  if (provider === 'openai-compatible') return undefined

  if (provider === 'openai') {
    if (trimmed.startsWith('openai/')) return trimmed.replace(/^openai\//, '')
    if (trimmed.startsWith('gpt-') || /^o[134](?:-|$)/.test(trimmed)) return trimmed
    return undefined
  }

  if (trimmed.startsWith('anthropic/')) return trimmed.replace(/^anthropic\//, '')
  if (trimmed.startsWith('claude')) return trimmed
  if (trimmed.startsWith('openai/')) return anthropicFallback
  if (trimmed.startsWith('gpt-') || /^o[134](?:-|$)/.test(trimmed)) return anthropicFallback
  return undefined
}

/**
 * Get the appropriate model name for the available provider.
 * Maps OpenAI model names to Anthropic equivalents when needed.
 */
function resolveModel(requestedModel: string): string {
  const { provider } = getAvailableProvider(_requestByokKeys)
  const systemPreferredModel = readWorkspaceIntegrationConfig().systemPreferredModel?.trim()
  if (provider === 'openai-compatible') {
    const model = resolveOpenAiCompatibleGenerationDefaults(_requestByokKeys).defaultModel
    if (model) return model
    throw new Error('OpenAI-compatible AI generation requires a default model. Set one in BYOK first.')
  }
  const anthropicModel = getPreferredAnthropicGenerationModel()
  const preferredForProvider = resolveSystemGenerationModelForProvider(provider, systemPreferredModel, anthropicModel)
  if (preferredForProvider) return preferredForProvider
  if (provider === 'openai') return requestedModel
  // Map OpenAI models to Anthropic equivalents
  if (requestedModel.includes('gpt-4o-mini') || requestedModel.includes('gpt-4')) return anthropicModel
  if (requestedModel.includes('gpt-4o') || requestedModel.includes('gpt-5')) return anthropicModel
  return anthropicModel
}

function getSystemOpenAiClient(): OpenAI {
  return currentClient().client
}

interface GenerateAgentFilesInput {
  description: string
  name: string
  tags: string[]
}

interface GeneratedSkillScaffold {
  name: string
  description: string
  emoji?: string
  tags: string[]
  content: string
}

const DEFAULT_SKILL_SECTION_ORDER = [
  '## Purpose',
  '## When to Use',
  '## Instructions',
  '## Examples',
]

interface GeneratedFiles {
  identity: string
  soul: string
  tools: string
}

export function extractJsonResponseText(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '{}'
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, trimmed]
  return (jsonMatch[1] || trimmed).trim()
}

export function parseJsonResponse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(extractJsonResponseText(raw)) as T
  } catch {
    return fallback
  }
}

export function isOneTimeScheduleRequest(text: string): boolean {
  const normalized = `${text || ''}`.toLowerCase()
  return /\b(just once|one time|one-time|only once|run once|single run)\b/.test(normalized)
}

export function explainOneTimeCronLimitation(): string {
  return 'Cron expressions always repeat. A one-time run cannot be expressed as a cron schedule. Trigger the workflow manually instead.'
}

function slugifyGeneratedTemplateValue(value: string, fallback = 'workflow'): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback
}

function humanizeGeneratedChannelName(value: string, fallback = 'Team'): string {
  const trimmed = String(value || '').trim()
  if (!trimmed) return fallback
  if (/[A-Z]/.test(trimmed) || /\s/.test(trimmed)) return trimmed
  return trimmed
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function extractPromptUrls(text: string): string[] {
  return Array.from(new Set((text.match(/https?:\/\/[^\s)]+/g) || []).map((url) => url.trim())))
}

function summarizePromptExamples(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const summaries: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^#{1,6}\s+/.test(line)) {
      const heading = line.replace(/^#{1,6}\s+/, '').trim()
      if (/example|camera|lens|part|sample|reference/i.test(heading)) {
        const next = lines.slice(i + 1, i + 5).find((candidate) => candidate && !candidate.startsWith('#'))
        summaries.push(next ? `${heading}: ${next}` : heading)
      }
      continue
    }
    if (/^grade:|^\$|^\w.*\b(condition|working order|ready for use|cosmetic)\b/i.test(line)) {
      summaries.push(line)
    }
  }
  return Array.from(new Set(summaries)).slice(0, 8)
}

function inferStyleGuidanceFromPrompt(text: string): string[] {
  const guidance: string[] = []
  if (/\bmatch(?:es|ing)?\b.*\bformat\b|\bstyle\b/i.test(text)) guidance.push('Match the style, structure, and tone of the provided examples.')
  if (/\b500 words\b|\bno more than\b/i.test(text)) guidance.push('Keep the final output concise and within any length limits mentioned in the prompt.')
  if (/\baccurate\b|\bcorroborat(?:e|ion)\b/i.test(text)) guidance.push('Use the provided evidence, notes, and examples to stay accurate and grounded.')
  if (/\balternatives?\b.*\bhuman\b/i.test(text)) guidance.push('If confidence is low, present alternatives and flag them clearly for human review.')
  return guidance
}

function promptImpliesScaling(text: string): boolean {
  return /\b(collection|multiple|many|batch|catalog|lots of|set of|images|photos|posts|items|products|assets)\b/i.test(text)
}

function promptImpliesCompany(text: string): boolean {
  return /\b(company|business|startup|agency|studio|firm|operator|ecommerce|e-commerce|revenue|sales pipeline|lead gen|outbound|client acquisition|offer|pricing)\b/i.test(text)
}

function promptImpliesRevenue(text: string): boolean {
  return /\b(revenue|profit|sales|sell|paying customers|pipeline|qualified leads|booked calls|closed deals|inbound|outbound|conversion|pricing|offer|retainer|subscriptions?)\b/i.test(text)
}

function promptExplicitlyRequestsMultipleCommunities(text: string): boolean {
  return /\b(two|2|multiple|separate|distinct)\s+communities\b|\bseparate umbrellas\b|\bdifferent umbrella communities\b/i.test(text)
}

function buildSoberCompanyName(description: string): string {
  const text = description.toLowerCase()
  if (/\bhomepage\b/.test(text) && /\bconversion\b/.test(text)) return 'Homepage Conversion Studio'
  if (/\blanding page\b/.test(text) && /\bconversion\b/.test(text)) return 'Landing Page Growth Studio'
  if (/\boutbound\b/.test(text) && /\blead generation\b|\blead gen\b/.test(text)) return 'Outbound Growth Studio'
  if (/\bb2b\b/.test(text) && /\bsaas\b/.test(text) && /\bconversion\b/.test(text)) return 'B2B SaaS Conversion Studio'
  if (/\becommerce\b|\be-commerce\b/.test(text)) return 'Ecommerce Operating Studio'
  if (promptImpliesRevenue(description)) return 'Revenue Operations Studio'
  return 'Operating Company'
}

function roleImpliesScalableLane(role: string, agentId: string): boolean {
  const value = `${role} ${agentId}`.toLowerCase()
  return /\b(writer|selector|reviewer|analyst|researcher|specialist|editor|creator|curator|planner)\b/.test(value)
}

function buildScalableTeamParameters(agents: any[], shouldScale: boolean) {
  if (!shouldScale || !Array.isArray(agents) || agents.length < 2) return []

  const usedLabels = new Set<string>()
  return agents
    .filter((agent: any) => roleImpliesScalableLane(String(agent?.role || ''), String(agent?.id || '')))
    .slice(0, 3)
    .map((agent: any) => {
      const cleanedRole = String(agent?.role || agent?.id || 'Agent')
        .replace(/\bSpecialist\b/gi, '')
        .replace(/\bCoordinator\b/gi, '')
        .trim()
      let label = `Number of ${cleanedRole || humanizeGeneratedChannelName(String(agent?.id || 'agents'), 'Agents')}s`
        .replace(/\s+/g, ' ')
        .trim()
      if (!label || usedLabels.has(label.toLowerCase())) {
        label = `Number of ${humanizeGeneratedChannelName(String(agent?.id || 'agents'), 'Agents')}`
      }
      usedLabels.add(label.toLowerCase())
      return {
        agentId: String(agent.id),
        label,
        default: 2,
        min: 1,
        max: 10,
      }
    })
}

function buildExampleAwarePromptContext(description: string): string {
  const urls = extractPromptUrls(description)
  const examples = summarizePromptExamples(description)
  const styleGuidance = inferStyleGuidanceFromPrompt(description)
  const sections: string[] = []

  if (urls.length > 0) {
    sections.push(`Reference URLs provided by the user:\n${urls.map((url) => `- ${url}`).join('\n')}`)
  }

  if (examples.length > 0) {
    sections.push(`Example snippets and reference cues from the prompt:\n${examples.map((example) => `- ${example}`).join('\n')}`)
  }

  if (styleGuidance.length > 0) {
    sections.push(`Style and quality guidance inferred from the prompt:\n${styleGuidance.map((item) => `- ${item}`).join('\n')}`)
  }

  if (promptImpliesScaling(description)) {
    sections.push('The prompt implies potentially many assets/items/posts, so the middle workflow stages should support scalable or parallel work where appropriate while kickoff and finalization remain singleton steps.')
  }

  if (promptImpliesCompany(description)) {
    sections.push('The prompt implies a company rather than a simple team. Favor a company-shaped template with leadership, operating lanes, and visible handoffs across functions.')
  }

  if (promptImpliesRevenue(description)) {
    sections.push('The prompt is revenue-oriented. The generated company should produce commercially concrete outputs such as offers, ICPs, lead lists, outreach copy, pricing, launch plans, funnel metrics, and next revenue actions.')
  }

  return sections.join('\n\n')
}

function buildWorkflowReferenceBlock(description: string, options?: { finalOnly?: boolean; isFinal?: boolean; firstOnly?: boolean; isFirst?: boolean }): string {
  if (options?.finalOnly && !options?.isFinal) return ''
  if (options?.firstOnly && !options?.isFirst) return ''

  const urls = extractPromptUrls(description).slice(0, 3)
  const examples = summarizePromptExamples(description).slice(0, 4)
  const styleGuidance = inferStyleGuidanceFromPrompt(description).slice(0, 3)
  if (urls.length === 0 && examples.length === 0 && styleGuidance.length === 0) return ''

  const lines: string[] = ['## References']
  if (urls.length > 0) {
    lines.push('- Use these source examples/URLs directly when matching format and tone:')
    for (const url of urls) lines.push(`  - ${url}`)
  }
  if (examples.length > 0) {
    lines.push('- Preserve these example cues from the original prompt:')
    for (const example of examples) lines.push(`  - ${example}`)
  }
  if (styleGuidance.length > 0) {
    lines.push('- Apply this style guidance while producing the output:')
    for (const item of styleGuidance) lines.push(`  - ${item}`)
  }
  return lines.join('\n')
}

function normalizeGenerationName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
}

function inferCompanyWorkflowTeamId(
  workflow: any,
  teams: any[] = [],
  groups: any[] = []
): string | undefined {
  const normalizedWorkflowText = normalizeGenerationName([
    workflow?.id,
    workflow?.name,
    workflow?.description,
    ...(Array.isArray(workflow?.targeting?.groups) ? workflow.targeting.groups : []),
  ].filter(Boolean).join(' '))

  const normalizedTargetGroups = new Set<string>(
    (Array.isArray(workflow?.targeting?.groups) ? workflow.targeting.groups : [])
      .map((groupName: string) => normalizeGenerationName(groupName))
      .filter(Boolean)
  )

  const groupToTeamId = new Map<string, string>()
  for (const group of groups || []) {
    const normalizedGroupName = normalizeGenerationName(String(group?.name || ''))
    if (!normalizedGroupName) continue
    const matchingTeam = (teams || []).find((team: any) => {
      const teamId = normalizeGenerationName(String(team?.id || ''))
      const teamName = normalizeGenerationName(String(team?.name || ''))
      return teamId === normalizedGroupName || teamName === normalizedGroupName
    })
    if (matchingTeam?.id) {
      groupToTeamId.set(normalizedGroupName, matchingTeam.id)
    }
  }

  for (const normalizedGroupName of normalizedTargetGroups) {
    const matchedTeamId = groupToTeamId.get(normalizedGroupName)
    if (matchedTeamId) return matchedTeamId
  }

  const scoredTeams = (teams || []).map((team: any) => {
    const aliases = Array.from(new Set([
      normalizeGenerationName(String(team?.id || '')),
      normalizeGenerationName(String(team?.name || '')),
    ].filter(Boolean)))
    const score = aliases.reduce((total, alias) => total + (alias && normalizedWorkflowText.includes(alias) ? 1 : 0), 0)
    return { team, score }
  }).filter(({ score }) => score > 0)

  if (scoredTeams.length > 0) {
    scoredTeams.sort((a, b) => b.score - a.score)
    return scoredTeams[0].team.id
  }

  if (/\bkickoff|leadership|executive|strategy|brief\b/.test(normalizedWorkflowText)) {
    return (teams || []).find((team: any) => normalizeGenerationName(team.id) === 'leadership')?.id
  }

  return (teams || [])[0]?.id
}

export function applyCompanyWorkflowExecutionDefaults(
  workflows: any[],
  teams: any[] = [],
  groups: any[] = []
): any[] {
  if (!Array.isArray(workflows) || workflows.length === 0) return Array.isArray(workflows) ? workflows : []

  const teamsById = new Map((teams || []).map((team: any) => [team.id, team]))

  return workflows.map((workflow: any, idx: number, arr: any[]) => {
    const matchedTeamId = inferCompanyWorkflowTeamId(workflow, teams, groups)
    const matchedTeam = matchedTeamId ? teamsById.get(matchedTeamId) : undefined
    const explicitAgentTargets = Array.from(new Set(
      (Array.isArray(workflow?.targeting?.agents) ? workflow.targeting.agents : [])
        .map((agentId: string) => `${agentId || ''}`.trim())
        .filter(Boolean)
    ))
    const ownerAgentId = `${workflow.owner || ''}`.trim()
    const agentTargets = matchedTeam?.leaderAgentId
      ? [matchedTeam.leaderAgentId]
      : (ownerAgentId ? [ownerAgentId] : explicitAgentTargets)
    const priorOutputRef = idx > 0
      ? 'Use the latest approved markdown handoff from the previous workflow as input. Do not restate the full project context.'
      : 'Use the company brief and current request as the only required starting context.'
    const outputInstruction = idx === arr.length - 1
      ? 'Produce the final markdown deliverable and state where it was posted or saved.'
      : 'Produce one concise markdown handoff for the next workflow and post a short summary in the working channel.'

    const compactInstructions = [
      workflow.content ? String(workflow.content).split('\n').slice(0, 4).join('\n').trim() : '',
      `- ${priorOutputRef}`,
      `- ${outputInstruction}`,
      matchedTeam?.name ? `- Work as the ${matchedTeam.name} team and keep updates visible in its channel.` : '',
    ].filter(Boolean)

    return {
      ...workflow,
      owner: matchedTeam?.leaderAgentId || agentTargets[0] || workflow.owner,
      targeting: {
        communities: [],
        groups: [],
        agents: agentTargets,
        teamIds: matchedTeam?.id ? [matchedTeam.id] : (Array.isArray(workflow.targeting?.teamIds) ? workflow.targeting.teamIds : []),
        // In company templates, tags are categorization metadata in the AI output.
        // Keeping them as execution targets fans a one-owner workflow back out to
        // every similarly tagged agent.
        tags: [],
      },
      content: compactInstructions.join('\n'),
    }
  })
}

function buildDefaultWorkflowOutputDefinition(
  workflow: { id?: string; name?: string; description?: string },
  usedKeys: Set<string>
): { key: string; label: string; type: 'markdown' } {
  const sourceText = `${workflow.name || ''} ${workflow.description || ''}`.toLowerCase()
  const preferredKey =
    /\b(plan|execution|delivery|milestone)\b/.test(sourceText) ? 'plan'
      : /\b(kickoff|brief|intake|direction|strategy)\b/.test(sourceText) ? 'brief'
        : /\b(engineering|spec|technical)\b/.test(sourceText) ? 'spec'
          : /\b(marketing|launch|campaign|messaging)\b/.test(sourceText) ? 'launch-pack'
            : /\b(review|qa|signoff|summary|final|closeout)\b/.test(sourceText) ? 'summary'
              : `${slugifyGeneratedTemplateValue(workflow.id || workflow.name || 'workflow', 'workflow')}-output`

  let key = preferredKey
  let suffix = 2
  while (usedKeys.has(key)) {
    key = `${preferredKey}-${suffix}`
    suffix += 1
  }
  usedKeys.add(key)

  const labelBase = workflow.name?.trim() || workflow.id?.trim() || 'Workflow'
  return {
    key,
    label: `${labelBase} Output`,
    type: 'markdown',
  }
}

export function applyGeneratedWorkflowHandoffs(workflows: any[]): any[] {
  if (!Array.isArray(workflows) || workflows.length === 0) return []

  const usedOutputKeys = new Set<string>()
  const normalizedOutputsByWorkflowId = new Map<string, { key: string; label: string; type: 'markdown' }>()

  const withOutputs = workflows.map((workflow: any) => {
    const existingOutputDefinitions = Array.isArray(workflow.outputDefinitions) ? workflow.outputDefinitions : []
    const primaryOutput = existingOutputDefinitions[0]
      ? {
          key: String(existingOutputDefinitions[0].key || '').trim() || buildDefaultWorkflowOutputDefinition(workflow, usedOutputKeys).key,
          label: String(existingOutputDefinitions[0].label || '').trim() || `${workflow.name || workflow.id || 'Workflow'} Output`,
          type: 'markdown' as const,
          help: existingOutputDefinitions[0].help,
        }
      : buildDefaultWorkflowOutputDefinition(workflow, usedOutputKeys)

    usedOutputKeys.add(primaryOutput.key)
    normalizedOutputsByWorkflowId.set(workflow.id, {
      key: primaryOutput.key,
      label: primaryOutput.label,
      type: 'markdown',
    })

    return {
      ...workflow,
      outputDefinitions: existingOutputDefinitions.length > 0
        ? [
            {
              ...existingOutputDefinitions[0],
              key: primaryOutput.key,
              label: primaryOutput.label,
              type: 'markdown',
            },
            ...existingOutputDefinitions.slice(1),
          ]
        : [primaryOutput],
    }
  })

  return withOutputs.map((workflow: any, idx: number) => {
    const existingInputRefs = Array.isArray(workflow.inputRefs) ? workflow.inputRefs : []
    if (existingInputRefs.length > 0) return workflow

    const dependencyIds = Array.isArray(workflow.dependsOn) && workflow.dependsOn.length > 0
      ? workflow.dependsOn
      : (idx > 0 ? [withOutputs[idx - 1].id] : [])

    const inferredInputRefs = dependencyIds
      .map((workflowId: string) => {
        const upstreamOutput = normalizedOutputsByWorkflowId.get(workflowId)
        if (!upstreamOutput) return null
        return {
          workflowId,
          outputKey: upstreamOutput.key,
          label: upstreamOutput.label,
          required: true,
        }
      })
      .filter(Boolean)

    if (inferredInputRefs.length === 0) return workflow

    return {
      ...workflow,
      inputRefs: inferredInputRefs,
    }
  })
}

export function enforceVisibleCompanyWorkflowChain(workflows: any[]): any[] {
  if (!Array.isArray(workflows) || workflows.length <= 1) return Array.isArray(workflows) ? workflows : []

  return workflows.map((workflow: any, idx: number, arr: any[]) => {
    if (idx === 0) {
      return {
        ...workflow,
        dependsOn: [],
      }
    }

    const previousId = arr[idx - 1]?.id
    const existingDependsOn = Array.isArray(workflow.dependsOn) ? workflow.dependsOn.filter(Boolean) : []
    const nextDependsOn = previousId
      ? [previousId, ...existingDependsOn.filter((dependencyId: string) => dependencyId !== previousId)]
      : existingDependsOn

    return {
      ...workflow,
      dependsOn: nextDependsOn,
    }
  })
}

export function normalizeGeneratedWorkflowReferences(workflows: any[]): any[] {
  if (!Array.isArray(workflows) || workflows.length === 0) return []

  const aliasToId = new Map<string, string>()
  for (const workflow of workflows) {
    const id = String(workflow.id || '').trim()
    const sourceId = String(workflow._sourceId || '').trim()
    const sourceName = String(workflow._sourceName || workflow.name || '').trim()
    const slugName = slugifyGeneratedTemplateValue(sourceName, 'workflow')
    const normalizedText = `${id} ${sourceId} ${sourceName} ${slugName}`.toLowerCase()
    const heuristicAliases = [
      normalizedText.includes('kickoff') ? 'kickoff' : '',
      normalizedText.includes('strategy') && normalizedText.includes('brief') ? 'strategy-brief' : '',
      normalizedText.includes('research') && normalizedText.includes('icp') ? 'market-research' : '',
      normalizedText.includes('outreach') || normalizedText.includes('proposal') ? 'outreach' : '',
      normalizedText.includes('revenue') && normalizedText.includes('summary') ? 'revenue-summary' : '',
    ]
    for (const alias of [id, sourceId, sourceName, slugName, ...heuristicAliases]) {
      const normalizedAlias = String(alias || '').trim()
      if (normalizedAlias) aliasToId.set(normalizedAlias, id)
    }
  }

  return workflows.map((workflow) => {
    const normalizedDependsOn = Array.from(new Set(
      (Array.isArray(workflow.dependsOn) ? workflow.dependsOn : [])
        .map((dependencyId: string) => aliasToId.get(String(dependencyId || '').trim()) || String(dependencyId || '').trim())
        .filter(Boolean)
        .filter((dependencyId: string) => dependencyId !== workflow.id)
    ))

    const normalizedInputRefs = (Array.isArray(workflow.inputRefs) ? workflow.inputRefs : [])
      .map((inputRef: any) => ({
        ...inputRef,
        workflowId: aliasToId.get(String(inputRef.workflowId || '').trim()) || String(inputRef.workflowId || '').trim(),
      }))
      .filter((inputRef: any) => inputRef.workflowId && inputRef.workflowId !== workflow.id)

    const { _sourceId, _sourceName, ...rest } = workflow
    return {
      ...rest,
      dependsOn: normalizedDependsOn,
      inputRefs: normalizedInputRefs,
    }
  })
}

export function normalizeGeneratedSkillScaffold(input: Partial<GeneratedSkillScaffold>, prompt: string): GeneratedSkillScaffold {
  const rawName = (input.name || '').trim()
  const placeholderName = !rawName || rawName.toLowerCase() === 'custom-skill'
  const normalizedName = rawName
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-')
  const inferredName = placeholderName
    ? deriveSkillSlugFromText(`${input.description || ''} ${prompt || ''}`.trim())
    : ''
  const safeName = (!placeholderName ? normalizedName : '') || inferredName || 'custom-skill'
  const safeDescription = (input.description || prompt || 'AI-generated custom skill').trim()
  const tags = Array.isArray(input.tags) ? input.tags.filter(Boolean).slice(0, 6) : []
  const content = (input.content || '').trim() || `# ${safeName}

## Purpose

This skill was generated from a natural-language description. Refine the instructions below before relying on it heavily.

## When to Use

Use this skill when the task clearly matches its domain and the extra guidance will save repeated setup or repeated reasoning.

## Instructions

- Follow the user intent carefully
- Keep outputs concise and actionable
- Ask for clarification only when blocked by ambiguity

## Examples

- Example use case: adapt this skill to the specific task before relying on it
`

  return {
    name: safeName,
    description: safeDescription,
    emoji: input.emoji || '🛠️',
    tags,
    content,
  }
}

function deriveSkillSlugFromText(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[`'".,!?():/\\]+/g, ' ')
    .replace(/\b(a|an|the|skill|that|helps?|agent|for|with|and|or|to|of|in|on|at|by|from|into|this|these|those)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const tokens = cleaned
    .split(' ')
    .filter(Boolean)
    .slice(0, 5)

  return tokens
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-')
}

const IDENTITY_TEMPLATE = `# IDENTITY.md - Who Am I?

- **Name:** {name}
- **Creature:** {role}
- **Vibe:** {vibe}
- **Emoji:** {emoji}
- **WhatsApp:**
- **Tags:** {tags}
`

const SOUL_TEMPLATE = `# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the "Great question!" and "I'd be happy to help!" — just help. Actions speak louder than filler words.

**Have opinions.** You're allowed to disagree, prefer things, find stuff amusing or boring. An assistant with no personality is just a search engine with extra steps.

**Be resourceful before asking.** Try to figure it out. Read the file. Check the context. Search for it. _Then_ ask if you're stuck. The goal is to come back with answers, not questions.

**Earn trust through competence.** Your human gave you access to their stuff. Don't make them regret it. Be careful with external actions (emails, tweets, anything public). Be bold with internal ones (reading, organizing, learning).

**Remember you're a guest.** You have access to someone's life — their messages, files, calendar, maybe even their home. That's intimacy. Treat it with respect.

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- Never send half-baked replies to messaging surfaces.
- In group chats, respond when addressed or when @all is used. Be thoughtful, but do not speak for the user.

## Your Specific Role

{role_description}

## Vibe

{personality}

## Continuity

Each session, you wake up fresh. These files _are_ your memory. Read them. Update them. They're how you persist.

If you change this file, tell the user — it's your soul, and they should know.

---

_This file is yours to evolve. As you learn who you are, update it._
`

const TOOLS_TEMPLATE = `# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

{tools_section}

## What Goes Here

Other things to add as you learn this setup:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

---

Add whatever helps you do your job. This is your cheat sheet.
`

/**
 * Generate agent metadata (name, tags, model, skills) from a description.
 * Used when creating agents via "AI Generate" to suggest all fields.
 */
export async function generateAgentMeta(description: string): Promise<{
  name: string
  tags: string[]
  model: string
  skills: string[]
}> {
  // Get available skills for suggestion
  let availableSkills: string[] = []
  try {
    const { listAvailableSkills } = require('./skills')
    availableSkills = listAvailableSkills().map((s: any) => s.id || s.name)
  } catch {}

  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4o'),
    messages: [
      {
        role: 'system',
        content: `You suggest metadata for a new AI agent based on a description.

Available skills that can be assigned: ${availableSkills.join(', ') || 'gh-issues, github, web-search, code-review, slack, jira'}

Available models:
- anthropic/${getPreferredAnthropicGenerationModel()} (best available Anthropic generation model)
- openai/gpt-5 (latest OpenAI reasoning model when available)
- openai/gpt-4o (strong default OpenAI general-purpose model)

IMPORTANT: If the user mentions a specific name for the agent (e.g., "Create jarvis", "Make a bot called Friday"), use that name. The name should be a simple, clean identifier.

Respond in JSON: {
  "name": "agent-name",
  "tags": ["tag1", "tag2"],
  "model": "provider/model-name",
  "skills": ["skill1", "skill2"]
}

Rules:
- name: lowercase, letters/numbers/dashes only (e.g., "jarvis", "friday", "data-analyst")
- Pick 2-4 tags, 1-4 relevant skills, and the best model for the role.`
      },
      { role: 'user', content: description }
    ],
    temperature: 0.7,
    max_tokens: 200,
  })

  const parsed = parseJsonResponse<{
    name?: string
    tags?: string[]
    model?: string
    skills?: string[]
  }>(completion.choices[0].message.content || '{}', {})
  return {
    name: parsed.name || 'New Agent',
    tags: parsed.tags || [],
    model: parsed.model || getBestAvailableModel(),
    skills: parsed.skills || [],
  }
}

async function generateIdentity(input: GenerateAgentFilesInput): Promise<string> {
  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4'),
    messages: [
      {
        role: 'system',
        content: `You are an expert at creating agent identity files for OpenClaw agents. Generate concise, creative agent identities.

Extract from the description:
- role: a 2-3 word role description (e.g., "helpful assistant", "code wizard", "data analyst")
- vibe: one word describing personality (e.g., "professional", "casual", "energetic", "calm")
- emoji: one emoji that represents the agent

Respond in JSON format: { "role": "...", "vibe": "...", "emoji": "..." }`
      },
      {
        role: 'user',
        content: `Agent description: "${input.description}"\nAgent name: ${input.name}\nTags: ${input.tags.join(', ')}`
      }
    ],
    temperature: 0.7,
  })

  const result = parseJsonResponse<{ role?: string; vibe?: string; emoji?: string }>(
    completion.choices[0].message.content || '{}',
    {}
  )

  return IDENTITY_TEMPLATE
    .replace('{name}', input.name)
    .replace('{role}', result.role || 'assistant')
    .replace('{vibe}', result.vibe || 'helpful')
    .replace('{emoji}', result.emoji || '🤖')
    .replace('{tags}', input.tags.join(', '))
}

async function generateSoul(input: GenerateAgentFilesInput): Promise<string> {
  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4'),
    messages: [
      {
        role: 'system',
        content: `You are an expert at creating agent personality files for OpenClaw agents.

Generate two sections:
1. role_description: 2-3 sentences describing the agent's specific role and responsibilities
2. personality: 2-3 sentences describing the agent's personality, communication style, and approach

Be concise, specific, and authentic. Avoid corporate speak.

Respond in JSON format: { "role_description": "...", "personality": "..." }`
      },
      {
        role: 'user',
        content: `Agent description: "${input.description}"\nAgent name: ${input.name}\nTags: ${input.tags.join(', ')}`
      }
    ],
    temperature: 0.8,
  })

  const result = parseJsonResponse<{ role_description?: string; personality?: string }>(
    completion.choices[0].message.content || '{}',
    {}
  )

  return SOUL_TEMPLATE
    .replace('{role_description}', result.role_description || 'You are a helpful assistant.')
    .replace('{personality}', result.personality || 'Be concise, direct, and helpful.')
}

async function generateTools(input: GenerateAgentFilesInput): Promise<string> {
  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4'),
    messages: [
      {
        role: 'system',
        content: `You are an expert at creating agent tools documentation for OpenClaw agents.

Based on the agent's role and description, suggest relevant tools or environment-specific configurations they might need.

Generate a brief "tools_section" (3-5 sentences) describing tools, APIs, or services this agent might use.

Examples:
- For a code assistant: mention GitHub, code repositories, programming languages
- For a data analyst: mention databases, visualization tools, data sources
- For a project manager: mention task tracking, calendars, communication tools

Be specific but concise.

Respond in JSON format: { "tools_section": "..." }`
      },
      {
        role: 'user',
        content: `Agent description: "${input.description}"\nAgent name: ${input.name}\nTags: ${input.tags.join(', ')}`
      }
    ],
    temperature: 0.7,
  })

  const result = parseJsonResponse<{ tools_section?: string }>(
    completion.choices[0].message.content || '{}',
    {}
  )

  return TOOLS_TEMPLATE.replace('{tools_section}', result.tools_section || '## Your Tools\n\nConfigure tool-specific notes here as you learn what you need.')
}

export async function generateAgentFiles(input: GenerateAgentFilesInput): Promise<GeneratedFiles> {
  // Generate all three files in parallel
  const [identity, soul, tools] = await Promise.all([
    generateIdentity(input),
    generateSoul(input),
    generateTools(input),
  ])

  return { identity, soul, tools }
}

export async function generateSkillFromNL(description: string, currentDraft?: Partial<GeneratedSkillScaffold>): Promise<GeneratedSkillScaffold> {
  getAvailableProvider(_requestByokKeys)

  const isRefinement = !!currentDraft
  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4o-mini'),
    messages: [
      {
        role: 'system',
        content: `You generate compact ClawMax skill scaffolds from natural language.

Return JSON with:
{
  "name": "skill-id",
  "description": "short description",
  "emoji": "one emoji",
  "tags": ["tag1", "tag2"],
  "content": "markdown body for SKILL.md without frontmatter"
}

Rules:
- name must be lowercase letters, numbers, dashes, or underscores only
- keep description under 140 characters
- content should be practical and concise
- focus on what the skill does, how it should behave, and what it should avoid
- structure the skill body with these sections when possible:
  - ## Purpose
  - ## When to Use
  - ## Instructions
  - ## Examples
- do not include YAML frontmatter
- do not mention implementation code unless the user explicitly asks for it
- if an existing draft is provided, refine it rather than replacing it blindly
  - preserve good structure where possible
  - follow the user's requested changes
  - add missing SKILL.md sections if they are absent and would make the skill clearer
Respond with JSON only.`
      },
      {
        role: 'user',
        content: isRefinement
          ? `Refine this existing skill draft.\n\nUser refinement request:\n${description}\n\nCurrent draft:\n${JSON.stringify(currentDraft, null, 2)}`
          : description
      }
    ],
    temperature: 0.6,
    max_tokens: 500,
  })

  const parsed = parseJsonResponse<Partial<GeneratedSkillScaffold>>(
    completion.choices[0].message.content || '{}',
    {}
  )
  return normalizeGeneratedSkillScaffold(parsed, description)
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function generateArchiveTitle(messages: Message[]): Promise<string> {
  if (messages.length === 0) return 'Empty conversation'

  // Fallback: use first user message
  const fallbackTitle = (() => {
    const firstUserMsg = messages.find(m => m.role === 'user')
    return firstUserMsg ? firstUserMsg.content.slice(0, 50) : 'Conversation'
  })()

  // Only use LLM if API key is available
  const apiKey = resolveSystemExecutionProviderKeys().openai
  if (!apiKey || apiKey.trim() === '') {
    return fallbackTitle
  }

  // Extract first 5 messages for context
  const contextMessages = messages.slice(0, 5).map(m => `${m.role}: ${m.content}`).join('\n')

  try {
    const completion = await getSystemOpenAiClient().chat.completions.create({
      model: resolveModel('gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content: `Generate a concise, descriptive title (max 50 characters) for this chat conversation. The title should capture the main topic or purpose of the conversation. Be specific and informative. Respond with only the title, no quotes or extra text.`
        },
        {
          role: 'user',
          content: `Generate a title for this conversation:\n\n${contextMessages}`
        }
      ],
      temperature: 0.7,
      max_tokens: 20,
    })

    const title = completion.choices[0].message.content?.trim() || ''
    return title.slice(0, 50) // Ensure max 50 chars
  } catch (err) {
    console.error('Failed to generate archive title:', err)
    return fallbackTitle
  }
}

/**
 * Generate a workflow definition from natural language description.
 */
export async function generateWorkflowFromNL(description: string, availableAgents: string[], availableTags: string[]): Promise<any> {
  getAvailableProvider(_requestByokKeys)

  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4o'),
    messages: [
      {
        role: 'system',
        content: `You are a workflow generator for ClawMax, a multiagent orchestration platform.

Given a natural language description, generate a valid workflow definition in JSON format.

Available agents: ${availableAgents.join(', ')}
Available tags: ${availableTags.join(', ')}

A workflow has:
- name: short descriptive name
- description: what the workflow does
- schedule: a cron expression (e.g., "0 9 * * 1-5" for weekdays at 9am) or "manual"
- executionMode: "automated" (agents run independently) or "managed" (sequential with coordination)
- targeting: which agents participate, defined by:
  - agents: array of agent IDs from the available list
  - tags: array of agent tags from the available list
  - groups: array of group names
  - communities: array of community names
- content: the detailed instruction/prompt that agents will receive when the workflow runs

Respond with ONLY valid JSON, no markdown fences or explanation.`
      },
      {
        role: 'user',
        content: description
      }
    ],
    temperature: 0.7,
  })

  const raw = completion.choices[0].message.content?.trim() || ''
  const jsonStr = extractJsonResponseText(raw)

  try {
    return JSON.parse(jsonStr)
  } catch {
    throw new Error(`Generated output is not valid JSON: ${jsonStr.slice(0, 200)}`)
  }
}

/**
 * Generate an organization template from natural language description.
 */
export async function generateTemplateFromNL(
  description: string,
  generationTarget: TemplateGenerationTarget = 'team',
  preferredAuthor: string = 'ClawMax AI',
): Promise<any> {
  getAvailableProvider(_requestByokKeys)
  const promptContext = buildExampleAwarePromptContext(description)
  const shouldScaleMiddleWork = promptImpliesScaling(description)
  const normalizedTarget = normalizeTemplateGenerationTarget(generationTarget)
  const shouldGenerateCompany = shouldGenerateCompanyTemplate(description, normalizedTarget)
  const shouldBiasRevenue = promptImpliesRevenue(description)
  const explicitMultiCommunityRequest = promptExplicitlyRequestsMultipleCommunities(description)
  let availableSkills: string[] = []
  try {
    const { listAvailableSkills } = require('./skills')
    availableSkills = listAvailableSkills().map((s: any) => s.id || s.name).filter(Boolean)
  } catch {}

  const completion = await getSystemOpenAiClient().chat.completions.create({
    model: resolveModel('gpt-4o'),
    messages: [
      {
        role: 'system',
        content: `You are an organization template generator for ClawMax, a multiagent orchestration platform.

Given a natural language description, generate a valid organization template in JSON format.

A template has:
- name: organization name
- description: what this organization does
- version: "1.0.0"
- author: "${preferredAuthor}"
- tags: relevant tags array
- agents: array of agent definitions, each with:
  - id: lowercase kebab-case ID (e.g., "lead-engineer")
  - name: display name
  - role: job title/role
  - communities: array of community names
  - groups: array of group names
  - identity: multiline string describing role, responsibilities, expertise
  - skills: optional array of skill IDs chosen from the available list when relevant
- communities: array with name, description, tags
- groups: array with name, description, community (parent), tags
- workflows: array of workflow definitions, each with:
  - id: lowercase kebab-case ID
  - name: display name
  - description: what the workflow does
  - schedule: "manual" or a cron expression
  - executionMode: "managed" or "automated"
  - targeting:
    - agents: array of agent IDs
    - groups: array of group names
    - communities: array of community names
    - tags: array of agent tags
  - dependsOn: optional array of workflow IDs
  - content: the detailed instructions agents receive when the workflow runs

Important structure rules:
- Prefer exactly 1 shared community for the whole team.
- Use groups, not communities, for sub-teams or work lanes.
- Only create 2 communities when the prompt clearly implies two genuinely separate umbrellas.
- Do not create a community and a group that represent the same concept with different names.
- If unsure, create 1 community and 3-6 groups.
- If the prompt describes a company, startup, agency, studio, operator, or revenue engine, generate a company-style template rather than a generic team.
- For company-style templates, include a teams array with leadership plus 2-4 functional teams and at least one nested sub-team when appropriate.
- Keep company structures legible and demo-friendly: leadership, delivery/product, go-to-market, and operations only when justified.
- For company-style templates, prefer a sober descriptive company name. Avoid gimmicky agency names like "ConversionMax", "Growthify", or "RevenueGenius".
- For company-style templates, default to exactly 1 shared community for the company and use groups for functional lanes such as leadership, strategy, research, sales, delivery, and operations.

Important workflow behavior rules:
- Always create 2-4 workflows for the team unless the prompt explicitly asks for none.
- Kickoff must be the first workflow and should be a singleton step.
- The final workflow must be the last workflow and should be a singleton step.
- When the prompt implies many items/images/posts/assets, make at least one middle workflow explicitly scalable or parallelizable.
- Workflows must tell agents to communicate visibly in the target group/community as they work.
- At least one intermediate workflow should produce a tangible artifact such as a brief, plan, shortlist, report, draft, recommendation, or checklist.
- The final workflow must produce the final deliverable or an explicit confirmation that the final output was completed and where it was posted/saved.
- Workflows should use groups for ongoing coordination and communities for broader summaries/announcements.
- Avoid vague workflow content like "work on the task"; be concrete about what agents should discuss, produce, and publish.
- When the user provides examples, URLs, formats, or style references, preserve and use them explicitly in agent responsibilities and workflow content.
- If the prompt includes sample outputs or product pages, tell the team to refer back to them and match the requested style.
- For company-style templates, make workflows form a visible business chain with handoffs, not isolated tasks.
- For revenue-oriented prompts, workflows must produce commercially concrete artifacts such as offer briefs, ICPs, lead lists, outreach copy, pricing, launch plans, pipeline reviews, delivery plans, and revenue summaries.
- For revenue-oriented prompts, prefer a chain like strategy -> offer/ICP -> acquisition or delivery -> revenue review/final brief.
- Assign 1-4 relevant skills to agents when the role clearly benefits from them.
- Prefer exact skill IDs from this installed skill list: ${availableSkills.join(', ') || 'github, web-search, code-review, slack, jira'}.
- Do not invent fake skill IDs. If none fit, omit the skills field.

Respond with ONLY valid JSON, no markdown fences or explanation.`
      },
      {
        role: 'user',
        content: promptContext ? `${description}\n\n## Preserved Reference Context\n${promptContext}` : description
      }
    ],
    temperature: 0.7,
  })

  const raw = completion.choices[0].message.content?.trim() || ''
  const jsonStr = extractJsonResponseText(raw)

  try {
    const parsed = JSON.parse(jsonStr)
    if (!parsed.author || String(parsed.author).trim() === 'ClawMax AI') {
      parsed.author = preferredAuthor
    }
    const text = description.toLowerCase()
    const inferredTemplateTags = Array.from(new Set([
      ...(Array.isArray(parsed.tags) ? parsed.tags : []),
      ...(text.includes('meta') ? ['meta'] : []),
      ...(text.includes('ad') || text.includes('ads') ? ['ads'] : []),
      ...(text.includes('marketing') ? ['marketing'] : []),
      ...(shouldGenerateCompany ? ['company'] : []),
      ...(shouldBiasRevenue ? ['revenue'] : []),
    ]))
    const fallbackPrimaryTag = slugifyGeneratedTemplateValue(
      inferredTemplateTags[0]
      || String(parsed.name || description || 'team').split(/[^a-z0-9]+/i).find(Boolean)
      || 'team',
      'team'
    )
    if (shouldGenerateCompany && (typeof parsed.name !== 'string' || /^[A-Z][A-Za-z0-9]+(?:Max|ify|ly|gen|matic|hub|labs)$/i.test(parsed.name) || !/\s/.test(String(parsed.name || '').trim()))) {
      parsed.name = buildSoberCompanyName(description)
    }
    const inferredAgentTags = Array.from(new Set([fallbackPrimaryTag, ...inferredTemplateTags])).slice(0, 3)

    parsed.tags = Array.from(new Set([fallbackPrimaryTag, ...inferredTemplateTags]))
    parsed.agents = (parsed.agents || []).map((agent: any) => ({
      ...agent,
      skills: Array.from(new Set([
        ...(Array.isArray(agent.skills) ? agent.skills : []),
        ...(Array.isArray(agent.tools) ? agent.tools : []),
      ])).filter(Boolean).slice(0, 4),
      tags: Array.from(new Set([
        fallbackPrimaryTag,
        ...(Array.isArray(agent.tags) ? agent.tags : []),
        ...inferredAgentTags,
      ])),
    }))

    if (!Array.isArray(parsed.communities) || parsed.communities.length === 0) {
      parsed.communities = [
        {
          name: parsed.name || 'Team',
          description: `Shared coordination space for ${(parsed.name || 'this team').trim()}`,
          tags: inferredTemplateTags.slice(0, 2),
        },
      ]
    }

    const normalizedTeamName = String(parsed.name || 'Team').trim()
    const allowMultipleCommunities = shouldGenerateCompany
      ? explicitMultiCommunityRequest
      : (
          (parsed.groups || []).length >= 7 ||
          /\b(platform|ops|operations|customer|client|external|internal|partner|community-facing|field team|back office)\b/i.test(description)
        )

    if (Array.isArray(parsed.communities) && parsed.communities.length > 1 && !allowMultipleCommunities) {
      parsed.communities = [
        {
          ...parsed.communities[0],
          name: shouldGenerateCompany ? 'Company' : (normalizedTeamName || parsed.communities[0]?.name || 'Team'),
          description: parsed.communities[0]?.description || `Shared coordination space for ${normalizedTeamName || 'this team'}`,
          tags: Array.from(new Set([
            ...(Array.isArray(parsed.communities[0]?.tags) ? parsed.communities[0].tags : []),
            ...inferredTemplateTags.slice(0, 2),
          ])),
        },
      ]
    }

    if (!Array.isArray(parsed.groups) || parsed.groups.length === 0) {
      parsed.groups = [
        {
          name: 'Status',
          description: 'Shared status updates, handoffs, and coordination',
          community: parsed.communities[0]?.name,
          tags: inferredTemplateTags.slice(0, 2),
        },
      ]
    }

    const primaryCommunityName = parsed.communities[0]?.name

    parsed.groups = (parsed.groups || []).map((group: any) => ({
      ...group,
      community: primaryCommunityName || group.community,
      tags: Array.from(new Set([
        ...(Array.isArray(group.tags) ? group.tags : []),
        ...inferredTemplateTags.slice(0, 2),
      ])),
    }))

    const communityRenameMap = new Map<string, string>()
    const seenCommunityNames = new Set<string>()
    parsed.communities = (parsed.communities || []).map((community: any, idx: number) => {
      const originalName = String(community?.name || '').trim()
      let nextName = humanizeGeneratedChannelName(originalName, idx === 0 ? normalizedTeamName || 'Team' : `Community ${idx + 1}`)
      if (seenCommunityNames.has(nextName.toLowerCase())) {
        nextName = originalName || nextName
      }
      seenCommunityNames.add(nextName.toLowerCase())
      if (originalName && nextName !== originalName) {
        communityRenameMap.set(originalName, nextName)
      }
      return {
        ...community,
        name: nextName,
      }
    })

    const groupRenameMap = new Map<string, string>()
    const seenGroupNames = new Set<string>()
    parsed.groups = (parsed.groups || []).map((group: any, idx: number) => {
      const originalName = String(group?.name || '').trim()
      let nextName = humanizeGeneratedChannelName(originalName, `Group ${idx + 1}`)
      if (seenGroupNames.has(nextName.toLowerCase())) {
        nextName = originalName || nextName
      }
      seenGroupNames.add(nextName.toLowerCase())
      if (originalName && nextName !== originalName) {
        groupRenameMap.set(originalName, nextName)
      }
      return {
        ...group,
        name: nextName,
        community: group.community ? (communityRenameMap.get(group.community) || group.community) : group.community,
      }
    })

    parsed.communities = (parsed.communities || []).map((community: any) => ({
      ...community,
      tags: Array.from(new Set([
        ...(Array.isArray(community.tags) ? community.tags : []),
        ...inferredTemplateTags.slice(0, 2),
      ])),
    }))

    const fallbackCommunity = parsed.communities[0]?.name
    const fallbackGroup = parsed.groups[0]?.name
    const validCommunityNames = new Set((parsed.communities || []).map((community: any) => String(community?.name || '').trim()).filter(Boolean))
    parsed.agents = (parsed.agents || []).map((agent: any) => {
      const normalizedCommunities = Array.isArray(agent.communities) && agent.communities.length > 0
        ? agent.communities
          .map((communityName: string) => communityRenameMap.get(communityName) || communityName)
          .filter((communityName: string) => validCommunityNames.has(communityName))
        : []
      return {
        ...agent,
        communities: normalizedCommunities.length > 0 ? normalizedCommunities : (fallbackCommunity ? [fallbackCommunity] : []),
        groups: Array.isArray(agent.groups) && agent.groups.length > 0
          ? agent.groups.map((groupName: string) => groupRenameMap.get(groupName) || groupName)
          : (fallbackGroup ? [fallbackGroup] : []),
      }
    })

    const baseWorkflowTags = inferredTemplateTags.slice(0, 2)
    let sourceWorkflows = Array.isArray(parsed.workflows) ? parsed.workflows : []
    if (sourceWorkflows.length === 0) {
      sourceWorkflows = [
        {
          id: `${slugifyGeneratedTemplateValue(normalizedTeamName || 'team')}-kickoff`,
          name: `${normalizedTeamName || 'Team'} Kickoff`,
          description: 'Start a new run with goals, constraints, and priorities.',
          schedule: 'manual',
          executionMode: 'managed',
          targeting: {
            agents: [],
            groups: fallbackGroup ? [fallbackGroup] : [],
            communities: fallbackCommunity ? [fallbackCommunity] : [],
            tags: baseWorkflowTags,
          },
          dependsOn: [],
          content: 'Review the request, clarify goals and constraints, assign work, and publish a kickoff plan.',
        },
        {
          id: `${slugifyGeneratedTemplateValue(normalizedTeamName || 'team')}-execution-review`,
          name: `${normalizedTeamName || 'Team'} Execution Review`,
          description: 'Review progress, unblock work, and refine the plan.',
          schedule: 'manual',
          executionMode: 'managed',
          targeting: {
            agents: [],
            groups: fallbackGroup ? [fallbackGroup] : [],
            communities: fallbackCommunity ? [fallbackCommunity] : [],
            tags: baseWorkflowTags,
          },
          dependsOn: [`${slugifyGeneratedTemplateValue(normalizedTeamName || 'team')}-kickoff`],
          content: 'Review progress, identify blockers, refine next actions, and share an intermediate artifact.',
        },
        {
          id: `${slugifyGeneratedTemplateValue(normalizedTeamName || 'team')}-final-output`,
          name: `${normalizedTeamName || 'Team'} Final Output`,
          description: 'Deliver the final output or confirm completion.',
          schedule: 'manual',
          executionMode: 'managed',
          targeting: {
            agents: [],
            groups: fallbackGroup ? [fallbackGroup] : [],
            communities: fallbackCommunity ? [fallbackCommunity] : [],
            tags: baseWorkflowTags,
          },
          dependsOn: [`${slugifyGeneratedTemplateValue(normalizedTeamName || 'team')}-execution-review`],
          content: 'Deliver the final output and clearly confirm where it was posted or saved.',
        },
      ]
    }

    const kickoffPattern = /\bkickoff|start|intake|brief|request\b/i
    const finalPattern = /\bfinal|summary|deliver|delivery|publish|report|closeout|wrap[- ]?up\b/i
    const kickoffWorkflow = sourceWorkflows.find((workflow: any) => kickoffPattern.test(`${workflow.name || ''} ${workflow.description || ''}`)) || sourceWorkflows[0]
    const finalWorkflow = sourceWorkflows.find((workflow: any) => workflow !== kickoffWorkflow && finalPattern.test(`${workflow.name || ''} ${workflow.description || ''}`)) || sourceWorkflows[sourceWorkflows.length - 1]
    const middleWorkflows = sourceWorkflows.filter((workflow: any) => workflow !== kickoffWorkflow && workflow !== finalWorkflow)
    const orderedWorkflows = [kickoffWorkflow, ...middleWorkflows, finalWorkflow].filter(Boolean)

    parsed.workflows = orderedWorkflows.map((workflow: any, idx: number, arr: any[]) => {
      const workflowCommunityTargets = workflow.targeting?.communities?.length
        ? workflow.targeting.communities.map((communityName: string) => communityRenameMap.get(communityName) || communityName)
          .filter((communityName: string) => validCommunityNames.has(communityName))
        : []
      const normalizedWorkflowCommunityTargets = workflowCommunityTargets.length > 0 ? workflowCommunityTargets : (fallbackCommunity ? [fallbackCommunity] : [])
      const workflowGroupTargets = workflow.targeting?.groups?.length
        ? workflow.targeting.groups.map((groupName: string) => groupRenameMap.get(groupName) || groupName)
        : (fallbackGroup ? [fallbackGroup] : [])
      const isKickoff = idx === 0
      const isFinal = idx === arr.length - 1
      const isMiddle = !isKickoff && !isFinal
      const collaborationBlock = [
        '## Coordination',
        workflowGroupTargets.length > 0
          ? `- Post updates in: ${workflowGroupTargets.join(', ')}.`
          : '- Post updates in the working group.',
        normalizedWorkflowCommunityTargets.length > 0
          ? `- Share major status in: ${normalizedWorkflowCommunityTargets.join(', ')}.`
          : '- Share major status in the main community.',
      ].join('\n')
      const outputBlock = isFinal
        ? [
            '## Final Output',
            '- Produce the final markdown deliverable and state where it was saved or posted.',
          ].join('\n')
        : [
            '## Output',
            '- Produce one concrete markdown handoff for the next workflow and post a short summary.',
          ].join('\n')
      const kickoffBlock = isKickoff
        ? [
            '## Kickoff',
            '- Clarify goals, constraints, and success criteria.',
            '- Publish a concise kickoff plan.',
          ].join('\n')
        : ''
      const scalingBlock = shouldScaleMiddleWork && isMiddle
        ? [
            '## Scaling',
            '- Split the work into batches or parallel lanes where useful.',
            '- Consolidate the best results for the next step.',
          ].join('\n')
        : ''
      const referenceBlock = promptContext
        ? buildWorkflowReferenceBlock(description, { firstOnly: true, isFirst: isKickoff })
        : ''
      const contentSections = [workflow.content || '', kickoffBlock, collaborationBlock, outputBlock].filter(Boolean)
      if (scalingBlock) contentSections.splice(Math.max(contentSections.length - 1, 1), 0, scalingBlock)
      if (referenceBlock) contentSections.splice(Math.max(contentSections.length - 1, 1), 0, referenceBlock)
      const normalizedId = workflow.id || slugifyGeneratedTemplateValue(
        isKickoff
          ? `${normalizedTeamName || 'team'} kickoff`
          : isFinal
            ? `${normalizedTeamName || 'team'} final output`
            : `${normalizedTeamName || 'team'} step ${idx + 1}`,
        'workflow'
      )
      const normalizedName = workflow.name || (
        isKickoff
          ? `${normalizedTeamName || 'Team'} Kickoff`
          : isFinal
            ? `${normalizedTeamName || 'Team'} Final Output`
            : `${normalizedTeamName || 'Team'} Step ${idx + 1}`
      )
      const inferredDependsOn = idx === 0
        ? []
        : [arr[idx - 1].id || slugifyGeneratedTemplateValue(arr[idx - 1].name || `${normalizedTeamName || 'team'} step ${idx}`, 'workflow')]

      return {
        ...workflow,
        _sourceId: workflow.id,
        _sourceName: workflow.name,
        id: normalizedId,
        name: normalizedName,
        owner: workflow.owner || workflow.targeting?.agents?.[0] || undefined,
        scaling: isMiddle && shouldScaleMiddleWork ? 'parallel' : 'singleton',
        parallelism: isMiddle && shouldScaleMiddleWork
          ? Math.min(10, Math.max(2, Number(workflow.parallelism) || 3))
          : 1,
        description: workflow.description || (
          isKickoff
            ? 'Start a new run with goals, priorities, and constraints.'
            : isFinal
              ? 'Deliver the final output or confirm completion.'
              : shouldScaleMiddleWork
                ? 'Execute the next stage of work, scale across multiple items in parallel where useful, and share progress.'
                : 'Execute the next stage of work and share progress.'
        ),
        targeting: {
          communities: normalizedWorkflowCommunityTargets,
          groups: workflowGroupTargets,
          agents: workflow.targeting?.agents || [],
          tags: Array.from(new Set([
            ...(Array.isArray(workflow.targeting?.tags) ? workflow.targeting.tags : []),
            ...baseWorkflowTags,
          ])),
        },
        dependsOn: Array.isArray(workflow.dependsOn) && workflow.dependsOn.length > 0 ? workflow.dependsOn : inferredDependsOn,
        content: contentSections.join('\n\n'),
      }
    })

    if (shouldGenerateCompany) {
      parsed.workflows = enforceVisibleCompanyWorkflowChain(parsed.workflows)
    }
    parsed.workflows = normalizeGeneratedWorkflowReferences(parsed.workflows)
    parsed.workflows = applyGeneratedWorkflowHandoffs(parsed.workflows)

    if (shouldGenerateCompany) {
      const leadershipRegex = /\b(lead|head|director|manager|founder|ceo|chief|owner)\b/i
      const leadAgents = (parsed.agents || []).filter((agent: any) => leadershipRegex.test(`${agent.role || ''} ${(agent.tags || []).join(' ')}`))
      const leadershipLead = leadAgents[0] || parsed.agents?.[0]
      const uniqueGroups: string[] = Array.from(
        new Set<string>(
          (parsed.groups || [])
            .map((group: any) => String(group?.name || '').trim())
            .filter((name: string) => Boolean(name))
        )
      )
      const operationalGroups = uniqueGroups
        .filter((name) => !/^status$/i.test(name))
        .filter((name) => !/^leadership$/i.test(String(name).trim()))
        .slice(0, 4)
      const generatedTeams: any[] = []
      const companyRootId = slugifyGeneratedTemplateValue(parsed.name || 'company', 'company-root')

      if (leadershipLead) {
        generatedTeams.push({
          id: companyRootId,
          name: parsed.name || 'Company',
          purpose: shouldBiasRevenue ? 'Root company team for revenue leadership and operating lanes.' : 'Root company team for leadership and operating lanes.',
          leaderAgentId: leadershipLead.id,
          memberAgentIds: [],
          tags: ['company', 'org-root'],
        })
        generatedTeams.push({
          id: 'leadership',
          name: 'Leadership',
          purpose: shouldBiasRevenue ? 'Set company direction, revenue goals, and operating priorities.' : 'Set company direction and operating priorities.',
          leaderAgentId: leadershipLead.id,
          memberAgentIds: leadAgents.slice(1, 3).map((agent: any) => agent.id),
          parentTeamId: companyRootId,
          tags: shouldBiasRevenue ? ['leadership', 'revenue'] : ['leadership'],
        })
      }

      for (const groupName of operationalGroups) {
        const normalizedGroupName = String(groupName)
        const groupMembers = (parsed.agents || []).filter((agent: any) => (agent.groups || []).includes(normalizedGroupName))
        const teamLead = groupMembers.find((agent: any) => leadershipRegex.test(`${agent.role || ''} ${(agent.tags || []).join(' ')}`)) || groupMembers[0]
        generatedTeams.push({
          id: slugifyGeneratedTemplateValue(normalizedGroupName, 'team'),
          name: humanizeGeneratedChannelName(normalizedGroupName, normalizedGroupName),
          purpose: shouldBiasRevenue
            ? `Own ${humanizeGeneratedChannelName(normalizedGroupName, normalizedGroupName).toLowerCase()} execution tied to company revenue.`
            : `Own ${humanizeGeneratedChannelName(normalizedGroupName, normalizedGroupName).toLowerCase()} execution for the company.`,
          leaderAgentId: teamLead?.id,
          memberAgentIds: groupMembers.filter((agent: any) => agent.id !== teamLead?.id).map((agent: any) => agent.id),
          parentTeamId: leadershipLead ? 'leadership' : undefined,
          tags: [slugifyGeneratedTemplateValue(normalizedGroupName, 'team')],
        })
      }

      if (generatedTeams.length >= 3) {
        const nestedParent = generatedTeams.find((team) => /\b(delivery|service|operations|engineering|product)\b/i.test(team.id))
        if (nestedParent) {
          generatedTeams.push({
            id: `${nestedParent.id}-execution`,
            name: `${nestedParent.name} Execution`,
            purpose: `Break ${nestedParent.name.toLowerCase()} work into execution lanes and milestones.`,
            leaderAgentId: nestedParent.leaderAgentId,
            memberAgentIds: [],
            parentTeamId: nestedParent.id,
            tags: ['execution'],
          })
        }
      }

      if (generatedTeams.length > 0) {
        parsed.teams = ensureGeneratedCompanyRoot(generatedTeams, parsed.name || 'Company', shouldBiasRevenue)
      }
    }

    if (shouldBiasRevenue && Array.isArray(parsed.workflows) && parsed.workflows.length > 0) {
      const fallbackOutputKeys = ['strategy-brief', 'offer-and-icp', 'pipeline-plan', 'revenue-summary']
      const fallbackOutputLabels = ['Strategy Brief', 'Offer & ICP', 'Pipeline Plan', 'Revenue Summary']
      parsed.workflows = parsed.workflows.map((workflow: any, idx: number, arr: any[]) => {
        const previous = arr[idx - 1]
        const existingOutputDefinitions = Array.isArray(workflow.outputDefinitions) ? workflow.outputDefinitions : []
        const existingInputRefs = Array.isArray(workflow.inputRefs) ? workflow.inputRefs : []
        const extraSections = [
          idx === 0 ? '## Revenue Goal\n- Define the commercial goal, buyer, pricing logic, and the fastest credible path to revenue.' : '',
          idx > 0 && idx < arr.length - 1 ? '## Commercial Handoff\n- Use the upstream artifact as required input. Convert it into the next commercially useful asset and post the handoff summary visibly.' : '',
          idx === arr.length - 1 ? '## Revenue Check\n- State what revenue-oriented outputs were produced, what is ready to ship or sell, and the top next actions to move toward real customers or revenue.' : '',
        ].filter(Boolean)

        return {
          ...workflow,
          outputDefinitions: existingOutputDefinitions.length > 0 ? existingOutputDefinitions : [
            {
              key: fallbackOutputKeys[Math.min(idx, fallbackOutputKeys.length - 1)],
              label: fallbackOutputLabels[Math.min(idx, fallbackOutputLabels.length - 1)],
              type: 'markdown',
            },
          ],
          inputRefs: idx > 0
            ? (existingInputRefs.length > 0 ? existingInputRefs : [
                {
                  workflowId: previous.id,
                  outputKey: previous.outputDefinitions?.[0]?.key || fallbackOutputKeys[Math.min(idx - 1, fallbackOutputKeys.length - 1)],
                  label: previous.outputDefinitions?.[0]?.label || fallbackOutputLabels[Math.min(idx - 1, fallbackOutputLabels.length - 1)],
                  required: true,
                },
              ])
            : existingInputRefs,
          content: [workflow.content || '', ...extraSections].filter(Boolean).join('\n\n'),
        }
      })
      parsed.workflows = enforceVisibleCompanyWorkflowChain(parsed.workflows)
      parsed.workflows = normalizeGeneratedWorkflowReferences(parsed.workflows)
      parsed.workflows = applyGeneratedWorkflowHandoffs(parsed.workflows)
    }

    if (shouldGenerateCompany && Array.isArray(parsed.teams) && parsed.teams.length > 0) {
      parsed.workflows = applyCompanyWorkflowExecutionDefaults(parsed.workflows, parsed.teams, parsed.groups)
      parsed.workflows = normalizeGeneratedWorkflowReferences(parsed.workflows)
      parsed.workflows = applyGeneratedWorkflowHandoffs(parsed.workflows)
    }

    if (!Array.isArray(parsed.parameters) || parsed.parameters.length === 0) {
      parsed.parameters = buildScalableTeamParameters(parsed.agents || [], shouldScaleMiddleWork)
    }

    return parsed
  } catch {
    throw new Error(`Generated output is not valid JSON: ${jsonStr.slice(0, 200)}`)
  }
}

/**
 * Convert natural language schedule description to a cron expression.
 * Returns the cron expression and a human-readable confirmation.
 */
export async function generateCronFromText(text: string, timezone?: string): Promise<{ cron: string; explanation: string; error?: string }> {
  if (isOneTimeScheduleRequest(text)) {
    return {
      cron: '',
      explanation: explainOneTimeCronLimitation(),
    }
  }

  const apiKey = resolveSystemExecutionProviderKeys().openai
  if (!apiKey || apiKey.trim() === '') {
    return { cron: '', explanation: '', error: 'No OpenAI API key configured' }
  }

  try {
    const normalizedTimezone = `${timezone || ''}`.trim() || 'UTC'
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: normalizedTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
    const completion = await getSystemOpenAiClient().chat.completions.create({
      model: resolveModel('gpt-4o-mini'),
      messages: [
        {
          role: 'system',
          content: `You are a cron expression generator. Convert the user's natural language schedule into a standard 5-field cron expression (minute hour day-of-month month day-of-week).

Rules:
- Output ONLY valid JSON: {"cron": "EXPRESSION", "explanation": "HUMAN READABLE"}
- Use standard 5-field cron syntax
- If the request is ambiguous, pick the most reasonable interpretation
- If the request is impossible or nonsensical, set cron to "" and explain why in the explanation field
- Cron expressions ALWAYS repeat. If the user asks to run something just once, one time, only once, or a single time, you MUST set cron to "" and explain that one-time runs must be triggered manually.
- Do NOT infer a recurring schedule from a one-time request.
- For "every N minutes" use */N in the minute field
- For specific times, use 24-hour format
- Interpret times in timezone ${normalizedTimezone}
- Treat "today", "tomorrow", and similar relative dates relative to ${today} in timezone ${normalizedTimezone}
- Examples: "every weekday at 9am" → "0 9 * * 1-5", "twice daily" → "0 9,17 * * *", "every 5 minutes" → "*/5 * * * *"`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.1,
      max_tokens: 100,
    })

    const raw = completion.choices[0].message.content?.trim() || ''
    try {
      const parsed = JSON.parse(extractJsonResponseText(raw))
      return { cron: parsed.cron || '', explanation: parsed.explanation || '' }
    } catch {
      // Try to extract cron from raw text
      const cronMatch = raw.match(/(\S+\s+\S+\s+\S+\s+\S+\s+\S+)/)
      return { cron: cronMatch?.[1] || '', explanation: raw }
    }
  } catch (err: any) {
    console.error('Failed to generate cron:', err)
    return { cron: '', explanation: '', error: err.message }
  }
}
