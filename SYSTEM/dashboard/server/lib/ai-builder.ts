import { listTemplates, type Template, type AgentTemplate, type OrganizationTemplate } from './templates'
import { listAgents, type AgentInfo } from './workspace'
import { listAvailableSkills, type OpenClawSkill } from './skills'
import { listWorkflows, type Workflow } from './workflows'

export type AiBuilderIntent =
  | 'existing_agent'
  | 'skill_or_integration'
  | 'agent_template'
  | 'team_template'
  | 'ai_generate'

export type AiBuilderScope =
  | 'single_agent'
  | 'team'
  | 'team_of_teams'
  | 'unknown'

export type AiBuilderOperation =
  | 'reuse_existing'
  | 'improve_existing'
  | 'use_template'
  | 'refine_template'
  | 'create_new'
  | 'unknown'

export type AiBuilderConfidence = 'high' | 'medium' | 'low'

export interface AiBuilderAction {
  id: string
  label: string
  description: string
  page: 'builder' | 'agents' | 'templates' | 'skills' | 'workflows' | 'organizations'
  action?: 'create' | 'create-ai' | 'import'
  pageHint?: string
  templateId?: string
  templateName?: string
  templateType?: 'agent' | 'organization'
  templateDraftTarget?: 'team' | 'company'
  prefillPrompt?: string
  templateRefineMode?: boolean
}

export interface AiBuilderMatchedAsset {
  id: string
  name: string
  type: 'agent' | 'skill' | 'agent-template' | 'organization-template' | 'workflow'
  summary: string
  score: number
  matchCount?: number
  source?: string
}

export interface AiBuilderRecommendation {
  intent: AiBuilderIntent
  scope: AiBuilderScope
  operation: AiBuilderOperation
  confidence: AiBuilderConfidence
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
    primaryAction: AiBuilderAction
  }
  alternativePaths: Array<{
    title: string
    reasoning: string
    action: AiBuilderAction
  }>
  matchedAssets: {
    agents: AiBuilderMatchedAsset[]
    skills: AiBuilderMatchedAsset[]
    agentTemplates: AiBuilderMatchedAsset[]
    organizationTemplates: AiBuilderMatchedAsset[]
    workflows: AiBuilderMatchedAsset[]
  }
  suggestedActions: AiBuilderAction[]
  testPlan: string[]
}

type SearchableRecord = {
  id: string
  name: string
  summary: string
  source?: string
  haystack: string
}

const TEAM_KEYWORDS = ['team', 'teams', 'handoff', 'handoffs', 'workflow', 'workflows', 'company', 'organization', 'org', 'lane', 'lanes', 'group', 'groups']
const TEAM_OF_TEAMS_KEYWORDS = ['team of teams', 'teams of teams', 'multi-team', 'multiple teams', 'teams and subteams', 'org of teams', 'organization of teams']
const COMPANY_SCOPE_KEYWORDS = ['company template', 'organization template', 'new company template', 'new organization template', 'create a new company template', 'create a new organization template']
const AGENT_KEYWORDS = ['agent', 'assistant', 'helper', 'specialist']
const SKILL_KEYWORDS = ['skill', 'skills', 'tool', 'tools', 'github', 'slack', 'whatsapp', 'gmail', 'calendar', 'integration', 'integrations', 'api', 'connect', 'connector']
const CREATE_KEYWORDS = ['create', 'build', 'design', 'new', 'from scratch', 'generate']
const REUSE_KEYWORDS = ['existing', 'already have', 'reuse', 'use my', 'current']
const TEMPLATE_KEYWORDS = ['template', 'templates', 'refine template', 'edit template', 'team template', 'organization template']
const AGENT_TEMPLATE_KEYWORDS = ['agent template', 'agent starter', 'create agent from template', 'create a new agent from', 'create new agent from', 'new agent from', 'use template for agent']
const REFINE_KEYWORDS = ['refine', 'improve', 'edit', 'update', 'adjust', 'tune']
const NEW_BUILD_KEYWORDS = ['new', 'from scratch', 'generate', 'net new']
const IMPROVE_EXISTING_KEYWORDS = ['improve my', 'improve current', 'make better', 'upgrade', 'extend', 'enhance']
const TEMPLATE_REFINE_KEYWORDS = ['refine template', 'edit template', 'adapt template', 'customize template', 'improve template']
const EXISTING_TEMPLATE_KEYWORDS = ['existing template', 'current template', 'already have a template', 'local template']
const NEW_TEMPLATE_KEYWORDS = ['new template', 'new team template', 'new company template', 'new organization template', 'create a new template', 'create a new team template', 'create a new company template', 'create a new organization template']
const AMBIGUITY_KEYWORDS = ['maybe', 'not sure', 'whichever fits best', 'or maybe', 'either']
const NON_SCORING_TOKENS = new Set(['agent', 'agents', 'team', 'teams', 'template', 'templates', 'create', 'build', 'design', 'new', 'from', 'scratch', 'use'])

function topScore(items: AiBuilderMatchedAsset[]): number {
  return items[0]?.score || 0
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function tokenize(prompt: string): string[] {
  return Array.from(new Set(
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !NON_SCORING_TOKENS.has(token))
  ))
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function includesAny(prompt: string, words: string[]): boolean {
  const normalized = prompt.toLowerCase()
  return words.some((word) => {
    const escaped = escapeRegex(word.toLowerCase()).replace(/\s+/g, '\\s+')
    return new RegExp(`(?:^|\\b)${escaped}(?:\\b|$)`, 'i').test(normalized)
  })
}

function detectScope(prompt: string): AiBuilderScope {
  if (includesAny(prompt, TEAM_OF_TEAMS_KEYWORDS)) return 'team_of_teams'
  if (includesAny(prompt, COMPANY_SCOPE_KEYWORDS)) return 'team_of_teams'
  if (includesAny(prompt, ['organization', 'company']) && includesAny(prompt, ['teams', 'leadership'])) return 'team_of_teams'
  if (includesAny(prompt, TEAM_KEYWORDS)) return 'team'
  if (includesAny(prompt, ['operations', 'ops', 'intake', 'delivery']) && includesAny(prompt, TEMPLATE_KEYWORDS)) return 'team'
  if (includesAny(prompt, AGENT_KEYWORDS)) return 'single_agent'
  return 'unknown'
}

function detectOperation(prompt: string): AiBuilderOperation {
  const hasTemplateLanguage = includesAny(prompt, TEMPLATE_KEYWORDS)
  const hasAgentTemplateLanguage = includesAny(prompt, AGENT_TEMPLATE_KEYWORDS)
  if (hasTemplateLanguage && includesAny(prompt, NEW_TEMPLATE_KEYWORDS)) {
    return 'create_new'
  }
  if (hasAgentTemplateLanguage && !includesAny(prompt, EXISTING_TEMPLATE_KEYWORDS) && !includesAny(prompt, TEMPLATE_REFINE_KEYWORDS)) {
    return 'use_template'
  }
  if (hasTemplateLanguage && (includesAny(prompt, TEMPLATE_REFINE_KEYWORDS) || includesAny(prompt, EXISTING_TEMPLATE_KEYWORDS) || includesAny(prompt, REFINE_KEYWORDS))) {
    return 'refine_template'
  }
  if (hasTemplateLanguage || includesAny(prompt, AGENT_TEMPLATE_KEYWORDS)) return 'use_template'
  if ((includesAny(prompt, IMPROVE_EXISTING_KEYWORDS) || includesAny(prompt, REFINE_KEYWORDS)) && (includesAny(prompt, AGENT_KEYWORDS) || includesAny(prompt, REUSE_KEYWORDS))) {
    return 'improve_existing'
  }
  if (includesAny(prompt, REUSE_KEYWORDS) && includesAny(prompt, AGENT_KEYWORDS)) return 'reuse_existing'
  if (includesAny(prompt, CREATE_KEYWORDS) || includesAny(prompt, NEW_BUILD_KEYWORDS)) return 'create_new'
  return 'unknown'
}

function scoreRecord(tokens: string[], record: SearchableRecord): number {
  let score = 0
  const haystack = record.haystack
  for (const token of tokens) {
    if (!token) continue
    if (haystack.includes(token)) score += 3
    if (record.name.toLowerCase().includes(token)) score += 4
    if (record.id.toLowerCase().includes(token)) score += 2
  }
  return score
}

function countRecordMatches(tokens: string[], record: SearchableRecord): number {
  let matches = 0
  const haystack = record.haystack
  for (const token of tokens) {
    if (haystack.includes(token)) matches++
  }
  return matches
}

type IntentDecision = {
  intent: AiBuilderIntent
  scope: AiBuilderScope
  operation: AiBuilderOperation
  confidence: AiBuilderConfidence
}

function toAgentRecord(agent: AgentInfo): SearchableRecord {
  return {
    id: agent.id,
    name: agent.name || agent.id,
    summary: normalizeText([
      agent.status !== 'unknown' ? agent.status : '',
      agent.skills?.length ? `Skills: ${agent.skills.join(', ')}` : '',
      agent.tags?.length ? `Tags: ${agent.tags.join(', ')}` : '',
      agent.groups?.length ? `Groups: ${agent.groups.map((group) => group.name).join(', ')}` : '',
    ].filter(Boolean).join(' · ') || 'Existing workspace agent'),
    source: 'workspace',
    haystack: [
      agent.id,
      agent.name,
      ...(agent.tags || []),
      ...(agent.skills || []),
      ...(agent.groups || []).map((group) => group.name),
      ...(agent.communities || []).map((community) => community.name),
    ].map(normalizeText).join(' ').toLowerCase(),
  }
}

function toSkillRecord(skill: OpenClawSkill): SearchableRecord {
  return {
    id: skill.name,
    name: skill.name,
    summary: normalizeText(skill.description || 'Workspace skill'),
    source: skill.source,
    haystack: [
      skill.name,
      skill.description,
      ...(skill.tags || []),
      ...(skill.registryCategories || []),
      ...(skill.requires?.bins || []),
    ].map(normalizeText).join(' ').toLowerCase(),
  }
}

function toWorkflowRecord(workflow: Workflow): SearchableRecord {
  return {
    id: workflow.id,
    name: workflow.name,
    summary: normalizeText(workflow.description || workflow.schedule || 'Workspace workflow'),
    source: 'workspace',
    haystack: [
      workflow.id,
      workflow.name,
      workflow.description,
      workflow.schedule,
      ...(workflow.targeting?.groups || []),
      ...(workflow.targeting?.communities || []),
      ...(workflow.targeting?.tags || []),
    ].map(normalizeText).join(' ').toLowerCase(),
  }
}

function toTemplateRecord(template: Template): SearchableRecord {
  const participants = template.type === 'organization'
    ? template.agents.map((agent) => `${agent.name || agent.id} ${agent.role}`).join(' ')
    : template.agents.map((agent) => `${agent.name || agent.id} ${agent.role}`).join(' ')

  return {
    id: template.slug || template.name,
    name: template.name,
    summary: normalizeText(template.description || `${template.type} template`),
    source: template.source,
    haystack: [
      template.slug,
      template.name,
      template.description,
      ...(template.tags || []),
      participants,
    ].map(normalizeText).join(' ').toLowerCase(),
  }
}

function rankAssets<T extends SearchableRecord>(
  tokens: string[],
  records: T[],
  type: AiBuilderMatchedAsset['type'],
): AiBuilderMatchedAsset[] {
  return records
    .map((record) => ({
      id: record.id,
      name: record.name,
      type,
      summary: record.summary,
      score: scoreRecord(tokens, record),
      matchCount: countRecordMatches(tokens, record),
      source: record.source,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)
}

function buildClarifyingQuestions(prompt: string, intent: AiBuilderIntent, matches: AiBuilderRecommendation['matchedAssets']): string[] {
  const questions: string[] = []
  if (!includesAny(prompt, ['one agent', 'single agent', 'team', 'company', 'organization', 'team of teams', 'multi-team'])) {
    questions.push('Is this best handled by one agent or a coordinated team?')
  }
  if (intent === 'skill_or_integration') {
    questions.push('Is the main gap a missing integration/tool, or do you need a new agent role too?')
  }
  if ((intent === 'team_template' || intent === 'ai_generate') && matches.organizationTemplates.length === 0) {
    questions.push('What are the 2-4 core roles or lanes this setup must include?')
  }
  if (matches.agents.length > 0 && !includesAny(prompt, CREATE_KEYWORDS)) {
    questions.push('Do you want to reuse an existing workspace agent first before creating anything new?')
  }
  if (!includesAny(prompt, ['test', 'verify', 'validate'])) {
    questions.push('How would you like to test the result once it is created?')
  }
  return questions.slice(0, 4)
}

function buildConfirmationOptions(args: {
  prompt: string
  scope: AiBuilderScope
  operation: AiBuilderOperation
  confidence: AiBuilderConfidence
  matchedAgents: AiBuilderMatchedAsset[]
  matchedAgentTemplates: AiBuilderMatchedAsset[]
  matchedOrganizationTemplates: AiBuilderMatchedAsset[]
}): AiBuilderRecommendation['confirmationOptions'] {
  const { prompt, scope, operation, confidence, matchedAgents, matchedAgentTemplates, matchedOrganizationTemplates } = args
  if (confidence !== 'low') return []

  const options: AiBuilderRecommendation['confirmationOptions'] = []
  const topAgent = matchedAgents[0]
  const topAgentTemplate = matchedAgentTemplates[0]
  const topOrgTemplate = matchedOrganizationTemplates[0]

  if (topAgent) {
    options.push({
      id: 'confirm-existing-agent',
      label: `Use ${topAgent.name}`,
      prompt: `${prompt}\n\nConfirmation: reuse and improve my existing agent ${topAgent.name}.`,
      reasoning: `${topAgent.name} already overlaps with the request.`,
    })
  }
  if (scope === 'team' || scope === 'team_of_teams' || topOrgTemplate) {
    options.push({
      id: 'confirm-team-template',
      label: topOrgTemplate ? `Use ${topOrgTemplate.name}` : 'Use a team template',
      prompt: `${prompt}\n\nConfirmation: I want a coordinated team or team template, not a single agent.`,
      reasoning: topOrgTemplate
        ? `${topOrgTemplate.name} is the closest multi-role starting point.`
        : 'The request sounds multi-role and coordination-heavy.',
    })
  }
  if (scope === 'team' || scope === 'team_of_teams') {
    options.push({
      id: 'confirm-new-team-template',
      label: scope === 'team_of_teams' ? 'Create a new company template' : 'Create a new team template',
      prompt: `${prompt}\n\nConfirmation: create a new team template from this request instead of reusing a generic one.`,
      reasoning: 'Use a fresh team template when the existing matches are too generic for the actual domain.',
    })
  }
  if (topAgentTemplate) {
    options.push({
      id: 'confirm-agent-template',
      label: `Use ${topAgentTemplate.name}`,
      prompt: `${prompt}\n\nConfirmation: create a new agent from the ${topAgentTemplate.name} template.`,
      reasoning: `${topAgentTemplate.name} looks like the closest single-agent template match.`,
    })
  }
  if (operation === 'create_new' || options.length < 2) {
    options.push({
      id: 'confirm-generate-new',
      label: 'Create something new',
      prompt: `${prompt}\n\nConfirmation: create a new solution instead of reusing the current workspace assets.`,
      reasoning: 'Use a fresh build path if the current assets are only partial matches.',
    })
  }

  return options.slice(0, 3)
}

function chooseIntent(args: {
  prompt: string
  tokenCount: number
  matchedAgents: AiBuilderMatchedAsset[]
  matchedSkills: AiBuilderMatchedAsset[]
  matchedAgentTemplates: AiBuilderMatchedAsset[]
  matchedOrganizationTemplates: AiBuilderMatchedAsset[]
}): IntentDecision {
  const { prompt, tokenCount, matchedAgents, matchedSkills, matchedAgentTemplates, matchedOrganizationTemplates } = args
  const scope = detectScope(prompt)
  const operation = detectOperation(prompt)
  const hasTeamLanguage = scope === 'team' || scope === 'team_of_teams'
  const hasSkillLanguage = includesAny(prompt, SKILL_KEYWORDS)
  const hasReuseLanguage = includesAny(prompt, REUSE_KEYWORDS)
  const hasTemplateLanguage = includesAny(prompt, TEMPLATE_KEYWORDS)
  const hasAgentTemplateLanguage = includesAny(prompt, AGENT_TEMPLATE_KEYWORDS)
  const hasRefineLanguage = includesAny(prompt, REFINE_KEYWORDS)
  const wantsSomethingNew = includesAny(prompt, NEW_BUILD_KEYWORDS)
  const hasAmbiguityLanguage = includesAny(prompt, AMBIGUITY_KEYWORDS)
  const agentScore = topScore(matchedAgents)
  const agentTemplateScore = topScore(matchedAgentTemplates)
  const orgTemplateScore = topScore(matchedOrganizationTemplates)
  const strongestTemplateScore = Math.max(agentTemplateScore, orgTemplateScore)
  const topAgentTemplate = matchedAgentTemplates[0]
  const existingAgentPreferred = matchedAgents.length > 0
    && (operation === 'reuse_existing'
      || operation === 'improve_existing'
      || (hasReuseLanguage && !hasTemplateLanguage && !wantsSomethingNew)
      || (hasRefineLanguage && hasReuseLanguage && agentScore >= strongestTemplateScore)
      || (!wantsSomethingNew && agentScore >= 8 && agentScore >= strongestTemplateScore + 3))

  if (hasAgentTemplateLanguage && matchedAgentTemplates.length > 0) {
    return { intent: 'agent_template', scope, operation, confidence: hasAmbiguityLanguage ? 'low' : (agentTemplateScore >= 7 ? 'high' : 'medium') }
  }

  if (hasSkillLanguage && matchedSkills.length > 0) {
    return { intent: 'skill_or_integration', scope, operation, confidence: matchedSkills[0].score >= 8 ? 'high' : 'medium' }
  }

  if (scope === 'single_agent' && (operation === 'reuse_existing' || operation === 'improve_existing')) {
    const confidence: AiBuilderConfidence = hasAmbiguityLanguage
      ? 'low'
      : matchedAgents.length > 0
        ? (agentScore >= Math.max(strongestTemplateScore + 2, 8) ? 'high' : 'medium')
        : 'medium'
    return { intent: 'existing_agent', scope, operation, confidence }
  }

  if (scope === 'team_of_teams') {
    return { intent: 'team_template', scope, operation, confidence: hasAmbiguityLanguage ? 'low' : (orgTemplateScore >= 8 ? 'high' : 'medium') }
  }

  if (operation === 'refine_template' && scope !== 'single_agent' && matchedOrganizationTemplates.length > 0) {
    return { intent: 'team_template', scope, operation, confidence: hasAmbiguityLanguage ? 'low' : (orgTemplateScore >= 6 ? 'high' : 'medium') }
  }

  if (operation === 'refine_template' && matchedAgentTemplates.length > 0) {
    return { intent: 'agent_template', scope, operation, confidence: hasAmbiguityLanguage ? 'low' : (agentTemplateScore >= 6 ? 'high' : 'medium') }
  }

  if (
    scope === 'single_agent'
    && operation !== 'reuse_existing'
    && operation !== 'improve_existing'
    && matchedAgentTemplates.length > 0
    && !hasSkillLanguage
    && (
      operation !== 'create_new'
      || (
        agentTemplateScore >= 9
        && ((topAgentTemplate?.matchCount || 0) / Math.max(tokenCount, 1)) >= 0.6
      )
    )
  ) {
    const confidence: AiBuilderConfidence = hasAmbiguityLanguage ? 'low' : (matchedOrganizationTemplates.length > 0 && orgTemplateScore >= agentTemplateScore ? 'low' : (agentTemplateScore >= 7 ? 'high' : 'medium'))
    return { intent: 'agent_template', scope, operation, confidence }
  }

  if (hasTemplateLanguage && matchedOrganizationTemplates.length > 0 && (hasTeamLanguage || orgTemplateScore >= agentTemplateScore)) {
    return { intent: 'team_template', scope, operation, confidence: hasAmbiguityLanguage ? 'low' : (orgTemplateScore >= 7 ? 'high' : 'medium') }
  }

  if ((hasTemplateLanguage || hasAgentTemplateLanguage) && matchedAgentTemplates.length > 0) {
    return { intent: 'agent_template', scope, operation, confidence: hasAmbiguityLanguage ? 'low' : (agentTemplateScore >= 7 ? 'high' : 'medium') }
  }

  if (existingAgentPreferred) {
    const confidence: AiBuilderConfidence = hasAmbiguityLanguage ? 'low' : (strongestTemplateScore >= agentScore - 1 ? 'low' : (agentScore >= 8 ? 'high' : 'medium'))
    return { intent: 'existing_agent', scope, operation, confidence }
  }

  if (
    scope === 'single_agent'
    && operation === 'create_new'
    && !hasTemplateLanguage
    && !hasAgentTemplateLanguage
    && (
      agentTemplateScore < 9
      || ((topAgentTemplate?.matchCount || 0) <= 1 && tokenCount >= 3)
      || (((topAgentTemplate?.matchCount || 0) / Math.max(tokenCount, 1)) < 0.6 && tokenCount >= 4)
    )
  ) {
    return { intent: 'ai_generate', scope, operation, confidence: 'medium' }
  }

  if (matchedOrganizationTemplates.length > 0 && (hasTeamLanguage || orgTemplateScore >= Math.max(agentScore + 2, 7))) {
    const confidence: AiBuilderConfidence = hasAmbiguityLanguage ? 'low' : (agentScore >= orgTemplateScore - 1 ? 'low' : 'high')
    return { intent: 'team_template', scope, operation, confidence }
  }

  if (matchedAgentTemplates.length > 0 && (agentTemplateScore >= Math.max(agentScore + 2, 7) || (hasRefineLanguage && !hasReuseLanguage))) {
    const confidence: AiBuilderConfidence = hasAmbiguityLanguage ? 'low' : (agentScore >= agentTemplateScore - 1 ? 'low' : 'high')
    return { intent: 'agent_template', scope, operation, confidence }
  }

  if (wantsSomethingNew && strongestTemplateScore === 0) {
    return { intent: 'ai_generate', scope, operation, confidence: 'medium' }
  }

  if (hasTeamLanguage) {
    return { intent: 'team_template', scope, operation, confidence: orgTemplateScore > 0 ? 'medium' : 'low' }
  }

  return { intent: 'ai_generate', scope, operation, confidence: strongestTemplateScore > 0 || agentScore > 0 ? 'low' : 'medium' }
}

function action(id: string, label: string, description: string, page: AiBuilderAction['page'], actionValue?: AiBuilderAction['action'], pageHint?: string): AiBuilderAction {
  return { id, label, description, page, action: actionValue, pageHint }
}

function getSpecificPromptTokens(prompt: string): string[] {
  return tokenize(prompt).filter((token) => (
    token.length > 3
    && !NON_SCORING_TOKENS.has(token)
    && !TEAM_KEYWORDS.includes(token)
    && !AGENT_KEYWORDS.includes(token)
    && !CREATE_KEYWORDS.includes(token)
    && !REUSE_KEYWORDS.includes(token)
    && !REFINE_KEYWORDS.includes(token)
  ))
}

function countTokenOverlapInText(tokens: string[], text: string): number {
  const normalized = normalizeText(text).toLowerCase()
  if (!normalized) return 0
  return tokens.filter((token) => normalized.includes(token)).length
}

function shouldPreferNewTeamTemplate(args: {
  prompt: string
  scope: AiBuilderScope
  operation: AiBuilderOperation
  matchedOrganizationTemplates: AiBuilderMatchedAsset[]
  organizationTemplates: OrganizationTemplate[]
}): boolean {
  const { prompt, scope, operation, matchedOrganizationTemplates, organizationTemplates } = args
  if (scope !== 'team' && scope !== 'team_of_teams') return false
  const topOrgTemplate = matchedOrganizationTemplates[0]
  if (!topOrgTemplate) return true
  const domainTokens = getSpecificPromptTokens(prompt)
  const matchedTemplate = organizationTemplates.find((template) => (
    (template.slug || template.name) === topOrgTemplate.id || template.name === topOrgTemplate.name
  ))
  const haystack = [
    matchedTemplate?.slug,
    matchedTemplate?.name,
    matchedTemplate?.description,
    ...(matchedTemplate?.tags || []),
    ...(matchedTemplate?.agents || []).flatMap((agent) => [agent.id, agent.name, agent.role]),
  ].filter(Boolean).join(' ')
  const overlap = countTokenOverlapInText(domainTokens, haystack)
  const overlapRatio = domainTokens.length > 0 ? overlap / domainTokens.length : 0
  const looksGeneric = overlap === 0 || (domainTokens.length >= 3 && overlapRatio < 0.34)
  if (operation === 'create_new') return looksGeneric || topOrgTemplate.score < 10
  if (operation === 'unknown') return looksGeneric && topOrgTemplate.score < 11
  return false
}

export function buildAiBuilderRecommendation(prompt: string): AiBuilderRecommendation {
  const normalizedPrompt = normalizeText(prompt)
  const tokens = tokenize(normalizedPrompt)
  const templates = listTemplates()
  const agentTemplates = templates.filter((template): template is AgentTemplate => template.type === 'agent')
  const organizationTemplates = templates.filter((template): template is OrganizationTemplate => template.type === 'organization')
  const agents = listAgents().filter((agent) => !agent.archived)
  const skills = listAvailableSkills()
  const workflows = listWorkflows()

  const matchedAgents = rankAssets(tokens, agents.map(toAgentRecord), 'agent')
  const matchedSkills = rankAssets(tokens, skills.map(toSkillRecord), 'skill')
  const matchedAgentTemplates = rankAssets(tokens, agentTemplates.map(toTemplateRecord), 'agent-template')
  const matchedOrganizationTemplates = rankAssets(tokens, organizationTemplates.map(toTemplateRecord), 'organization-template')
  const matchedWorkflows = rankAssets(tokens, workflows.map(toWorkflowRecord), 'workflow')

  const decision = chooseIntent({
    prompt: normalizedPrompt,
    tokenCount: tokens.length,
    matchedAgents,
    matchedSkills,
    matchedAgentTemplates,
    matchedOrganizationTemplates,
  })
  const { intent, scope, operation, confidence } = decision

  const clarifyingQuestions = buildClarifyingQuestions(normalizedPrompt, intent, {
    agents: matchedAgents,
    skills: matchedSkills,
    agentTemplates: matchedAgentTemplates,
    organizationTemplates: matchedOrganizationTemplates,
    workflows: matchedWorkflows,
  })
  const confirmationOptions = buildConfirmationOptions({
    prompt: normalizedPrompt,
    scope,
    operation,
    confidence,
    matchedAgents,
    matchedAgentTemplates,
    matchedOrganizationTemplates,
  })

  const topAgent = matchedAgents[0]
  const topSkill = matchedSkills[0]
  const topAgentTemplate = matchedAgentTemplates[0]
  const topOrgTemplate = matchedOrganizationTemplates[0]
  const preferNewTeamTemplate = shouldPreferNewTeamTemplate({
    prompt: normalizedPrompt,
    scope,
    operation,
    matchedOrganizationTemplates,
    organizationTemplates,
  })
  const teamTemplateDraftTarget: AiBuilderAction['templateDraftTarget'] = scope === 'team_of_teams' ? 'company' : 'team'

  let recommendedPath: AiBuilderRecommendation['recommendedPath']
  let alternativePaths: AiBuilderRecommendation['alternativePaths'] = []
  let suggestedActions: AiBuilderAction[] = []
  let testPlan: string[] = []

  switch (intent) {
    case 'existing_agent':
      recommendedPath = {
        title: topAgent ? `Start with existing agent ${topAgent.name}` : 'Start with an existing workspace agent',
        reasoning: topAgent
          ? `${topAgent.name} already overlaps with this request, so the fastest path is to test or refine that agent before creating something new.`
          : 'An existing workspace agent is the lowest-friction path if it already covers most of the use case.',
        primaryAction: action('reuse-agent', 'Open Agents', 'Review or test the closest existing agent in this workspace.', 'agents'),
      }
      alternativePaths = [
        {
          title: 'Use an agent template instead',
          reasoning: 'If the existing agent is close but not cleanly aligned, a template may be a faster starter than editing by hand.',
          action: action('open-agent-templates', 'Browse agent templates', 'Look for a cleaner role match in the template catalog.', 'templates'),
        },
        {
          title: 'Generate a fresh agent from AI',
          reasoning: 'Use this if the current workspace agents are too far from the actual job to be done.',
          action: action('ai-generate-agent', 'AI Generate Agent', 'Create a new agent with a sharper prompt for this use case.', 'agents', 'create-ai'),
        },
      ]
      suggestedActions = [
        recommendedPath.primaryAction,
        action('test-agent-chat', 'Test in agent chat', 'Send a representative prompt to the chosen agent and inspect the response quality.', 'agents'),
        action('review-skills', 'Review agent skills', 'Check whether the agent is missing an integration or tool capability.', 'skills'),
      ]
      testPlan = [
        'Open the closest existing agent and send a real first prompt from your use case.',
        'Confirm whether the agent has the right role, model, and required skills.',
        'If the response is close but limited, add the missing skill or refine the identity before creating a new agent.',
      ]
      break
    case 'skill_or_integration':
      recommendedPath = {
        title: topSkill ? `Add or use skill ${topSkill.name}` : 'Resolve the missing skill or integration first',
        reasoning: topSkill
          ? `The request sounds tool-driven, and ${topSkill.name} looks like the closest capability match.`
          : 'The main gap appears to be capability or integration, not agent structure.',
        primaryAction: action('open-skills', 'Open Skills', 'Browse or assign matching skills before creating new agents.', 'skills'),
      }
      alternativePaths = [
        {
          title: 'Use an existing agent plus a skill',
          reasoning: 'If there is already a close agent in the workspace, adding a skill is lighter than spinning up a new role.',
          action: action('open-agents-for-skill', 'Review agents', 'Pick the closest existing agent and add the needed skill.', 'agents'),
        },
        {
          title: 'Create a new agent with the skill in mind',
          reasoning: 'If no existing agent fits the job, create a purpose-built agent after choosing the needed tools.',
          action: action('ai-generate-agent-with-skill', 'AI Generate Agent', 'Generate a new agent once the tool/integration choice is clear.', 'agents', 'create-ai'),
        },
      ]
      suggestedActions = [
        recommendedPath.primaryAction,
        action('browse-agent-templates', 'Browse templates', 'Check whether a template already includes the right role and tools.', 'templates'),
        action('verify-setup', 'Verify setup requirements', 'Confirm keys, binaries, or auth are available for the target skill.', 'skills'),
      ]
      testPlan = [
        'Open the skill and confirm setup requirements, keys, and local binaries are satisfied.',
        'Assign the skill to the target agent or create a new agent with that capability in mind.',
        'Run one real task that forces the integration to be used, not just a generic chat exchange.',
      ]
      break
    case 'agent_template':
      recommendedPath = {
        title: topAgentTemplate ? `Start from agent template ${topAgentTemplate.name}` : 'Start from an agent template',
        reasoning: topAgentTemplate
          ? `${topAgentTemplate.name} is the closest role match and should be faster than building a single agent from scratch.`
          : 'A role-specific agent template is likely the fastest path for a focused use case.',
        primaryAction: action('open-agent-template-library', 'Open Templates', 'Use a matching agent template as the starting point.', 'templates'),
      }
      alternativePaths = [
        {
          title: 'Reuse an existing workspace agent',
          reasoning: 'If there is already a close agent in the workspace, refining it may be even faster.',
          action: action('reuse-existing-agent', 'Open Agents', 'Check whether a current agent already covers most of the need.', 'agents'),
        },
        {
          title: 'Generate a custom agent from AI',
          reasoning: 'Use this if the template is close but still too generic for the actual job.',
          action: action('generate-custom-agent', 'AI Generate Agent', 'Create a more tailored agent from the prompt.', 'agents', 'create-ai'),
        },
      ]
      suggestedActions = [
        recommendedPath.primaryAction,
        action('compare-existing-agents', 'Compare existing agents', 'Make sure you are not duplicating a role already present in the workspace.', 'agents'),
        action('plan-first-test', 'Plan first test', 'Prepare the first prompt you will use to validate the created agent.', 'builder'),
      ]
      testPlan = [
        'Apply the template and review the generated identity, tools, and model before first use.',
        'Send a real task prompt that matches the actual job this agent should perform.',
        'If the agent is close but generic, refine the identity or clone into a workspace-specific variant.',
      ]
      break
    case 'team_template':
      recommendedPath = preferNewTeamTemplate
        ? {
            title: scope === 'team_of_teams' ? 'Create a new company template' : 'Create a new team template',
            reasoning: topOrgTemplate
              ? `${topOrgTemplate.name} is the closest existing team template, but it still looks too generic for this request, so a new AI-created template is the better starting point.`
              : 'This request sounds multi-role and domain-specific, so a new AI-created team template is the best starting point.',
            primaryAction: {
              ...action(
                'create-team-template',
                scope === 'team_of_teams' ? 'AI Create Company Template' : 'AI Create Team Template',
                scope === 'team_of_teams'
                  ? 'Create a new company or team-of-teams template from this prompt.'
                  : 'Create a new team template from this prompt.',
                'templates',
                'create-ai',
              ),
              templateDraftTarget: teamTemplateDraftTarget,
              prefillPrompt: normalizedPrompt,
            },
          }
        : {
            title: topOrgTemplate ? `Start from team template ${topOrgTemplate.name}` : 'Start from a team or organization template',
            reasoning: topOrgTemplate
              ? `${topOrgTemplate.name} already suggests multiple roles and handoffs, which fits this request better than a single agent.`
              : 'The request sounds multi-role and coordination-heavy, so a team template is a better fit than a standalone agent.',
            primaryAction: topOrgTemplate
              ? {
                  ...action('refine-top-team-template', 'Refine Template', 'Open the closest team template in the AI editor and refine it with this prompt.', 'templates', 'create-ai'),
                  templateDraftTarget: teamTemplateDraftTarget,
                  templateId: topOrgTemplate.id,
                  templateName: topOrgTemplate.name,
                  templateType: 'organization' as const,
                  templateRefineMode: true,
                  prefillPrompt: normalizedPrompt,
                }
              : action('open-team-template-library', 'Open Templates', 'Apply or refine a matching team template.', 'templates'),
          }
      alternativePaths = [
        ...(topOrgTemplate ? [{
          title: `Refine ${topOrgTemplate.name}`,
          reasoning: 'Use the closest existing template as a starting point if you want to adapt it instead of starting net-new.',
          action: {
            ...action('refine-team-template', 'Refine Template', 'Open the closest team template in the AI editor and refine it with this prompt.', 'templates', 'create-ai'),
            templateDraftTarget: teamTemplateDraftTarget,
            templateId: topOrgTemplate.id,
            templateName: topOrgTemplate.name,
            templateType: 'organization' as const,
            templateRefineMode: true,
            prefillPrompt: normalizedPrompt,
          },
        }] : []),
        {
          title: 'Use a single agent first',
          reasoning: 'If the work is still exploratory, prove the workflow with one agent before creating a full team.',
          action: action('start-single-agent', 'Open Agents', 'Prototype the core job with one agent first.', 'agents'),
        },
        {
          title: 'Generate a custom team from AI',
          reasoning: 'Use AI generation if the available templates are close but do not reflect the right lanes or handoffs.',
          action: {
            ...action('generate-custom-team', 'Open Templates', 'Use AI template generation for a custom organization/team starter.', 'templates', 'create-ai'),
            templateDraftTarget: teamTemplateDraftTarget,
            prefillPrompt: normalizedPrompt,
          },
        },
      ]
      suggestedActions = [
        recommendedPath.primaryAction,
        ...(topOrgTemplate ? [{
          ...action('review-existing-team-template', 'Refine Template', 'Open the closest team template in the AI editor with this prompt as refinement context.', 'templates', 'create-ai'),
          templateDraftTarget: teamTemplateDraftTarget,
          templateId: topOrgTemplate.id,
          templateName: topOrgTemplate.name,
          templateType: 'organization' as const,
          templateRefineMode: true,
          prefillPrompt: normalizedPrompt,
        }] : []),
        action('review-workflows', 'Review workflows', 'Check kickoff, specialist lanes, and final output flow before applying.', 'workflows'),
        action('review-org-shape', 'Review organization structure', 'Confirm the resulting groups and communities fit the intended collaboration model.', 'organizations'),
      ]
      testPlan = [
        preferNewTeamTemplate
          ? 'Generate the new team template, then inspect the created agents, groups, and workflows before saving or applying.'
          : 'Apply the team template into the active workspace and inspect the created agents, groups, and workflows.',
        'Run the kickoff workflow or send a coordinated first prompt through the intended team entry point.',
        'Confirm handoffs, group structure, and final output match how the team is supposed to operate.',
      ]
      break
    case 'ai_generate':
    default:
      recommendedPath = {
        title: 'Generate a custom starter from AI',
        reasoning: 'This request appears specific enough that a custom generated agent or team starter is likely the fastest path.',
        primaryAction: action('ai-generate-starter', 'AI Generate Agent', 'Use AI generation to create a first tailored draft from your prompt.', 'agents', 'create-ai'),
      }
      alternativePaths = [
        {
          title: 'Browse templates for a near match',
          reasoning: 'If a close template already exists, starting from it may be faster and more predictable.',
          action: action('browse-templates', 'Open Templates', 'Search system and local templates before generating from scratch.', 'templates'),
        },
        {
          title: 'Prototype with an existing agent',
          reasoning: 'If the need is still fuzzy, test the idea with one current agent before creating anything new.',
          action: action('prototype-with-agent', 'Open Agents', 'Use a nearby existing agent to validate the use case first.', 'agents'),
        },
      ]
      suggestedActions = [
        recommendedPath.primaryAction,
        action('review-templates-anyway', 'Browse templates', 'Sanity-check whether the catalog already has a strong starter.', 'templates'),
        action('define-test', 'Define success test', 'Write the first real prompt or workflow outcome you will use to validate the result.', 'builder'),
      ]
      testPlan = [
        'Generate the first draft and immediately review the role, scope, and success criteria for fit.',
        'Use one representative task prompt to see whether the draft solves the real use case.',
        'If the result requires coordination across roles, switch from single-agent generation to a team-template path.',
      ]
      break
  }

  return {
    intent,
    scope,
    operation,
    confidence,
    summary: confidence === 'low'
      ? `${recommendedPath.reasoning} I am not fully confident yet, so pick one of the confirmation paths below if needed.`
      : recommendedPath.reasoning,
    clarifyingQuestions,
    confirmationOptions,
    recommendedPath,
    alternativePaths,
    matchedAssets: {
      agents: matchedAgents,
      skills: matchedSkills,
      agentTemplates: matchedAgentTemplates,
      organizationTemplates: matchedOrganizationTemplates,
      workflows: matchedWorkflows,
    },
    suggestedActions,
    testPlan,
  }
}
