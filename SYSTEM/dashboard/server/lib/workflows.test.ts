/**
 * Workflows API Test Suite
 *
 * Run with: npx ts-node --transpileOnly server/lib/workflows.test.ts
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { getWorkspacePath } from './workspace'
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  validateCron,
  parseWorkflowMd,
  workflowToMarkdown,
  areDependenciesMet,
  completeWorkflow,
  getDAGStatus,
  triggerWorkflow,
  getExecution,
  resolveParticipants,
  detectParticipantReportedFailure,
  extractGitHubResultLinks,
  summarizeGitHubResultLink,
  buildWorkflowSessionId,
  isWorkflowSessionLockError,
  getWorkflowAgentRetryDelay,
  getWorkflowAgentTimeoutMs,
  normalizeWorkflowExecutionOutputs,
  resolveWorkflowRunInputPath,
  resolveWorkflowInputRefs,
  deriveWorkflowExecutionOutputs,
  persistWorkflowExecutionOutputArtifacts,
  resolveTargetTeamAgentIds,
} from './workflows'

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

let testsPassed = 0
let testsFailed = 0
const createdIds: string[] = []

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

console.log(`\n${YELLOW}=== Workflows Test Suite ===${RESET}\n`)

// ============================================================================
// Cron Validation
// ============================================================================

test('validateCron accepts valid cron expressions', () => {
  assert(validateCron('0 9 * * *').valid, '0 9 * * * should be valid')
  assert(validateCron('*/5 * * * *').valid, '*/5 should be valid')
  assert(validateCron('0 */2 * * *').valid, 'every 2h should be valid')
  assert(validateCron('30 9 * * 1-5').valid, 'weekdays should be valid')
})

test('validateCron rejects invalid expressions', () => {
  assert(!validateCron('invalid').valid, 'invalid should fail')
  assert(!validateCron('60 * * * *').valid, '60 minutes should fail')
  assert(!validateCron('').valid, 'empty should fail')
})

test('validateCron returns human-readable description', () => {
  const result = validateCron('0 9 * * *')
  assert(result.humanReadable !== undefined, 'Should have humanReadable')
  assert(result.humanReadable!.toLowerCase().includes('9'), 'Should mention 9')
})

// ============================================================================
// CRUD
// ============================================================================

test('createWorkflow creates a workflow', () => {
  const result = createWorkflow({
    name: 'Test Create',
    description: 'Testing create',
    schedule: 'manual',
    content: '# Test\nDo the thing.',
    executionMode: 'automated',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(result.success, `Should succeed: ${result.error}`)
  assert(result.id !== undefined, 'Should return id')
  createdIds.push(result.id!)
})

test('createWorkflow with dependsOn and type', () => {
  const result = createWorkflow({
    name: 'Test Deps',
    description: 'Testing deps',
    schedule: 'manual',
    content: '# Test deps',
    executionMode: 'automated',
    dependsOn: [createdIds[0]],
    type: 'conditional',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(result.success, `Should succeed: ${result.error}`)
  createdIds.push(result.id!)

  const wf = getWorkflow(result.id!)
  assert(wf?.dependsOn?.includes(createdIds[0]) === true, 'Should have dependsOn')
  assert(wf?.type === 'conditional', 'Should have type')
})

test('createWorkflow validates required fields', () => {
  const result = createWorkflow({ name: 'Missing fields' } as any)
  assert(!result.success, 'Should fail without required fields')
})

test('createWorkflow rejects invalid cron', () => {
  const result = createWorkflow({
    name: 'Bad Cron',
    description: 'Test',
    schedule: 'not-a-cron',
    content: 'test',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!result.success, 'Should fail with invalid cron')
})

test('createWorkflow accepts manual and once schedules', () => {
  const r1 = createWorkflow({
    name: 'Manual Test',
    description: 'Test',
    schedule: 'manual',
    content: 'test',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(r1.success, 'manual should be accepted')
  createdIds.push(r1.id!)

  const r2 = createWorkflow({
    name: 'Once Test',
    description: 'Test',
    schedule: 'once',
    content: 'test',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(r2.success, 'once should be accepted')
  createdIds.push(r2.id!)
})

test('getWorkflow returns workflow by ID', () => {
  const wf = getWorkflow(createdIds[0])
  assert(wf !== null, 'Should find workflow')
  assert(wf!.name === 'Test Create', 'Name should match')
})

test('getWorkflow returns null for unknown ID', () => {
  const wf = getWorkflow('nonexistent-workflow-xyz')
  assert(wf === null, 'Should return null')
})

test('listWorkflows returns array', () => {
  const wfs = listWorkflows()
  assert(Array.isArray(wfs), 'Should be array')
  assert(wfs.length >= createdIds.length, `Should have at least ${createdIds.length}`)
})

test('updateWorkflow updates fields', () => {
  const result = updateWorkflow(createdIds[0], { description: 'Updated description' })
  assert(result.success, 'Should succeed')
  const wf = getWorkflow(createdIds[0])
  assert(wf?.description === 'Updated description', 'Description should update')
})

test('updateWorkflow persists progress and status', () => {
  const result = updateWorkflow(createdIds[0], { progress: 50, status: 'running' } as any)
  assert(result.success, 'Should succeed')
  const wf = getWorkflow(createdIds[0])
  assert(wf?.progress === 50, `Progress should be 50, got ${wf?.progress}`)
  assert(wf?.status === 'running', `Status should be running, got ${wf?.status}`)
})

test('updateWorkflow returns error for unknown ID', () => {
  const result = updateWorkflow('nonexistent', { description: 'nope' })
  assert(!result.success, 'Should fail')
})

// ============================================================================
// WORKFLOW.md Format
// ============================================================================

test('parseWorkflowMd parses valid markdown', () => {
  const md = `---
name: Test Parse
description: Parse test
schedule: "0 9 * * *"
executionMode: automated
targeting:
  agents: [agent-1]
  groups: []
  tags: []
  communities: []
---

# Test Parse

Do the thing.
`
  const wf = parseWorkflowMd(md)
  assert(wf !== null, 'Should parse')
  assert(wf!.name === 'Test Parse', 'Name should match')
  assert(wf!.schedule === '0 9 * * *', 'Schedule should match')
  assert(wf!.content.includes('Do the thing'), 'Content should be body')
})

test('parseWorkflowMd returns null for invalid content', () => {
  assert(parseWorkflowMd('just text') === null, 'Plain text should fail')
  assert(parseWorkflowMd('') === null, 'Empty should fail')
})

test('workflowToMarkdown round-trips', () => {
  const wf = getWorkflow(createdIds[0])!
  const md = workflowToMarkdown(wf)
  assert(md.includes('name: Test Create'), 'Should contain name')
  assert(md.includes('Do the thing'), 'Should contain content')

  const parsed = parseWorkflowMd(md)
  assert(parsed?.name === wf.name, 'Round-trip name should match')
})

// ============================================================================
// DAG Engine
// ============================================================================

test('areDependenciesMet returns true when no deps', () => {
  const { met, pending } = areDependenciesMet(createdIds[0])
  assert(met === true, 'No deps should be met')
  assert(pending.length === 0, 'No pending')
})

test('areDependenciesMet checks dependency status', () => {
  // createdIds[1] depends on createdIds[0]
  // Reset [0] to idle
  updateWorkflow(createdIds[0], { status: 'idle', progress: 0 } as any)
  const { met, pending } = areDependenciesMet(createdIds[1])
  assert(!met, 'Should not be met (dep is idle)')
  assert(pending.includes(createdIds[0]), 'Should list pending dep')
})

test('completeWorkflow marks complete and finds ready dependents', () => {
  const { readyToRun } = completeWorkflow(createdIds[0])
  const wf = getWorkflow(createdIds[0])
  assert(wf?.status === 'completed', 'Should be completed')
  assert(wf?.progress === 100, 'Progress should be 100')
  assert(readyToRun.includes(createdIds[1]), `Should unlock ${createdIds[1]}`)
})

test('getDAGStatus returns all workflows with dep info', () => {
  const dag = getDAGStatus()
  assert(Array.isArray(dag), 'Should be array')
  const entry = dag.find(d => d.id === createdIds[1])
  assert(entry !== undefined, 'Should find our workflow')
  assert(entry!.dependenciesMet === true, 'Deps should now be met')
})

test('resolveParticipants prefers owner over group-only expansion when owner is set', () => {
  const participants = resolveParticipants({
    id: 'owner-driven',
    name: 'Owner Driven',
    description: 'Test',
    schedule: 'manual',
    enabled: true,
    executionMode: 'managed',
    owner: 'lead',
    targeting: {
      agents: [],
      tags: [],
      groups: ['Status'],
      communities: [],
    },
    content: '# Test',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    author: 'test',
  } as any, [
    { id: 'lead', name: 'Lead', groups: ['Status'], tags: ['lead'], communities: [] },
    { id: 'analyst', name: 'Analyst', groups: ['Status'], tags: ['analysis'], communities: [] },
  ])

  assert(participants.length === 1, `Expected only owner to execute, got ${participants.length}`)
  assert(participants[0].agentId === 'lead', `Expected owner lead to execute, got ${participants[0].agentId}`)
})

test('resolveParticipants still expands group targets when no direct execution target is set', () => {
  const participants = resolveParticipants({
    id: 'group-driven',
    name: 'Group Driven',
    description: 'Test',
    schedule: 'manual',
    enabled: true,
    executionMode: 'managed',
    targeting: {
      agents: [],
      tags: [],
      groups: ['Status'],
      communities: [],
    },
    content: '# Test',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    author: 'test',
  } as any, [
    { id: 'lead', name: 'Lead', groups: ['Status'], tags: ['lead'], communities: [] },
    { id: 'analyst', name: 'Analyst', groups: ['Status'], tags: ['analysis'], communities: [] },
    { id: 'other', name: 'Other', groups: ['Elsewhere'], tags: [], communities: [] },
  ])

  assert(participants.length === 2, `Expected group expansion to include 2 participants, got ${participants.length}`)
  assert(participants.some((p) => p.agentId === 'lead'), 'Expected lead in group-driven participants')
  assert(participants.some((p) => p.agentId === 'analyst'), 'Expected analyst in group-driven participants')
})

test('resolveTargetTeamAgentIds resolves only the targeted team leader by default', () => {
  const reasons = resolveTargetTeamAgentIds(['leadership'], [
    {
      id: 'leadership',
      name: 'Leadership',
      leaderAgentId: 'ceo',
      memberAgentIds: ['chief-of-staff'],
      tags: [],
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'engineering',
      name: 'Engineering',
      leaderAgentId: 'eng-lead',
      memberAgentIds: ['platform-engineer'],
      parentTeamId: 'leadership',
      tags: [],
      createdAt: '',
      updatedAt: '',
    },
  ] as any)

  assert(reasons.get('ceo')?.includes('team:leadership') === true, 'Expected leadership lead to resolve')
  assert(!reasons.has('chief-of-staff'), 'Expected non-leader member to remain excluded by default')
  assert(!reasons.has('eng-lead'), 'Expected child team lead to remain excluded by default')
  assert(!reasons.has('platform-engineer'), 'Expected child team member to remain excluded by default')
})

test('resolveParticipants includes team-targeted agents as direct execution targets', () => {
  const participants = resolveParticipants({
    id: 'team-driven',
    name: 'Team Driven',
    description: 'Test',
    schedule: 'manual',
    enabled: true,
    executionMode: 'managed',
    targeting: {
      agents: [],
      teamIds: ['leadership'],
      tags: [],
      groups: ['Status'],
      communities: [],
    },
    content: '# Test',
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    author: 'test',
  } as any, [
    { id: 'ceo', name: 'CEO', groups: ['Status'], tags: ['lead'], communities: [] },
    { id: 'eng-lead', name: 'Engineering Lead', groups: ['Status'], tags: ['build'], communities: [] },
    { id: 'analyst', name: 'Analyst', groups: ['Status'], tags: ['analysis'], communities: [] },
  ], [
    {
      id: 'leadership',
      name: 'Leadership',
      leaderAgentId: 'ceo',
      memberAgentIds: ['eng-lead'],
      tags: [],
      createdAt: '',
      updatedAt: '',
    },
  ] as any)

  assert(participants.length === 1, `Expected only team leader to execute, got ${participants.length}`)
  assert(participants.some((p) => p.agentId === 'ceo' && p.reason.includes('team:leadership')), 'Expected leadership team lead to execute')
  assert(!participants.some((p) => p.agentId === 'eng-lead'), 'Expected non-leader team member to be excluded by default')
  assert(!participants.some((p) => p.agentId === 'analyst'), 'Expected unrelated group agent to be excluded when teamIds create direct targets')
})

test('detectParticipantReportedFailure catches explicit FAIL markers', () => {
  assert(detectParticipantReportedFailure('COMMS FAIL') === 'COMMS FAIL', 'Expected COMMS FAIL to be treated as failure')
  assert(detectParticipantReportedFailure('FAIL\nNeed retry') === 'FAIL', 'Expected FAIL line to be treated as failure')
  assert(detectParticipantReportedFailure('COMMS PASS') === null, 'Expected PASS marker to remain non-failing')
  assert(
    detectParticipantReportedFailure('LLM request rejected: You have reached your specified API usage limits.') === 'LLM request rejected: You have reached your specified API usage limits.',
    'Expected upstream provider rejection to be treated as failure'
  )
  assert(
    detectParticipantReportedFailure('No execution path configured. Add hosted provider keys, or configure Ollama in BYOK / workspace integrations.') === 'No execution path configured. Add hosted provider keys, or configure Ollama in BYOK / workspace integrations.',
    'Expected missing execution path to be treated as failure'
  )
})

test('extractGitHubResultLinks finds issue and PR URLs cleanly', () => {
  const text = 'Created https://github.com/Maximilien-ai/clawmax/issues/12 and opened https://github.com/Maximilien-ai/clawmax/pull/57.'
  const links = extractGitHubResultLinks(text)
  assert(links.length === 2, `Expected 2 links, got ${links.length}`)
  assert(links[0] === 'https://github.com/Maximilien-ai/clawmax/issues/12', 'Expected trimmed issue URL')
  assert(links[1] === 'https://github.com/Maximilien-ai/clawmax/pull/57', 'Expected trimmed PR URL')
})

test('summarizeGitHubResultLink produces compact labels', () => {
  assert(
    summarizeGitHubResultLink('https://github.com/Maximilien-ai/clawmax/pull/57') === 'Maximilien-ai/clawmax PR #57',
    'Expected compact PR label'
  )
  assert(
    summarizeGitHubResultLink('https://github.com/Maximilien-ai/clawmax/issues/12') === 'Maximilien-ai/clawmax issue #12',
    'Expected compact issue label'
  )
})

test('buildWorkflowSessionId uses workflow execution and agent id', () => {
  const sessionId = buildWorkflowSessionId('exec-123', 'analysis-lead')
  assert(
    sessionId === 'workflow-exec-123-analysis-lead',
    `Expected workflow session format, got ${sessionId}`
  )
})

test('buildWorkflowSessionId produces distinct sessions per agent and run', () => {
  const first = buildWorkflowSessionId('exec-123', 'agent-a')
  const second = buildWorkflowSessionId('exec-123', 'agent-b')
  const third = buildWorkflowSessionId('exec-456', 'agent-a')

  assert(first !== second, 'Expected different agents in same execution to use different sessions')
  assert(first !== third, 'Expected same agent across executions to use different sessions')
})

test('resolveWorkflowRunInputPath resolves relative paths against workspace root', () => {
  const workspaceRoot = '/tmp/clawmax-workspace'
  assert(
    resolveWorkflowRunInputPath('AGENTS/cw-items', workspaceRoot) === '/tmp/clawmax-workspace/AGENTS/cw-items',
    'Expected bare relative path to resolve against workspace root'
  )
  assert(
    resolveWorkflowRunInputPath('./AGENTS/cw-items', workspaceRoot) === '/tmp/clawmax-workspace/AGENTS/cw-items',
    'Expected dot-relative path to resolve against workspace root'
  )
  assert(
    resolveWorkflowRunInputPath('/tmp/cw-items', workspaceRoot) === '/tmp/cw-items',
    'Expected absolute path to remain unchanged'
  )
})

test('normalizeWorkflowExecutionOutputs trims keys and preserves structured values', () => {
  const normalized = normalizeWorkflowExecutionOutputs({
    ' brief ': {
      type: 'markdown',
      summary: ' Planning summary ',
      artifactPath: ' deliverables/brief.md ',
      value: { owner: 'product' },
    },
  })

  assert(normalized !== undefined, 'Expected outputs to normalize')
  assert(normalized?.brief?.type === 'markdown', 'Expected output type to persist')
  assert(normalized?.brief?.summary === 'Planning summary', 'Expected summary to trim')
  assert(normalized?.brief?.artifactPath === 'deliverables/brief.md', 'Expected artifact path to trim')
  assert((normalized?.brief?.value as any)?.owner === 'product', 'Expected structured value to persist')
})

test('resolveWorkflowInputRefs resolves latest upstream output by workflow id and key', () => {
  const refs = resolveWorkflowInputRefs({
    inputRefs: [
      { workflowId: 'leadership-kickoff', outputKey: 'brief', label: 'Leadership Brief' },
    ],
  }, (workflowId) => {
    if (workflowId !== 'leadership-kickoff') return null
    return {
      id: 'exec-1',
      workflowId,
      startedAt: new Date().toISOString(),
      status: 'completed',
      triggerType: 'manual',
      participants: [],
      logs: [],
      outputs: {
        brief: {
          type: 'markdown',
          summary: 'Kickoff brief ready',
          artifactPath: 'deliverables/brief.md',
          value: { ownerTeam: 'product' },
        },
      },
    }
  })

  assert(refs.length === 1, `Expected one resolved ref, got ${refs.length}`)
  assert(refs[0].missing === false, 'Expected upstream output to resolve')
  assert(refs[0].summary === 'Kickoff brief ready', 'Expected summary to resolve')
  assert(refs[0].artifactPath === 'deliverables/brief.md', 'Expected artifact path to resolve')
  assert((refs[0].value as any)?.ownerTeam === 'product', 'Expected structured value to resolve')
})

test('deriveWorkflowExecutionOutputs uses owner response for declared output', () => {
  const outputs = deriveWorkflowExecutionOutputs(
    {
      owner: 'agent-owner',
      outputDefinitions: [{ key: 'brief', type: 'markdown' }],
    },
    [
      { agentId: 'agent-helper', response: 'Helper draft' },
      { agentId: 'agent-owner', response: 'Owner final brief\n\nWith detail.' },
    ]
  )

  assert(outputs !== undefined, 'Expected derived outputs')
  assert(outputs?.brief?.type === 'markdown', `Expected markdown type, got ${outputs?.brief?.type}`)
  assert(outputs?.brief?.value === 'Owner final brief\n\nWith detail.', `Expected owner response as value, got ${outputs?.brief?.value}`)
  assert(outputs?.brief?.summary?.includes('Owner final brief') === true, `Expected summary to include owner response, got ${outputs?.brief?.summary}`)
})

test('persistWorkflowExecutionOutputArtifacts writes markdown outputs into workflow output files', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-output-'))
  const persisted = persistWorkflowExecutionOutputArtifacts('leadership-kickoff', {
    'leadership-brief': {
      type: 'markdown',
      value: '# Leadership Brief\n\nShip the company kickoff.',
      summary: 'Leadership brief ready',
    },
  }, workspaceRoot)

  const artifactPath = persisted?.['leadership-brief']?.artifactPath
  assert(artifactPath === 'WORKFLOWS/outputs/leadership-kickoff/leadership-brief.md', `Unexpected artifact path: ${artifactPath}`)

  const absoluteArtifactPath = path.join(workspaceRoot, artifactPath!)
  assert(fs.existsSync(absoluteArtifactPath), `Expected artifact file to exist at ${absoluteArtifactPath}`)
  const artifactContent = fs.readFileSync(absoluteArtifactPath, 'utf-8')
  assert(artifactContent.includes('Ship the company kickoff.'), `Unexpected artifact content: ${artifactContent}`)
})

test('getExecution backfills artifact paths for existing markdown outputs', () => {
  const workflowId = 'artifact-backfill'
  const workspaceRoot = process.env.OPENCLAW_WORKSPACE || getWorkspacePath()
  const workflowPath = path.join(workspaceRoot, 'WORKFLOWS', `${workflowId}.md`)
  fs.writeFileSync(workflowPath, `---
name: Artifact Backfill
description: Test workflow
schedule: manual
enabled: true
targeting:
  communities: []
  groups: []
  tags: []
  agents: []
author: test
executionMode: managed
---
Backfill output artifacts on read.
`, 'utf-8')

  const executionDir = path.join(workspaceRoot, 'WORKFLOWS', 'executions', workflowId)
  fs.mkdirSync(executionDir, { recursive: true })
  const executionPath = path.join(executionDir, 'exec-backfill.json')
  fs.writeFileSync(executionPath, JSON.stringify({
    id: 'exec-backfill',
    workflowId,
    startedAt: new Date().toISOString(),
    status: 'completed',
    triggerType: 'manual',
    participants: [],
    logs: [],
    outputs: {
      'leadership-brief': {
        type: 'markdown',
        value: '# Backfilled brief\n\nNow with file path.',
        summary: 'Backfilled brief',
      },
    },
  }, null, 2), 'utf-8')

  const execution = getExecution(workflowId, 'exec-backfill')
  const artifactPath = execution?.outputs?.['leadership-brief']?.artifactPath
  assert(artifactPath === 'WORKFLOWS/outputs/artifact-backfill/leadership-brief.md', `Unexpected backfilled artifact path: ${artifactPath}`)
  assert(fs.existsSync(path.join(workspaceRoot, artifactPath!)), `Expected backfilled artifact file to exist at ${artifactPath}`)
})

test('isWorkflowSessionLockError matches the OpenClaw lock timeout error', () => {
  assert(
    isWorkflowSessionLockError(new Error('session file locked (timeout 10000ms)')),
    'Expected lock timeout error to be recognized'
  )
  assert(
    !isWorkflowSessionLockError(new Error('Agent timeout')),
    'Expected non-lock error to be ignored'
  )
})

test('getWorkflowAgentRetryDelay uses bounded exponential backoff', () => {
  assert(getWorkflowAgentRetryDelay(0) === 1500, 'Expected first retry delay to be 1500ms')
  assert(getWorkflowAgentRetryDelay(1) === 3000, 'Expected second retry delay to be 3000ms')
  assert(getWorkflowAgentRetryDelay(4) === 5000, 'Expected retry delay to cap at 5000ms')
})

test('getWorkflowAgentTimeoutMs defaults to 10 minutes', () => {
  const previous = process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS
  delete process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS
  try {
    assert(getWorkflowAgentTimeoutMs() === 600000, `Expected 600000ms, got ${getWorkflowAgentTimeoutMs()}`)
  } finally {
    if (typeof previous === 'undefined') delete process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS
    else process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS = previous
  }
})

test('getWorkflowAgentTimeoutMs uses configured override when valid', () => {
  const previous = process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS
  process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS = '900000'
  try {
    assert(getWorkflowAgentTimeoutMs() === 900000, `Expected 900000ms, got ${getWorkflowAgentTimeoutMs()}`)
  } finally {
    if (typeof previous === 'undefined') delete process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS
    else process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS = previous
  }
})

test('getWorkflowAgentTimeoutMs falls back on invalid values', () => {
  const previous = process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS
  process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS = '5000'
  try {
    assert(getWorkflowAgentTimeoutMs() === 600000, `Expected fallback 600000ms, got ${getWorkflowAgentTimeoutMs()}`)
  } finally {
    if (typeof previous === 'undefined') delete process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS
    else process.env.CLAWMAX_WORKFLOW_AGENT_TIMEOUT_MS = previous
  }
})

test('triggerWorkflow supports rerunning upstream DAG workflows', () => {
  const root = createWorkflow({
    name: 'Reset Root',
    description: 'Root',
    schedule: 'manual',
    content: '# Root',
    executionMode: 'automated',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!!(root.success && root.id), 'Root workflow should be created')
  createdIds.push(root.id as string)

  const child = createWorkflow({
    name: 'Reset Child',
    description: 'Child',
    schedule: 'manual',
    content: '# Child',
    executionMode: 'automated',
    dependsOn: [root.id!],
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!!(child.success && child.id), 'Child workflow should be created')
  createdIds.push(child.id as string)

  const grandchild = createWorkflow({
    name: 'Reset Grandchild',
    description: 'Grandchild',
    schedule: 'manual',
    content: '# Grandchild',
    executionMode: 'automated',
    dependsOn: [child.id!],
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(!!(grandchild.success && grandchild.id), 'Grandchild workflow should be created')
  createdIds.push(grandchild.id as string)

  updateWorkflow(child.id!, { enabled: false } as any)
  updateWorkflow(grandchild.id!, { enabled: false } as any)
  updateWorkflow(root.id!, { status: 'completed', progress: 100 } as any)
  updateWorkflow(child.id!, { status: 'completed', progress: 100 } as any)
  updateWorkflow(grandchild.id!, { status: 'completed', progress: 100 } as any)

  const triggered = triggerWorkflow(root.id!, { manual: true })
  assert(triggered.success, `Rerun should succeed: ${triggered.error}`)

  const rerunRoot = getWorkflow(root.id!)
  const rerunChild = getWorkflow(child.id!)
  const rerunGrandchild = getWorkflow(grandchild.id!)

  assert(rerunRoot?.status === 'running' || rerunRoot?.status === 'completed', 'Root should restart cleanly after rerun')
  assert((rerunRoot?.progress || 0) >= 0 && (rerunRoot?.progress || 0) <= 100, `Root progress should stay in range during rerun, got ${rerunRoot?.progress}`)
  assert(rerunChild !== null, 'Direct downstream workflow should remain present after rerun')
  assert(rerunGrandchild !== null, 'Nested downstream workflow should remain present after rerun')
})

test('triggerWorkflow stores edited manual inputs on the new execution', () => {
  const result = createWorkflow({
    name: 'Editable Kickoff',
    description: 'Stores structured inputs',
    schedule: 'manual',
    content: [
      '# Kickoff',
      '',
      '- **Project:** Alpha',
      '- **Region:** US',
    ].join('\n'),
    executionMode: 'automated',
    targeting: { agents: [], groups: [], tags: [], communities: [] },
  })
  assert(result.success && !!result.id, `Workflow should be created: ${result.error}`)
  createdIds.push(result.id!)

  const triggered = triggerWorkflow(result.id!, {
    manual: true,
    inputs: {
      Project: 'Beta',
      Region: 'EU',
      Priority: 'High',
    },
  })
  assert(triggered.success && !!triggered.executionId, `Trigger should succeed: ${triggered.error}`)

  const execution = getExecution(result.id!, triggered.executionId!)
  assert(execution !== null, 'Execution should be readable after trigger')
  assert(execution?.inputs?.Project === 'Beta', `Expected edited Project input, got ${execution?.inputs?.Project}`)
  assert(execution?.inputs?.Region === 'EU', `Expected edited Region input, got ${execution?.inputs?.Region}`)
  assert(execution?.inputs?.Priority === 'High', `Expected new Priority input, got ${execution?.inputs?.Priority}`)
})

test('triggerWorkflow mock mode completes immediately and persists output artifacts', () => {
  const result = createWorkflow({
    name: 'Mock Kickoff',
    description: 'Mock execution test',
    schedule: 'manual',
    content: '# Mock kickoff',
    executionMode: 'managed',
    owner: 'mock-owner',
    targeting: { agents: ['mock-owner'], groups: [], tags: [], communities: [] },
    outputDefinitions: [{ key: 'brief', label: 'Brief', type: 'markdown' }],
  } as any)
  assert(result.success && !!result.id, `Workflow should be created: ${result.error}`)
  createdIds.push(result.id!)

  const triggered = triggerWorkflow(result.id!, {
    manual: true,
    mock: true,
    inputs: {
      Audience: 'Hack judges',
    },
  })
  assert(triggered.success && !!triggered.executionId, `Mock trigger should succeed: ${triggered.error}`)

  const execution = getExecution(result.id!, triggered.executionId!)
  assert(execution !== null, 'Mock execution should be readable')
  assert(execution?.status === 'completed', `Expected completed mock execution, got ${execution?.status}`)
  assert(execution?.participants.length === 1, `Expected one mock participant, got ${execution?.participants.length}`)
  assert(execution?.participants[0].status === 'completed', `Expected completed mock participant, got ${execution?.participants[0].status}`)
  assert(execution?.outputs?.brief?.artifactPath === `WORKFLOWS/outputs/${result.id}/brief.md`, `Unexpected mock artifact path: ${execution?.outputs?.brief?.artifactPath}`)
  const artifactPath = path.join(getWorkspacePath(), execution!.outputs!.brief!.artifactPath!)
  assert(fs.existsSync(artifactPath), `Expected mock artifact file to exist at ${artifactPath}`)
  const artifactContent = fs.readFileSync(artifactPath, 'utf-8')
  assert(artifactContent.includes('Mock execution completed by'), `Expected mock artifact content, got ${artifactContent}`)
  assert(artifactContent.includes('Audience: Hack judges'), `Expected run inputs to appear in mock artifact, got ${artifactContent}`)
})

// ============================================================================
// Cleanup
// ============================================================================

test('deleteWorkflow deletes by ID', () => {
  for (const id of createdIds) {
    const result = deleteWorkflow(id)
    assert(result.success, `Should delete ${id}: ${result.error}`)
  }
})

test('deleteWorkflow returns error for unknown ID', () => {
  const result = deleteWorkflow('nonexistent-xyz')
  assert(!result.success, 'Should fail')
})

// Summary
setTimeout(() => {
  console.log(`\n${YELLOW}=== Test Summary ===${RESET}`)
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`)
  if (testsFailed > 0) {
    console.log(`${RED}Failed: ${testsFailed}${RESET}`)
    process.exit(1)
  } else {
    console.log(`\n${GREEN}All tests passed! ✓${RESET}\n`)
    process.exit(0)
  }
}, 100)
