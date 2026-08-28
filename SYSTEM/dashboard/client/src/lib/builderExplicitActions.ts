const CREATE_KEYWORDS = ['create', 'build', 'design', 'new', 'from scratch', 'generate']
const REFINE_KEYWORDS = ['refine', 'improve', 'edit', 'update', 'adjust', 'tune']
const AGENT_KEYWORDS = ['agent', 'assistant', 'helper', 'specialist']
const WORKFLOW_KEYWORDS = ['workflow', 'workflows', 'handoff', 'handoffs', 'sequence', 'pipeline', 'steps', 'process', 'weekly', 'monthly', 'daily', 'recurring', 'review', 'approval', 'follow-up']
const SKILL_KEYWORDS = ['skill', 'skills', 'tool', 'tools', 'integration', 'integrations']

export type BuilderCreateTarget = 'agent' | 'team' | 'company' | 'workflow' | 'skill'

export function hasExplicitBuilderEntityAction(prompt: string, entity: 'agent' | 'workflow' | 'skill'): boolean {
  const normalized = prompt.toLowerCase()
  const entityWords = entity === 'agent' ? AGENT_KEYWORDS : entity === 'workflow' ? WORKFLOW_KEYWORDS : SKILL_KEYWORDS
  return [...CREATE_KEYWORDS, ...REFINE_KEYWORDS].some((word) => normalized.includes(word))
    && entityWords.some((word) => normalized.includes(word))
}

export function requiredBuilderCreateTargets(prompt: string): BuilderCreateTarget[] {
  const normalized = prompt.toLowerCase()
  const hasAgentLanguage = /\b(?:agents?|assistants?|helpers?|specialists?)\b/.test(normalized)
  const intentWords = [...CREATE_KEYWORDS, 'existing', 'already have', 'reuse', 'use my', 'current', 'need', 'want', 'using']
  const hasCreateOrUseLanguage = intentWords.some((word) => normalized.includes(word))
  const companyIntent = /\b(?:company|organization)\s+(?:of\s+)?(?:agents?|teams?)\b/.test(normalized)
    || /\b(?:company|organization)\s+template\b/.test(normalized)
    || (/\b(?:company|organization)\b/.test(normalized) && hasCreateOrUseLanguage)
  const teamIntent = !companyIntent && (
    /\bteam\s+(?:of\s+)?agents?\b/.test(normalized)
    || /\bteam\s+template\b/.test(normalized)
    || (/\bteams?\b/.test(normalized) && hasCreateOrUseLanguage)
  )

  const targets: BuilderCreateTarget[] = []
  if (companyIntent) targets.push('company')
  else if (teamIntent) targets.push('team')
  else if (hasAgentLanguage) targets.push('agent')
  if (/\bworkflows?\b/.test(normalized)) targets.push('workflow')
  if (/\bskills?\b/.test(normalized)) targets.push('skill')
  return targets
}

export function selectBuilderSecondaryActions<T extends { label: string }>(actions: T[], usualLimit = 2): T[] {
  const requiredAiCreateActions = actions.filter((action) => action.label.startsWith('AI Create '))
  const otherActions = actions.filter((action) => !action.label.startsWith('AI Create '))
  return [
    ...requiredAiCreateActions,
    ...otherActions.slice(0, Math.max(0, usualLimit - requiredAiCreateActions.length)),
  ]
}
