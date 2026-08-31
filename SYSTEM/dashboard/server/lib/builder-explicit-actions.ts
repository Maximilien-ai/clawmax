export type BuilderCreateTarget = 'agent' | 'team' | 'company' | 'workflow' | 'skill'

type BuilderEntity = 'agent' | 'workflow' | 'skill'

const CREATE_VERB_PATTERN = String.raw`(?:create|build|design|generate|make|set\s*up|spin\s*up|draft|develop)`
const ENTITY_PATTERNS: Record<BuilderCreateTarget, RegExp> = {
  agent: /\b(?:agents?|assistants?|helpers?|specialists?)\b/i,
  team: /\b(?:teams?|team\s+templates?)\b/i,
  company: /\b(?:companies|company|organizations?|company\s+templates?|organization\s+templates?)\b/i,
  workflow: /\b(?:workflows?)\b/i,
  skill: /\b(?:skills?)\b/i,
}

const NON_CREATION_QUESTION_PATTERNS = [
  /\bhow\s+(?:do|can|could|should|would)\b[^.!?]{0,80}\b(?:create|build|design|generate|make|set\s*up)\b/i,
  /\b(?:explain|show|tell)\s+(?:me\s+)?how\s+to\b[^.!?]{0,80}\b(?:create|build|design|generate|make|set\s*up)\b/i,
  /\b(?:can|could|should|would)\s+(?:an?|the|my|this|that)\s+(?:agent|assistant|helper|specialist)\b[^.!?]{0,50}\b(?:create|build|design|generate|make)\b/i,
]

const TARGET_IS_EXISTING_PATTERNS: Record<BuilderCreateTarget, RegExp> = {
  agent: /\b(?:my|our|the|this|that|an?)\s+(?:current|existing)\s+(?:agents?|assistants?|helpers?|specialists?)\b|\b(?:my|our|this|that)\s+(?:agents?|assistants?|helpers?|specialists?)\b/i,
  team: /\b(?:my|our|the|this|that|an?)\s+(?:current|existing)\s+(?:teams?|team\s+templates?)\b|\b(?:my|our|this|that)\s+(?:teams?|team\s+templates?)\b/i,
  company: /\b(?:my|our|the|this|that|an?)\s+(?:current|existing)\s+(?:companies|company|organizations?)\b|\b(?:my|our|this|that)\s+(?:companies|company|organizations?)\b/i,
  workflow: /\b(?:my|our|the|this|that|an?)\s+(?:current|existing)\s+workflows?\b|\b(?:my|our|this|that)\s+workflows?\b/i,
  skill: /\b(?:my|our|the|this|that|an?)\s+(?:current|existing)\s+skills?\b|\b(?:my|our|this|that)\s+skills?\b/i,
}

function normalizePrompt(prompt: string): string {
  return prompt.replace(/\s+/g, ' ').trim()
}

function creationClauses(prompt: string): string[] {
  const normalized = normalizePrompt(prompt)
  if (!normalized) return []

  const clauses: string[] = []
  for (const sentence of normalized.split(/[.!?;]/)) {
    if (!sentence || NON_CREATION_QUESTION_PATTERNS.some((pattern) => pattern.test(sentence))) continue
    const verb = new RegExp(`\\b${CREATE_VERB_PATTERN}\\b`, 'ig')
    for (const match of sentence.matchAll(verb)) {
      const prefix = sentence.slice(0, match.index || 0)
      if (/\b(?:agents?|assistants?|helpers?|specialists?|workflows?|skills?|teams?|companies|company|organizations?)\b[^.!?;]{0,50}\b(?:to|can|could|will|would|should)\s*$/i.test(prefix)) {
        continue
      }
      clauses.push(sentence.slice(match.index || 0))
    }

    const directRequest = sentence.match(/\b(?:i\s+(?:need|want)|we\s+(?:need|want)|give\s+me)\s+.+/ig)
    if (directRequest) clauses.push(...directRequest)
  }
  return clauses
}

function targetAppearsAsCreationObject(clause: string, target: BuilderCreateTarget): boolean {
  const match = ENTITY_PATTERNS[target].exec(clause)
  if (!match || match.index === undefined) return false

  const throughTarget = clause.slice(0, match.index + match[0].length)
  const targetContext = clause.slice(Math.max(0, match.index - 28), match.index + match[0].length)
  if (TARGET_IS_EXISTING_PATTERNS[target].test(targetContext)) return false

  // “Create a workflow for my agent” creates the workflow, not the agent.
  // The same boundary prevents capability/context nouns after “using” or “for”
  // from being promoted to extra AI Create actions.
  if (/\b(?:for|using|via|through|to|that|who|which)\b/i.test(throughTarget)) return false

  return true
}

export function requiredBuilderCreateTargets(prompt: string): BuilderCreateTarget[] {
  const detected = new Set<BuilderCreateTarget>()

  for (const clause of creationClauses(prompt)) {
    const clauseTargets = new Set<BuilderCreateTarget>()
    if (targetAppearsAsCreationObject(clause, 'agent')) clauseTargets.add('agent')
    if (targetAppearsAsCreationObject(clause, 'team')) clauseTargets.add('team')
    if (targetAppearsAsCreationObject(clause, 'company')) clauseTargets.add('company')

    if (targetAppearsAsCreationObject(clause, 'workflow')) clauseTargets.add('workflow')
    if (targetAppearsAsCreationObject(clause, 'skill')) clauseTargets.add('skill')

    if (/\b(?:teams?|team\s+templates?)\s+of\s+(?:agents?|assistants?|helpers?|specialists?)\b/i.test(clause)) {
      clauseTargets.delete('agent')
    }
    if (/\b(?:companies|company|organizations?|company\s+templates?|organization\s+templates?)\s+of\s+(?:teams?|agents?)\b/i.test(clause)) {
      clauseTargets.delete('agent')
      clauseTargets.delete('team')
    }
    if (clauseTargets.has('company')) {
      if (!/\b(?:and|,)\s+(?:an?\s+|one\s+|new\s+)?(?:agents?|assistants?|helpers?|specialists?)\b/i.test(clause)) {
        clauseTargets.delete('agent')
      }
      if (!/\b(?:and|,)\s+(?:an?\s+|one\s+|new\s+)?(?:teams?|team\s+templates?)\b/i.test(clause)) {
        clauseTargets.delete('team')
      }
    }
    for (const target of clauseTargets) detected.add(target)
  }

  return (['agent', 'team', 'company', 'workflow', 'skill'] as BuilderCreateTarget[])
    .filter((target) => detected.has(target))
}

export function hasExplicitBuilderEntityAction(prompt: string, entity: BuilderEntity): boolean {
  return requiredBuilderCreateTargets(prompt).includes(entity)
}

export function selectBuilderSecondaryActions<T extends { label: string }>(actions: T[], usualLimit = 2): T[] {
  const requiredAiCreateActions = actions.filter((action) => action.label.startsWith('AI Create '))
  const otherActions = actions.filter((action) => !action.label.startsWith('AI Create '))
  return [
    ...requiredAiCreateActions,
    ...otherActions.slice(0, Math.max(0, usualLimit - requiredAiCreateActions.length)),
  ]
}
