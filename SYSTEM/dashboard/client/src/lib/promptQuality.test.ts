import assert from 'assert'
import {
  comparePromptQuality,
  PROMPT_QUALITY_EXCELLENT_SCORE,
  PROMPT_QUALITY_READY_SCORE,
  scorePromptQuality,
} from './promptQuality'

const empty = scorePromptQuality('', 'agent')
assert.equal(empty.score, 0, 'Empty prompts must start at zero')
assert.equal(empty.ready, false, 'Empty prompts must not be ready')
assert(empty.suggestions.length > 0, 'Empty prompts must include improvement suggestions')

const vague = scorePromptQuality('Create an agent', 'agent')
const detailed = scorePromptQuality(
  'Create a customer support agent responsible for reviewing uploaded email messages and API records. '
  + 'It should use the Gmail skill, write a concise markdown summary with urgent items first, never expose private credentials, '
  + 'run every weekday, and verify success by listing the source message count and any failed records.',
  'agent',
)
assert(detailed.score > vague.score, 'Meaningful prompt detail must increase the score')
assert(detailed.score >= PROMPT_QUALITY_READY_SCORE, 'A complete agent prompt must be ready')
assert(detailed.score >= PROMPT_QUALITY_EXCELLENT_SCORE, 'A comprehensive agent prompt should be excellent')

const workflow = scorePromptQuality(
  'Every weekday at 9am, have the analyst read uploaded reports, then send a concise markdown blocker summary to the manager. '
  + 'Do not include private credentials. The run passes when every report is counted and the final result is verified.',
  'workflow',
)
assert(workflow.facets.find((facet) => facet.id === 'domain')?.earned === 20, 'Workflow rules must recognize triggers and steps')
assert(workflow.suggestions.every((suggestion) => suggestion.earned < suggestion.max), 'Suggestions must only describe incomplete facets')

const skill = scorePromptQuality('Build a skill with instructions and examples for when an agent should use it.', 'skill')
assert((skill.facets.find((facet) => facet.id === 'domain')?.earned || 0) === 20, 'Skill rules must recognize usage and instruction detail')

const improvement = comparePromptQuality('Create an agent', detailed.facets.map((facet) => facet.suggestion).join(' '), 'builder')
assert.equal(improvement.delta, improvement.after - improvement.before, 'Prompt comparison must expose an exact score delta')
const regression = comparePromptQuality(detailed.facets.map((facet) => facet.suggestion).join(' '), 'Create an agent', 'builder')
assert(regression.delta < 0, 'Prompt comparison must identify a readiness regression without blocking the rewrite')

console.log('promptQuality.test.ts: 12 tests passed')
