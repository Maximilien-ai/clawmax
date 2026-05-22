import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'

type BuilderAction = {
  id: string
  label: string
  description: string
  page: 'builder' | 'agents' | 'templates' | 'skills' | 'workflows' | 'organizations'
  action?: 'create' | 'create-ai' | 'import'
  pageHint?: string
  agentId?: string
  skillName?: string
  workflowId?: string
  templateId?: string
  templateName?: string
  templateType?: 'agent' | 'organization'
}

type BuilderMatchedAsset = {
  id: string
  name: string
  type: 'agent' | 'skill' | 'agent-template' | 'organization-template' | 'workflow'
  summary: string
  score: number
  matchCount?: number
  source?: string
}

type BuilderRecommendation = {
  intent: 'existing_agent' | 'skill_or_integration' | 'agent_template' | 'team_template' | 'ai_generate'
  scope: 'single_agent' | 'team' | 'team_of_teams' | 'unknown'
  operation: 'reuse_existing' | 'improve_existing' | 'use_template' | 'refine_template' | 'create_new' | 'unknown'
  confidence: 'high' | 'medium' | 'low'
  summary: string
  clarifyingQuestions: string[]
  confirmationOptions: Array<{
    id: string
    label: string
    prompt: string
    reasoning: string
  }>
  recommendedPath: {
    title: string
    reasoning: string
    primaryAction: BuilderAction
  }
  alternativePaths: Array<{
    title: string
    reasoning: string
    action: BuilderAction
  }>
  matchedAssets: {
    agents: BuilderMatchedAsset[]
    skills: BuilderMatchedAsset[]
    agentTemplates: BuilderMatchedAsset[]
    organizationTemplates: BuilderMatchedAsset[]
    workflows: BuilderMatchedAsset[]
  }
  suggestedActions: BuilderAction[]
  testPlan: string[]
}

type BuilderAttachment = {
  id: string
  name: string
  type: string
  size: number
  contextSnippet?: string
  isImage: boolean
}

type BuilderMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  label: string
}

type BuilderArchive = {
  id: string
  title: string
  timestamp: number
  messages: BuilderMessage[]
  recommendation: BuilderRecommendation | null
}

type ApiAgent = {
  id: string
  name?: string
  tags?: string[]
  skills?: string[]
  groups?: Array<{ name: string }>
  communities?: Array<{ name: string }>
}

type ApiSkill = {
  name: string
  description?: string
  tags?: string[]
  source?: string
  requires?: { bins?: string[] }
  registryCategories?: string[]
}

type ApiWorkflow = {
  id: string
  name: string
  description?: string
  schedule?: string
  targeting?: {
    groups?: string[]
    communities?: string[]
    tags?: string[]
  }
}

type ApiTemplate = {
  name: string
  slug?: string
  description?: string
  source?: string
  tags?: string[]
  agents?: Array<{ id: string; name?: string; role?: string }>
}

const DEFAULT_STARTER_PROMPTS = [
  'Design a competitor research assistant for this workspace.',
  'Design a customer support escalation team with clean handoffs.',
  'Refine an existing agent by adding the right skills and integrations.',
  'Design a multi-role planning team for a new project.',
]

const TEMPLATE_KEYWORDS = ['template', 'templates', 'refine template', 'edit template', 'team template', 'organization template']
const AGENT_TEMPLATE_KEYWORDS = ['agent template', 'agent starter', 'create agent from template', 'use template for agent']
const TEAM_KEYWORDS = ['team', 'teams', 'handoff', 'handoffs', 'workflow', 'workflows', 'company', 'organization', 'org', 'group', 'groups']
const TEAM_OF_TEAMS_KEYWORDS = ['team of teams', 'teams of teams', 'multi-team', 'multiple teams', 'teams and subteams', 'org of teams', 'organization of teams']
const AGENT_KEYWORDS = ['agent', 'assistant', 'helper', 'specialist']
const CREATE_KEYWORDS = ['create', 'build', 'design', 'new', 'from scratch', 'generate']
const REUSE_KEYWORDS = ['existing', 'already have', 'reuse', 'current']
const REFINE_KEYWORDS = ['refine', 'improve', 'edit', 'update', 'adjust', 'tune']
const NON_SCORING_TOKENS = new Set(['agent', 'agents', 'team', 'teams', 'template', 'templates', 'create', 'build', 'design', 'new', 'from', 'scratch', 'use'])

const BUILDER_SESSION_STORAGE_PREFIX = 'clawmax-builder-session'
const BUILDER_ARCHIVES_STORAGE_PREFIX = 'clawmax-builder-archives'
const BUILDER_FEEDBACK_STORAGE_PREFIX = 'clawmax-builder-feedback'

function createIntroMessage(): BuilderMessage {
  return {
    id: 'intro',
    role: 'assistant',
    label: 'Builder agent',
    content: 'Describe what you want to build in this workspace. I will route you toward the best starting path: existing agent, skill, agent template, team template, or AI generation.',
  }
}

function createInitialMessages(): BuilderMessage[] {
  return [createIntroMessage()]
}

function buildWorkspaceStarterPrompts(args: {
  agents: ApiAgent[]
  skills: ApiSkill[]
  templates: { agents: ApiTemplate[]; organizations: ApiTemplate[] }
}): string[] {
  const prompts: string[] = []
  const firstAgent = args.agents[0]
  const firstAgentSkill = firstAgent?.skills?.[0]
  const firstSkill = args.skills[0]
  const firstAgentTemplate = args.templates.agents[0]
  const firstOrganizationTemplate = args.templates.organizations[0]

  if (firstAgent) {
    prompts.push(`Help me improve ${firstAgent.name || firstAgent.id} for the next real task in this workspace.`)
  }
  if (firstAgent && firstAgentSkill) {
    prompts.push(`Check whether ${firstAgent.name || firstAgent.id} needs better ${firstAgentSkill} setup or other missing skills.`)
  } else if (firstSkill) {
    prompts.push(`Find the best agent in this workspace to use ${firstSkill.name} effectively.`)
  }
  if (firstOrganizationTemplate) {
    prompts.push(`See whether the ${firstOrganizationTemplate.name} team template fits this workspace better than starting from scratch.`)
  }
  if (firstAgentTemplate) {
    prompts.push(`Use the ${firstAgentTemplate.name} agent template if it is a better fit than my current agents.`)
  }

  return Array.from(new Set([...prompts, ...DEFAULT_STARTER_PROMPTS])).slice(0, 4)
}

function intentBadge(intent: BuilderRecommendation['intent']): string {
  switch (intent) {
    case 'existing_agent': return 'Reuse Existing Agent'
    case 'skill_or_integration': return 'Skill / Integration'
    case 'agent_template': return 'Agent Template'
    case 'team_template': return 'Team Template'
    case 'ai_generate':
    default: return 'AI Generate'
  }
}

function confidenceBadge(confidence: BuilderRecommendation['confidence']): string {
  switch (confidence) {
    case 'high': return 'High confidence'
    case 'medium': return 'Medium confidence'
    case 'low':
    default: return 'Needs confirmation'
  }
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function BuilderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
      <path d="M5 18.5 6 21l1-2.5L9.5 17 7 16l-1-2.5L5 16l-2.5 1L5 18.5Z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
    </svg>
  )
}

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m21.44 11.05-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l9.2-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.2a1.5 1.5 0 1 1-2.12-2.13l8.5-8.48" />
    </svg>
  )
}

function RecommendationIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 3 4 7v6c0 5 3.4 7.7 8 8 4.6-.3 8-3 8-8V7l-8-4Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function ActionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 20V10" />
      <path d="m18 14-6 6-6-6" />
      <path d="M12 4v2" />
    </svg>
  )
}

function AssetsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="7" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
      <rect x="14" y="15" width="7" height="6" rx="1.5" />
    </svg>
  )
}

function TestIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M10 2v7.3L4.8 18a4 4 0 0 0 3.6 6h7.2a4 4 0 0 0 3.6-6L14 9.3V2" />
      <path d="M8.5 2h7" />
      <path d="M8 14h8" />
    </svg>
  )
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 3v6h6" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function ThumbUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M7 10v10" />
      <path d="M12 4l-1 6H7a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h8.7a2 2 0 0 0 2-1.5l1.8-7A2 2 0 0 0 17.6 7H14V4a2 2 0 0 0-2-2Z" />
    </svg>
  )
}

function ThumbDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M17 14V4" />
      <path d="M12 20l1-6h4a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H8.3a2 2 0 0 0-2 1.5l-1.8 7A2 2 0 0 0 6.4 17H10v3a2 2 0 0 0 2 2Z" />
    </svg>
  )
}

function sourceBadge(source?: string): string | null {
  if (!source) return null
  if (source === 'workspace') return 'Workspace'
  if (source === 'system') return 'System'
  if (source === 'bundled') return 'Built-in'
  return source
}

async function readAttachmentContext(file: File): Promise<string | undefined> {
  const lowerName = file.name.toLowerCase()
  const isTextLike = file.type.startsWith('text/')
    || lowerName.endsWith('.md')
    || lowerName.endsWith('.txt')
    || lowerName.endsWith('.json')
    || lowerName.endsWith('.csv')
    || lowerName.endsWith('.yaml')
    || lowerName.endsWith('.yml')

  if (!isTextLike) return undefined

  const text = await file.text()
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return undefined
  return compact.slice(0, 800)
}

async function parseBuilderResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || ''
  const raw = await response.text()

  if (contentType.includes('application/json')) {
    return raw ? JSON.parse(raw) : {}
  }

  if (/<!DOCTYPE|<html/i.test(raw)) {
    throw new Error('Builder endpoint returned HTML instead of JSON. Restart the dashboard server so the new /api/ai-builder route is active.')
  }

  if (!raw.trim()) {
    throw new Error(`Builder endpoint returned HTTP ${response.status} with an empty body.`)
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(raw.slice(0, 220))
  }
}

function tokenizePrompt(prompt: string): string[] {
  return Array.from(new Set(
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !NON_SCORING_TOKENS.has(token))
  ))
}

function includesAnyPrompt(prompt: string, words: string[]): boolean {
  const normalized = prompt.toLowerCase()
  return words.some((word) => normalized.includes(word))
}

function detectPromptScope(prompt: string): BuilderRecommendation['scope'] {
  if (includesAnyPrompt(prompt, TEAM_OF_TEAMS_KEYWORDS)) return 'team_of_teams'
  if (includesAnyPrompt(prompt, TEAM_KEYWORDS)) return 'team'
  if (includesAnyPrompt(prompt, ['operations', 'ops', 'intake', 'delivery']) && includesAnyPrompt(prompt, TEMPLATE_KEYWORDS)) return 'team'
  if (includesAnyPrompt(prompt, AGENT_KEYWORDS)) return 'single_agent'
  return 'unknown'
}

function detectPromptOperation(prompt: string): BuilderRecommendation['operation'] {
  const hasTemplateLanguage = includesAnyPrompt(prompt, TEMPLATE_KEYWORDS) || includesAnyPrompt(prompt, AGENT_TEMPLATE_KEYWORDS)
  if (hasTemplateLanguage && (includesAnyPrompt(prompt, REFINE_KEYWORDS) || includesAnyPrompt(prompt, ['adapt template', 'customize template', 'existing template']))) {
    return 'refine_template'
  }
  if (hasTemplateLanguage) return 'use_template'
  if (includesAnyPrompt(prompt, REFINE_KEYWORDS) && (includesAnyPrompt(prompt, AGENT_KEYWORDS) || includesAnyPrompt(prompt, REUSE_KEYWORDS))) return 'improve_existing'
  if (includesAnyPrompt(prompt, REUSE_KEYWORDS) && includesAnyPrompt(prompt, AGENT_KEYWORDS)) return 'reuse_existing'
  if (includesAnyPrompt(prompt, CREATE_KEYWORDS)) return 'create_new'
  return 'unknown'
}

function scoreHaystack(tokens: string[], values: Array<string | undefined>): number {
  const haystack = values.filter(Boolean).join(' ').toLowerCase()
  let score = 0
  for (const token of tokens) {
    if (haystack.includes(token)) score += 3
  }
  return score
}

function countHaystackMatches(tokens: string[], values: Array<string | undefined>): number {
  const haystack = values.filter(Boolean).join(' ').toLowerCase()
  let matches = 0
  for (const token of tokens) {
    if (haystack.includes(token)) matches++
  }
  return matches
}

async function buildClientFallbackRecommendation(prompt: string): Promise<BuilderRecommendation> {
  const [agentsResp, skillsResp, templatesResp, workflowsResp] = await Promise.all([
    fetch('/api/agents').then(async (response) => response.ok ? response.json() : { agents: [] }).catch(() => ({ agents: [] })),
    fetch('/api/skills').then(async (response) => response.ok ? response.json() : { skills: [] }).catch(() => ({ skills: [] })),
    fetch('/api/templates').then(async (response) => response.ok ? response.json() : { agents: [], organizations: [] }).catch(() => ({ agents: [], organizations: [] })),
    fetch('/api/workflows').then(async (response) => response.ok ? response.json() : { workflows: [] }).catch(() => ({ workflows: [] })),
  ])

  const tokens = tokenizePrompt(prompt)
  const skillWords = ['skill', 'skills', 'tool', 'tools', 'github', 'slack', 'whatsapp', 'gmail', 'calendar', 'integration', 'integrations', 'api']
  const hasTemplateLanguage = includesAnyPrompt(prompt, TEMPLATE_KEYWORDS)
  const hasAgentTemplateLanguage = includesAnyPrompt(prompt, AGENT_TEMPLATE_KEYWORDS)
  const scope = detectPromptScope(prompt)
  const operation = detectPromptOperation(prompt)

  const matchedAgents: BuilderMatchedAsset[] = ((agentsResp.agents || []) as ApiAgent[])
    .map((agent) => ({
      id: agent.id,
      name: agent.name || agent.id,
      type: 'agent' as const,
      summary: [
        agent.skills?.length ? `Skills: ${agent.skills.join(', ')}` : '',
        agent.tags?.length ? `Tags: ${agent.tags.join(', ')}` : '',
      ].filter(Boolean).join(' · ') || 'Workspace agent',
      score: scoreHaystack(tokens, [
        agent.id,
        agent.name,
        ...(agent.tags || []),
        ...(agent.skills || []),
        ...(agent.groups || []).map((group) => group.name),
        ...(agent.communities || []).map((community) => community.name),
      ]),
      matchCount: countHaystackMatches(tokens, [
        agent.id,
        agent.name,
        ...(agent.tags || []),
        ...(agent.skills || []),
        ...(agent.groups || []).map((group) => group.name),
        ...(agent.communities || []).map((community) => community.name),
      ]),
      source: 'workspace',
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)

  const matchedSkills: BuilderMatchedAsset[] = ((skillsResp.skills || []) as ApiSkill[])
    .map((skill) => ({
      id: skill.name,
      name: skill.name,
      type: 'skill' as const,
      summary: skill.description || 'Workspace skill',
      score: scoreHaystack(tokens, [
        skill.name,
        skill.description,
        ...(skill.tags || []),
        ...(skill.registryCategories || []),
        ...(skill.requires?.bins || []),
      ]),
      matchCount: countHaystackMatches(tokens, [
        skill.name,
        skill.description,
        ...(skill.tags || []),
        ...(skill.registryCategories || []),
        ...(skill.requires?.bins || []),
      ]),
      source: skill.source,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)

  const matchedAgentTemplates: BuilderMatchedAsset[] = ((templatesResp.agents || []) as ApiTemplate[])
    .map((template) => ({
      id: template.slug || template.name,
      name: template.name,
      type: 'agent-template' as const,
      summary: template.description || 'Agent template',
      score: scoreHaystack(tokens, [
        template.slug,
        template.name,
        template.description,
        ...(template.tags || []),
        ...(template.agents || []).flatMap((agent) => [agent.id, agent.name, agent.role]),
      ]),
      matchCount: countHaystackMatches(tokens, [
        template.slug,
        template.name,
        template.description,
        ...(template.tags || []),
        ...(template.agents || []).flatMap((agent) => [agent.id, agent.name, agent.role]),
      ]),
      source: template.source,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)

  const matchedOrganizationTemplates: BuilderMatchedAsset[] = ((templatesResp.organizations || []) as ApiTemplate[])
    .map((template) => ({
      id: template.slug || template.name,
      name: template.name,
      type: 'organization-template' as const,
      summary: template.description || 'Organization template',
      score: scoreHaystack(tokens, [
        template.slug,
        template.name,
        template.description,
        ...(template.tags || []),
        ...(template.agents || []).flatMap((agent) => [agent.id, agent.name, agent.role]),
      ]),
      matchCount: countHaystackMatches(tokens, [
        template.slug,
        template.name,
        template.description,
        ...(template.tags || []),
        ...(template.agents || []).flatMap((agent) => [agent.id, agent.name, agent.role]),
      ]),
      source: template.source,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)

  const matchedWorkflows: BuilderMatchedAsset[] = ((workflowsResp.workflows || []) as ApiWorkflow[])
    .map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      type: 'workflow' as const,
      summary: workflow.description || workflow.schedule || 'Workspace workflow',
      score: scoreHaystack(tokens, [
        workflow.id,
        workflow.name,
        workflow.description,
        workflow.schedule,
        ...(workflow.targeting?.groups || []),
        ...(workflow.targeting?.communities || []),
        ...(workflow.targeting?.tags || []),
      ]),
      matchCount: countHaystackMatches(tokens, [
        workflow.id,
        workflow.name,
        workflow.description,
        workflow.schedule,
        ...(workflow.targeting?.groups || []),
        ...(workflow.targeting?.communities || []),
        ...(workflow.targeting?.tags || []),
      ]),
      source: 'workspace',
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)

  const topAgent = matchedAgents[0]
  const topSkill = matchedSkills[0]
  const topAgentTemplate = matchedAgentTemplates[0]
  const topOrgTemplate = matchedOrganizationTemplates[0]

  let intent: BuilderRecommendation['intent'] = 'ai_generate'
  let confidence: BuilderRecommendation['confidence'] = 'medium'
  if (includesAnyPrompt(prompt, skillWords) && matchedSkills.length > 0) intent = 'skill_or_integration'
  else if (hasAgentTemplateLanguage && matchedAgentTemplates.length > 0) intent = 'agent_template'
  else if (hasTemplateLanguage && scope !== 'single_agent') intent = 'team_template'
  else if (hasTemplateLanguage && matchedOrganizationTemplates.length > 0) intent = 'team_template'
  else if ((hasTemplateLanguage || hasAgentTemplateLanguage) && matchedAgentTemplates.length > 0) intent = 'agent_template'
  else if (hasTemplateLanguage && matchedAgentTemplates.length > 0) intent = 'agent_template'
  else if (scope !== 'single_agent' && matchedOrganizationTemplates.length > 0) intent = 'team_template'
  else if (operation === 'reuse_existing' && matchedAgents.length > 0) intent = 'existing_agent'
  else if (
    scope === 'single_agent'
    && operation === 'create_new'
    && !hasTemplateLanguage
    && (
      ((topAgentTemplate?.matchCount || 0) <= 1 && tokens.length >= 3)
      || (((topAgentTemplate?.matchCount || 0) / Math.max(tokens.length, 1)) < 0.6 && tokens.length >= 4)
    )
  ) intent = 'ai_generate'
  else if (matchedAgents.length > 0 && topAgent.score >= 6) intent = 'existing_agent'
  else if (matchedAgentTemplates.length > 0 && topAgentTemplate.score >= 5) intent = 'agent_template'
  else if (scope !== 'single_agent' && scope !== 'unknown') intent = 'team_template'

  if (
    (intent === 'existing_agent' && ((topAgent?.score || 0) <= ((topAgentTemplate?.score || 0) + 1) || (topAgent?.score || 0) <= ((topOrgTemplate?.score || 0) + 1)))
    || (intent === 'team_template' && (topAgent?.score || 0) >= ((topOrgTemplate?.score || 0) - 1))
    || (intent === 'agent_template' && (topAgent?.score || 0) >= ((topAgentTemplate?.score || 0) - 1))
  ) {
    confidence = 'low'
  } else if ((topAgent?.score || topAgentTemplate?.score || topOrgTemplate?.score || 0) >= 8) {
    confidence = 'high'
  }

  const fallbackNotice = 'Live Builder route is not available in the current server process, so this recommendation was generated locally in the browser from current workspace APIs.'
  const confirmationOptions = confidence === 'low'
    ? [
        topAgent ? {
          id: 'confirm-existing-agent',
          label: `Use ${topAgent.name}`,
          prompt: `${prompt}\n\nConfirmation: reuse and improve my existing agent ${topAgent.name}.`,
          reasoning: `${topAgent.name} is already close to the request.`,
        } : null,
        topOrgTemplate ? {
          id: 'confirm-team-template',
          label: `Use ${topOrgTemplate.name}`,
          prompt: `${prompt}\n\nConfirmation: I want a coordinated team or team template.`,
          reasoning: `${topOrgTemplate.name} is the closest multi-role match.`,
        } : null,
        topAgentTemplate ? {
          id: 'confirm-agent-template',
          label: `Use ${topAgentTemplate.name}`,
          prompt: `${prompt}\n\nConfirmation: create a new agent from the ${topAgentTemplate.name} template.`,
          reasoning: `${topAgentTemplate.name} is the closest single-agent template match.`,
        } : null,
      ].filter(Boolean) as BuilderRecommendation['confirmationOptions']
    : []

  if (intent === 'existing_agent') {
    return {
      intent,
      scope,
      operation,
      confidence,
      summary: `${topAgent ? `${topAgent.name} looks like the closest existing workspace agent.` : 'A current workspace agent is likely the best starting point.'} ${fallbackNotice}${confidence === 'low' ? ' Confirm the path below if this could also be a template or new-build request.' : ''}`,
      clarifyingQuestions: ['Do you want to refine the existing agent before creating anything new?', 'What is the first real task you want this agent to handle?'],
      confirmationOptions,
      recommendedPath: {
        title: topAgent ? `Start with existing agent ${topAgent.name}` : 'Start with an existing workspace agent',
        reasoning: 'The fastest path is to test or refine the closest agent before creating a new one.',
        primaryAction: { id: 'reuse-agent', label: 'Open Agents', description: 'Review and test the closest existing agent.', page: 'agents' },
      },
      alternativePaths: [
        {
          title: 'Browse templates',
          reasoning: 'Use a template if the current agent is close but structurally off.',
          action: { id: 'fallback-agent-template', label: 'Open Templates', description: 'Look for a cleaner role match.', page: 'templates' },
        },
      ],
      matchedAssets: { agents: matchedAgents, skills: matchedSkills, agentTemplates: matchedAgentTemplates, organizationTemplates: matchedOrganizationTemplates, workflows: matchedWorkflows },
      suggestedActions: [
        { id: 'reuse-agent', label: 'Open Agents', description: 'Review and test the closest existing agent.', page: 'agents' },
        { id: 'review-skills', label: 'Open Skills', description: 'Check whether the agent is missing tools or integrations.', page: 'skills' },
      ],
      testPlan: [
        'Open the closest agent and send a real first prompt from your actual use case.',
        'Check whether the response quality is close enough before creating anything new.',
      ],
    }
  }

  if (intent === 'skill_or_integration') {
    return {
      intent,
      scope,
      operation,
      confidence,
      summary: `${topSkill ? `${topSkill.name} looks like the nearest capability match.` : 'This request appears tool or integration driven.'} ${fallbackNotice}`,
      clarifyingQuestions: ['Is the main gap tooling, or do you also need a new agent role?', 'Which existing agent should own this capability?'],
      confirmationOptions: [],
      recommendedPath: {
        title: topSkill ? `Resolve skill ${topSkill.name} first` : 'Resolve the skill or integration first',
        reasoning: 'The core gap looks capability-related rather than structural.',
        primaryAction: { id: 'open-skills', label: 'Open Skills', description: 'Browse and assign the needed capability.', page: 'skills' },
      },
      alternativePaths: [
        {
          title: 'Create a new agent with this capability',
          reasoning: 'If no current agent fits, generate a purpose-built one.',
          action: { id: 'fallback-create-agent', label: 'AI Generate Agent', description: 'Create a new agent around the required tools.', page: 'agents', action: 'create-ai' },
        },
      ],
      matchedAssets: { agents: matchedAgents, skills: matchedSkills, agentTemplates: matchedAgentTemplates, organizationTemplates: matchedOrganizationTemplates, workflows: matchedWorkflows },
      suggestedActions: [
        { id: 'open-skills', label: 'Open Skills', description: 'Browse and assign the needed capability.', page: 'skills' },
        { id: 'open-agents', label: 'Open Agents', description: 'Choose which agent should own the capability.', page: 'agents' },
      ],
      testPlan: [
        'Verify setup requirements and assign the skill to the target agent.',
        'Run one real task that forces the integration to be used.',
      ],
    }
  }

  if (intent === 'team_template') {
    return {
      intent,
      scope,
      operation,
      confidence,
      summary: `${topOrgTemplate ? `${topOrgTemplate.name} looks like the closest team template.` : 'This request sounds multi-role and coordination heavy.'} ${fallbackNotice}${confidence === 'low' ? ' Confirm below if you want a team template rather than reusing current assets.' : ''}`,
      clarifyingQuestions: ['What are the core roles or lanes this team needs?', 'What should the kickoff and final output look like?'],
      confirmationOptions,
      recommendedPath: {
        title: topOrgTemplate ? `Start from team template ${topOrgTemplate.name}` : 'Start from a team template',
        reasoning: 'A multi-role template is the fastest path for handoffs and workflow structure.',
        primaryAction: { id: 'open-team-templates', label: 'Open Templates', description: 'Apply or refine a matching team template.', page: 'templates' },
      },
      alternativePaths: [
        {
          title: 'Prototype with one agent first',
          reasoning: 'Use a single agent if the process is still exploratory.',
          action: { id: 'fallback-single-agent', label: 'Open Agents', description: 'Prototype the core task before building the whole team.', page: 'agents' },
        },
      ],
      matchedAssets: { agents: matchedAgents, skills: matchedSkills, agentTemplates: matchedAgentTemplates, organizationTemplates: matchedOrganizationTemplates, workflows: matchedWorkflows },
      suggestedActions: [
        { id: 'open-team-templates', label: 'Open Templates', description: 'Apply or refine a matching team template.', page: 'templates' },
        { id: 'open-workflows', label: 'Open Workflows', description: 'Review kickoff and final output flow expectations.', page: 'workflows' },
      ],
      testPlan: [
        'Apply the team template and inspect the created agents, groups, and workflows.',
        'Run the kickoff flow and confirm the handoffs and final output shape make sense.',
      ],
    }
  }

  if (intent === 'agent_template') {
    return {
      intent,
      scope,
      operation,
      confidence,
      summary: `${topAgentTemplate ? `${topAgentTemplate.name} looks like the closest agent template.` : 'A role-specific agent template is probably the fastest starter here.'} ${fallbackNotice}${confidence === 'low' ? ' Confirm below if you want a new template-based agent rather than reusing an existing one.' : ''}`,
      clarifyingQuestions: ['Is there already an agent in the workspace that is close enough to reuse?', 'What is the first task this agent should complete?'],
      confirmationOptions,
      recommendedPath: {
        title: topAgentTemplate ? `Start from agent template ${topAgentTemplate.name}` : 'Start from an agent template',
        reasoning: 'A known role template is likely faster than building the whole identity by hand.',
        primaryAction: { id: 'open-agent-templates', label: 'Open Templates', description: 'Use a matching agent template as the starting point.', page: 'templates' },
      },
      alternativePaths: [
        {
          title: 'Generate a fresh custom agent',
          reasoning: 'If the template is too generic, generate a sharper first draft.',
          action: { id: 'fallback-generate-agent', label: 'AI Generate Agent', description: 'Create a more tailored agent draft.', page: 'agents', action: 'create-ai' },
        },
      ],
      matchedAssets: { agents: matchedAgents, skills: matchedSkills, agentTemplates: matchedAgentTemplates, organizationTemplates: matchedOrganizationTemplates, workflows: matchedWorkflows },
      suggestedActions: [
        { id: 'open-agent-templates', label: 'Open Templates', description: 'Use a matching agent template as the starting point.', page: 'templates' },
        { id: 'open-agents', label: 'Open Agents', description: 'Compare against current workspace agents before duplicating a role.', page: 'agents' },
      ],
      testPlan: [
        'Apply the template and review identity, tools, and model before first use.',
        'Send a real task prompt and see whether the result is close enough.',
      ],
    }
  }

  return {
    intent: 'ai_generate',
    scope,
    operation,
    confidence,
    summary: `This request is specific enough that AI generation is a reasonable first path. ${fallbackNotice}`,
    clarifyingQuestions: ['Is this one agent or a team?', 'What should success look like when you test the result?'],
    confirmationOptions,
    recommendedPath: {
      title: 'Generate a custom starter from AI',
      reasoning: 'When there is no obvious close asset, generation is the fastest way to get to a first draft.',
      primaryAction: { id: 'open-ai-generate', label: 'AI Generate Agent', description: 'Create a tailored starter from this prompt.', page: 'agents', action: 'create-ai' },
    },
    alternativePaths: [
      {
        title: 'Browse templates first',
        reasoning: 'A near-match template may still be faster and more predictable.',
        action: { id: 'fallback-templates', label: 'Open Templates', description: 'Check the catalog before generating from scratch.', page: 'templates' },
      },
    ],
    matchedAssets: { agents: matchedAgents, skills: matchedSkills, agentTemplates: matchedAgentTemplates, organizationTemplates: matchedOrganizationTemplates, workflows: matchedWorkflows },
    suggestedActions: [
      { id: 'open-ai-generate', label: 'AI Generate Agent', description: 'Create a tailored starter from this prompt.', page: 'agents', action: 'create-ai' },
      { id: 'fallback-templates', label: 'Open Templates', description: 'Check the catalog before generating from scratch.', page: 'templates' },
    ],
    testPlan: [
      'Generate the first draft and immediately review the role and scope for fit.',
      'Use one representative task prompt to validate the result before expanding further.',
    ],
  }
}

function getBuilderSessionStorageKey(workspaceKey: string): string {
  return `${BUILDER_SESSION_STORAGE_PREFIX}:${workspaceKey}`
}

function getBuilderArchivesStorageKey(workspaceKey: string): string {
  return `${BUILDER_ARCHIVES_STORAGE_PREFIX}:${workspaceKey}`
}

function getBuilderFeedbackStorageKey(workspaceKey: string): string {
  return `${BUILDER_FEEDBACK_STORAGE_PREFIX}:${workspaceKey}`
}

function loadStoredBuilderSession(workspaceKey: string): { messages: BuilderMessage[]; recommendation: BuilderRecommendation | null } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(getBuilderSessionStorageKey(workspaceKey))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const messages = Array.isArray(parsed?.messages) && parsed.messages.length > 0 ? parsed.messages as BuilderMessage[] : createInitialMessages()
    return {
      messages,
      recommendation: parsed?.recommendation || null,
    }
  } catch {
    return null
  }
}

function saveStoredBuilderSession(workspaceKey: string, session: { messages: BuilderMessage[]; recommendation: BuilderRecommendation | null }) {
  if (typeof window === 'undefined') return
  localStorage.setItem(getBuilderSessionStorageKey(workspaceKey), JSON.stringify(session))
}

function clearStoredBuilderSession(workspaceKey: string) {
  if (typeof window === 'undefined') return
  localStorage.removeItem(getBuilderSessionStorageKey(workspaceKey))
}

function loadBuilderArchives(workspaceKey: string): BuilderArchive[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(getBuilderArchivesStorageKey(workspaceKey))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed as BuilderArchive[] : []
  } catch {
    return []
  }
}

function saveBuilderArchives(workspaceKey: string, archives: BuilderArchive[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(getBuilderArchivesStorageKey(workspaceKey), JSON.stringify(archives))
}

function loadBuilderFeedback(workspaceKey: string): Record<string, 'up' | 'down'> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(getBuilderFeedbackStorageKey(workspaceKey))
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed as Record<string, 'up' | 'down'> : {}
  } catch {
    return {}
  }
}

function saveBuilderFeedback(workspaceKey: string, feedback: Record<string, 'up' | 'down'>) {
  if (typeof window === 'undefined') return
  localStorage.setItem(getBuilderFeedbackStorageKey(workspaceKey), JSON.stringify(feedback))
}

function buildTemplateSelection(action: BuilderAction): string | null {
  if (action.page !== 'templates' || !action.templateType) return null
  try {
    sessionStorage.setItem('clawmax-onboarding-template-query', JSON.stringify({
      search: action.templateName || action.templateId || '',
      templateId: action.templateId || action.templateName || '',
      templateName: action.templateName || action.templateId || '',
      templateType: action.templateType,
    }))
    return action.templateType
  } catch {
    return null
  }
}

function createAssetAction(asset: BuilderMatchedAsset, matchedAssets: BuilderRecommendation['matchedAssets']): BuilderAction {
  if (asset.type === 'agent') {
    return {
      id: `open-agent-${asset.id}`,
      label: `Open ${asset.name}`,
      description: 'Open this agent directly.',
      page: 'agents',
      agentId: asset.id,
    }
  }
  if (asset.type === 'skill') {
    return {
      id: `open-skill-${asset.id}`,
      label: `Open ${asset.name}`,
      description: 'Open this skill directly.',
      page: 'skills',
      skillName: asset.name,
      agentId: matchedAssets.agents[0]?.id,
    }
  }
  if (asset.type === 'workflow') {
    return {
      id: `open-workflow-${asset.id}`,
      label: `Open ${asset.name}`,
      description: 'Open this workflow directly.',
      page: 'workflows',
      workflowId: asset.id,
    }
  }
  return {
    id: `open-template-${asset.id}`,
    label: `Open ${asset.name}`,
    description: 'Open this template directly.',
    page: 'templates',
    templateId: asset.id,
    templateName: asset.name,
    templateType: asset.type === 'organization-template' ? 'organization' : 'agent',
  }
}

function hydrateBuilderAction(action: BuilderAction, recommendation: BuilderRecommendation): BuilderAction {
  if (action.agentId || action.skillName || action.workflowId || action.templateId) return action
  const topAgent = recommendation.matchedAssets.agents[0]
  const topSkill = recommendation.matchedAssets.skills[0]
  const topWorkflow = recommendation.matchedAssets.workflows[0]
  const topAgentTemplate = recommendation.matchedAssets.agentTemplates[0]
  const topOrgTemplate = recommendation.matchedAssets.organizationTemplates[0]

  if (action.page === 'agents' && !action.action && topAgent) {
    return { ...action, agentId: topAgent.id }
  }
  if (action.page === 'skills' && topSkill) {
    return { ...action, skillName: topSkill.name, agentId: topAgent?.id }
  }
  if (action.page === 'workflows' && topWorkflow) {
    return { ...action, workflowId: topWorkflow.id }
  }
  if (action.page === 'templates') {
    const template = recommendation.intent === 'team_template' ? topOrgTemplate : (topAgentTemplate || topOrgTemplate)
    if (template) {
      return {
        ...action,
        templateId: template.id,
        templateName: template.name,
        templateType: template.type === 'organization-template' ? 'organization' : 'agent',
      }
    }
  }
  return action
}

function hydrateBuilderRecommendation(recommendation: BuilderRecommendation): BuilderRecommendation {
  return {
    ...recommendation,
    recommendedPath: {
      ...recommendation.recommendedPath,
      primaryAction: hydrateBuilderAction(recommendation.recommendedPath.primaryAction, recommendation),
    },
    alternativePaths: recommendation.alternativePaths.map((path) => ({
      ...path,
      action: hydrateBuilderAction(path.action, recommendation),
    })),
    suggestedActions: recommendation.suggestedActions.map((action) => hydrateBuilderAction(action, recommendation)),
  }
}

export default function Builder({
  onNavigateToPage,
  onOpenAgentCreate,
  onOpenAgentCreateAI,
  onOpenAgentImport,
  onOpenAgent,
  onOpenSkill,
  onOpenWorkflow,
}: {
  onNavigateToPage?: (page: 'builder' | 'agents' | 'templates' | 'skills' | 'workflows' | 'organizations') => void
  onOpenAgentCreate?: () => void
  onOpenAgentCreateAI?: () => void
  onOpenAgentImport?: () => void
  onOpenAgent?: (agentId: string) => void
  onOpenSkill?: (skillName: string, agentId?: string) => void
  onOpenWorkflow?: (workflowId: string) => void
}) {
  const { activeWorkspace } = useWorkspace()
  const workspaceKey = activeWorkspace?.id || activeWorkspace?.path || 'default'
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<BuilderMessage[]>(createInitialMessages())
  const [recommendation, setRecommendation] = useState<BuilderRecommendation | null>(null)
  const [attachments, setAttachments] = useState<BuilderAttachment[]>([])
  const [isListening, setIsListening] = useState(false)
  const [archives, setArchives] = useState<BuilderArchive[]>([])
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showArchives, setShowArchives] = useState(false)
  const [viewingArchive, setViewingArchive] = useState<BuilderArchive | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [starterPrompts, setStarterPrompts] = useState<string[]>(DEFAULT_STARTER_PROMPTS)
  const [feedbackByRecommendation, setFeedbackByRecommendation] = useState<Record<string, 'up' | 'down'>>({})
  const [showRightPane, setShowRightPane] = useState(true)
  const recognitionRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const listeningBasePromptRef = useRef('')
  const transcriptViewportRef = useRef<HTMLDivElement | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement | null>(null)
  const rightPaneRef = useRef<HTMLDivElement | null>(null)
  const currentRecommendationRef = useRef<HTMLDivElement | null>(null)

  const historyItems = useMemo(() => messages.filter((message) => message.role === 'user').slice().reverse(), [messages])
  const hasConversation = historyItems.length > 0

  useEffect(() => {
    const storedSession = loadStoredBuilderSession(workspaceKey)
    setMessages(storedSession?.messages || createInitialMessages())
    setRecommendation(storedSession?.recommendation || null)
    setPrompt('')
    setAttachments([])
    setError(null)
    setLoading(false)
    setArchives(loadBuilderArchives(workspaceKey))
    setShowArchives(false)
    setShowClearConfirm(false)
    setViewingArchive(null)
    setDeleteConfirm(null)
    setFeedbackByRecommendation(loadBuilderFeedback(workspaceKey))
  }, [workspaceKey])

  useEffect(() => {
    let cancelled = false
    async function loadStarterPrompts() {
      try {
        const [agentsResp, skillsResp, templatesResp] = await Promise.all([
          fetch('/api/agents').then(async (response) => response.ok ? response.json() : { agents: [] }).catch(() => ({ agents: [] })),
          fetch('/api/skills').then(async (response) => response.ok ? response.json() : { skills: [] }).catch(() => ({ skills: [] })),
          fetch('/api/templates').then(async (response) => response.ok ? response.json() : { agents: [], organizations: [] }).catch(() => ({ agents: [], organizations: [] })),
        ])
        if (cancelled) return
        setStarterPrompts(buildWorkspaceStarterPrompts({
          agents: (agentsResp.agents || []) as ApiAgent[],
          skills: (skillsResp.skills || []) as ApiSkill[],
          templates: {
            agents: (templatesResp.agents || []) as ApiTemplate[],
            organizations: (templatesResp.organizations || []) as ApiTemplate[],
          },
        }))
      } catch {
        if (!cancelled) setStarterPrompts(DEFAULT_STARTER_PROMPTS)
      }
    }
    void loadStarterPrompts()
    return () => {
      cancelled = true
    }
  }, [workspaceKey])

  useEffect(() => {
    if (!hasConversation && !recommendation) {
      clearStoredBuilderSession(workspaceKey)
      return
    }
    saveStoredBuilderSession(workspaceKey, { messages, recommendation })
  }, [hasConversation, messages, recommendation, workspaceKey])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, recommendation])

  useEffect(() => {
    if (!recommendation) return
    currentRecommendationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (rightPaneRef.current) {
      rightPaneRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [recommendation])

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    recognitionRef.current = new SpeechRecognition()
    recognitionRef.current.continuous = false
    recognitionRef.current.interimResults = true
    recognitionRef.current.maxAlternatives = 1
    recognitionRef.current.lang = 'en-US'
    recognitionRef.current.onstart = () => {
      setIsListening(true)
      setError(null)
    }
    recognitionRef.current.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((result: any) => result?.[0]?.transcript || '')
        .join(' ')
        .trim()
      setPrompt([listeningBasePromptRef.current.trim(), transcript].filter(Boolean).join(' '))
      if (event.results?.[event.results.length - 1]?.isFinal) {
        textareaRef.current?.focus()
      }
    }
    recognitionRef.current.onerror = (event: any) => {
      setIsListening(false)
      setError(`Voice input error: ${event.error}`)
    }
    recognitionRef.current.onend = () => {
      setIsListening(false)
    }

    return () => {
      recognitionRef.current?.stop?.()
    }
  }, [])

  function resetBuilderSession() {
    setPrompt('')
    setAttachments([])
    setError(null)
    setRecommendation(null)
    setMessages(createInitialMessages())
    clearStoredBuilderSession(workspaceKey)
  }

  function archiveCurrentSession() {
    const userMessages = messages.filter((message) => message.role === 'user')
    if (userMessages.length === 0) {
      resetBuilderSession()
      return
    }
    const archive: BuilderArchive = {
      id: `builder-archive-${Date.now()}`,
      title: userMessages[0]?.content.slice(0, 80) || 'Builder session',
      timestamp: Date.now(),
      messages,
      recommendation,
    }
    const nextArchives = [archive, ...archives]
    setArchives(nextArchives)
    saveBuilderArchives(workspaceKey, nextArchives)
    resetBuilderSession()
  }

  function viewArchive(archiveId: string) {
    const archive = archives.find((item) => item.id === archiveId) || null
    setViewingArchive(archive)
  }

  function deleteArchive(archiveId: string) {
    const nextArchives = archives.filter((archive) => archive.id !== archiveId)
    setArchives(nextArchives)
    saveBuilderArchives(workspaceKey, nextArchives)
    if (viewingArchive?.id === archiveId) {
      setViewingArchive(null)
    }
    setDeleteConfirm(null)
  }

  function appendAttachmentContext(basePrompt: string): string {
    if (attachments.length === 0) return basePrompt
    const lines = attachments.map((attachment) => {
      const label = attachment.isImage ? 'image' : 'file'
      const snippet = attachment.contextSnippet ? ` Context: ${attachment.contextSnippet}` : ''
      return `- ${label}: ${attachment.name}${snippet}`
    })
    return `${basePrompt}\n\nAttached context:\n${lines.join('\n')}`
  }

  async function submitPrompt(nextPrompt?: string) {
    const value = (nextPrompt ?? prompt).trim()
    if (!value) return

    const effectivePrompt = appendAttachmentContext(value)

    setLoading(true)
    setError(null)
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', label: 'You', content: value }])

    try {
      const response = await fetch('/api/ai-builder/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: effectivePrompt }),
      })
      let data: any
      try {
        data = await parseBuilderResponse(response)
      } catch (parseError: any) {
        if ((parseError?.message || '').includes('returned HTML instead of JSON')) {
          const localRecommendation = hydrateBuilderRecommendation(await buildClientFallbackRecommendation(effectivePrompt))
          setRecommendation(localRecommendation)
          setMessages((prev) => [
            ...prev,
            {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              label: 'Builder agent',
              content: localRecommendation.summary,
            },
          ])
          setPrompt('')
          setAttachments([])
          return
        }
        throw parseError
      }
      if (!response.ok || !data?.recommendation) {
        throw new Error(data?.error || `Builder request failed with HTTP ${response.status}`)
      }
      const nextRecommendation = hydrateBuilderRecommendation(data.recommendation as BuilderRecommendation)
      setRecommendation(nextRecommendation)
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          label: 'Builder agent',
          content: nextRecommendation.summary,
        },
      ])
      setPrompt('')
      setAttachments([])
    } catch (err: any) {
      setError(err?.message || 'Failed to build recommendation')
    } finally {
      setLoading(false)
    }
  }

  async function handleAttachFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    const nextAttachments = await Promise.all(files.map(async (file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      type: file.type,
      size: file.size,
      contextSnippet: await readAttachmentContext(file),
      isImage: file.type.startsWith('image/'),
    })))

    setAttachments((prev) => {
      const merged = new Map(prev.map((attachment) => [attachment.id, attachment]))
      for (const attachment of nextAttachments) merged.set(attachment.id, attachment)
      return Array.from(merged.values())
    })

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }

  function toggleListening() {
    if (!recognitionRef.current) {
      setError('Voice input is not supported in this browser.')
      return
    }
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }
    setError(null)
    listeningBasePromptRef.current = prompt
    try {
      recognitionRef.current.start()
    } catch (err: any) {
      setIsListening(false)
      setError(err?.message || 'Unable to start voice input.')
    }
  }

  function runAction(action: BuilderAction) {
    if (action.page === 'builder') return
    if (action.page === 'templates') {
      buildTemplateSelection(action)
      onNavigateToPage?.('templates')
      return
    }
    if (action.page === 'agents' && action.agentId) {
      onOpenAgent?.(action.agentId)
      return
    }
    if (action.page === 'skills' && action.skillName) {
      onOpenSkill?.(action.skillName, action.agentId)
      return
    }
    if (action.page === 'workflows' && action.workflowId) {
      onOpenWorkflow?.(action.workflowId)
      return
    }
    if (action.page === 'agents' && action.action === 'create-ai') {
      onOpenAgentCreateAI?.()
      return
    }
    if (action.page === 'agents' && action.action === 'create') {
      onOpenAgentCreate?.()
      return
    }
    if (action.page === 'agents' && action.action === 'import') {
      onOpenAgentImport?.()
      return
    }
    onNavigateToPage?.(action.page)
  }

  function handlePromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (loading || !prompt.trim()) return
    void submitPrompt()
  }

  const recommendationFeedbackKey = recommendation
    ? `${recommendation.intent}:${recommendation.recommendedPath.title}`
    : null
  const currentRecommendationFeedback = recommendationFeedbackKey ? feedbackByRecommendation[recommendationFeedbackKey] : undefined

  function setRecommendationFeedback(value: 'up' | 'down') {
    if (!recommendationFeedbackKey) return
    const nextFeedback = { ...feedbackByRecommendation, [recommendationFeedbackKey]: value }
    setFeedbackByRecommendation(nextFeedback)
    saveBuilderFeedback(workspaceKey, nextFeedback)
  }

  function toggleRecommendationFeedback(value: 'up' | 'down') {
    if (!recommendationFeedbackKey) return
    const nextFeedback = { ...feedbackByRecommendation }
    if (nextFeedback[recommendationFeedbackKey] === value) {
      delete nextFeedback[recommendationFeedbackKey]
    } else {
      nextFeedback[recommendationFeedbackKey] = value
    }
    setFeedbackByRecommendation(nextFeedback)
    saveBuilderFeedback(workspaceKey, nextFeedback)
  }

  return (
    <div className="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_32%),linear-gradient(180deg,_rgba(15,23,42,0.04),_rgba(15,23,42,0))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.12),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.25),_rgba(15,23,42,0))]">
      <div className={`mx-auto grid h-full max-w-7xl grid-cols-1 gap-4 overflow-hidden px-3 py-4 lg:px-5 ${
        showRightPane ? 'lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_380px]' : ''
      }`}>
        <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
          <div className="shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-600 dark:text-sky-300">Builder</div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white xl:text-[2rem]">AI Builder / Designer</h1>
                {!hasConversation ? (
                  <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
                    Describe what you want to build in the active workspace. The builder will look at current agents, skills, templates, and workflows, then route you toward the fastest next step.
                  </p>
                ) : (
                  <p className="mt-2 max-w-3xl text-xs text-gray-500 dark:text-gray-400">
                    Builder is now focused on the active conversation and recommendations for this workspace.
                  </p>
                )}
              </div>
              {recommendation && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                    {intentBadge(recommendation.intent)}
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    recommendation.confidence === 'high'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
                      : recommendation.confidence === 'medium'
                        ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200'
                  }`}>
                    {confidenceBadge(recommendation.confidence)}
                  </div>
                </div>
              )}
              {hasConversation && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowRightPane((value) => !value)}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:text-sky-200"
                    title={showRightPane ? 'Hide right pane' : 'Show right pane'}
                    aria-label={showRightPane ? 'Hide right pane' : 'Show right pane'}
                  >
                    {showRightPane ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:text-sky-200"
                  >
                    Reset Session
                  </button>
                  <button
                    onClick={() => setShowArchives(true)}
                    disabled={archives.length === 0}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-sky-300 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:text-sky-200"
                  >
                    History
                  </button>
                  <button
                    onClick={resetBuilderSession}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:text-sky-200"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {!hasConversation && (
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                  Suggested Prompts
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {starterPrompts.map((starter) => (
                    <button
                      key={starter}
                      onClick={() => void submitPrompt(starter)}
                      className="min-h-[3.25rem] rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs leading-5 text-gray-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:bg-sky-900/30 dark:hover:text-sky-200"
                    >
                      <span className="block overflow-hidden">{starter}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-950/50">
            <div ref={transcriptViewportRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[88%]">
                    <div className={`mb-1 flex items-center gap-2 text-[11px] font-medium ${message.role === 'user' ? 'justify-end text-sky-200 dark:text-sky-200' : 'text-gray-500 dark:text-gray-400'}`}>
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${message.role === 'user' ? 'bg-sky-600 text-white' : 'bg-white text-sky-700 dark:bg-gray-900 dark:text-sky-300'}`}>
                        {message.role === 'user' ? <UserIcon /> : <BuilderIcon />}
                      </span>
                      <span>{message.label}</span>
                    </div>
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                        message.role === 'user'
                          ? 'bg-sky-600 text-white'
                          : 'border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200'
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                </div>
              ))}

              {recommendation && !loading && (
                <div className="flex justify-start">
                  <div className="max-w-[92%] rounded-2xl border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-900 dark:bg-sky-950/30">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">Latest Recommendation</div>
                        <div className="mt-1 text-sm font-semibold text-gray-950 dark:text-white">{recommendation.recommendedPath.title}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-300">
                          {intentBadge(recommendation.intent)}
                        </div>
                        <div className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          recommendation.confidence === 'high'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : recommendation.confidence === 'medium'
                              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'
                        }`}>
                          {confidenceBadge(recommendation.confidence)}
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{recommendation.recommendedPath.reasoning}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => runAction(recommendation.recommendedPath.primaryAction)}
                        className="rounded-full bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700"
                      >
                        {recommendation.recommendedPath.primaryAction.label}
                      </button>
                    </div>
                    {recommendation.confirmationOptions.length > 0 && (
                      <div className="mt-3">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300">Confirm Path</div>
                        <div className="flex flex-wrap gap-2">
                          {recommendation.confirmationOptions.map((option) => (
                            <button
                              key={option.id}
                              onClick={() => void submitPrompt(option.prompt)}
                              className="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 transition-colors hover:border-sky-400 hover:bg-sky-100 dark:border-sky-800 dark:bg-gray-900 dark:text-sky-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/40"
                              title={option.reasoning}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => toggleRecommendationFeedback('up')}
                          title="Helpful recommendation"
                          aria-label="Helpful recommendation"
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            currentRecommendationFeedback === 'up'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                          }`}
                        >
                          <ThumbUpIcon />
                        </button>
                        <button
                          onClick={() => toggleRecommendationFeedback('down')}
                          title="Not helpful recommendation"
                          aria-label="Not helpful recommendation"
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                            currentRecommendationFeedback === 'down'
                              ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-rose-300 hover:text-rose-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                          }`}
                        >
                          <ThumbDownIcon />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[88%]">
                    <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-sky-700 dark:bg-gray-900 dark:text-sky-300">
                        <BuilderIcon />
                      </span>
                      <span>Builder agent</span>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.2s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.1s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-sky-500" />
                        </span>
                        Builder agent thinking…
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>

            <div className="mt-3 shrink-0 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              {attachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="inline-flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                      <span>{attachment.isImage ? 'Image' : 'File'}: {attachment.name}</span>
                      <button onClick={() => removeAttachment(attachment.id)} className="text-gray-400 hover:text-red-500">×</button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={handlePromptKeyDown}
                placeholder="Example: I want a small team that watches competitor launches, writes concise summaries, and posts a final brief every Friday."
                className="min-h-[64px] max-h-[110px] w-full resize-y border-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3 dark:border-gray-800">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isListening
                        ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300'
                        : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-sky-700 dark:hover:text-sky-200'
                    }`}
                    title={isListening ? 'Stop voice input' : 'Start voice input'}
                  >
                    <MicIcon />
                    {isListening ? <span className="text-[11px]">Listening…</span> : <span className="sr-only">Voice input</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-sky-700 dark:hover:text-sky-200"
                  >
                    <AttachIcon />
                    Attach files or images
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.txt,.md,.json,.csv,.yaml,.yml,.pdf"
                    onChange={handleAttachFiles}
                    className="hidden"
                  />
                </div>

                <button
                  onClick={() => void submitPrompt()}
                  disabled={loading || !prompt.trim()}
                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700"
                >
                  {loading ? 'Designing…' : 'Design This'}
                </button>
              </div>

              {!hasConversation && (
                <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  Good prompts mention the user, whether this is one agent or a team, and what success should look like.
                </div>
              )}
              <div className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                Press <span className="font-medium text-gray-500 dark:text-gray-400">Enter</span> to submit. Use <span className="font-medium text-gray-500 dark:text-gray-400">Shift + Enter</span> for a new line.
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}
          </div>
        </section>

        {showRightPane && (
        <aside className="min-h-0 overflow-hidden rounded-3xl border border-gray-200 bg-white/90 p-3 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
          <div ref={rightPaneRef} className="h-full space-y-3 overflow-y-auto pr-1">
            <div ref={currentRecommendationRef} className="rounded-3xl border border-gray-200 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                <RecommendationIcon />
                <span>Current Recommendation</span>
              </div>
              {!recommendation ? (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Waiting for the first builder response.
                </div>
              ) : (
                <div className="mt-2 space-y-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-gray-950 dark:text-white">{recommendation.recommendedPath.title}</div>
                      <div className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        recommendation.confidence === 'high'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : recommendation.confidence === 'medium'
                            ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'
                      }`}>
                        {confidenceBadge(recommendation.confidence)}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{recommendation.recommendedPath.reasoning}</p>
                  </div>
                  <button
                    onClick={() => runAction(recommendation.recommendedPath.primaryAction)}
                    className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-sky-700"
                  >
                    {recommendation.recommendedPath.primaryAction.label}
                    <div className="mt-1 text-xs font-normal text-sky-100">{recommendation.recommendedPath.primaryAction.description}</div>
                  </button>
                  {recommendation.confirmationOptions.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Confirm Path</div>
                      <div className="mt-2 space-y-2">
                        {recommendation.confirmationOptions.map((option) => (
                          <button
                            key={option.id}
                            onClick={() => void submitPrompt(option.prompt)}
                            className="w-full rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-left text-xs text-sky-800 transition-colors hover:border-sky-400 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/50"
                          >
                            <div className="font-semibold">{option.label}</div>
                            <div className="mt-1 text-[11px] text-sky-700/80 dark:text-sky-300/80">{option.reasoning}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() => toggleRecommendationFeedback('up')}
                        title="Helpful recommendation"
                        aria-label="Helpful recommendation"
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          currentRecommendationFeedback === 'up'
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                              : 'border-gray-200 bg-white text-gray-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                        }`}
                      >
                        <ThumbUpIcon />
                      </button>
                      <button
                        onClick={() => toggleRecommendationFeedback('down')}
                        title="Not helpful recommendation"
                        aria-label="Not helpful recommendation"
                        className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                          currentRecommendationFeedback === 'down'
                            ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'
                            : 'border-gray-200 bg-white text-gray-600 hover:border-rose-300 hover:text-rose-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300'
                        }`}
                      >
                        <ThumbDownIcon />
                      </button>
                    </div>
                  </div>
                  {recommendation.clarifyingQuestions.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Questions To Ask</div>
                      <ul className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                        {recommendation.clarifyingQuestions.map((question) => (
                          <li key={question} className="rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-950/60">{question}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {recommendation.alternativePaths.length > 0 && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Alternative Paths</div>
                      <div className="mt-2 space-y-2">
                        {recommendation.alternativePaths.map((path) => (
                          <button
                            key={path.title}
                            onClick={() => runAction(path.action)}
                            className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 dark:border-gray-800 dark:hover:border-sky-700 dark:hover:bg-sky-900/20"
                          >
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{path.title}</div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{path.reasoning}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                <ActionsIcon />
                <span>Suggested Next Actions</span>
              </div>
              <div className="mt-2 space-y-2">
                {(recommendation?.suggestedActions || []).map((nextAction) => (
                  <button
                    key={nextAction.id}
                    onClick={() => runAction(nextAction)}
                    className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 dark:border-gray-800 dark:hover:border-sky-700 dark:hover:bg-sky-900/20"
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{nextAction.label}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{nextAction.description}</div>
                  </button>
                ))}
                {!recommendation && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Actions appear when the builder recommends a path.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                <AssetsIcon />
                <span>Matched Workspace Assets</span>
              </div>
              <div className="mt-2 space-y-3">
                {[
                  { label: 'Agents', items: recommendation?.matchedAssets.agents || [] },
                  { label: 'Skills', items: recommendation?.matchedAssets.skills || [] },
                  { label: 'Agent Templates', items: recommendation?.matchedAssets.agentTemplates || [] },
                  { label: 'Team Templates', items: recommendation?.matchedAssets.organizationTemplates || [] },
                ].map((section) => (
                  <div key={section.label}>
                    <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{section.label}</div>
                    {section.items.length === 0 ? (
                      <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">No match yet.</div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {section.items.slice(0, 2).map((item) => (
                          <button
                            key={`${section.label}-${item.id}`}
                            onClick={() => runAction(createAssetAction(item, recommendation?.matchedAssets || {
                              agents: [],
                              skills: [],
                              agentTemplates: [],
                              organizationTemplates: [],
                              workflows: [],
                            }))}
                            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 dark:border-gray-800 dark:bg-gray-950/50 dark:hover:border-sky-700 dark:hover:bg-sky-900/20"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</div>
                              <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400">score {item.score}</div>
                            </div>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.summary}</div>
                            {sourceBadge(item.source) && (
                              <div className="mt-2 inline-flex rounded-full border border-gray-200 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                {sourceBadge(item.source)}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                <TestIcon />
                <span>Test This Result</span>
              </div>
              {!recommendation ? (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Validation steps will appear after the first recommendation.
                </div>
              ) : (
                <ol className="mt-2 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  {recommendation.testPlan.map((step) => (
                    <li key={step} className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-gray-950/50">{step}</li>
                  ))}
                </ol>
              )}
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white/80 p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900/80">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                <HistoryIcon />
                <span>History</span>
              </div>
              <div className="mt-2 space-y-2">
                {archives.length > 0 && (
                  <button
                    onClick={() => setShowArchives(true)}
                    className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-left text-xs text-gray-600 transition-colors hover:border-sky-300 hover:text-sky-700 dark:border-gray-800 dark:text-gray-300 dark:hover:border-sky-700 dark:hover:text-sky-200"
                  >
                    View archived Builder sessions ({archives.length})
                  </button>
                )}
                {historyItems.length === 0 ? (
                  <div className="text-xs text-gray-500 dark:text-gray-400">No builder history yet.</div>
                ) : (
                  historyItems.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
                      {item.content}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>
        )}
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reset Builder Session</h3>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              This will archive the current Builder conversation and recommendation, then start a fresh session. You can recover it later from History.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowClearConfirm(false)
                  archiveCurrentSession()
                }}
                className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                Archive & Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchives && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Builder History</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Archived Builder sessions for the active workspace.</p>
              </div>
              <button onClick={() => setShowArchives(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
            </div>
            <div className="mt-5 min-h-0 overflow-y-auto">
              {archives.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No Builder archives yet.</p>
              ) : (
                <div className="space-y-3">
                  {archives.map((archive) => (
                    <div key={archive.id} className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800">
                      <button
                        onClick={() => viewArchive(archive.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{archive.title || 'Untitled Builder session'}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {new Date(archive.timestamp).toLocaleString()} • {archive.messages.length} messages
                        </div>
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(archive.id)}
                        className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 dark:border-gray-700 dark:text-gray-400 dark:hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingArchive && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[84vh] w-full max-w-4xl flex-col rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{viewingArchive.title || 'Builder archive'}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{new Date(viewingArchive.timestamp).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setMessages(viewingArchive.messages)
                    setRecommendation(viewingArchive.recommendation)
                    setPrompt('')
                    setAttachments([])
                    setError(null)
                    setShowArchives(false)
                    setViewingArchive(null)
                  }}
                  className="rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                >
                  Restore
                </button>
                <button onClick={() => setViewingArchive(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">✕</button>
              </div>
            </div>
            <div className="mt-5 min-h-0 space-y-3 overflow-y-auto">
              {viewingArchive.messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'bg-sky-600 text-white'
                      : 'border border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-200'
                  }`}>
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete Builder Archive</h3>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              This Builder archive will be permanently deleted. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteArchive(deleteConfirm)}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
