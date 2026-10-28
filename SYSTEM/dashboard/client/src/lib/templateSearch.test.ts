import { matchesAgentTemplateSearch, matchesOrganizationTemplateSearch, matchesTemplateCategory } from './templateSearch'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (err: any) {
    console.error(`✗ ${name}`)
    console.error(err.message)
    process.exitCode = 1
  }
}

const agentTemplate = {
  name: 'Release Engineer',
  description: 'Handles tags and release automation',
  author: 'ClawMax',
  tags: ['devops', 'release'],
  agents: [{ id: 'release-engineer', name: 'Release Engineer', role: 'release engineer', tags: ['git'] }],
  metadata: { basedOnSlug: 'release-engineer' },
}

const orgTemplate = {
  name: 'ClawMax Dev Team',
  description: 'A coordinated team for software delivery and release management.',
  author: 'ClawMax',
  kind: 'team',
  tags: ['engineering', 'delivery'],
  agents: [{ id: 'dev-lead', role: 'dev lead', tags: ['leadership'] }],
  teams: [{ id: 'dev-team', name: 'Dev Team', purpose: 'Build and release product', tags: ['software'] }],
  communities: [{ name: 'Dev Team' }],
  groups: [{ name: 'Dev Status' }],
  workflows: [{
    id: 'dev-kickoff',
    name: 'Dev Team Kickoff',
    description: 'Create sprint plan and assign release work',
    content: 'Post the sprint plan to Dev Status group',
    schedule: 'manual',
    owner: 'dev-lead',
    targeting: { communities: ['Dev Team'], groups: ['Dev Status'], tags: ['delivery'], agents: ['dev-lead'] },
  }],
  metadata: { basedOnSlug: 'clawmax-dev-team' },
}

test('agent template search matches core fields', () => {
  assert(matchesAgentTemplateSearch(agentTemplate, 'release'), 'Expected release query to match agent template')
  assert(matchesAgentTemplateSearch(agentTemplate, 'devops'), 'Expected tag query to match agent template')
})

test('organization template search matches workflow and channel fields', () => {
  assert(matchesOrganizationTemplateSearch(orgTemplate, 'dev'), 'Expected dev query to match organization template')
  assert(matchesOrganizationTemplateSearch(orgTemplate, 'status'), 'Expected group/workflow query to match organization template')
})

test('template search returns false for nonsense queries', () => {
  assert(!matchesAgentTemplateSearch(agentTemplate, 'zzznotfound'), 'Expected nonsense query to miss agent template')
  assert(!matchesOrganizationTemplateSearch(orgTemplate, 'zzznotfound'), 'Expected nonsense query to miss org template')
})

test('matchesTemplateCategory uses declared category and tags only, ignoring case', () => {
  const rows: Array<[string, { category?: unknown; tags?: unknown }, string, boolean]> = [
    ['declared category', { category: 'personal' }, 'personal', true],
    ['declared category in another case', { category: 'Technical' }, 'technical', true],
    ['matching tag', { tags: ['research', 'Personal'] }, 'personal', true],
    ['singular event tag counts as Events', { tags: ['event'] }, 'events', true],
    ['other category', { category: 'business', tags: ['technical-writing'] }, 'technical', false],
    ['tag that only contains the name', { tags: ['personal-finance'] }, 'personal', false],
    ['no category metadata is never guessed into a category', { tags: ['ceo', 'leadership'] }, 'business', false],
    ['no metadata at all', {}, 'personal', false],
    ['non-string metadata', { category: 7, tags: 'personal' }, 'personal', false],
    ['All accepts everything', {}, 'all', true],
  ]
  for (const [label, template, category, expected] of rows) {
    assert(matchesTemplateCategory(template, category) === expected, `${label}: expected ${expected} for ${category}`)
  }
})

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode)
}

console.log('templateSearch.test.ts: ok')
