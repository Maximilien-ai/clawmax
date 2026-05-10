/**
 * Build-a-Company demo smoke tests
 *
 * Run with: npx ts-node --transpileOnly server/lib/build-company-demo-smoke.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { importOrganizationTemplate } from './templates'
import { listTeams } from './teams'
import { listAgents } from './workspace'
import { getWorkflow, listWorkflows, resolveParticipants, type Workflow } from './workflows'
import { resetWorkspaceManagerForTests } from './workspace-manager'
import { inferWorkspaceDashboardCompanies } from '../routes/workspace-dashboards'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`)
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

function withTempWorkspace(name: string, fn: (workspacePath: string) => void) {
  const originalHome = process.env.HOME
  const originalWorkspace = process.env.OPENCLAW_WORKSPACE
  const originalOpenAi = process.env.SYSTEM_OPENAI_API_KEY
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), `clawmax-${name}-`))
  const workspacePath = path.join(tempHome, 'workspace')
  fs.mkdirSync(workspacePath, { recursive: true })

  process.env.HOME = tempHome
  process.env.OPENCLAW_WORKSPACE = workspacePath
  process.env.SYSTEM_OPENAI_API_KEY = 'test-openai-key'
  resetWorkspaceManagerForTests()

  try {
    fn(workspacePath)
  } finally {
    if (typeof originalHome === 'undefined') delete process.env.HOME
    else process.env.HOME = originalHome

    if (typeof originalWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = originalWorkspace

    if (typeof originalOpenAi === 'undefined') delete process.env.SYSTEM_OPENAI_API_KEY
    else process.env.SYSTEM_OPENAI_API_KEY = originalOpenAi

    resetWorkspaceManagerForTests()
    fs.rmSync(tempHome, { recursive: true, force: true })
  }
}

function requireWorkflow(id: string): Workflow {
  const workflow = getWorkflow(id)
  assert(workflow !== null, `Expected workflow ${id} to exist`)
  return workflow!
}

function assertSingleParticipant(workflow: Workflow, expectedAgentId: string) {
  const participants = resolveParticipants(workflow, listAgents(), listTeams())
  assertEqual(participants.length, 1, `Expected ${workflow.id} to target exactly one agent`)
  assertEqual(participants[0].agentId, expectedAgentId, `Expected ${workflow.id} to target ${expectedAgentId}`)
  assertEqual((workflow.targeting.tags || []).length, 0, `Expected ${workflow.id} not to keep broad tag targeting`)
}

function writeGeneratedB2BTemplate(workspacePath: string) {
  const template: any = {
    name: 'SaaS Conversion Boosters',
    type: 'organization',
    kind: 'company',
    version: '1.0.0',
    description: 'Generated B2B SaaS company for homepage conversion services.',
    tags: ['b2b', 'saas', 'conversion', 'company'],
    agents: [
      { id: 'ceo', name: 'CEO', role: 'Chief Executive Officer', tags: ['b2b', 'leadership'], groups: ['Leadership'], communities: ['Conversion Boosters'] },
      { id: 'offer-strategist', name: 'Offer Strategist', role: 'Owns strategy brief and offer design.', tags: ['b2b', 'strategy'], groups: ['Offer Strategy'], communities: ['Conversion Boosters'] },
      { id: 'market-researcher', name: 'Market Researcher', role: 'Builds ICP and lead list.', tags: ['b2b', 'research'], groups: ['Research'], communities: ['Conversion Boosters'] },
      { id: 'sales-rep', name: 'Sales Representative', role: 'Creates outreach and proposal material.', tags: ['b2b', 'sales'], groups: ['Outbound Sales'], communities: ['Conversion Boosters'] },
      { id: 'project-manager', name: 'Project Manager', role: 'Owns client delivery plan.', tags: ['b2b', 'delivery'], groups: ['Client Delivery'], communities: ['Conversion Boosters'] },
      { id: 'operations-manager', name: 'Operations Manager', role: 'Owns revenue summary and operating cadence.', tags: ['b2b', 'operations'], groups: ['Operations'], communities: ['Conversion Boosters'] },
    ],
    teams: [
      { id: 'company-root', name: 'SaaS Conversion Boosters', purpose: 'Root company team.', leaderAgentId: 'ceo', memberAgentIds: [], tags: ['company', 'org-root'] },
      { id: 'leadership', name: 'Leadership', purpose: 'Set company direction.', leaderAgentId: 'ceo', memberAgentIds: ['offer-strategist'], parentTeamId: 'company-root', tags: ['leadership'] },
      { id: 'offer-strategy', name: 'Offer Strategy', purpose: 'Develop strategy brief.', leaderAgentId: 'offer-strategist', memberAgentIds: [], parentTeamId: 'leadership', tags: ['strategy'] },
      { id: 'research', name: 'Research', purpose: 'Develop ICP and lead list.', leaderAgentId: 'market-researcher', memberAgentIds: [], parentTeamId: 'leadership', tags: ['research'] },
      { id: 'outbound-sales', name: 'Outbound Sales', purpose: 'Prepare outreach.', leaderAgentId: 'sales-rep', memberAgentIds: [], parentTeamId: 'leadership', tags: ['sales'] },
      { id: 'client-delivery', name: 'Client Delivery', purpose: 'Create proposal and delivery plan.', leaderAgentId: 'project-manager', memberAgentIds: [], parentTeamId: 'leadership', tags: ['delivery'] },
      { id: 'operations', name: 'Operations', purpose: 'Summarize revenue and next actions.', leaderAgentId: 'operations-manager', memberAgentIds: [], parentTeamId: 'leadership', tags: ['operations'] },
    ],
    communities: [{ name: 'Conversion Boosters', description: 'Company-wide coordination.' }],
    groups: [
      { name: 'Leadership', community: 'Conversion Boosters' },
      { name: 'Offer Strategy', community: 'Conversion Boosters' },
      { name: 'Research', community: 'Conversion Boosters' },
      { name: 'Outbound Sales', community: 'Conversion Boosters' },
      { name: 'Client Delivery', community: 'Conversion Boosters' },
      { name: 'Operations', community: 'Conversion Boosters' },
    ],
    workflows: [
      {
        id: 'kickoff',
        name: 'Kickoff',
        description: 'Create the company operating brief.',
        schedule: 'manual',
        enabled: true,
        executionMode: 'managed',
        owner: 'ceo',
        targeting: { agents: ['ceo'], groups: ['Leadership'], communities: ['Conversion Boosters'], tags: ['b2b', 'conversion'], teamIds: ['leadership'] },
        outputDefinitions: [{ key: 'brief', label: 'Operating Brief', type: 'markdown' }],
        content: 'Produce the kickoff brief.',
      },
      {
        id: 'strategy-brief',
        name: 'Strategy Brief',
        description: 'Create offer strategy.',
        schedule: 'manual',
        enabled: true,
        executionMode: 'managed',
        owner: 'offer-strategist',
        dependsOn: ['kickoff'],
        targeting: { agents: ['offer-strategist'], groups: ['Offer Strategy'], communities: ['Conversion Boosters'], tags: ['b2b', 'conversion'], teamIds: ['offer-strategy'] },
        inputRefs: [{ workflowId: 'kickoff', outputKey: 'brief', label: 'Operating Brief', required: true }],
        outputDefinitions: [{ key: 'strategy', label: 'Strategy Brief', type: 'markdown' }],
        content: 'Use the kickoff brief to produce the strategy brief.',
      },
      {
        id: 'icp-leads',
        name: 'ICP and Lead List',
        description: 'Create ICP and leads.',
        schedule: 'manual',
        enabled: true,
        executionMode: 'managed',
        owner: 'market-researcher',
        dependsOn: ['strategy-brief'],
        targeting: { agents: ['market-researcher'], groups: ['Research'], communities: ['Conversion Boosters'], tags: ['b2b', 'conversion'], teamIds: ['research'] },
        inputRefs: [{ workflowId: 'strategy-brief', outputKey: 'strategy', label: 'Strategy Brief', required: true }],
        outputDefinitions: [{ key: 'icp', label: 'ICP and Leads', type: 'markdown' }],
        content: 'Use strategy to produce ICP and leads.',
      },
      {
        id: 'outreach-proposal',
        name: 'Outreach and Proposal',
        description: 'Create outreach copy and proposal.',
        schedule: 'manual',
        enabled: true,
        executionMode: 'managed',
        owner: 'sales-rep',
        dependsOn: ['icp-leads'],
        targeting: { agents: ['sales-rep'], groups: ['Outbound Sales'], communities: ['Conversion Boosters'], tags: ['b2b', 'conversion'], teamIds: ['outbound-sales'] },
        inputRefs: [{ workflowId: 'icp-leads', outputKey: 'icp', label: 'ICP and Leads', required: true }],
        outputDefinitions: [{ key: 'outreach', label: 'Outreach and Proposal', type: 'markdown' }],
        content: 'Use ICP and leads to produce outreach and proposal.',
      },
      {
        id: 'delivery-summary',
        name: 'Delivery Plan and Revenue Summary',
        description: 'Create delivery plan and revenue summary.',
        schedule: 'manual',
        enabled: true,
        executionMode: 'managed',
        owner: 'project-manager',
        dependsOn: ['outreach-proposal'],
        targeting: { agents: ['project-manager'], groups: ['Client Delivery'], communities: ['Conversion Boosters'], tags: ['b2b', 'conversion'], teamIds: ['client-delivery'] },
        inputRefs: [{ workflowId: 'outreach-proposal', outputKey: 'outreach', label: 'Outreach and Proposal', required: true }],
        outputDefinitions: [{ key: 'delivery', label: 'Delivery Plan and Revenue Summary', type: 'markdown' }],
        content: 'Use outreach and proposal to produce delivery plan and revenue summary.',
      },
    ],
  }

  const templateDir = path.join(workspacePath, 'TEMPLATES', 'organizations', 'generated-b2b-company')
  fs.mkdirSync(templateDir, { recursive: true })
  fs.writeFileSync(path.join(templateDir, 'template.json'), JSON.stringify(template, null, 2), 'utf-8')
}

console.log(`\n${YELLOW}=== Build-a-Company Demo Smoke Tests ===${RESET}\n`)

test('hack-test template imports as a one-agent-per-step company workflow chain', () => {
  withTempWorkspace('hack-demo-smoke', () => {
    const result = importOrganizationTemplate('build-a-company-hack-test', { prefix: 'test-' })
    assert(result.ok === true, `Expected import to succeed, got ${result.error || 'unknown error'}`)

    const teams = listTeams()
    const root = teams.find((team) => team.id === 'test-build-a-company-hackathon-org')
    const leadership = teams.find((team) => team.id === 'test-leadership')
    const execution = teams.find((team) => team.id === 'test-execution')
    const engineering = teams.find((team) => team.id === 'test-engineering')

    assert(root !== undefined, 'Expected prefixed company root')
    assert(leadership?.parentTeamId === root?.id, 'Expected leadership under company root')
    assert(execution?.parentTeamId === leadership?.id, 'Expected execution under leadership')
    assert(engineering?.parentTeamId === leadership?.id, 'Expected engineering under leadership')

    const kickoff = requireWorkflow('test-leadership-kickoff')
    const executionBrief = requireWorkflow('test-execution-brief')
    const engineeringPlan = requireWorkflow('test-engineering-plan')
    const marketingLaunch = requireWorkflow('test-marketing-launch')
    const qaReview = requireWorkflow('test-qa-review')

    assertSingleParticipant(kickoff, 'test-ceo')
    assertSingleParticipant(executionBrief, 'test-execution-lead')
    assertSingleParticipant(engineeringPlan, 'test-eng-lead')
    assertSingleParticipant(marketingLaunch, 'test-marketing-lead')
    assertSingleParticipant(qaReview, 'test-qa-lead')

    assertEqual(executionBrief.dependsOn?.[0], 'test-leadership-kickoff', 'Expected execution to depend on kickoff')
    assertEqual(engineeringPlan.inputRefs?.[0]?.workflowId, 'test-execution-brief', 'Expected engineering to consume execution output')
    assert(marketingLaunch.inputRefs?.some((ref) => ref.workflowId === 'test-engineering-plan') === true, 'Expected marketing to consume engineering output')
    assert(qaReview.inputRefs?.some((ref) => ref.workflowId === 'test-marketing-launch') === true, 'Expected QA to consume marketing output')

    const dashboardCompanies = inferWorkspaceDashboardCompanies({ teams, workflows: listWorkflows() })
    assert(dashboardCompanies.some((company) => company.kind === 'team' && company.value === 'test-build-a-company-hackathon-org'), 'Expected company dashboard option for imported root team')
  })
})

test('generated B2B company import keeps one root, nested teams, handoffs, and narrow participants', () => {
  withTempWorkspace('b2b-demo-smoke', (workspacePath) => {
    writeGeneratedB2BTemplate(workspacePath)

    const result = importOrganizationTemplate('generated-b2b-company', { prefix: 'b2b-' })
    assert(result.ok === true, `Expected import to succeed, got ${result.error || 'unknown error'}`)

    const b2bTeams = listTeams().filter((team) => team.id.startsWith('b2b-'))
    const roots = b2bTeams.filter((team) => !team.parentTeamId)
    assertEqual(roots.length, 1, `Expected one B2B company root, got ${roots.map((team) => team.id).join(', ')}`)
    assertEqual(roots[0].id, 'b2b-company-root', 'Expected prefixed company root id')
    assertEqual(b2bTeams.find((team) => team.id === 'b2b-leadership')?.parentTeamId, 'b2b-company-root', 'Expected leadership under root')
    assertEqual(b2bTeams.find((team) => team.id === 'b2b-research')?.parentTeamId, 'b2b-leadership', 'Expected research under leadership')
    assertEqual(b2bTeams.find((team) => team.id === 'b2b-client-delivery')?.parentTeamId, 'b2b-leadership', 'Expected delivery under leadership')

    const kickoff = requireWorkflow('b2b-kickoff')
    const strategy = requireWorkflow('b2b-strategy-brief')
    const icp = requireWorkflow('b2b-icp-leads')
    const outreach = requireWorkflow('b2b-outreach-proposal')
    const delivery = requireWorkflow('b2b-delivery-summary')

    assertSingleParticipant(kickoff, 'b2b-ceo')
    assertSingleParticipant(strategy, 'b2b-offer-strategist')
    assertSingleParticipant(icp, 'b2b-market-researcher')
    assertSingleParticipant(outreach, 'b2b-sales-rep')
    assertSingleParticipant(delivery, 'b2b-project-manager')

    assertEqual(strategy.dependsOn?.[0], 'b2b-kickoff', 'Expected strategy dependency to be remapped')
    assertEqual(strategy.inputRefs?.[0]?.workflowId, 'b2b-kickoff', 'Expected strategy input ref to be remapped')
    assertEqual(icp.inputRefs?.[0]?.workflowId, 'b2b-strategy-brief', 'Expected ICP input ref to be remapped')
    assertEqual(outreach.inputRefs?.[0]?.workflowId, 'b2b-icp-leads', 'Expected outreach input ref to be remapped')
    assertEqual(delivery.inputRefs?.[0]?.workflowId, 'b2b-outreach-proposal', 'Expected delivery input ref to be remapped')

    const dashboardCompanies = inferWorkspaceDashboardCompanies({ teams: b2bTeams, workflows: listWorkflows() })
    assert(dashboardCompanies.some((company) => company.kind === 'team' && company.value === 'b2b-company-root'), 'Expected company dashboard option for B2B root')
  })
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
