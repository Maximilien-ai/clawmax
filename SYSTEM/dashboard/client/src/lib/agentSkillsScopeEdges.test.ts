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

test('initial scope is false when initial agent differs from current agent', () => {
  const result = buildAgentSkillsScope({
    agentId: 'astro-guide',
    initialAgentId: 'release-lead',
    assignedSkillNames: ['github'],
  })

  assert.strictEqual(result.isAgentScoped, true)
  assert.strictEqual(result.isInitialScoped, false)
})

test('assigned count label reflects zero and plural values', () => {
  assert.strictEqual(
    buildAgentSkillsScope({ agentId: 'astro-guide', assignedSkillNames: [] }).assignedCountLabel,
    '0 assigned',
  )
  assert.strictEqual(
    buildAgentSkillsScope({ agentId: 'astro-guide', assignedSkillNames: ['a', 'b', 'c'] }).assignedCountLabel,
    '3 assigned',
  )
})

test('buildAssignedSkillBadges preserves order of assigned skill names', () => {
  const badges = buildAssignedSkillBadges(['workspace-ls', 'github', 'resend'])
  assert.deepStrictEqual(badges.map((badge) => badge.name), ['workspace-ls', 'github', 'resend'])
})

console.log('agentSkillsScopeEdges.test.ts: ok')
