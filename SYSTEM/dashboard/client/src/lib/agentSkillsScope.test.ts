import assert from 'assert'
import { buildAgentSkillsScope, buildAssignedSkillBadges } from './agentSkillsScope'

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('buildAgentSkillsScope returns scoped title/subtitle for selected agent', () => {
  const result = buildAgentSkillsScope({
    agentId: 'astro-guide',
    initialAgentId: 'astro-guide',
    assignedSkillNames: ['github', 'workspace-ls'],
  })

  assert.equal(result.isAgentScoped, true)
  assert.equal(result.isInitialScoped, true)
  assert.equal(result.title, 'Skills for astro-guide')
  assert(result.subtitle.includes('astro-guide'))
  assert.equal(result.assignedCountLabel, '2 assigned')
})

test('buildAgentSkillsScope returns generic state when no agent is selected', () => {
  const result = buildAgentSkillsScope({
    agentId: '',
    initialAgentId: undefined,
    assignedSkillNames: [],
  })

  assert.equal(result.isAgentScoped, false)
  assert.equal(result.isInitialScoped, false)
  assert.equal(result.title, 'Skills')
  assert.equal(result.assignedCountLabel, '0 assigned')
})

test('buildAssignedSkillBadges preserves setup warnings for assigned skills', () => {
  const badges = buildAssignedSkillBadges(['github', 'workspace-ls'])
  const github = badges.find((badge) => badge.name === 'github')
  const workspaceLs = badges.find((badge) => badge.name === 'workspace-ls')

  assert.equal(github?.needsSetup, true)
  assert.equal(workspaceLs?.needsSetup, false)
})

console.log('agentSkillsScope.test.ts: 3 tests passed')
