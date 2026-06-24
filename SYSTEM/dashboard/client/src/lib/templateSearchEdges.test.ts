import assert from 'assert'
import { matchesAgentTemplateSearch, matchesOrganizationTemplateSearch } from './templateSearch'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

const agentTemplate = {
  name: 'Release Engineer',
  description: 'Handles tags and release automation',
  author: 'ClawMax',
  tags: ['devops', 'release'],
  agents: [{ id: 'release-engineer', name: 'Release Engineer', role: 'release engineer', tags: ['git'] }],
  metadata: { nested: { owner: 'platform-team' } },
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
  metadata: { nested: { owner: 'platform-team' } },
}

test('blank queries match agent templates', () => {
  assert.strictEqual(matchesAgentTemplateSearch(agentTemplate, '   '), true)
})

test('organization search matches nested metadata text', () => {
  assert.strictEqual(matchesOrganizationTemplateSearch(orgTemplate, 'platform-team'), true)
})

test('agent search is case-insensitive for agent names and roles', () => {
  assert.strictEqual(matchesAgentTemplateSearch(agentTemplate, 'RELEASE ENGINEER'), true)
})

test('organization search matches targeting agent ids', () => {
  assert.strictEqual(matchesOrganizationTemplateSearch(orgTemplate, 'dev-lead'), true)
})

console.log('templateSearchEdges.test.ts: ok')
