const CREATE_KEYWORDS = ['create', 'build', 'design', 'new', 'from scratch', 'generate']
const REFINE_KEYWORDS = ['refine', 'improve', 'edit', 'update', 'adjust', 'tune']
const AGENT_KEYWORDS = ['agent', 'assistant', 'helper', 'specialist']
const WORKFLOW_KEYWORDS = ['workflow', 'workflows', 'handoff', 'handoffs', 'sequence', 'pipeline', 'steps', 'process', 'weekly', 'monthly', 'daily', 'recurring', 'review', 'approval', 'follow-up']
const SKILL_KEYWORDS = ['skill', 'skills', 'tool', 'tools', 'integration', 'integrations']

export function hasExplicitBuilderEntityAction(prompt: string, entity: 'agent' | 'workflow' | 'skill'): boolean {
  const normalized = prompt.toLowerCase()
  const entityWords = entity === 'agent' ? AGENT_KEYWORDS : entity === 'workflow' ? WORKFLOW_KEYWORDS : SKILL_KEYWORDS
  return [...CREATE_KEYWORDS, ...REFINE_KEYWORDS].some((word) => normalized.includes(word))
    && entityWords.some((word) => normalized.includes(word))
}
