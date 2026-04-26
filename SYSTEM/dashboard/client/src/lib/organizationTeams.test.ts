/**
 * Organization team synthesis test suite
 *
 * Run with: npx ts-node --transpileOnly client/src/lib/organizationTeams.test.ts
 */

import { buildOrganizationDeletePlan, buildOrganizationDisplayTeams, sanitizeOrganizationDisplayTeams } from './organizationTeams'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

console.log(`\n${YELLOW}=== Organization Team Synthesis Test Suite ===${RESET}\n`)

test('buildOrganizationDisplayTeams preserves persisted teams', () => {
  const teams = buildOrganizationDisplayTeams({
    persistedTeams: [
      {
        id: 'leadership',
        name: 'Leadership',
        leaderAgentId: 'ceo',
        memberAgentIds: ['ops'],
        tags: [],
      },
    ],
    agents: [{ id: 'ceo', name: 'CEO' }],
    groups: [],
  })

  assert(teams.some((team) => team.id === 'company-leadership'), 'Expected synthetic company root for top-level persisted team')
  assert(teams.some((team) => team.id === 'leadership' && team.parentTeamId === 'company-leadership'), 'Expected persisted team to be nested under synthetic company root')
})

test('buildOrganizationDisplayTeams merges persisted company teams with newly derived groups', () => {
  const teams = buildOrganizationDisplayTeams({
    persistedTeams: [
      {
        id: 'leadership',
        name: 'Leadership',
        leaderAgentId: 'ceo',
        memberAgentIds: ['ops'],
        tags: [],
      },
      {
        id: 'execution',
        name: 'Execution',
        leaderAgentId: 'ops',
        memberAgentIds: ['pm'],
        parentTeamId: 'leadership',
        tags: [],
      },
    ],
    agents: [
      { id: 'ceo', name: 'CEO' },
      { id: 'ops', name: 'Ops' },
      { id: 'pm', name: 'PM' },
      { id: 'seller', name: 'Seller' },
      { id: 'seller-ae', name: 'Seller AE' },
      { id: 'seller-ops', name: 'Seller Ops' },
    ],
    groups: [
      { name: 'Sales', members: [{ id: 'seller' }, { id: 'seller-ae' }, { id: 'seller-ops' }] },
    ],
    workflows: [
      { name: 'Build-a-Company Hack Test (demo) · Leadership Kickoff', owner: 'ceo', targeting: { teamIds: ['leadership'] } },
      { name: 'B2B Growth Desk · Sales Pipeline', owner: 'seller', targeting: { groups: ['Sales'] } },
    ],
    organizationName: 'B2B Growth Desk',
  })

  assert(teams.some((team) => team.id === 'company-leadership' && team.name === 'Build-a-Company Hack Test (demo)'), 'Expected persisted subtree to infer company name from workflow prefix')
  assert(teams.some((team) => team.id === 'organization' && team.name === 'B2B Growth Desk'), 'Expected derived root for uncovered second company structure')
  assert(teams.some((team) => team.id === 'sales' && team.parentTeamId === 'organization'), 'Expected derived Sales team to remain visible alongside persisted teams')
  const derivedRoot = teams.find((team) => team.id === 'organization')
  assert(derivedRoot?.leaderAgentId === 'seller', `Expected uncovered company leader to stay scoped to second company, got ${derivedRoot?.leaderAgentId}`)
  assert(!derivedRoot?.memberAgentIds.includes('ceo'), 'Did not expect first company agents inside second derived root')
})

test('buildOrganizationDisplayTeams does not add a duplicate derived root when persisted company already covers the same agents', () => {
  const teams = buildOrganizationDisplayTeams({
    persistedTeams: [
      {
        id: 'build-a-company-hackathon-org',
        name: 'Build-a-Company Hackathon Org',
        leaderAgentId: 'ceo',
        memberAgentIds: [],
        tags: ['company', 'org-root'],
      },
      {
        id: 'leadership',
        name: 'Leadership',
        leaderAgentId: 'ceo',
        memberAgentIds: ['execution-lead'],
        parentTeamId: 'build-a-company-hackathon-org',
        tags: ['exec'],
      },
      {
        id: 'engineering',
        name: 'Engineering',
        leaderAgentId: 'eng-lead',
        memberAgentIds: ['platform-engineer'],
        parentTeamId: 'leadership',
        tags: ['build'],
      },
      {
        id: 'marketing',
        name: 'Marketing',
        leaderAgentId: 'marketing-lead',
        memberAgentIds: ['content-strategist'],
        parentTeamId: 'leadership',
        tags: ['launch'],
      },
      {
        id: 'qa',
        name: 'QA',
        leaderAgentId: 'qa-lead',
        memberAgentIds: ['release-analyst'],
        parentTeamId: 'leadership',
        tags: ['review'],
      },
    ],
    agents: [
      { id: 'ceo', name: 'CEO' },
      { id: 'execution-lead', name: 'Execution Lead' },
      { id: 'eng-lead', name: 'Engineering Lead' },
      { id: 'platform-engineer', name: 'Platform Engineer' },
      { id: 'marketing-lead', name: 'Marketing Lead' },
      { id: 'content-strategist', name: 'Content Strategist' },
      { id: 'qa-lead', name: 'QA Lead' },
      { id: 'release-analyst', name: 'Release Analyst' },
    ],
    groups: [
      { name: 'Leadership', members: [{ id: 'ceo' }, { id: 'execution-lead' }] },
      { name: 'Engineering', members: [{ id: 'eng-lead' }, { id: 'platform-engineer' }] },
      { name: 'Marketing', members: [{ id: 'marketing-lead' }, { id: 'content-strategist' }] },
      { name: 'QA', members: [{ id: 'qa-lead' }, { id: 'release-analyst' }] },
    ],
    workflows: [
      { name: 'Build-a-Company Hack Test · Leadership Kickoff', owner: 'ceo', targeting: { teamIds: ['leadership'] } },
    ],
    organizationName: 'Build-a-Company Hackathon Org',
  })

  assert(teams.filter((team) => !team.parentTeamId).length === 1, `Expected one top-level root, got ${teams.filter((team) => !team.parentTeamId).map((team) => team.id).join(', ')}`)
  assert(!teams.some((team) => team.id === 'organization'), 'Did not expect derived organization root when persisted company covers the same agents')
})

test('buildOrganizationDisplayTeams derives root plus group teams when no persisted teams exist', () => {
  const teams = buildOrganizationDisplayTeams({
    agents: [
      { id: 'seller', name: 'Seller', groups: ['Sales'] },
      { id: 'seller-ops', name: 'Seller Ops', groups: ['Sales'] },
      { id: 'seller-ae', name: 'Seller AE', groups: ['Sales'] },
      { id: 'marketer', name: 'Marketer', groups: ['Marketing'] },
      { id: 'marketer-content', name: 'Content', groups: ['Marketing'] },
      { id: 'marketer-growth', name: 'Growth', groups: ['Marketing'] },
    ],
    groups: [
      { name: 'Sales', members: [{ id: 'seller' }, { id: 'seller-ops' }, { id: 'seller-ae' }] },
      { name: 'Marketing', members: [{ id: 'marketer' }, { id: 'marketer-content' }, { id: 'marketer-growth' }] },
    ],
    workflows: [
      { owner: 'seller', targeting: { groups: ['Sales'] } },
      { owner: 'marketer', targeting: { groups: ['Marketing'] } },
    ],
    organizationName: 'B2B Growth Desk',
    organizationDescription: 'Generated B2B org',
  })

  assert(teams.length === 3, `Expected root plus two group teams, got ${teams.length}`)
  assert(teams[0].id === 'organization', `Expected root organization team first, got ${teams[0].id}`)
  assert(teams.some((team) => team.id === 'sales' && team.parentTeamId === 'organization'), 'Expected derived Sales team under root')
  assert(teams.some((team) => team.id === 'marketing' && team.parentTeamId === 'organization'), 'Expected derived Marketing team under root')
})

test('buildOrganizationDisplayTeams uses imported workflow prefix as derived company label and strips namespace from group names', () => {
  const teams = buildOrganizationDisplayTeams({
    agents: [
      { id: 'b2b-ceo', name: 'Chief Executive Officer' },
      { id: 'b2b-sales-representative', name: 'Sales Representative' },
      { id: 'b2b-market-researcher', name: 'Market Researcher' },
    ],
    groups: [
      { name: 'b2b-Leadership', members: [{ id: 'b2b-ceo' }] },
      { name: 'Market Research and ICP', members: [{ id: 'b2b-market-researcher' }] },
      { name: 'Outbound Sales', members: [{ id: 'b2b-sales-representative' }] },
    ],
    workflows: [
      { id: 'b2b-kickoff', name: 'b2b · b2b-Leadership / Kickoff Meeting', owner: 'b2b-ceo', targeting: { groups: ['b2b-Leadership'] } } as any,
      { id: 'b2b-sales', name: 'b2b · Outbound Sales / Sales Outreach and Proposal', owner: 'b2b-sales-representative', targeting: { groups: ['Outbound Sales'] } } as any,
    ],
    organizationName: 'Workspace Org',
  })

  assert(teams[0].name === 'b2b', `Expected derived root name to use workflow prefix, got ${teams[0].name}`)
  assert(teams.some((team) => team.name === 'Leadership'), 'Expected prefixed group display name to strip namespace')
  assert(!teams.some((team) => team.name === 'b2b-Leadership'), 'Did not expect raw prefixed group name in display')
})

test('buildOrganizationDisplayTeams adds derived lanes when many sibling teams would be flat', () => {
  const teams = buildOrganizationDisplayTeams({
    agents: [
      { id: 'ceo', name: 'CEO' },
      { id: 'sales-lead', name: 'Sales Lead' },
      { id: 'sales-ae', name: 'Sales AE' },
      { id: 'sales-ops', name: 'Sales Ops' },
      { id: 'marketing-lead', name: 'Marketing Lead' },
      { id: 'marketing-content', name: 'Marketing Content' },
      { id: 'marketing-growth', name: 'Marketing Growth' },
      { id: 'ops-lead', name: 'Ops Lead' },
      { id: 'ops-analyst', name: 'Ops Analyst' },
      { id: 'ops-manager', name: 'Ops Manager' },
      { id: 'analyst', name: 'Analyst' },
      { id: 'researcher', name: 'Researcher' },
      { id: 'insights', name: 'Insights' },
      { id: 'delivery-lead', name: 'Delivery Lead' },
      { id: 'delivery-pm', name: 'Delivery PM' },
      { id: 'delivery-csm', name: 'Delivery CSM' },
    ],
    groups: [
      { name: 'Leadership', members: [{ id: 'ceo' }] },
      { name: 'Sales', members: [{ id: 'sales-lead' }, { id: 'sales-ae' }, { id: 'sales-ops' }] },
      { name: 'Marketing', members: [{ id: 'marketing-lead' }, { id: 'marketing-content' }, { id: 'marketing-growth' }] },
      { name: 'Operations', members: [{ id: 'ops-lead' }, { id: 'ops-analyst' }, { id: 'ops-manager' }] },
      { name: 'Research', members: [{ id: 'analyst' }, { id: 'researcher' }, { id: 'insights' }] },
      { name: 'Client Delivery', members: [{ id: 'delivery-lead' }, { id: 'delivery-pm' }, { id: 'delivery-csm' }] },
    ],
    workflows: [
      { owner: 'ceo', targeting: { groups: ['Leadership'] } },
      { owner: 'sales-lead', targeting: { groups: ['Sales'] } },
    ],
    organizationName: 'Layered Org',
  })

  assert(teams[0].id === 'organization', `Expected organization root first, got ${teams[0].id}`)
  assert(teams.some((team) => team.id === 'lane-revenue-growth' && team.parentTeamId === 'organization'), 'Expected revenue lane under root')
  assert(teams.some((team) => team.id === 'lane-client-delivery' && team.parentTeamId === 'organization'), 'Expected delivery lane under root')
  assert(teams.some((team) => team.id === 'sales' && team.parentTeamId === 'lane-revenue-growth'), 'Expected sales team nested under revenue lane')
  assert(teams.filter((team) => team.id === 'client-delivery').length === 1, 'Expected real team ids not to collide with derived lane ids')
})

test('buildOrganizationDisplayTeams falls back to a single root team when no groups exist', () => {
  const teams = buildOrganizationDisplayTeams({
    agents: [
      { id: 'lead', name: 'Lead' },
      { id: 'analyst', name: 'Analyst' },
    ],
    groups: [],
    workflows: [{ owner: 'lead' }],
    organizationName: 'Solo Org',
  })

  assert(teams.length === 1, `Expected single fallback team, got ${teams.length}`)
  assert(teams[0].leaderAgentId === 'lead', `Expected workflow owner to be leader, got ${teams[0].leaderAgentId}`)
  assert(teams[0].memberAgentIds.includes('analyst'), 'Expected remaining agent as member')
})

test('sanitizeOrganizationDisplayTeams breaks self and ancestor cycles', () => {
  const teams = sanitizeOrganizationDisplayTeams([
    { id: 'a', name: 'A', parentTeamId: 'b', memberAgentIds: [], tags: [] },
    { id: 'b', name: 'B', parentTeamId: 'a', memberAgentIds: [], tags: [] },
    { id: 'c', name: 'C', parentTeamId: 'c', memberAgentIds: [], tags: [] },
  ])

  const byId = new Map(teams.map((team) => [team.id, team]))
  assert(byId.get('a')?.parentTeamId === undefined || byId.get('b')?.parentTeamId === undefined, 'Expected one side of ancestor cycle to be broken')
  assert(byId.get('c')?.parentTeamId === undefined, 'Expected self cycle to be cleared')
})

test('buildOrganizationDeletePlan includes the selected company subtree and related resources', () => {
  const plan = buildOrganizationDeletePlan({
    rootTeamId: 'leadership',
    teams: [
      { id: 'leadership', name: 'Leadership', leaderAgentId: 'ceo', memberAgentIds: ['execution-lead'], tags: [] },
      { id: 'execution', name: 'Execution', leaderAgentId: 'execution-lead', memberAgentIds: ['program-manager'], parentTeamId: 'leadership', tags: [] },
      { id: 'marketing', name: 'Marketing', leaderAgentId: 'marketing-lead', memberAgentIds: ['content-strategist'], parentTeamId: 'leadership', tags: [] },
      { id: 'outside', name: 'Outside', leaderAgentId: 'outside-lead', memberAgentIds: [], tags: [] },
    ],
    groups: [
      { name: 'Leadership', members: [{ id: 'ceo' }, { id: 'execution-lead' }] },
      { name: 'Execution', members: [{ id: 'execution-lead' }, { id: 'program-manager' }] },
      { name: 'Marketing', members: [{ id: 'marketing-lead' }, { id: 'content-strategist' }] },
      { name: 'Outside', members: [{ id: 'outside-lead' }] },
    ] as any,
    communities: [
      { name: 'Build-a-Company', members: [{ id: 'ceo' }, { id: 'execution-lead' }, { id: 'program-manager' }, { id: 'marketing-lead' }, { id: 'content-strategist' }] },
      { name: 'Shared', members: [{ id: 'ceo' }, { id: 'outside-lead' }] },
    ],
    workflows: [
      { id: 'leadership-kickoff', owner: 'ceo', targeting: { teamIds: ['leadership'], groups: ['Leadership'] } },
      { id: 'execution-brief', owner: 'execution-lead', targeting: { teamIds: ['execution'] } },
      { id: 'marketing-launch', owner: 'marketing-lead', targeting: { teamIds: ['marketing'] } },
      { id: 'outside-flow', owner: 'outside-lead', targeting: { groups: ['Outside'] } },
    ],
  })

  assert(plan.teamIds.join(',') === 'leadership,execution,marketing', `Unexpected team ids: ${plan.teamIds.join(',')}`)
  assert(plan.agentIds.includes('ceo') && plan.agentIds.includes('content-strategist'), 'Expected subtree agents in delete plan')
  assert(!plan.agentIds.includes('outside-lead'), 'Did not expect outside agents in delete plan')
  assert(plan.workflowIds.join(',') === 'leadership-kickoff,execution-brief,marketing-launch', `Unexpected workflow ids: ${plan.workflowIds.join(',')}`)
  assert(plan.groupNames.join(',') === 'Leadership,Execution,Marketing', `Unexpected group names: ${plan.groupNames.join(',')}`)
  assert(plan.communityNames.join(',') === 'Build-a-Company', `Unexpected community names: ${plan.communityNames.join(',')}`)
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
