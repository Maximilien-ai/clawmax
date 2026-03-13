import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

interface GenerateAgentFilesInput {
  description: string
  name: string
  tags: string[]
}

interface GeneratedFiles {
  identity: string
  soul: string
  tools: string
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
- You're not the user's voice — be careful in group chats.

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

async function generateIdentity(input: GenerateAgentFilesInput): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
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

  const result = JSON.parse(completion.choices[0].message.content || '{}')

  return IDENTITY_TEMPLATE
    .replace('{name}', input.name)
    .replace('{role}', result.role || 'assistant')
    .replace('{vibe}', result.vibe || 'helpful')
    .replace('{emoji}', result.emoji || '🤖')
    .replace('{tags}', input.tags.join(', '))
}

async function generateSoul(input: GenerateAgentFilesInput): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
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

  const result = JSON.parse(completion.choices[0].message.content || '{}')

  return SOUL_TEMPLATE
    .replace('{role_description}', result.role_description || 'You are a helpful assistant.')
    .replace('{personality}', result.personality || 'Be concise, direct, and helpful.')
}

async function generateTools(input: GenerateAgentFilesInput): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
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

  const result = JSON.parse(completion.choices[0].message.content || '{}')

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
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey.trim() === '') {
    return fallbackTitle
  }

  // Extract first 5 messages for context
  const contextMessages = messages.slice(0, 5).map(m => `${m.role}: ${m.content}`).join('\n')

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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
