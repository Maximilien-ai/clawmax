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

export interface AiBuilderAction {
  id: string
  label: string
  description: string
  page: 'builder' | 'agents' | 'templates' | 'skills' | 'workflows' | 'organizations'
  action?: 'create' | 'create-ai' | 'import'
  pageHint?: string
}

export interface AiBuilderMatchedAsset {
  id: string
  name: string
  type: 'agent' | 'skill' | 'agent-template' | 'organization-template' | 'workflow'
  summary: string
  score: number
  source?: string
}

export interface AiBuilderRecommendation {
  intent: AiBuilderIntent
  summary: string
  clarifyingQuestions: string[]
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
const SKILL_KEYWORDS = ['skill', 'skills', 'tool', 'tools', 'github', 'slack', 'whatsapp', 'gmail', 'calendar', 'integration', 'integrations', 'api', 'connect', 'connector']
const CREATE_KEYWORDS = ['create', 'build', 'design', 'new', 'from scratch', 'generate']
const REUSE_KEYWORDS = ['existing', 'already have', 'reuse', 'use my', 'current']
const TEMPLATE_KEYWORDS = ['template', 'templates', 'refine template', 'edit template', 'team template', 'organization template']
const AGENT_TEMPLATE_KEYWORDS = ['agent template', 'agent starter', 'create agent from template', 'use template for agent']
const REFINE_KEYWORDS = ['refine', 'improve', 'edit', 'update', 'adjust', 'tune']
const NEW_BUILD_KEYWORDS = ['new', 'from scratch', 'generate', 'net new']

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
      .filter((token) => token.length >= 3)
  ))
}

function includesAny(prompt: string, words: string[]): boolean {
  const normalized = prompt.toLowerCase()
  return words.some((word) => normalized.includes(word))
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
      source: record.source,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 5)
}

function buildClarifyingQuestions(prompt: string, intent: AiBuilderIntent, matches: AiBuilderRecommendation['matchedAssets']): string[] {
  const questions: string[] = []
  if (!includesAny(prompt, ['one agent', 'single agent', 'team', 'company', 'organization'])) {
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

function chooseIntent(args: {
  prompt: string
  matchedAgents: AiBuilderMatchedAsset[]
  matchedSkills: AiBuilderMatchedAsset[]
  matchedAgentTemplates: AiBuilderMatchedAsset[]
  matchedOrganizationTemplates: AiBuilderMatchedAsset[]
}): AiBuilderIntent {
  const { prompt, matchedAgents, matchedSkills, matchedAgentTemplates, matchedOrganizationTemplates } = args
  const hasTeamLanguage = includesAny(prompt, TEAM_KEYWORDS)
  const hasSkillLanguage = includesAny(prompt, SKILL_KEYWORDS)
  const hasReuseLanguage = includesAny(prompt, REUSE_KEYWORDS)
  const hasCreateLanguage = includesAny(prompt, CREATE_KEYWORDS)
  const hasTemplateLanguage = includesAny(prompt, TEMPLATE_KEYWORDS)
  const hasAgentTemplateLanguage = includesAny(prompt, AGENT_TEMPLATE_KEYWORDS)
  const hasRefineLanguage = includesAny(prompt, REFINE_KEYWORDS)
  const wantsSomethingNew = includesAny(prompt, NEW_BUILD_KEYWORDS)
  const agentScore = topScore(matchedAgents)
  const agentTemplateScore = topScore(matchedAgentTemplates)
  const orgTemplateScore = topScore(matchedOrganizationTemplates)
  const strongestTemplateScore = Math.max(agentTemplateScore, orgTemplateScore)

  if (hasSkillLanguage && matchedSkills.length > 0) return 'skill_or_integration'
  if (hasAgentTemplateLanguage && matchedAgentTemplates.length > 0) return 'agent_template'
  if (hasTemplateLanguage && hasTeamLanguage) return 'team_template'
  if (hasTemplateLanguage && matchedOrganizationTemplates.length > 0) return 'team_template'
  if ((hasTemplateLanguage || hasAgentTemplateLanguage) && matchedAgentTemplates.length > 0) return 'agent_template'
  if (hasTemplateLanguage && matchedAgentTemplates.length > 0) return 'agent_template'
  if (hasTeamLanguage && matchedOrganizationTemplates.length > 0 && (wantsSomethingNew || orgTemplateScore >= agentScore)) return 'team_template'
  if (hasReuseLanguage && matchedAgents.length > 0 && !hasTemplateLanguage && !wantsSomethingNew) return 'existing_agent'
  if (hasRefineLanguage && hasReuseLanguage && matchedAgents.length > 0 && agentScore >= strongestTemplateScore) return 'existing_agent'
  if (!wantsSomethingNew && matchedAgents.length > 0 && agentScore >= 8 && agentScore >= strongestTemplateScore + 3) return 'existing_agent'
  if (matchedOrganizationTemplates.length > 0 && (hasTeamLanguage || orgTemplateScore >= Math.max(agentScore + 2, 7))) return 'team_template'
  if (matchedAgentTemplates.length > 0 && (agentTemplateScore >= Math.max(agentScore + 2, 7) || (hasRefineLanguage && !hasReuseLanguage))) return 'agent_template'
  if (wantsSomethingNew && strongestTemplateScore === 0) return 'ai_generate'
  if (hasTeamLanguage) return 'team_template'
  return 'ai_generate'
}

function action(id: string, label: string, description: string, page: AiBuilderAction['page'], actionValue?: AiBuilderAction['action'], pageHint?: string): AiBuilderAction {
  return { id, label, description, page, action: actionValue, pageHint }
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

  const intent = chooseIntent({
    prompt: normalizedPrompt,
    matchedAgents,
    matchedSkills,
    matchedAgentTemplates,
    matchedOrganizationTemplates,
  })

  const clarifyingQuestions = buildClarifyingQuestions(normalizedPrompt, intent, {
    agents: matchedAgents,
    skills: matchedSkills,
    agentTemplates: matchedAgentTemplates,
    organizationTemplates: matchedOrganizationTemplates,
    workflows: matchedWorkflows,
  })

  const topAgent = matchedAgents[0]
  const topSkill = matchedSkills[0]
  const topAgentTemplate = matchedAgentTemplates[0]
  const topOrgTemplate = matchedOrganizationTemplates[0]

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
      recommendedPath = {
        title: topOrgTemplate ? `Start from team template ${topOrgTemplate.name}` : 'Start from a team or organization template',
        reasoning: topOrgTemplate
          ? `${topOrgTemplate.name} already suggests multiple roles and handoffs, which fits this request better than a single agent.`
          : 'The request sounds multi-role and coordination-heavy, so a team template is a better fit than a standalone agent.',
        primaryAction: action('open-team-template-library', 'Open Templates', 'Apply or refine a matching team template.', 'templates'),
      }
      alternativePaths = [
        {
          title: 'Use a single agent first',
          reasoning: 'If the work is still exploratory, prove the workflow with one agent before creating a full team.',
          action: action('start-single-agent', 'Open Agents', 'Prototype the core job with one agent first.', 'agents'),
        },
        {
          title: 'Generate a custom team from AI',
          reasoning: 'Use AI generation if the available templates are close but do not reflect the right lanes or handoffs.',
          action: action('generate-custom-team', 'Open Templates', 'Use AI template generation for a custom organization/team starter.', 'templates'),
        },
      ]
      suggestedActions = [
        recommendedPath.primaryAction,
        action('review-workflows', 'Review workflows', 'Check kickoff, specialist lanes, and final output flow before applying.', 'workflows'),
        action('review-org-shape', 'Review organization structure', 'Confirm the resulting groups and communities fit the intended collaboration model.', 'organizations'),
      ]
      testPlan = [
        'Apply the team template into the active workspace and inspect the created agents, groups, and workflows.',
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
    summary: recommendedPath.reasoning,
    clarifyingQuestions,
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
