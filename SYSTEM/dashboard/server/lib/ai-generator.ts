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
