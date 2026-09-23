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

test('unknown roots and unrelated communities produce no deletion targets', () => {
  const missing = buildOrganizationDeletePlan({ rootTeamId: 'missing', teams, groups, communities, workflows })
  assertEqual(Object.values(missing).flat().length, 0, 'Unknown team cannot authorize deletion')
  const unrelated = findImpactedTopLevelTeamsForCommunityDelete({
    communityName: 'Other Community', teams, groups, communities, workflows,
  })
  assertEqual(unrelated.length, 0, 'Unrelated community cannot select a team')
})

test('child traversal is deterministic and survives cyclic team references', () => {
  const plan = buildOrganizationDeletePlan({
    rootTeamId: 'root',
    teams: [
      { id: 'root', name: 'Root', leaderAgentId: 'lead', memberAgentIds: [], parentTeamId: 'child-b', tags: [] },
      { id: 'child-b', name: 'B', leaderAgentId: 'b', memberAgentIds: [], parentTeamId: 'root', tags: [] },
      { id: 'child-a', name: 'A', leaderAgentId: 'a', memberAgentIds: [], parentTeamId: 'root', tags: [] },
    ],
    groups: [], communities: [], workflows: [],
  })
  assertEqual(plan.teamIds.join(','), 'root,child-a,child-b', 'Children should be ordered once despite cyclic input')
  assertEqual(plan.agentIds.length, 3, 'Each child agent should appear once')
})

test('workflow and group references expand the deletion plan transitively', () => {
  const plan = buildOrganizationDeletePlan({
    rootTeamId: 'root',
    teams: [{ id: 'root', name: 'Root Org', leaderAgentId: ' lead ', memberAgentIds: ['lead', ''], tags: [] }],
    groups: [
      { name: 'root-group', community: 'root-community', members: ['lead', { id: 'colleague' }, { id: '' }] },
      { name: 'linked-group', community: 'linked-community', members: [{ id: 'collaborator' }] },
      { name: 'unrelated-group', community: 'other', members: ['outsider'] },
    ],
    communities: [
      { name: 'root-community', members: ['lead', 'colleague'] },
      { name: 'linked-community', members: ['collaborator'] },
      { name: 'other', members: ['outsider'] },
    ],
    workflows: [
      { id: 'first', owner: 'lead', targeting: { agents: ['collaborator'], groups: ['linked-group'] } },
      { id: 'second', owner: 'later-owner', targeting: { groups: ['linked-group'] } },
      { id: 'third', targeting: { agents: ['later-owner'] } },
      { id: 'outside', owner: 'outsider', targeting: { groups: ['unrelated-group'] } },
    ],
  })
  assert(plan.agentIds.includes('later-owner'), 'Referenced workflow owners should be included')
  assert(plan.workflowIds.includes('third'), 'Later workflows should enter through acquired owners')
  assert(plan.groupNames.includes('root-group') && plan.groupNames.includes('linked-group'), 'Connected groups should be included')
  assert(plan.communityNames.includes('root-community') && plan.communityNames.includes('linked-community'), 'Connected communities should be included')
  assert(!plan.workflowIds.includes('outside') && !plan.agentIds.includes('outsider'), 'Unrelated resources must remain out of scope')
})

test('empty communities stay outside the plan unless attached to a selected group', () => {
  const input = {
    rootTeamId: 'root',
    teams: [{ id: 'root', name: 'Root', leaderAgentId: 'lead', memberAgentIds: [], tags: [] }],
    groups: [{ name: 'root', community: 'attached', members: [] as string[] }],
    communities: [
      { name: 'attached', members: [] as string[] },
      { name: 'empty-unrelated', members: [] as string[] },
    ],
  }
  const plan = buildOrganizationDeletePlan(input)
  assert(plan.communityNames.includes('attached'), 'Attached empty community should be included')
  assert(!plan.communityNames.includes('empty-unrelated'), 'Unrelated empty community should remain untouched')
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
