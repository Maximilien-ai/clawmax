import nodeAssert from 'assert'
import {
  comparePromptQuality,
  PROMPT_QUALITY_EXCELLENT_SCORE,
  PROMPT_QUALITY_READY_SCORE,
  scorePromptQuality,
} from './promptQuality'

let assertionsRun = 0
const assert = Object.assign(
  (value: unknown, message?: string) => { assertionsRun++; nodeAssert(value, message) },
  { equal: (a: unknown, b: unknown, message?: string) => { assertionsRun++; nodeAssert.equal(a, b, message) } },
)

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
assert(workflow.facets.find((facet) => facet.id === 'domain')?.earned === 15, 'Workflow rules must recognize triggers and steps')
assert(workflow.suggestions.every((suggestion) => suggestion.earned < suggestion.max), 'Suggestions must only describe incomplete facets')

const skill = scorePromptQuality('Build a skill with instructions and examples for when an agent should use it.', 'skill')
assert((skill.facets.find((facet) => facet.id === 'domain')?.earned || 0) === 15, 'Skill rules must recognize usage and instruction detail')

const improvement = comparePromptQuality('Create an agent', detailed.facets.map((facet) => facet.suggestion).join(' '), 'builder')
assert.equal(improvement.delta, improvement.after - improvement.before, 'Prompt comparison must expose an exact score delta')
const regression = comparePromptQuality(detailed.facets.map((facet) => facet.suggestion).join(' '), 'Create an agent', 'builder')
assert(regression.delta < 0, 'Prompt comparison must identify a readiness regression without blocking the rewrite')

// The rubric must be worth exactly 100 for every domain, so a score can never exceed its own denominator.
for (const domain of ['general', 'agent', 'skill', 'template', 'workflow', 'plugin', 'builder'] as const) {
  const total = scorePromptQuality('x', domain).facets.reduce((sum, facet) => sum + facet.max, 0)
  assert(total === 100, `${domain} rubric maxes must total 100, got ${total}`)
  // A prompt that trips every pattern must never score past the denominator.
  const stuffed = scorePromptQuality('Create an agent role for the team to read input data and return a markdown report; it must never send without approval every day, verify success criteria, trigger the workflow step, use the tool skill plugin with a deliverable result, and explain when to use it.', domain)
  assert.equal(stuffed.score, 100, `${domain} must reach exactly 100 when all criteria are covered`)
  assert.equal(scorePromptQuality('  \n\t', domain).score, 0, `${domain} whitespace scores zero`)
  assert(stuffed.facets.every(facet => facet.earned >= 0 && facet.earned <= facet.max), `${domain} facets remain within their advertised bounds`)
}

const cues = {
  agent: ['analyst', 'memory'], skill: ['trigger', 'dependencies'],
  template: ['department', 'collaborate'], workflow: ['cron', 'participant'],
  plugin: ['setting', 'capability'], builder: ['reuse', 'deploy'], general: ['why', 'constraint'],
} as const
for (const domain of Object.keys(cues) as Array<keyof typeof cues>) {
  const [first, second] = cues[domain]
  const detail = (text: string) => scorePromptQuality(text, domain).facets.find(facet => facet.id === 'domain')!
  assert.equal(detail(first).earned, 8, `${domain} first domain rule remains independently useful`)
  assert.equal(detail(second).earned, 7, `${domain} second domain rule remains independently useful`)
  assert.equal(detail('zzzzz').earned, 0, `${domain} grants no detail points without either rule`)
  assert.equal(detail(`${first} ${second}`).max, 15, `${domain} domain detail advertises its actual ceiling`)
}
assert.equal(PROMPT_QUALITY_READY_SCORE, 80, 'Readiness remains advisory at the existing threshold')
assert.equal(PROMPT_QUALITY_EXCELLENT_SCORE, 90, 'Excellent retains the existing threshold')
console.log(`promptQuality.test.ts: ${assertionsRun} tests passed`)
