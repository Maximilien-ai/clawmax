import OpenAI from 'openai'
import { resolveSystemExecutionProviderKeys, resolveUserExecutionProviderKeys, ProviderKeys } from './dashboard-env'

type AIProvider = 'openai' | 'anthropic'

function getAvailableProvider(byokKeys?: ProviderKeys): { provider: AIProvider; key: string } {
  // Try BYOK keys first (passed from client request)
  if (byokKeys?.openai) return { provider: 'openai', key: byokKeys.openai }
  if (byokKeys?.anthropic) return { provider: 'anthropic', key: byokKeys.anthropic }
  // Then system/user-default keys
  const keys = resolveSystemExecutionProviderKeys()
  if (keys.openai) return { provider: 'openai', key: keys.openai }
  if (keys.anthropic) return { provider: 'anthropic', key: keys.anthropic }
  throw new Error('No API key configured. Set SYSTEM_OPENAI_API_KEY or SYSTEM_ANTHROPIC_API_KEY in .env, or provide a BYOK key.')
}

function getAIClient(byokKeys?: ProviderKeys): { client: OpenAI; model: string } {
  const { provider, key } = getAvailableProvider(byokKeys)
  if (provider === 'anthropic') {
    // Use Anthropic's OpenAI-compatible endpoint
    return {
      client: new OpenAI({
        apiKey: key,
        baseURL: 'https://api.anthropic.com/v1/',
        defaultHeaders: { 'anthropic-version': '2023-06-01' },
      }),
      model: 'claude-sonnet-4-20250514',
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

/**
 * Get the appropriate model name for the available provider.
 * Maps OpenAI model names to Anthropic equivalents when needed.
 */
function resolveModel(requestedModel: string): string {
  const { provider } = getAvailableProvider(_requestByokKeys)
  if (provider === 'openai') return requestedModel
  // Map OpenAI models to Anthropic equivalents
  if (requestedModel.includes('gpt-4o-mini') || requestedModel.includes('gpt-4')) return 'claude-sonnet-4-20250514'
  if (requestedModel.includes('gpt-4o') || requestedModel.includes('gpt-5')) return 'claude-sonnet-4-20250514'
  return 'claude-sonnet-4-20250514'
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

  return sections.join('\n\n')
}

function buildWorkflowReferenceBlock(description: string, options?: { finalOnly?: boolean; isFinal?: boolean }): string {
  if (options?.finalOnly && !options?.isFinal) return ''

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

export function normalizeGeneratedSkillScaffold(input: Partial<GeneratedSkillScaffold>, prompt: string): GeneratedSkillScaffold {
  const normalizedName = (input.name || 'custom-skill')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-')

  const safeName = normalizedName || 'custom-skill'
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
    model: resolveModel('gpt-4o-mini'),
    messages: [
      {
        role: 'system',
        content: `You suggest metadata for a new AI agent based on a description.

Available skills that can be assigned: ${availableSkills.join(', ') || 'gh-issues, github, web-search, code-review, slack, jira'}

Available models:
- anthropic/claude-sonnet-4-20250514 (best for coding, analysis, complex reasoning)
- openai/gpt-4o (best for general purpose, creative tasks)
- openai/gpt-4o-mini (best for simple tasks, cost-efficient)

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
    model: parsed.model || 'anthropic/claude-sonnet-4-20250514',
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
export async function generateTemplateFromNL(description: string): Promise<any> {
  getAvailableProvider(_requestByokKeys)
  const promptContext = buildExampleAwarePromptContext(description)
  const shouldScaleMiddleWork = promptImpliesScaling(description)

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
- author: "ClawMax AI"
- tags: relevant tags array
- agents: array of agent definitions, each with:
  - id: lowercase kebab-case ID (e.g., "lead-engineer")
  - name: display name
  - role: job title/role
  - communities: array of community names
  - groups: array of group names
  - identity: multiline string describing role, responsibilities, expertise
  - tools: array of tool names (e.g., "gh-issues", "github", "web-search", "code-review")
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
    const text = description.toLowerCase()
    const inferredTemplateTags = Array.from(new Set([
      ...(Array.isArray(parsed.tags) ? parsed.tags : []),
      ...(text.includes('meta') ? ['meta'] : []),
      ...(text.includes('ad') || text.includes('ads') ? ['ads'] : []),
      ...(text.includes('marketing') ? ['marketing'] : []),
    ]))
    const fallbackPrimaryTag = slugifyGeneratedTemplateValue(
      inferredTemplateTags[0]
      || String(parsed.name || description || 'team').split(/[^a-z0-9]+/i).find(Boolean)
      || 'team',
      'team'
    )
    const inferredAgentTags = Array.from(new Set([fallbackPrimaryTag, ...inferredTemplateTags])).slice(0, 3)

    parsed.tags = Array.from(new Set([fallbackPrimaryTag, ...inferredTemplateTags]))
    parsed.agents = (parsed.agents || []).map((agent: any) => ({
      ...agent,
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
    const allowMultipleCommunities =
      (parsed.groups || []).length >= 7 ||
      /\b(platform|ops|operations|customer|client|external|internal|partner|community-facing|field team|back office)\b/i.test(description)

    if (Array.isArray(parsed.communities) && parsed.communities.length > 1 && !allowMultipleCommunities) {
      parsed.communities = [
        {
          ...parsed.communities[0],
          name: normalizedTeamName || parsed.communities[0]?.name || 'Team',
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
    parsed.agents = (parsed.agents || []).map((agent: any) => ({
      ...agent,
      communities: Array.isArray(agent.communities) && agent.communities.length > 0
        ? agent.communities.map((communityName: string) => communityRenameMap.get(communityName) || communityName)
        : (fallbackCommunity ? [fallbackCommunity] : []),
      groups: Array.isArray(agent.groups) && agent.groups.length > 0
        ? agent.groups.map((groupName: string) => groupRenameMap.get(groupName) || groupName)
        : (fallbackGroup ? [fallbackGroup] : []),
    }))

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
        : (fallbackCommunity ? [fallbackCommunity] : [])
      const workflowGroupTargets = workflow.targeting?.groups?.length
        ? workflow.targeting.groups.map((groupName: string) => groupRenameMap.get(groupName) || groupName)
        : (fallbackGroup ? [fallbackGroup] : [])
      const isKickoff = idx === 0
      const isFinal = idx === arr.length - 1
      const isMiddle = !isKickoff && !isFinal
      const collaborationBlock = [
        '## Coordination',
        workflowGroupTargets.length > 0
          ? `- Post progress updates and handoffs in group(s): ${workflowGroupTargets.join(', ')}.`
          : '- Post progress updates and handoffs in the team group channel.',
        workflowCommunityTargets.length > 0
          ? `- Share broader status or stakeholder-facing updates in community(s): ${workflowCommunityTargets.join(', ')}.`
          : '- Share broader status updates in the main team community.',
      ].join('\n')
      const outputBlock = isFinal
        ? [
            '## Final Output',
            '- Produce the final deliverable or explicitly confirm that it was completed.',
            '- State where the final output was posted, saved, or shared.',
          ].join('\n')
        : [
            '## Output',
            '- Produce a concrete intermediate artifact such as a brief, draft, shortlist, checklist, report, or recommendation.',
            '- Post a short summary of that artifact in the target group/community.',
          ].join('\n')
      const kickoffBlock = isKickoff
        ? [
            '## Kickoff',
            '- Clarify goals, constraints, timing, and success criteria for this run.',
            '- Assign initial work across the team and publish the kickoff plan in the team channels.',
          ].join('\n')
        : ''
      const scalingBlock = shouldScaleMiddleWork && isMiddle
        ? [
            '## Scaling',
            '- This stage should support many items/assets/posts in parallel where appropriate.',
            '- Split the work into batches or parallel lanes, keep progress visible in the working group, and consolidate the best results for the next step.',
          ].join('\n')
        : ''
      const referenceBlock = promptContext
        ? buildWorkflowReferenceBlock(description, { finalOnly: false, isFinal })
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
        id: normalizedId,
        name: normalizedName,
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
          communities: workflowCommunityTargets,
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
export async function generateCronFromText(text: string): Promise<{ cron: string; explanation: string; error?: string }> {
  const apiKey = resolveSystemExecutionProviderKeys().openai
  if (!apiKey || apiKey.trim() === '') {
    return { cron: '', explanation: '', error: 'No OpenAI API key configured' }
  }

  try {
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
- For "every N minutes" use */N in the minute field
- For specific times, use 24-hour format
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
