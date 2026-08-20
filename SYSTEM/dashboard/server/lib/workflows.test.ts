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
  getLatestExecution,
  listExecutions,
  cancelExecution,
  resolveParticipants,
  detectParticipantReportedFailure,
  extractGitHubResultLinks,
  summarizeGitHubResultLink,
  buildWorkflowSessionId,
  buildWorkflowRetrySessionId,
  resolveWorkflowOpenClawCliPath,
  repairWorkflowSessionEntryForRun,
  getLatestAgentSessionErrorMessage,
  isWorkflowSessionLockError,
  getWorkflowAgentRetryDelay,
  normalizeWorkflowExecutionOutputs,
  compactWorkflowExecutionContent,
  resolveWorkflowRunInputPath,
  resolveWorkflowInputRefs,
  deriveWorkflowExecutionOutputs,
  persistWorkflowExecutionOutputArtifacts,
  resolveTargetTeamAgentIds,
  extractWorkflowAgentResultPayload,
  isBenignOpenClawRuntimeWarning,
  stripBenignOpenClawRuntimeWarnings,
  summarizeAgentInputRequest,
  formatParticipantFailure,
  normalizeWorkflowThreadDiagnostic,
  resolveWorkflowConversationTarget,
  syncWorkflowToCron,
  getWorkflowPipelineState,
  setWorkflowPipelinePaused,
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

test('extractWorkflowAgentResultPayload falls back to stderr json when stdout is empty', () => {
  const payload = extractWorkflowAgentResultPayload(
    '',
    'Gateway warning: embedded fallback engaged\n{"payloads":[{"text":"hello from stderr json"}]}'
  )
  assert(payload.includes('"hello from stderr json"'), `Expected stderr JSON payload, got ${payload}`)
})

test('extractWorkflowAgentResultPayload ignores benign plugin symlink warnings', () => {
  const payload = extractWorkflowAgentResultPayload(
    '',
    '[skills] failed to create plugin skill symlink "/app/DATA/.home/.openclaw/plugin-skills/browser-automation" → "/usr/local/lib/node_modules/openclaw/dist/extensions/browser/skills/browser-automation": Error: EEXIST: file already exists, symlink\n{"payloads":[{"text":"workflow output"}]}'
  )
  assert(payload.includes('"workflow output"'), `Expected stderr JSON payload after stripping benign warnings, got ${payload}`)
})

test('stripBenignOpenClawRuntimeWarnings removes idempotent symlink warnings', () => {
  const cleaned = stripBenignOpenClawRuntimeWarnings([
    '[skills] failed to create plugin skill symlink "/plugin" → "/target": Error: EEXIST: file already exists, symlink',
    'real output line',
  ].join('\n'))
  assert(cleaned === 'real output line', `Unexpected cleaned warning output: ${cleaned}`)
  assert(isBenignOpenClawRuntimeWarning('[skills] failed to create plugin skill symlink "/plugin" → "/target": Error: EEXIST: file already exists, symlink') === true, 'Expected EEXIST plugin symlink warning to be benign')
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
timezone: America/Los_Angeles
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
  assert(wf!.timezone === 'America/Los_Angeles', 'Timezone should match')
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
  assert(parsed?.timezone === (wf.timezone || 'UTC'), 'Round-trip timezone should match')
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
    detectParticipantReportedFailure('FsSafeError: directory changed during operation') === 'FsSafeError: directory changed during operation',
    'Expected runtime fs errors to be treated as failure'
  )
  assert(
    detectParticipantReportedFailure('Unknown model: openai/gpt-4o-mini') === 'Unknown model: openai/gpt-4o-mini',
    'Expected unsupported model errors to be treated as failure'
  )
  assert(
    detectParticipantReportedFailure('LLM request rejected: You have reached your specified API usage limits.') === 'LLM request rejected: You have reached your specified API usage limits.',
    'Expected upstream provider rejection to be treated as failure'
  )
  assert(
    detectParticipantReportedFailure('No execution path configured. Add hosted provider keys, or configure Ollama in BYOK / workspace integrations.') === 'No execution path configured. Add hosted provider keys, or configure Ollama in BYOK / workspace integrations.',
    'Expected missing execution path to be treated as failure'
  )
  assert(
    detectParticipantReportedFailure('Context overflow: prompt too large for the model. Try /reset.') === 'Context overflow: prompt too large for the model. Try /reset.',
    'Expected context overflow to be treated as failure'
  )
  assert(
    detectParticipantReportedFailure("Runtime error detail: 400 Invalid 'prompt_cache_key': string too long.") === "Runtime error detail: 400 Invalid 'prompt_cache_key': string too long.",
    'Expected provider runtime detail to be treated as failure'
  )
  assert(
    detectParticipantReportedFailure('EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /tmp/agent.jsonl') === 'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /tmp/agent.jsonl',
    'Expected embedded session takeover errors to be treated as failure'
  )
})

test('formatParticipantFailure explains provider auth failures clearly', () => {
  const message = formatParticipantFailure('FailoverError: 401 Incorrect API key provided: openai-cible.')
  assert(
    /authentication failed/i.test(message) && /api key|auth profile|byok/i.test(message),
    `Expected auth guidance, got: ${message}`
  )
})

test('formatParticipantFailure explains runtime fs errors clearly', () => {
  const message = formatParticipantFailure('FsSafeError: directory changed during operation')
  assert(
    /runtime changed files while this workflow was running/i.test(message) && /restart the runtime|disable unstable runtime plugins/i.test(message),
    `Expected runtime fs guidance, got: ${message}`
  )
})

test('formatParticipantFailure explains unsupported models clearly', () => {
  const message = formatParticipantFailure('Unknown model: openai/gpt-4o-mini')
  assert(
    /configured with a model that the current runtime does not support/i.test(message) && /choose a different model/i.test(message),
    `Expected unsupported-model guidance, got: ${message}`
  )
})

test('workflow session conflicts are explained without exposing runtime session paths', () => {
  const raw = 'EmbeddedAttemptSessionTakeoverError: session file changed while embedded prompt lock was released: /app/DATA/.home/.openclaw/agents/agent0/sessions/private.jsonl'
  const failure = formatParticipantFailure(raw)
  const threadMessage = normalizeWorkflowThreadDiagnostic(raw)
  assert(/runtime retried this workflow participant/i.test(failure), `Expected retry explanation, got: ${failure}`)
  assert(/runtime retried this workflow participant/i.test(threadMessage || ''), `Expected normalized thread explanation, got: ${threadMessage}`)
  assert(!failure.includes('/app/DATA'), `Expected runtime path to be hidden: ${failure}`)
  assert(!(threadMessage || '').includes('/app/DATA'), `Expected thread runtime path to be hidden: ${threadMessage}`)
})

test('formatParticipantFailure explains provider cooldowns clearly', () => {
  const message = formatParticipantFailure('FallbackSummaryError: All models failed (1): openai/gpt-5: Provider openai is in cooldown (suspending lanes) (timeout)')
  assert(
    /temporarily cooling down/i.test(message) && /retry|fallback/i.test(message),
    `Expected cooldown guidance, got: ${message}`
  )
})

test('formatParticipantFailure explains provider quota limits clearly', () => {
  const message = formatParticipantFailure('Error: 429 insufficient_quota: You exceeded your current quota. Too many requests.')
  assert(
    /usage limits blocked/i.test(message) && /billing|rate-limit/i.test(message),
    `Expected quota guidance, got: ${message}`
  )
})

test('formatParticipantFailure distinguishes incorrect api keys from sticky auth state', () => {
  const invalidKey = formatParticipantFailure('FailoverError: 401 Incorrect API key provided: openai-cible.')
  const stickyAuth = formatParticipantFailure('FallbackSummaryError: All models failed (1): openai/gpt-4o-mini: Provider openai has auth issue (skipping all models) (auth)')
  assert(/api key was rejected/i.test(invalidKey), `Expected invalid-key guidance, got: ${invalidKey}`)
  assert(/marked unhealthy|auth issue/i.test(stickyAuth), `Expected sticky-auth guidance, got: ${stickyAuth}`)
})

test('normalizeWorkflowThreadDiagnostic compresses raw auth fallback noise for workflow threads', () => {
  const normalized = normalizeWorkflowThreadDiagnostic('model fallback decision: decision=candidate_failed detail=401 Incorrect API key provided: openai-cible. FailoverError: 401 Incorrect API key provided: openai-cible.')
  assert(/Runtime auth error/i.test(normalized || ''), `Expected auth normalization, got: ${normalized}`)
})

test('normalizeWorkflowThreadDiagnostic compresses raw network fallback noise for workflow threads', () => {
  const normalized = normalizeWorkflowThreadDiagnostic('model fallback decision: decision=candidate_failed detail=Connection error. FailoverError: LLM request failed: network connection error.')
  assert(/Runtime connection error/i.test(normalized || ''), `Expected network normalization, got: ${normalized}`)
})

test('normalizeWorkflowThreadDiagnostic compresses runtime fs errors for workflow threads', () => {
  const normalized = normalizeWorkflowThreadDiagnostic('FsSafeError: directory changed during operation')
  assert(/runtime changed files while this workflow was running/i.test(normalized || ''), `Expected fs-safe normalization, got: ${normalized}`)
})

test('resolveWorkflowConversationTarget prefers workflow groups before communities', () => {
  const groupTarget = resolveWorkflowConversationTarget({ groups: ['Status'], communities: ['Dev Team'] })
  assert(groupTarget?.type === 'group' && groupTarget?.name === 'Status', `Expected group target, got: ${JSON.stringify(groupTarget)}`)
  const communityTarget = resolveWorkflowConversationTarget({ groups: [], communities: ['Research Lab'] })
  assert(communityTarget?.type === 'community' && communityTarget?.name === 'Research Lab', `Expected community target, got: ${JSON.stringify(communityTarget)}`)
})

test('resolveWorkflowConversationTarget infers team workflow channels when explicit channels are omitted', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-conversation-target-'))
  const previousWorkspace = process.env.OPENCLAW_WORKSPACE
  const previousHome = process.env.HOME
  const home = path.join(workspaceRoot, '.home')

  try {
    process.env.OPENCLAW_WORKSPACE = workspaceRoot
    process.env.HOME = home
    fs.mkdirSync(path.join(workspaceRoot, 'ORG'), { recursive: true })
    fs.mkdirSync(path.join(workspaceRoot, 'SYSTEM'), { recursive: true })
    fs.mkdirSync(path.join(workspaceRoot, 'AGENTS', 'lead'), { recursive: true })
    fs.mkdirSync(path.join(workspaceRoot, 'AGENTS', 'researcher'), { recursive: true })
    fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })

    fs.writeFileSync(path.join(workspaceRoot, 'ORG', 'GROUPS.md'), [
      '# Groups',
      '',
      '### Research Team',
      '- **Description:** Research group',
      '- **Community:** Ops Hub',
      '- **Members:** lead, researcher',
    ].join('\n'), 'utf-8')
    fs.writeFileSync(path.join(workspaceRoot, 'ORG', 'COMMUNITIES.md'), [
      '# Communities',
      '',
      '### Ops Hub',
      '- **Description:** Operations community',
      '- **Members:** lead, researcher',
    ].join('\n'), 'utf-8')
    fs.writeFileSync(path.join(workspaceRoot, 'SYSTEM', 'teams.json'), JSON.stringify({
      version: '1.0.0',
      teams: [
        {
          id: 'research-team',
          name: 'Research Team',
          leaderAgentId: 'lead',
          memberAgentIds: ['researcher'],
          tags: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    }, null, 2), 'utf-8')
    fs.writeFileSync(path.join(home, '.openclaw', 'openclaw.json'), JSON.stringify({
      agents: {
        list: [
          { id: 'lead', workspace: path.join(workspaceRoot, 'AGENTS', 'lead') },
          { id: 'researcher', workspace: path.join(workspaceRoot, 'AGENTS', 'researcher') },
        ],
      },
    }, null, 2), 'utf-8')
    fs.writeFileSync(path.join(workspaceRoot, 'AGENTS', 'lead', 'IDENTITY.md'), [
      '# Identity',
      '',
      '- **Name:** Lead',
      '- **Role:** Lead',
    ].join('\n'), 'utf-8')
    fs.writeFileSync(path.join(workspaceRoot, 'AGENTS', 'researcher', 'IDENTITY.md'), [
      '# Identity',
      '',
      '- **Name:** Researcher',
      '- **Role:** Researcher',
    ].join('\n'), 'utf-8')

    const teamTarget = resolveWorkflowConversationTarget({ groups: [], communities: [], teamIds: ['research-team'] }, workspaceRoot)
    assert(teamTarget?.type === 'group' && teamTarget?.name === 'Research Team', `Expected inferred team group target, got: ${JSON.stringify(teamTarget)}`)
  } finally {
    if (typeof previousWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = previousWorkspace
    if (typeof previousHome === 'undefined') delete process.env.HOME
    else process.env.HOME = previousHome
    fs.rmSync(workspaceRoot, { recursive: true, force: true })
  }
})

test('summarizeAgentInputRequest extracts direct user asks for notifications', () => {
  const summary = summarizeAgentInputRequest('I can continue, but I need your decision. Please confirm whether we should target founders or growth leads for the first outbound campaign. Once you confirm, I will finish the draft.')
  assert(
    /Please confirm whether we should target founders or growth leads/i.test(summary),
    `Expected direct request to be preserved, got: ${summary}`
  )
})

test('summarizeAgentInputRequest falls back to a short tail summary', () => {
  const summary = summarizeAgentInputRequest('Status update. We completed the draft. Next blocker is choosing the final launch date and budget owner so the workflow can proceed without ambiguity.')
  assert(summary.length <= 220, `Expected fallback summary to stay compact, got length ${summary.length}`)
  assert(/launch date and budget owner/i.test(summary), `Expected fallback summary to retain relevant context, got: ${summary}`)
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
    /^wf-[a-f0-9]{10}-analysis-lead$/.test(sessionId),
    `Expected compact workflow session format, got ${sessionId}`
  )
  assert(sessionId.length <= 48, `Expected compact workflow session id, got length ${sessionId.length}`)
})

test('buildWorkflowSessionId produces distinct sessions per agent and run', () => {
  const first = buildWorkflowSessionId('exec-123', 'agent-a')
  const second = buildWorkflowSessionId('exec-123', 'agent-b')
  const third = buildWorkflowSessionId('exec-456', 'agent-a')

  assert(first !== second, 'Expected different agents in same execution to use different sessions')
  assert(first !== third, 'Expected same agent across executions to use different sessions')
})

test('buildWorkflowRetrySessionId rotates session keys for repaired retries', () => {
  const initial = buildWorkflowRetrySessionId('execution-123', 'agent-a', 0)
  const firstRetry = buildWorkflowRetrySessionId('execution-123', 'agent-a', 1)
  const secondRetry = buildWorkflowRetrySessionId('execution-123', 'agent-a', 2)
  assert(initial !== firstRetry, 'Expected first retry to use a fresh workflow session key')
  assert(firstRetry !== secondRetry, 'Expected each retry to rotate the workflow session key')
  assert(firstRetry.length <= 48, `Expected bounded retry session key, got ${firstRetry.length}`)
})

test('resolveWorkflowOpenClawCliPath honors OPENCLAW_BIN override', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-cli-'))
  const fakeCli = path.join(dir, 'openclaw')
  const original = process.env.OPENCLAW_BIN
  fs.writeFileSync(fakeCli, '#!/bin/sh\necho workflow-openclaw\n', 'utf-8')
  fs.chmodSync(fakeCli, 0o755)
  process.env.OPENCLAW_BIN = fakeCli
  try {
    assert(resolveWorkflowOpenClawCliPath() === fakeCli, 'Expected workflow execution to use the resolved OPENCLAW_BIN override')
  } finally {
    if (typeof original === 'undefined') delete process.env.OPENCLAW_BIN
    else process.env.OPENCLAW_BIN = original
  }
})

function withRuntimePinnedWorkspace<T>(agentRuntimes: Record<string, string | undefined>, fn: (workspaceRoot: string) => T): T {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-cron-runtime-'))
  const previousWorkspace = process.env.OPENCLAW_WORKSPACE
  const previousHome = process.env.HOME
  const previousEnabledRuntimes = process.env.WORKSPACES_INTEGRATIONS_RUNTIMES
  const home = path.join(workspaceRoot, '.home')
  try {
    process.env.OPENCLAW_WORKSPACE = workspaceRoot
    process.env.HOME = home
    // A runtime pin is only honored when that CLI is enabled for the workspace. The temp
    // workspace has no integration config, so enable both CLIs explicitly rather than
    // inheriting a developer's local .env — otherwise this test only passes on machines
    // that happen to set WORKSPACES_INTEGRATIONS_RUNTIMES.
    process.env.WORKSPACES_INTEGRATIONS_RUNTIMES = 'claude,droid'
    fs.mkdirSync(path.join(home, '.openclaw'), { recursive: true })
    fs.mkdirSync(path.join(workspaceRoot, 'SYSTEM'), { recursive: true })
    for (const [agentId, runtime] of Object.entries(agentRuntimes)) {
      const agentDir = path.join(workspaceRoot, 'AGENTS', agentId)
      fs.mkdirSync(agentDir, { recursive: true })
      const identityLines = ['# Identity', '', '- **Name:** Test Agent']
      if (runtime) identityLines.push(`- **Runtime:** ${runtime}`)
      fs.writeFileSync(path.join(agentDir, 'IDENTITY.md'), identityLines.join('\n'), 'utf-8')
    }
    return fn(workspaceRoot)
  } finally {
    if (typeof previousWorkspace === 'undefined') delete process.env.OPENCLAW_WORKSPACE
    else process.env.OPENCLAW_WORKSPACE = previousWorkspace
    if (typeof previousHome === 'undefined') delete process.env.HOME
    else process.env.HOME = previousHome
    if (typeof previousEnabledRuntimes === 'undefined') delete process.env.WORKSPACES_INTEGRATIONS_RUNTIMES
    else process.env.WORKSPACES_INTEGRATIONS_RUNTIMES = previousEnabledRuntimes
    fs.rmSync(workspaceRoot, { recursive: true, force: true })
  }
}

test('syncWorkflowToCron skips openclaw cron registration for a claude/droid-pinned participant', () => {
  withRuntimePinnedWorkspace({ 'droid-runner': 'droid' }, () => {
    const result = syncWorkflowToCron({
      id: 'wf-runtime-skip',
      enabled: true,
      schedule: '0 9 * * *',
      timezone: 'UTC',
      content: 'Say hi',
    } as any, ['droid-runner'])
    assert(result.ok === true, `Expected ok:true when every participant is non-openclaw, got ${JSON.stringify(result)}`)
    assert(result.cronJobId === undefined, `Expected no cron job id, got ${result.cronJobId}`)
  })
})

test('syncWorkflowToCron does not mask a real openclaw registration failure behind runtime skips', () => {
  withRuntimePinnedWorkspace({ 'droid-runner': 'droid', 'openclaw-runner': undefined }, () => {
    // No real openclaw CLI is on PATH in this test environment, so the openclaw-runner
    // registration attempt fails — that must still surface as ok:false, not be swallowed
    // by the unrelated droid-runner skip.
    const result = syncWorkflowToCron({
      id: 'wf-runtime-mixed',
      enabled: true,
      schedule: '0 9 * * *',
      timezone: 'UTC',
      content: 'Say hi',
    } as any, ['droid-runner', 'openclaw-runner'])
    assert(result.ok === false, `Expected ok:false when an openclaw participant's registration genuinely fails, got ${JSON.stringify(result)}`)
  })
})

test('buildWorkflowSessionId stays within provider cache key limits for long ids', () => {
  const sessionId = buildWorkflowSessionId(
    '0f575b29-176f-497a-9f00-89bfdbcf2af9',
    'technical-writing-writer1'
  )
  assert(sessionId.length <= 48, `Expected bounded session id length, got ${sessionId.length}`)
})

test('getLatestAgentSessionErrorMessage reads provider errors from recent session files', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-session-error-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'agent-a', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.writeFileSync(path.join(sessionsDir, 'latest.jsonl'), [
    JSON.stringify({ type: 'session', id: 'wf-short-agent-a' }),
    JSON.stringify({ type: 'message', message: { errorMessage: "400 Invalid 'prompt_cache_key': string too long." } }),
  ].join('\n'), 'utf-8')

  const errorMessage = getLatestAgentSessionErrorMessage('agent-a', home)
  assert(errorMessage === "400 Invalid 'prompt_cache_key': string too long.", `Unexpected session error: ${errorMessage}`)
})

test('repairWorkflowSessionEntryForRun drops stale transcript pointers for compact workflow sessions', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-session-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'agent-a', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const staleSessionFile = path.join(sessionsDir, 'legacy.jsonl')
  fs.writeFileSync(staleSessionFile, [
    JSON.stringify({ type: 'session', id: 'workflow-legacy-execution-agent-a' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
  ].join('\n'), 'utf-8')
  const sessionsPath = path.join(sessionsDir, 'sessions.json')
  fs.writeFileSync(sessionsPath, JSON.stringify({
    'agent:agent-a:main': {
      sessionId: 'wf-previous-agent-a',
      sessionFile: staleSessionFile,
      updatedAt: Date.now(),
    },
    'agent:agent-a:dashboard-chat': {
      sessionId: 'dashboard-chat',
      sessionFile: path.join(sessionsDir, 'dashboard-chat.jsonl'),
      updatedAt: Date.now(),
    },
  }, null, 2), 'utf-8')

  const changed = repairWorkflowSessionEntryForRun('agent-a', 'wf-current-agent-a', home)
  const repaired = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))

  assert(changed, 'Expected stale workflow session entry to be repaired')
  assert(!repaired['agent:agent-a:main'].sessionFile, 'Expected stale sessionFile pointer to be removed')
  assert(
    repaired['agent:agent-a:dashboard-chat'].sessionFile.endsWith('dashboard-chat.jsonl'),
    'Expected unrelated dashboard session entry to be preserved'
  )
})

test('repairWorkflowSessionEntryForRun preserves matching transcript pointers', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-session-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'agent-a', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const sessionFile = path.join(sessionsDir, 'wf-short-agent-a.jsonl')
  fs.writeFileSync(sessionFile, [
    JSON.stringify({ type: 'session', id: 'wf-short-agent-a' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
  ].join('\n'), 'utf-8')
  const sessionsPath = path.join(sessionsDir, 'sessions.json')
  fs.writeFileSync(sessionsPath, JSON.stringify({
    'agent:agent-a:main': {
      sessionId: 'wf-short-agent-a',
      sessionFile,
      updatedAt: Date.now(),
    },
  }, null, 2), 'utf-8')

  const changed = repairWorkflowSessionEntryForRun('agent-a', 'wf-short-agent-a', home)
  const repaired = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))

  assert(!changed, 'Expected matching workflow session entry to be left untouched')
  assert(repaired['agent:agent-a:main'].sessionFile === sessionFile, 'Expected matching sessionFile pointer to be preserved')
})

test('repairWorkflowSessionEntryForRun leaves non-workflow main sessions alone', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'clawmax-workflow-session-home-'))
  const sessionsDir = path.join(home, '.openclaw', 'agents', 'agent-a', 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })
  const sessionFile = path.join(sessionsDir, 'dashboard-chat.jsonl')
  fs.writeFileSync(sessionFile, [
    JSON.stringify({ type: 'session', id: 'dashboard-chat' }),
    JSON.stringify({ type: 'message', message: { role: 'user', content: [] } }),
  ].join('\n'), 'utf-8')
  const sessionsPath = path.join(sessionsDir, 'sessions.json')
  fs.writeFileSync(sessionsPath, JSON.stringify({
    'agent:agent-a:main': {
      sessionId: 'dashboard-chat',
      sessionFile,
      updatedAt: Date.now(),
    },
  }, null, 2), 'utf-8')

  const changed = repairWorkflowSessionEntryForRun('agent-a', 'wf-current-agent-a', home)
  const repaired = JSON.parse(fs.readFileSync(sessionsPath, 'utf-8'))

  assert(!changed, 'Expected non-workflow main session entry to be left untouched')
  assert(repaired['agent:agent-a:main'].sessionFile === sessionFile, 'Expected non-workflow sessionFile pointer to be preserved')
})

test('compactWorkflowExecutionContent preserves high-signal lines and truncates long workflow bodies', () => {
  const content = `# Weekly Review

Objective: Produce the concise executive review.

- Keep the summary artifact short.
- Include the latest blockers.

${'Background paragraph that is intentionally verbose and repetitive. '.repeat(120)}
`

  const compacted = compactWorkflowExecutionContent(content, 260)
  assert(compacted.includes('Objective: Produce the concise executive review.'), 'Expected objective line to survive compaction')
  assert(compacted.includes('- Keep the summary artifact short.'), 'Expected bullet points to survive compaction')
  assert(compacted.includes('Workflow instructions truncated for brevity.'), 'Expected explicit truncation notice')
  assert(compacted.length < content.length, 'Expected compacted content to be shorter than the original')
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

test('triggerWorkflow rejects a concurrent second run before it can increment state', () => {
  const result = createWorkflow({
    name: `Single Writer ${Date.now()}`,
    description: 'Validate the per-workflow running claim',
    schedule: 'manual',
    content: '# Single writer',
    executionMode: 'automated',
    targeting: { agents: [], groups: [], communities: [], tags: [] },
  })
  assert(result.success && !!result.id, `Workflow should be created: ${result.error}`)
  createdIds.push(result.id!)

  const first = triggerWorkflow(result.id!, { manual: true })
  const second = triggerWorkflow(result.id!, { manual: true })
  assert(first.success, `First trigger should claim the run: ${first.error}`)
  assert(!second.success && /already running/i.test(second.error || ''), 'Second trigger must be rejected while the first claim is active')
})

test('getWorkflow marks an execution owned by an earlier dashboard boot as interrupted', () => {
  const result = createWorkflow({
    name: `Restart Recovery ${Date.now()}`,
    description: 'Validate interrupted run reconciliation',
    schedule: 'manual',
    content: '# Restart recovery',
    executionMode: 'automated',
    targeting: { agents: [], groups: [], communities: [], tags: [] },
  })
  assert(result.success && !!result.id, `Workflow should be created: ${result.error}`)
  createdIds.push(result.id!)
  updateWorkflow(result.id!, { status: 'running', progress: 35 })
  const executionDir = path.join(getWorkspacePath(), 'WORKFLOWS', 'executions', result.id!)
  fs.mkdirSync(executionDir, { recursive: true })
  fs.writeFileSync(path.join(executionDir, 'interrupted-run.json'), JSON.stringify({
    id: 'interrupted-run',
    workflowId: result.id,
    startedAt: '2026-08-17T10:00:00.000Z',
    status: 'running',
    triggerType: 'manual',
    ownerBootId: 'previous-dashboard-boot',
    ownerPid: 42,
    participants: [{ agentId: 'agent-a', agentName: 'Agent A', status: 'running' }],
    logs: [],
  }), 'utf-8')

  assert(getWorkflow(result.id!)?.status === 'blocked', 'Expected stale running workflow to reconcile as blocked')
  const execution = getExecution(result.id!, 'interrupted-run')
  assert(execution?.status === 'interrupted', 'Expected stale execution to persist an interrupted terminal state')
  assert(/dashboard restarted/i.test(execution?.error || ''), 'Expected a clear restart interruption reason')
})

test('cancelExecution persists an operator-stopped terminal state and clears workflow running status', () => {
  const result = createWorkflow({
    name: `Operator Stop ${Date.now()}`,
    description: 'Validate operator cancellation state',
    schedule: 'manual',
    content: '# Operator stop',
    executionMode: 'automated',
    targeting: { agents: [], groups: [], communities: [], tags: [] },
  })
  assert(result.success && !!result.id, `Workflow should be created: ${result.error}`)
  createdIds.push(result.id!)
  updateWorkflow(result.id!, { status: 'running', progress: 50 })
  const executionDir = path.join(getWorkspacePath(), 'WORKFLOWS', 'executions', result.id!)
  fs.mkdirSync(executionDir, { recursive: true })
  fs.writeFileSync(path.join(executionDir, 'operator-stop.json'), JSON.stringify({
    id: 'operator-stop',
    workflowId: result.id,
    startedAt: '2026-08-17T11:00:00.000Z',
    status: 'running',
    triggerType: 'manual',
    participants: [{ agentId: 'agent-a', agentName: 'Agent A', status: 'running' }],
    logs: [],
  }), 'utf-8')

  assert(cancelExecution(result.id!, 'operator-stop').success, 'Expected running execution cancellation to succeed')
  const execution = getExecution(result.id!, 'operator-stop')
  assert(execution?.status === 'cancelled', 'Expected cancelled execution status to persist')
  assert(execution?.participants[0]?.status === 'cancelled', 'Expected in-flight participants to be marked cancelled')
  assert(getWorkflow(result.id!)?.status !== 'running', 'Expected workflow to leave running state after cancellation')
})

test('latest execution follows startedAt rather than random execution filenames', () => {
  const workflowId = `ordering-test-${Date.now()}`
  const executionDir = path.join(getWorkspacePath(), 'WORKFLOWS', 'executions', workflowId)
  fs.mkdirSync(executionDir, { recursive: true })
  try {
    const writeExecution = (fileName: string, id: string, startedAt: string) => {
      fs.writeFileSync(path.join(executionDir, fileName), JSON.stringify({
        id,
        workflowId,
        startedAt,
        status: 'completed',
        triggerType: 'manual',
        participants: [],
        logs: [],
      }), 'utf-8')
    }
    writeExecution('z-old.json', 'old-run', '2026-08-17T10:00:00.000Z')
    writeExecution('a-new.json', 'new-run', '2026-08-17T12:00:00.000Z')
    writeExecution('m-middle.json', 'middle-run', '2026-08-17T11:00:00.000Z')

    assert(
      listExecutions(workflowId, 3).map((execution) => execution.id).join(',') === 'old-run,middle-run,new-run',
      'Expected retained executions to remain oldest-to-newest by startedAt',
    )
    assert(getLatestExecution(workflowId)?.id === 'new-run', 'Expected latest helper to return the newest started execution')
  } finally {
    fs.rmSync(executionDir, { recursive: true, force: true })
  }
})

test('pipeline pause persists and blocks new runs without disabling workflows', () => {
  const created = createWorkflow({
    name: `Pipeline pause ${Date.now()}`,
    description: 'Pipeline pause test',
    schedule: 'manual',
    enabled: true,
    author: 'test',
    content: '# Pipeline pause',
    executionMode: 'automated',
    targeting: { agents: [], groups: [], communities: [], tags: [] },
  })
  assert(created.success && !!created.id, `Expected pipeline fixture: ${created.error}`)
  const workflowId = created.id!
  createdIds.push(workflowId)
  const before = getWorkflow(workflowId)
  assert(before?.enabled === true, 'Expected workflow fixture to remain enabled')

  const paused = setWorkflowPipelinePaused(true, 'test-operator')
  assert(paused.paused && paused.updatedBy === 'test-operator', 'Expected paused state and actor to persist')
  assert(getWorkflowPipelineState().paused, 'Expected paused state to survive a fresh read')
  const result = triggerWorkflow(workflowId, { manual: true, mock: true })
  assert(!result.success && /pipeline is paused/i.test(result.error || ''), 'Expected new run to be blocked by pipeline pause')
  assert(getWorkflow(workflowId)?.enabled === true, 'Pipeline pause must not disable the workflow')

  setWorkflowPipelinePaused(false, 'test-operator')
  assert(!getWorkflowPipelineState().paused, 'Expected pipeline resume to persist')
})

test('corrupt pipeline state fails closed and can be replaced by resume', () => {
  const statePath = path.join(getWorkspacePath(), 'WORKFLOWS', '.pipeline-state.json')
  fs.writeFileSync(statePath, '{broken', 'utf-8')
  const state = getWorkflowPipelineState()
  assert(state.paused && state.stateError === true, 'Corrupt pipeline state must fail closed')
  setWorkflowPipelinePaused(false, 'repair-test')
  assert(!getWorkflowPipelineState().paused, 'Resume should replace corrupt state')
})

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
