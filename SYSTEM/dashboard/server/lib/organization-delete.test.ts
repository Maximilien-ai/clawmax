/**
 * Organization delete planning test suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/organization-delete.test.ts
 */

import { buildOrganizationDeletePlan, findImpactedTopLevelTeamsForCommunityDelete } from './organization-delete'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEqual(actual: any, expected: any, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${expected}, got ${actual})`)
  }
}

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    testsPassed++
  } catch (err: any) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  Error: ${err.message}`)
    testsFailed++
  }
}

console.log(`\n${YELLOW}=== Organization Delete Test Suite ===${RESET}\n`)

const teams = [
  {
    id: 'cw-root',
    name: 'CW Demo Org',
    leaderAgentId: 'content-writer-1',
    memberAgentIds: ['content-writer-2'],
    tags: ['organization'],
  },
  {
    id: 'lane-specialized-teams',
    name: 'Specialized Teams',
    leaderAgentId: 'content-writer-1',
    memberAgentIds: ['content-writer-2'],
    parentTeamId: 'cw-root',
    tags: ['lane'],
  },
  {
    id: 'saas-root',
    name: 'SaaS Conversion Partners',
    leaderAgentId: 'saas-ceo',
    memberAgentIds: ['saas-client-delivery-manager', 'saas-strategy-lead'],
    tags: ['company-root'],
  },
  {
    id: 'saas-leadership',
    name: 'Leadership',
    leaderAgentId: 'saas-ceo',
    memberAgentIds: ['saas-client-delivery-manager', 'saas-strategy-lead'],
    parentTeamId: 'saas-root',
    tags: ['leadership'],
  },
  {
    id: 'saas-client-delivery',
    name: 'Client Delivery',
    leaderAgentId: 'saas-client-delivery-manager',
    memberAgentIds: [],
    parentTeamId: 'saas-leadership',
    tags: ['delivery'],
  },
]

const groups = [
  {
    name: 'saas-client-delivery',
    community: 'SaaS Conversion Partners',
    members: [{ id: 'saas-client-delivery-manager' }],
  },
  {
    name: 'lane-specialized-teams',
    community: 'CW Demo Org',
    members: [{ id: 'content-writer-1' }, { id: 'content-writer-2' }],
  },
]

const communities = [
  {
    name: 'CW Demo Org',
    members: [{ id: 'content-writer-1' }, { id: 'content-writer-2' }],
  },
  {
    name: 'SaaS Conversion Partners',
    members: [{ id: 'saas-ceo' }, { id: 'saas-client-delivery-manager' }, { id: 'saas-strategy-lead' }],
  },
]

const workflows = [
  {
    id: 'saas-kickoff',
    owner: 'saas-ceo',
    targeting: {
      groups: ['saas-client-delivery'],
      teamIds: ['saas-root', 'saas-leadership'],
      agents: ['saas-ceo'],
    },
  },
  {
    id: 'cw-kickoff',
    owner: 'content-writer-1',
    targeting: {
      groups: ['lane-specialized-teams'],
      teamIds: ['cw-root'],
      agents: ['content-writer-1'],
    },
  },
]

test('buildOrganizationDeletePlan includes community-linked subtree relationships', () => {
  const plan = buildOrganizationDeletePlan({
    rootTeamId: 'saas-root',
    teams: teams.map((team) => ({ ...team })),
    groups: groups.map((group) => ({ ...group, members: group.members.map((member) => ({ ...member })) })),
    communities: communities.map((community) => ({ ...community, members: community.members.map((member) => ({ ...member })) })),
    workflows: workflows.map((workflow) => ({ ...workflow, targeting: { ...workflow.targeting } })),
  })

  assert(plan.teamIds.includes('saas-root'), 'Expected root team to be included')
  assert(plan.teamIds.includes('saas-client-delivery'), 'Expected nested team to be included')
  assert(plan.communityNames.includes('SaaS Conversion Partners'), 'Expected matching community to be included')
  assert(plan.groupNames.includes('saas-client-delivery'), 'Expected matching group to be included')
  assert(plan.workflowIds.includes('saas-kickoff'), 'Expected matching workflow to be included')
})

test('findImpactedTopLevelTeamsForCommunityDelete isolates only the matching company subtree', () => {
  const plans = findImpactedTopLevelTeamsForCommunityDelete({
    communityName: 'SaaS Conversion Partners',
    teams: teams.map((team) => ({ ...team })),
    groups: groups.map((group) => ({ ...group, members: group.members.map((member) => ({ ...member })) })),
    communities: communities.map((community) => ({ ...community, members: community.members.map((member) => ({ ...member })) })),
    workflows: workflows.map((workflow) => ({ ...workflow, targeting: { ...workflow.targeting } })),
  })

  assertEqual(plans.length, 1, 'Expected exactly one top-level team subtree to match the deleted community')
  assert(plans[0].teamIds.includes('saas-root'), 'Expected SaaS root team to be targeted')
  assert(!plans[0].teamIds.includes('cw-root'), 'Expected unrelated company root to be excluded')
  assert(plans[0].communityNames.includes('SaaS Conversion Partners'), 'Expected deleted community to be in matched plan')
})

console.log('\n========================================')
console.log(`Tests passed: ${testsPassed}`)
console.log(`Tests failed: ${testsFailed}`)
console.log('========================================\n')

if (testsFailed > 0) {
  console.log(`${RED}Some tests failed${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}All tests passed${RESET}`)
}
